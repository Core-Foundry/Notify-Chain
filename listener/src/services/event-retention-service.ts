import { Database } from '../database/database';
import logger from '../utils/logger';
import { RetentionAuditTrail } from './retention-audit-trail';
import {
  RetentionPolicy,
  SetRetentionPolicyInput,
  EventRetentionHold,
  ApplyRetentionHoldInput,
  ReleaseRetentionHoldInput,
  RetentionAuditRecord,
  RetentionAuditFilters,
  RetentionCleanupResult,
  RetentionCleanupContractDetail,
} from '../types/retention';
import { ContractConfig } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_MS = 30 * DAY_MS;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_BATCH_SIZE = 1000;

export interface EventRetentionServiceOptions {
  /** Default retention period in milliseconds when not specified per contract (default: 30 days) */
  defaultRetentionMs?: number;
  /** Initial contract configurations to register */
  contractConfigs?: ContractConfig[];
  /** Cleanup interval in milliseconds for background scheduler */
  cleanupIntervalMs?: number;
  /** Custom audit trail instance */
  auditTrail?: RetentionAuditTrail;
}

interface ProcessedEventCandidate {
  id: number;
  event_id: string;
  contract_address: string;
  fingerprint: string;
  processed_at: string;
}

interface RetentionHoldRow {
  id: string;
  contract_address: string | null;
  event_id: string | null;
  fingerprint: string | null;
  reason: string;
  held_by: string;
  created_at: string;
  status: string;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
  metadata: string | null;
}

/**
 * EventRetentionService (#1115)
 *
 * Provides configurable per-contract event retention policies:
 * 1. Default and contract-specific retention configuration
 * 2. Contract-specific retention overrides default retention settings
 * 3. Safe background cleanup evaluating contract policies and preventing premature deletion
 * 4. Active retention holds protecting events regardless of retention expiration
 * 5. Immutable, auditable retention actions via RetentionAuditTrail
 */
export class EventRetentionService {
  private defaultPolicy: RetentionPolicy;
  private readonly contractPolicies = new Map<string, RetentionPolicy>();
  private readonly auditTrail: RetentionAuditTrail;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeCleanupPromise: Promise<RetentionCleanupResult> | null = null;
  private schemaEnsured = false;
  private cleanupRunSequence = 0;

  constructor(
    private readonly db: Database,
    options: EventRetentionServiceOptions = {},
  ) {
    const defaultMs = options.defaultRetentionMs && options.defaultRetentionMs >= 1
      ? options.defaultRetentionMs
      : DEFAULT_RETENTION_MS;

    this.defaultPolicy = {
      retentionPeriodMs: defaultMs,
      retentionDays: Math.round(defaultMs / DAY_MS),
      description: 'Default global event retention policy',
      updatedAt: new Date(),
      updatedBy: 'system',
      isOverride: false,
    };

    this.auditTrail = options.auditTrail ?? new RetentionAuditTrail(db);
    this.intervalMs = options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

    // Load initial contract configs
    if (options.contractConfigs && Array.isArray(options.contractConfigs)) {
      for (const contract of options.contractConfigs) {
        if (!contract.address) continue;
        const periodMs = contract.retentionPeriodMs ??
          (contract.retentionDays !== undefined ? contract.retentionDays * DAY_MS : undefined);

        if (periodMs !== undefined && periodMs >= 1) {
          this.contractPolicies.set(contract.address, {
            contractAddress: contract.address,
            retentionPeriodMs: periodMs,
            retentionDays: Math.round(periodMs / DAY_MS),
            description: `Configured retention policy for ${contract.address}`,
            updatedAt: new Date(),
            updatedBy: 'system_config',
            isOverride: true,
          });
        }
      }
    }
  }

  /**
   * Idempotently ensure hold and audit tables and triggers exist.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;

    await this.auditTrail.ensureSchema();

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS event_retention_holds (
        id TEXT PRIMARY KEY,
        contract_address TEXT,
        event_id TEXT,
        fingerprint TEXT,
        reason TEXT NOT NULL,
        held_by TEXT NOT NULL DEFAULT 'system',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED')),
        released_at DATETIME,
        released_by TEXT,
        release_reason TEXT,
        metadata TEXT
      );
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_holds_status ON event_retention_holds(status);
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_holds_fingerprint ON event_retention_holds(fingerprint);
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_holds_contract_event ON event_retention_holds(contract_address, event_id);
    `);
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_retention_holds_contract ON event_retention_holds(contract_address);
    `);

    this.schemaEnsured = true;
  }

  // ── Policy Configuration ──────────────────────────────────────────────────

  /**
   * Set or update a retention policy for an individual monitored contract.
   * Contract-specific settings take precedence over the default configuration.
   */
  async setContractPolicy(
    contractAddress: string,
    input: SetRetentionPolicyInput,
    actor = 'system',
  ): Promise<RetentionPolicy> {
    await this.ensureSchema();

    if (!contractAddress || typeof contractAddress !== 'string' || !contractAddress.trim()) {
      throw new Error('Contract address must be a non-empty string');
    }

    const trimmedAddress = contractAddress.trim();
    const periodMs = input.retentionPeriodMs ??
      (input.retentionDays !== undefined ? input.retentionDays * DAY_MS : undefined);

    if (periodMs === undefined || !Number.isFinite(periodMs) || periodMs < 1) {
      throw new Error('Retention period must be a positive number of milliseconds or days');
    }

    const isExisting = this.contractPolicies.has(trimmedAddress);
    const existing = this.contractPolicies.get(trimmedAddress);

    const policy: RetentionPolicy = {
      contractAddress: trimmedAddress,
      retentionPeriodMs: periodMs,
      retentionDays: Math.round(periodMs / DAY_MS),
      description: input.description ?? `Retention policy for contract ${trimmedAddress}`,
      updatedAt: new Date(),
      updatedBy: actor,
      isOverride: true,
    };

    this.contractPolicies.set(trimmedAddress, policy);

    await this.auditTrail.record({
      action: isExisting ? 'POLICY_UPDATED' : 'POLICY_SET',
      contractAddress: trimmedAddress,
      actor,
      details: {
        previousRetentionPeriodMs: existing?.retentionPeriodMs ?? null,
        newRetentionPeriodMs: periodMs,
        retentionDays: policy.retentionDays,
        description: policy.description,
      },
    });

    logger.info('Contract retention policy configured', {
      contractAddress: trimmedAddress,
      retentionPeriodMs: periodMs,
      retentionDays: policy.retentionDays,
      action: isExisting ? 'POLICY_UPDATED' : 'POLICY_SET',
    });

    return policy;
  }

  /**
   * Get the explicit retention policy configured for a contract, if any.
   */
  getContractPolicy(contractAddress: string): RetentionPolicy | undefined {
    return this.contractPolicies.get(contractAddress.trim());
  }

  /**
   * Remove a contract-specific retention override, causing it to fall back to the default policy.
   */
  async removeContractPolicy(contractAddress: string, actor = 'system'): Promise<boolean> {
    await this.ensureSchema();

    const trimmed = contractAddress.trim();
    const existing = this.contractPolicies.get(trimmed);
    if (!existing) {
      return false;
    }

    this.contractPolicies.delete(trimmed);

    await this.auditTrail.record({
      action: 'POLICY_REMOVED',
      contractAddress: trimmed,
      actor,
      details: {
        removedRetentionPeriodMs: existing.retentionPeriodMs,
        fallbackDefaultRetentionPeriodMs: this.defaultPolicy.retentionPeriodMs,
      },
    });

    logger.info('Contract retention policy override removed; falling back to default', {
      contractAddress: trimmed,
      defaultRetentionPeriodMs: this.defaultPolicy.retentionPeriodMs,
    });

    return true;
  }

  /**
   * Set the default retention period applied when a contract does not have an explicit override.
   */
  async setDefaultPolicy(input: SetRetentionPolicyInput, actor = 'system'): Promise<RetentionPolicy> {
    await this.ensureSchema();

    const periodMs = input.retentionPeriodMs ??
      (input.retentionDays !== undefined ? input.retentionDays * DAY_MS : undefined);

    if (periodMs === undefined || !Number.isFinite(periodMs) || periodMs < 1) {
      throw new Error('Default retention period must be a positive number of milliseconds or days');
    }

    const previousMs = this.defaultPolicy.retentionPeriodMs;

    this.defaultPolicy = {
      retentionPeriodMs: periodMs,
      retentionDays: Math.round(periodMs / DAY_MS),
      description: input.description ?? 'Default global event retention policy',
      updatedAt: new Date(),
      updatedBy: actor,
      isOverride: false,
    };

    await this.auditTrail.record({
      action: 'POLICY_UPDATED',
      contractAddress: null,
      actor,
      details: {
        previousDefaultMs: previousMs,
        newDefaultMs: periodMs,
        retentionDays: this.defaultPolicy.retentionDays,
      },
    });

    logger.info('Default retention policy updated', {
      previousDefaultMs: previousMs,
      newDefaultMs: periodMs,
    });

    return this.defaultPolicy;
  }

  /**
   * Get the active default retention policy.
   */
  getDefaultPolicy(): RetentionPolicy {
    return { ...this.defaultPolicy };
  }

  /**
   * Determine the applicable retention policy for a contract address.
   * If the contract has a contract-specific override, it takes precedence.
   * Otherwise, the default retention policy is returned.
   */
  getApplicablePolicy(contractAddress?: string | null): RetentionPolicy {
    if (contractAddress && this.contractPolicies.has(contractAddress.trim())) {
      return { ...this.contractPolicies.get(contractAddress.trim())! };
    }

    return { ...this.defaultPolicy };
  }

  /**
   * Return a snapshot of all configured policies.
   */
  getAllPolicies(): {
    defaultPolicy: RetentionPolicy;
    contractPolicies: Record<string, RetentionPolicy>;
  } {
    const contractPolicies: Record<string, RetentionPolicy> = {};
    for (const [address, policy] of this.contractPolicies.entries()) {
      contractPolicies[address] = { ...policy };
    }
    return {
      defaultPolicy: { ...this.defaultPolicy },
      contractPolicies,
    };
  }

  // ── Retention Holds ────────────────────────────────────────────────────────

  /**
   * Place an active retention hold on events.
   * Protects matching events from background cleanup regardless of whether retention has expired.
   */
  async applyHold(input: ApplyRetentionHoldInput): Promise<EventRetentionHold> {
    await this.ensureSchema();

    if (!input.reason || typeof input.reason !== 'string' || !input.reason.trim()) {
      throw new Error('Hold reason is required and must be a non-empty string');
    }

    const holdId = input.holdId?.trim() || `hold-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const contractAddress = input.contractAddress?.trim() || null;
    const eventId = input.eventId?.trim() || null;
    let fingerprint = input.fingerprint?.trim() || null;

    if (!fingerprint && contractAddress && eventId) {
      fingerprint = `${contractAddress}:${eventId}`;
    }

    if (!contractAddress && !eventId && !fingerprint) {
      throw new Error('At least one of contractAddress, eventId, or fingerprint must be provided for a retention hold');
    }

    const heldBy = input.heldBy?.trim() || 'system';
    const createdAt = new Date().toISOString();
    const metadataStr = input.metadata ? JSON.stringify(input.metadata) : null;

    await this.db.run(
      `INSERT INTO event_retention_holds (
        id, contract_address, event_id, fingerprint, reason, held_by, created_at, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [holdId, contractAddress, eventId, fingerprint, input.reason.trim(), heldBy, createdAt, metadataStr],
    );

    const hold: EventRetentionHold = {
      id: holdId,
      contractAddress: contractAddress ?? undefined,
      eventId: eventId ?? undefined,
      fingerprint: fingerprint ?? undefined,
      reason: input.reason.trim(),
      heldBy,
      createdAt: new Date(createdAt),
      status: 'ACTIVE',
      metadata: input.metadata,
    };

    await this.auditTrail.record({
      action: 'HOLD_APPLIED',
      contractAddress,
      eventId,
      fingerprint,
      actor: heldBy,
      details: {
        holdId,
        reason: hold.reason,
        metadata: input.metadata ?? null,
      },
    });

    logger.info('Retention hold applied', {
      holdId,
      contractAddress,
      eventId,
      fingerprint,
      heldBy,
    });

    return hold;
  }

  /**
   * Release an active retention hold.
   * Once released, protected events will be eligible for cleanup when their retention expires.
   */
  async releaseHold(holdId: string, input: ReleaseRetentionHoldInput = {}): Promise<EventRetentionHold> {
    await this.ensureSchema();

    if (!holdId || typeof holdId !== 'string' || !holdId.trim()) {
      throw new Error('Hold ID must be a non-empty string');
    }

    const id = holdId.trim();
    const existing = await this.db.get<RetentionHoldRow>(
      'SELECT * FROM event_retention_holds WHERE id = ?',
      [id],
    );

    if (!existing) {
      throw new Error(`Retention hold with ID "${id}" not found`);
    }

    if (existing.status !== 'ACTIVE') {
      throw new Error(`Retention hold "${id}" is already released`);
    }

    const releasedAt = new Date().toISOString();
    const releasedBy = input.releasedBy?.trim() || 'system';
    const releaseReason = input.reason?.trim() || 'Retention hold released';

    await this.db.run(
      `UPDATE event_retention_holds
       SET status = 'RELEASED', released_at = ?, released_by = ?, release_reason = ?
       WHERE id = ?`,
      [releasedAt, releasedBy, releaseReason, id],
    );

    const updatedHold = await this.db.get<RetentionHoldRow>(
      'SELECT * FROM event_retention_holds WHERE id = ?',
      [id],
    );

    const hold = this.rowToHold(updatedHold!);

    await this.auditTrail.record({
      action: 'HOLD_RELEASED',
      contractAddress: hold.contractAddress ?? null,
      eventId: hold.eventId ?? null,
      fingerprint: hold.fingerprint ?? null,
      actor: releasedBy,
      details: {
        holdId: id,
        releaseReason,
        heldDurationMs: hold.releasedAt ? hold.releasedAt.getTime() - hold.createdAt.getTime() : null,
      },
    });

    logger.info('Retention hold released', {
      holdId: id,
      releasedBy,
      releaseReason,
    });

    return hold;
  }

  /**
   * Check whether a specific event is protected by an active retention hold.
   */
  async isEventHeld(
    contractAddress: string,
    eventId: string,
    fingerprint?: string,
  ): Promise<boolean> {
    await this.ensureSchema();

    const fp = fingerprint ?? `${contractAddress}:${eventId}`;
    const row = await this.db.get<{ id: string }>(
      `SELECT id FROM event_retention_holds
       WHERE status = 'ACTIVE'
         AND (
           fingerprint = ?
           OR (contract_address = ? AND event_id = ?)
           OR (contract_address = ? AND (event_id IS NULL OR event_id = ''))
         )
       LIMIT 1`,
      [fp, contractAddress, eventId, contractAddress],
    );

    return Boolean(row);
  }

  /**
   * Get all currently active retention holds.
   */
  async getActiveHolds(filters: { contractAddress?: string } = {}): Promise<EventRetentionHold[]> {
    await this.ensureSchema();

    let sql = `SELECT * FROM event_retention_holds WHERE status = 'ACTIVE'`;
    const params: unknown[] = [];

    if (filters.contractAddress) {
      sql += ' AND contract_address = ?';
      params.push(filters.contractAddress.trim());
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await this.db.all<RetentionHoldRow>(sql, params);
    return rows.map((r) => this.rowToHold(r));
  }

  // ── Safe Background Cleanup ────────────────────────────────────────────────

  /**
   * Start periodic safe background cleanup.
   */
  start(intervalMs?: number): void {
    if (this.timer) return;

    const ms = intervalMs ?? this.intervalMs;
    logger.info('Event retention background cleanup started', { intervalMs: ms });

    this.timer = setInterval(() => {
      void this.cleanupExpiredEvents().catch((error) => {
        logger.error('Background event retention cleanup failed', { error });
      });
    }, ms);
    this.timer.unref?.();
  }

  /**
   * Stop periodic background cleanup and wait for any ongoing run to finish.
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.activeCleanupPromise) {
      try {
        await this.activeCleanupPromise;
      } catch {
        // Ignored during shutdown
      }
    }
    logger.info('Event retention background cleanup stopped');
  }

  /**
   * Execute safe background cleanup for events across all monitored contracts:
   * 1. Evaluates each contract's applicable retention policy (contract override or default).
   * 2. Calculates contract-specific cutoff time to prevent premature deletion.
   * 3. Checks active retention holds and protects held events regardless of age.
   * 4. Deletes expired, unprotected events in small batches safely.
   * 5. Emits an immutable audit record of the cleanup action with full metrics.
   */
  async cleanupExpiredEvents(nowDate: Date = new Date()): Promise<RetentionCleanupResult> {
    if (this.activeCleanupPromise) {
      return this.activeCleanupPromise;
    }

    const run = this.executeCleanup(nowDate);
    this.activeCleanupPromise = run;
    try {
      return await run;
    } finally {
      if (this.activeCleanupPromise === run) {
        this.activeCleanupPromise = null;
      }
    }
  }

  private async executeCleanup(nowDate: Date): Promise<RetentionCleanupResult> {
    await this.ensureSchema();

    const runId = `cleanup-retention-${Date.now()}-${++this.cleanupRunSequence}`;
    const startedAt = Date.now();
    const detailsPerContract: Record<string, RetentionCleanupContractDetail> = {};

    let totalDeleted = 0;
    let totalProtectedByHolds = 0;

    try {
      // 1. Gather all contract addresses in processed_events plus configured overrides
      const contractRows = await this.db.all<{ contract_address: string }>(
        'SELECT DISTINCT contract_address FROM processed_events WHERE contract_address IS NOT NULL',
      );

      const contractsToEvaluate = new Set<string>();
      for (const row of contractRows) {
        if (row.contract_address) contractsToEvaluate.add(row.contract_address);
      }
      for (const address of this.contractPolicies.keys()) {
        contractsToEvaluate.add(address);
      }

      // Also ensure we handle events with NULL or empty contract_address if any exist
      const nullContractRow = await this.db.get<{ count: number }>(
        "SELECT COUNT(*) as count FROM processed_events WHERE contract_address IS NULL OR contract_address = ''",
      );
      const hasNullContractEvents = (nullContractRow?.count ?? 0) > 0;

      // 2. Fetch all active retention holds into memory for fast batch lookup
      const activeHolds = await this.getActiveHolds();
      const globalContractHolds = new Set<string>();
      const heldFingerprints = new Set<string>();
      const heldContractEvents = new Set<string>();

      for (const hold of activeHolds) {
        if (hold.fingerprint) {
          heldFingerprints.add(hold.fingerprint);
        }
        if (hold.contractAddress && hold.eventId) {
          heldContractEvents.add(`${hold.contractAddress}:${hold.eventId}`);
        }
        if (hold.contractAddress && !hold.eventId) {
          // Contract-wide hold protects all events of this contract
          globalContractHolds.add(hold.contractAddress);
        }
      }

      // Helper to test if a candidate event is protected by an active hold
      const isProtected = (candidate: ProcessedEventCandidate): boolean => {
        if (globalContractHolds.has(candidate.contract_address)) {
          return true;
        }
        if (candidate.fingerprint && heldFingerprints.has(candidate.fingerprint)) {
          return true;
        }
        if (candidate.contract_address && candidate.event_id) {
          if (heldContractEvents.has(`${candidate.contract_address}:${candidate.event_id}`)) {
            return true;
          }
        }
        return false;
      };

      // 3. Process each contract with its applicable retention policy
      for (const contractAddress of contractsToEvaluate) {
        const policy = this.getApplicablePolicy(contractAddress);
        const cutoffMs = startedAt - policy.retentionPeriodMs;
        const cutoffIso = new Date(cutoffMs).toISOString();

        // Candidates: processed_at older than this contract's specific cutoff
        const candidates = await this.db.all<ProcessedEventCandidate>(
          `SELECT id, event_id, contract_address, fingerprint, processed_at
           FROM processed_events
           WHERE contract_address = ?
             AND datetime(processed_at) < datetime(?)`,
          [contractAddress, cutoffIso],
        );

        let contractDeleted = 0;
        let contractProtected = 0;
        const idsToDelete: number[] = [];

        for (const candidate of candidates) {
          if (isProtected(candidate)) {
            contractProtected++;
          } else {
            idsToDelete.push(candidate.id);
          }
        }

        // Delete eligible events in safe batches with atomic retention hold protection at deletion time
        for (let i = 0; i < idsToDelete.length; i += CLEANUP_BATCH_SIZE) {
          const batch = idsToDelete.slice(i, i + CLEANUP_BATCH_SIZE);
          const placeholders = batch.map(() => '?').join(',');
          const deleteResult = await this.db.run(
            `DELETE FROM processed_events
             WHERE id IN (${placeholders})
               AND NOT EXISTS (
                 SELECT 1 FROM event_retention_holds h
                 WHERE h.status = 'ACTIVE'
                   AND (
                     (h.fingerprint IS NOT NULL AND h.fingerprint != '' AND h.fingerprint = processed_events.fingerprint)
                     OR (h.contract_address IS NOT NULL AND h.contract_address = processed_events.contract_address AND h.event_id IS NOT NULL AND h.event_id != '' AND h.event_id = processed_events.event_id)
                     OR (h.contract_address IS NOT NULL AND h.contract_address = processed_events.contract_address AND (h.event_id IS NULL OR h.event_id = ''))
                   )
               )`,
            batch,
          );
          const actualDeleted = deleteResult.changes;
          contractDeleted += actualDeleted;
          const protectedAtDeletion = batch.length - actualDeleted;
          contractProtected += protectedAtDeletion;
        }

        detailsPerContract[contractAddress] = {
          retentionPeriodMs: policy.retentionPeriodMs,
          cutoff: cutoffIso,
          evaluated: candidates.length,
          deleted: contractDeleted,
          protectedByHolds: contractProtected,
        };

        totalDeleted += contractDeleted;
        totalProtectedByHolds += contractProtected;
      }

      // 4. Handle events without a contract address using default policy
      if (hasNullContractEvents) {
        const defaultCutoffMs = startedAt - this.defaultPolicy.retentionPeriodMs;
        const defaultCutoffIso = new Date(defaultCutoffMs).toISOString();

        const candidates = await this.db.all<ProcessedEventCandidate>(
          `SELECT id, event_id, contract_address, fingerprint, processed_at
           FROM processed_events
           WHERE (contract_address IS NULL OR contract_address = '')
             AND datetime(processed_at) < datetime(?)`,
          [defaultCutoffIso],
        );

        let nullDeleted = 0;
        let nullProtected = 0;
        const idsToDelete: number[] = [];

        for (const candidate of candidates) {
          if (isProtected(candidate)) {
            nullProtected++;
          } else {
            idsToDelete.push(candidate.id);
          }
        }

        for (let i = 0; i < idsToDelete.length; i += CLEANUP_BATCH_SIZE) {
          const batch = idsToDelete.slice(i, i + CLEANUP_BATCH_SIZE);
          const placeholders = batch.map(() => '?').join(',');
          const deleteResult = await this.db.run(
            `DELETE FROM processed_events
             WHERE id IN (${placeholders})
               AND NOT EXISTS (
                 SELECT 1 FROM event_retention_holds h
                 WHERE h.status = 'ACTIVE'
                   AND (
                     (h.fingerprint IS NOT NULL AND h.fingerprint != '' AND h.fingerprint = processed_events.fingerprint)
                     OR (h.contract_address IS NOT NULL AND h.contract_address = processed_events.contract_address AND h.event_id IS NOT NULL AND h.event_id != '' AND h.event_id = processed_events.event_id)
                     OR (h.contract_address IS NOT NULL AND h.contract_address = processed_events.contract_address AND (h.event_id IS NULL OR h.event_id = ''))
                   )
               )`,
            batch,
          );
          const actualDeleted = deleteResult.changes;
          nullDeleted += actualDeleted;
          const protectedAtDeletion = batch.length - actualDeleted;
          nullProtected += protectedAtDeletion;
        }

        detailsPerContract['<unspecified>'] = {
          retentionPeriodMs: this.defaultPolicy.retentionPeriodMs,
          cutoff: defaultCutoffIso,
          evaluated: candidates.length,
          deleted: nullDeleted,
          protectedByHolds: nullProtected,
        };

        totalDeleted += nullDeleted;
        totalProtectedByHolds += nullProtected;
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt;

      const result: RetentionCleanupResult = {
        runId,
        startedAt: new Date(startedAt),
        completedAt,
        durationMs,
        totalDeleted,
        totalProtectedByHolds,
        contractsEvaluated: Object.keys(detailsPerContract).length,
        detailsPerContract,
      };

      // 5. Append immutable audit record of cleanup execution
      await this.auditTrail.record({
        action: 'CLEANUP_EXECUTED',
        contractAddress: null,
        actor: 'retention_cleanup_job',
        details: {
          runId,
          durationMs,
          totalDeleted,
          totalProtectedByHolds,
          contractsEvaluated: result.contractsEvaluated,
          perContract: detailsPerContract,
        },
      });

      logger.info('Event retention safe cleanup completed', {
        runId,
        totalDeleted,
        totalProtectedByHolds,
        contractsEvaluated: result.contractsEvaluated,
        durationMs,
      });

      return result;
    } catch (error) {
      logger.error('Event retention cleanup failed', { runId, error });
      throw error;
    }
  }

  // ── Audit Queries ──────────────────────────────────────────────────────────

  /**
   * Query the immutable audit trail for retention actions.
   */
  async getAuditHistory(filters?: RetentionAuditFilters): Promise<RetentionAuditRecord[]> {
    return this.auditTrail.query(filters);
  }

  /**
   * Get the underlying RetentionAuditTrail instance.
   */
  getAuditTrail(): RetentionAuditTrail {
    return this.auditTrail;
  }

  private rowToHold(row: RetentionHoldRow): EventRetentionHold {
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = undefined;
      }
    }

    return {
      id: row.id,
      contractAddress: row.contract_address ?? undefined,
      eventId: row.event_id ?? undefined,
      fingerprint: row.fingerprint ?? undefined,
      reason: row.reason,
      heldBy: row.held_by,
      createdAt: new Date(row.created_at),
      status: row.status as 'ACTIVE' | 'RELEASED',
      releasedAt: row.released_at ? new Date(row.released_at) : undefined,
      releasedBy: row.released_by ?? undefined,
      releaseReason: row.release_reason ?? undefined,
      metadata,
    };
  }
}
