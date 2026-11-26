import { Database } from '../database/database';
import {
  CreateDeliveryReceiptInput,
  DeliveryReceipt,
  DeliveryReceiptRow,
  DeliveryReceiptStatus,
  DeliveryOutcome,
  DeliveryHistoryQueryOptions,
  DeliveryHistoryQueryResult,
  determineDeliveryOutcome,
} from '../types/delivery-receipt';

const SAFE_RESPONSE_FIELDS = new Set([
  'status',
  'statusCode',
  'code',
  'messageId',
  'providerMessageId',
  'requestId',
  'retryAfter',
]);

function sanitizeProviderResponse(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;

  const sanitized: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_RESPONSE_FIELDS.has(key)) continue;
    if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
      sanitized[key] = field;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeErrorMessage(message: string | null): string | null {
  if (!message) return null;
  return message
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /\b(?:sk_(?:live|test)_|sk-|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]+/gi,
      '[REDACTED_CREDENTIAL]',
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/https?:\/\/[^\s]+/gi, '[REDACTED_URL]')
    .slice(0, 500);
}

function sanitizeErrorCode(code: string | null): string | null {
  return code && /^[A-Z0-9_:-]{1,64}$/i.test(code) ? code : code ? 'DELIVERY_FAILED' : null;
}

export class DeliveryReceiptRepository {
  private schemaEnsured = false;
  private schemaEnsuringPromise: Promise<void> | null = null;

  constructor(private readonly db: Database) {}

  /**
   * Idempotently ensure the delivery_receipts table and all columns exist (#1116).
   *
   * Invariants:
   * - Ignores ONLY confirmed SQLite duplicate-column errors.
   * - Propagates all other migration errors.
   * - Does not mark schemaEnsured = true until all columns and indexes succeed.
   * - Supports resuming partially applied migrations safely.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    if (this.schemaEnsuringPromise) {
      await this.schemaEnsuringPromise;
      return;
    }

    this.schemaEnsuringPromise = (async () => {
      try {
        if (typeof this.db.get !== 'function' || typeof this.db.run !== 'function') {
          this.schemaEnsured = true;
          return;
        }

        const table = await this.db.get<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'delivery_receipts'",
        );
        if (!table) return;

        const migrations = [
          'ALTER TABLE delivery_receipts ADD COLUMN event_id TEXT',
          'ALTER TABLE delivery_receipts ADD COLUMN contract_address TEXT',
          "ALTER TABLE delivery_receipts ADD COLUMN outcome TEXT NOT NULL DEFAULT 'UNKNOWN'",
          'ALTER TABLE delivery_receipts ADD COLUMN provider_status INTEGER',
          'ALTER TABLE delivery_receipts ADD COLUMN attempt_timestamp DATETIME',
          'ALTER TABLE delivery_receipts ADD COLUMN delivered_at DATETIME',
        ];

        for (const sql of migrations) {
          try {
            await this.db.run(sql);
          } catch (error: any) {
            const message = String(error?.message ?? error);
            if (/duplicate column name/i.test(message)) {
              continue;
            }
            throw error;
          }
        }

        await this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_delivery_receipts_outcome_created
            ON delivery_receipts(outcome, created_at)
        `);
        await this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_delivery_receipts_event
            ON delivery_receipts(event_id)
        `);
        await this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_delivery_receipts_contract
            ON delivery_receipts(contract_address)
        `);

        this.schemaEnsured = true;
      } finally {
        this.schemaEnsuringPromise = null;
      }
    })();

    await this.schemaEnsuringPromise;
  }

  /**
   * Create a new delivery receipt for a delivery attempt.
   * Every delivery attempt creates its own traceable receipt row (#1116).
   */
  async create(input: CreateDeliveryReceiptInput): Promise<number> {
    await this.ensureSchema();

    const outcome: DeliveryOutcome = input.outcome ?? determineDeliveryOutcome({
      success: input.status === 'delivered',
      statusCode: input.providerStatus,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });

    const status: DeliveryReceiptStatus = input.status ?? (
      outcome === 'ACCEPTED' ? 'delivered' : outcome === 'REJECTED' ? 'rejected' : 'failed'
    );

    const now = new Date();
    const attemptTimestampIso = input.attemptTimestamp
      ? input.attemptTimestamp.toISOString()
      : now.toISOString();

    const deliveredAtIso = input.deliveredAt !== undefined
      ? (input.deliveredAt ? input.deliveredAt.toISOString() : null)
      : (outcome === 'ACCEPTED' ? attemptTimestampIso : null);

    const result = await this.db.run(
      `INSERT INTO delivery_receipts (
        notification_id, channel, status, attempt_count, provider_message_id,
        provider_response, error_code, error_message,
        event_id, contract_address, outcome, provider_status, attempt_timestamp, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.notificationId,
        input.channel,
        status,
        input.attemptCount,
        input.providerMessageId ?? null,
        JSON.stringify(sanitizeProviderResponse(input.providerResponse)),
        sanitizeErrorCode(input.errorCode ?? null),
        sanitizeErrorMessage(input.errorMessage ?? null),
        input.eventId ?? null,
        input.contractAddress ?? null,
        outcome,
        input.providerStatus ?? null,
        attemptTimestampIso,
        deliveredAtIso,
      ],
    );
    return result.lastID;
  }

  /**
   * Find receipts by notification ID, optionally filtered by status.
   */
  async findByNotificationId(
    notificationId: number,
    status?: DeliveryReceiptStatus,
  ): Promise<DeliveryReceipt[]> {
    await this.ensureSchema();

    const rows = status
      ? await this.db.all<DeliveryReceiptRow>(
          `SELECT * FROM delivery_receipts WHERE notification_id = ? AND status = ?
           ORDER BY attempt_count, id`,
          [notificationId, status],
        )
      : await this.db.all<DeliveryReceiptRow>(
          'SELECT * FROM delivery_receipts WHERE notification_id = ? ORDER BY attempt_count, id',
          [notificationId],
        );
    return rows.map((r) => this.rowToModel(r));
  }

  /**
   * Find receipts by status.
   */
  async findByStatus(status: DeliveryReceiptStatus): Promise<DeliveryReceipt[]> {
    await this.ensureSchema();

    const rows = await this.db.all<DeliveryReceiptRow>(
      'SELECT * FROM delivery_receipts WHERE status = ? ORDER BY created_at, id',
      [status],
    );
    return rows.map((r) => this.rowToModel(r));
  }

  /**
   * Find all delivery receipts associated with an originating event (#1116).
   */
  async findByEventId(eventId: string): Promise<DeliveryReceipt[]> {
    await this.ensureSchema();

    const rows = await this.db.all<DeliveryReceiptRow>(
      'SELECT * FROM delivery_receipts WHERE event_id = ? ORDER BY attempt_count ASC, id ASC',
      [eventId.trim()],
    );
    return rows.map((r) => this.rowToModel(r));
  }

  /**
   * Query delivery history with flexible filtering and pagination (#1116).
   */
  async queryHistory(options: DeliveryHistoryQueryOptions = {}): Promise<DeliveryHistoryQueryResult> {
    await this.ensureSchema();

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.eventId) {
      conditions.push('event_id = ?');
      params.push(options.eventId.trim());
    }

    if (options.contractAddress) {
      conditions.push('contract_address = ?');
      params.push(options.contractAddress.trim());
    }

    if (options.notificationId !== undefined) {
      conditions.push('notification_id = ?');
      params.push(options.notificationId);
    }

    if (options.outcome) {
      conditions.push('outcome = ?');
      params.push(options.outcome);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.channel) {
      conditions.push('channel = ?');
      params.push(options.channel.trim());
    }

    if (options.startDate) {
      const startIso = options.startDate instanceof Date
        ? options.startDate.toISOString()
        : new Date(options.startDate).toISOString();
      conditions.push('datetime(created_at) >= datetime(?)');
      params.push(startIso);
    }

    if (options.endDate) {
      const endIso = options.endDate instanceof Date
        ? options.endDate.toISOString()
        : new Date(options.endDate).toISOString();
      conditions.push('datetime(created_at) <= datetime(?)');
      params.push(endIso);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
    const offset = Math.max(0, options.offset ?? 0);

    const countRow = await this.db.get<{ count?: number; total?: number }>(
      `SELECT COUNT(*) as count FROM delivery_receipts ${whereClause}`,
      params,
    );
    const total = countRow?.count ?? countRow?.total ?? 0;

    const rows = await this.db.all<DeliveryReceiptRow>(
      `SELECT * FROM delivery_receipts
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return {
      receipts: rows.map((r) => this.rowToModel(r)),
      total,
      limit,
      offset,
    };
  }

  private rowToModel(row: DeliveryReceiptRow): DeliveryReceipt {
    let providerResponse: Record<string, unknown> | null = null;
    if (row.provider_response) {
      try {
        providerResponse = JSON.parse(row.provider_response) as Record<string, unknown> | null;
      } catch {
        providerResponse = null;
      }
    }

    const outcome: DeliveryOutcome = (row.outcome as DeliveryOutcome) ?? (
      row.status === 'delivered' ? 'ACCEPTED' : row.status === 'rejected' ? 'REJECTED' : 'UNKNOWN'
    );

    return {
      id: row.id,
      notificationId: row.notification_id,
      eventId: row.event_id ?? null,
      contractAddress: row.contract_address ?? null,
      channel: row.channel,
      status: row.status,
      outcome,
      providerStatus: row.provider_status ?? null,
      attemptCount: row.attempt_count,
      attemptTimestamp: row.attempt_timestamp ? new Date(row.attempt_timestamp) : new Date(row.created_at),
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
      providerMessageId: row.provider_message_id,
      providerResponse,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
