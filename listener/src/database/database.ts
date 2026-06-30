import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import logger from '../utils/logger';

/**
 * SQLite Database Service
 * Handles all database operations with promise-based interface
 */
export class Database {
  private db: sqlite3.Database | null = null;
  private dbPath: string;
  private isInitialized: boolean = false;

  constructor(dbPath: string = './data/notifications.db') {
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and run migrations
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      await this.applyIncrementalMigrations();
      return;
    }

    try {
      // Ensure data directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info('Created database directory', { path: dbDir });
      }

      // Open database connection
      await this.connect();

      // Run schema migrations
      await this.runMigrations();

      this.isInitialized = true;
      logger.info('Database initialized successfully', { path: this.dbPath });
    } catch (error) {
      logger.error('Failed to initialize database', { error, path: this.dbPath });
      throw error;
    }
  }

  /**
   * Connect to SQLite database
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Failed to connect to database', { error: err, path: this.dbPath });
          reject(err);
        } else {
          logger.info('Connected to SQLite database', { path: this.dbPath });
          // Enable foreign keys
          this.db!.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    });
  }

  /**
   * Run database migrations from schema.sql
   *
   * After applying the schema, the script's hash is recorded in the
   * `schema_migrations` table so that the migration-check script (and CI)
   * can detect when source has drifted from the database. See issue #103.
   */
  private async runMigrations(): Promise<void> {
    const schemaPath = path.join(__dirname, 'schema.sql');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute the schema as one script so trigger bodies with semicolons work.
    await this.exec(schema);

    // Record the applied schema hash so future runs of `migrate:check`
    // can detect when the on-disk schema has drifted from the database.
    await this.recordSchemaMigration(schema, 'migrate');
    await this.applyIncrementalMigrations();

    logger.info('Database migrations completed');
  }

  /**
   * Insert (or refresh) a row in schema_migrations for the schema contents
   * just applied. The hash is the SHA-256 of the schema text with
   * CRLF normalised to LF so editors and CI runners agree on a single value.
   */
  private async recordSchemaMigration(
    schemaSql: string,
    source: 'migrate' | 'migrate:check'
  ): Promise<void> {
    const normalized = schemaSql.replace(/\r\n/g, '\n');
    const hash = crypto
      .createHash('sha256')
      .update(normalized, 'utf-8')
      .digest('hex');

    // Use a simple timestamp-based version so successive migrations are
    // distinguishable without an external version registry.
    const version = `v-${Date.now()}`;

    await this.run(
      `INSERT OR REPLACE INTO schema_migrations (version, schema_hash, source)
       VALUES (?, ?, ?)`,
      [version, hash, source]
    );
   * Split SQL statements intelligently, preserving BEGIN...END blocks
   */
  private splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inBeginBlock = false;
    
    const lines = sql.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Check for BEGIN keyword (case insensitive)
      if (/^\s*BEGIN\s*$/i.test(trimmed)) {
        inBeginBlock = true;
      }
      
      current += line + '\n';
      
      // Check for END; which closes the BEGIN block
      if (inBeginBlock && /^\s*END\s*;/i.test(trimmed)) {
        inBeginBlock = false;
        statements.push(current.trim());
        current = '';
        continue;
      }
      
      // If not in BEGIN block and line ends with semicolon, it's a complete statement
      if (!inBeginBlock && trimmed.endsWith(';')) {
        statements.push(current.trim());
        current = '';
      }
    }
    
    // Add any remaining content
    if (current.trim().length > 0) {
      statements.push(current.trim());
    }
    
    return statements.filter(s => s.length > 0 && !s.startsWith('--'));
   * Apply migrations for databases created before schema.sql was updated in-place.
   */
  private async applyIncrementalMigrations(): Promise<void> {
    try {
      await this.run('ALTER TABLE scheduled_notifications ADD COLUMN next_retry_at DATETIME');
    } catch (error) {
      const message = String(error);
      if (!message.includes('duplicate column')) {
        throw error;
      }
    }
  }

  /**
   * Execute a SQL query that modifies data (INSERT, UPDATE, DELETE)
   */
  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function (err) {
        if (err) {
          logger.error('Database run error', { sql, params, error: err });
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Execute a SQL query that returns a single row (SELECT)
   */
  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          logger.error('Database get error', { sql, params, error: err });
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  /**
   * Execute a SQL query that returns multiple rows (SELECT)
   */
  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Database all error', { sql, params, error: err });
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * Execute a SQL script that may contain multiple statements.
   */
  async exec(sql: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      this.db!.exec(sql, (err) => {
        if (err) {
          logger.error('Database exec error', { sql, error: err });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Execute multiple statements in a transaction
   */
  async transaction(callback: () => Promise<void>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.run('BEGIN TRANSACTION');
      await callback();
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      logger.error('Transaction rolled back', { error });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      this.db!.close((err) => {
        if (err) {
          logger.error('Failed to close database', { error: err });
          reject(err);
        } else {
          logger.info('Database connection closed');
          this.db = null;
          this.isInitialized = false;
          resolve();
        }
      });
    });
  }

  /**
   * Get database connection status
   */
  isConnected(): boolean {
    return this.isInitialized && this.db !== null;
  }
}

// Singleton instance
let dbInstance: Database | null = null;

/**
 * Reset the database singleton (for tests).
 */
export async function resetDatabaseSingleton(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Get or create database singleton instance
 */
export function getDatabase(dbPath?: string): Database {
  if (!dbInstance) {
    const finalPath = dbPath || process.env.DATABASE_PATH || './data/notifications.db';
    dbInstance = new Database(finalPath);
  }
  return dbInstance;
}

/**
 * Initialize database (should be called on application startup)
 */
export async function initializeDatabase(dbPath?: string): Promise<Database> {
  const db = getDatabase(dbPath);
  await db.initialize();
  return db;
}
