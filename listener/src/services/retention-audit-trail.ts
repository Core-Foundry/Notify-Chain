import { Database } from '../database/database';
import logger from '../utils/logger';
import {
  RetentionAuditAction,
  RetentionAuditRecord,
  RetentionAuditRecordRow,
  RetentionAuditFilters,
  RecordRetentionAuditInput,
} from '../types/retention';

/**
 * Append-only audit trail for retention-related actions (#1115).
 * Records policy changes, retention holds, and cleanup execution runs.
 * Backed by SQLite retention_audit_log with triggers preventing UPDATE and DELETE.
 */
export class RetentionAuditTrail {
  private schemaEnsured = false;

  constructor(private readonly db: Database) {}

  /**
   * Idempotently ensure the audit table, indexes, and immutability triggers exist.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS retention_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL CHECK (action IN ('POLICY_SET', 'POLICY_UPDATED', 'POLICY_REMOVED', 'HOLD_APPLIED', 'HOLD_RELEASED', 'CLEANUP_EXECUTED')),
        contract_address TEXT,
        event_id TEXT,
        fingerprint TEXT,
        actor TEXT NOT NULL DEFAULT 'system',
        timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      );
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_audit_action ON retention_audit_log(action);
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_audit_contract ON retention_audit_log(contract_address);
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_audit_timestamp ON retention_audit_log(timestamp);
    `);

    // Add immutable triggers
    await this.db.run(`
      CREATE TRIGGER IF NOT EXISTS prevent_retention_audit_update
      BEFORE UPDATE ON retention_audit_log
      FOR EACH ROW
      BEGIN
        SELECT RAISE(ABORT, 'Retention audit records are immutable');
      END;
    `);

    await this.db.run(`
      CREATE TRIGGER IF NOT EXISTS prevent_retention_audit_delete
      BEFORE DELETE ON retention_audit_log
      FOR EACH ROW
      BEGIN
        SELECT RAISE(ABORT, 'Retention audit records are immutable');
      END;
    `);

    this.schemaEnsured = true;
  }

  /**
   * Append an audit entry for a retention action.
   */
  async record(input: RecordRetentionAuditInput): Promise<number> {
    await this.ensureSchema();

    const timestamp = new Date().toISOString();
    const actor = input.actor?.trim() || 'system';
    const safeDetails = input.details ? JSON.stringify(input.details) : null;

    const result = await this.db.run(
      `INSERT INTO retention_audit_log (
        action, contract_address, event_id, fingerprint, actor, timestamp, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.action,
        input.contractAddress ?? null,
        input.eventId ?? null,
        input.fingerprint ?? null,
        actor,
        timestamp,
        safeDetails,
      ],
    );

    logger.info('Retention audit record created', {
      auditId: result.lastID,
      action: input.action,
      contractAddress: input.contractAddress,
      actor,
    });

    return result.lastID;
  }

  /**
   * Query the retention audit log with optional filters.
   */
  async query(filters: RetentionAuditFilters = {}): Promise<RetentionAuditRecord[]> {
    await this.ensureSchema();

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.action) {
      clauses.push('action = ?');
      params.push(filters.action);
    }
    if (filters.contractAddress) {
      clauses.push('contract_address = ?');
      params.push(filters.contractAddress);
    }
    if (filters.eventId) {
      clauses.push('event_id = ?');
      params.push(filters.eventId);
    }
    if (filters.fingerprint) {
      clauses.push('fingerprint = ?');
      params.push(filters.fingerprint);
    }
    if (filters.since) {
      clauses.push('datetime(timestamp) >= datetime(?)');
      params.push(filters.since.toISOString());
    }
    if (filters.until) {
      clauses.push('datetime(timestamp) <= datetime(?)');
      params.push(filters.until.toISOString());
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(filters.limit ?? 100, 1000));
    const offset = Math.max(0, filters.offset ?? 0);

    const sql = `
      SELECT * FROM retention_audit_log
      ${where}
      ORDER BY timestamp DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await this.db.all<RetentionAuditRecordRow>(sql, [...params, limit, offset]);
    return rows.map((r) => this.rowToModel(r));
  }

  /**
   * Get all audit records related to a specific contract address.
   */
  async getByContract(contractAddress: string, limit = 50): Promise<RetentionAuditRecord[]> {
    return this.query({ contractAddress, limit });
  }

  /**
   * Get all audit records by action type.
   */
  async getByAction(action: RetentionAuditAction, limit = 50): Promise<RetentionAuditRecord[]> {
    return this.query({ action, limit });
  }

  private rowToModel(row: RetentionAuditRecordRow): RetentionAuditRecord {
    let parsedDetails: Record<string, unknown> | null = null;
    if (row.details) {
      try {
        parsedDetails = JSON.parse(row.details);
      } catch {
        parsedDetails = { raw: row.details };
      }
    }

    return {
      id: row.id,
      action: row.action as RetentionAuditAction,
      contractAddress: row.contract_address,
      eventId: row.event_id,
      fingerprint: row.fingerprint,
      actor: row.actor,
      timestamp: new Date(row.timestamp),
      details: parsedDetails,
    };
  }
}
