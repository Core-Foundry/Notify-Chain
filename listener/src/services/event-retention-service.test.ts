import { Database } from '../database/database';
import { EventRetentionService } from './event-retention-service';
import { DatabaseCleanupJob } from './database-cleanup-job';
import { CleanupService } from './cleanup-service';
import { EventRegistry } from '../store/event-registry';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('EventRetentionService (#1115)', () => {
  let db: Database;
  let service: EventRetentionService;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
    service = new EventRetentionService(db, {
      defaultRetentionMs: 30 * DAY_MS,
    });
    await service.ensureSchema();
  });

  afterEach(async () => {
    await service.stop();
    await db.close();
  });

  async function insertProcessedEvent(args: {
    eventId: string;
    contractAddress: string;
    processedAt: string;
    eventType?: string;
  }): Promise<number> {
    const fingerprint = `${args.contractAddress}:${args.eventId}`;
    const result = await db.run(
      `INSERT INTO processed_events (
        event_id, contract_address, fingerprint, ledger_number, event_type, processed_at
      ) VALUES (?, ?, ?, 100, ?, ?)`,
      [args.eventId, args.contractAddress, fingerprint, args.eventType ?? 'transfer', args.processedAt],
    );
    return result.lastID;
  }

  // ── Requirement 1 & 2: Retention Configuration & Overrides ──────────────────

  describe('Retention Configuration and Overrides', () => {
    it('initializes with the default retention policy', () => {
      const defaultPolicy = service.getDefaultPolicy();
      expect(defaultPolicy.retentionPeriodMs).toBe(30 * DAY_MS);
      expect(defaultPolicy.retentionDays).toBe(30);
      expect(defaultPolicy.isOverride).toBe(false);
    });

    it('allows configuring per-contract retention periods independently', async () => {
      await service.setContractPolicy('CA_SHORT', { retentionDays: 3 });
      await service.setContractPolicy('CA_LONG', { retentionDays: 90 });

      const shortPolicy = service.getContractPolicy('CA_SHORT');
      const longPolicy = service.getContractPolicy('CA_LONG');

      expect(shortPolicy).toBeDefined();
      expect(shortPolicy?.retentionPeriodMs).toBe(3 * DAY_MS);
      expect(shortPolicy?.retentionDays).toBe(3);
      expect(shortPolicy?.isOverride).toBe(true);

      expect(longPolicy).toBeDefined();
      expect(longPolicy?.retentionPeriodMs).toBe(90 * DAY_MS);
      expect(longPolicy?.retentionDays).toBe(90);
      expect(longPolicy?.isOverride).toBe(true);
    });

    it('ensures contract-specific retention overrides default configuration', async () => {
      // Contract with explicit override
      await service.setContractPolicy('CA_CUSTOM', { retentionPeriodMs: 7 * DAY_MS });

      // Unconfigured contract falls back to default
      const defaultApplicable = service.getApplicablePolicy('CA_UNCONFIGURED');
      expect(defaultApplicable.retentionPeriodMs).toBe(30 * DAY_MS);
      expect(defaultApplicable.isOverride).toBe(false);

      // Configured contract returns override
      const customApplicable = service.getApplicablePolicy('CA_CUSTOM');
      expect(customApplicable.retentionPeriodMs).toBe(7 * DAY_MS);
      expect(customApplicable.isOverride).toBe(true);
    });

    it('preserves contract overrides when default policy is updated', async () => {
      await service.setContractPolicy('CA_OVERRIDE', { retentionDays: 5 });
      await service.setDefaultPolicy({ retentionDays: 60 });

      expect(service.getDefaultPolicy().retentionPeriodMs).toBe(60 * DAY_MS);
      expect(service.getApplicablePolicy('CA_OTHER').retentionPeriodMs).toBe(60 * DAY_MS);
      expect(service.getApplicablePolicy('CA_OVERRIDE').retentionPeriodMs).toBe(5 * DAY_MS);
    });

    it('falls back to default policy when contract override is removed', async () => {
      await service.setContractPolicy('CA_TEMP', { retentionDays: 10 });
      expect(service.getApplicablePolicy('CA_TEMP').retentionPeriodMs).toBe(10 * DAY_MS);

      const removed = await service.removeContractPolicy('CA_TEMP');
      expect(removed).toBe(true);
      expect(service.getApplicablePolicy('CA_TEMP').retentionPeriodMs).toBe(30 * DAY_MS);
      expect(service.getApplicablePolicy('CA_TEMP').isOverride).toBe(false);
    });

    it('rejects invalid retention period configurations', async () => {
      await expect(
        service.setContractPolicy('', { retentionDays: 5 }),
      ).rejects.toThrow(/contract address/i);

      await expect(
        service.setContractPolicy('CA_INVALID', { retentionPeriodMs: 0 }),
      ).rejects.toThrow(/positive number/i);

      await expect(
        service.setDefaultPolicy({ retentionPeriodMs: -100 }),
      ).rejects.toThrow(/positive number/i);
    });
  });

  // ── Requirement 3: Safe Background Cleanup ─────────────────────────────────

  describe('Safe Background Cleanup', () => {
    it('does not remove events prematurely before their retention periods expire', async () => {
      const now = Date.now();
      // Contract A has 7-day retention; event is 3 days old (NOT expired)
      await service.setContractPolicy('CA_WEEK', { retentionDays: 7 });
      const event3DaysOld = new Date(now - 3 * DAY_MS).toISOString();
      await insertProcessedEvent({
        eventId: 'evt-3d',
        contractAddress: 'CA_WEEK',
        processedAt: event3DaysOld,
      });

      // Default contract has 30-day retention; event is 20 days old (NOT expired)
      const event20DaysOld = new Date(now - 20 * DAY_MS).toISOString();
      await insertProcessedEvent({
        eventId: 'evt-20d',
        contractAddress: 'CA_DEFAULT',
        processedAt: event20DaysOld,
      });

      const cleanupResult = await service.cleanupExpiredEvents(new Date(now));

      expect(cleanupResult.totalDeleted).toBe(0);

      // Verify events still exist
      const remainingEvents = await db.all('SELECT event_id FROM processed_events');
      expect(remainingEvents).toHaveLength(2);
      const remainingIds = remainingEvents.map((r: any) => r.event_id);
      expect(remainingIds).toContain('evt-3d');
      expect(remainingIds).toContain('evt-20d');
    });

    it('removes events that have exceeded their applicable retention period', async () => {
      const now = Date.now();
      // Contract A has 7-day retention; event is 10 days old (EXPIRED)
      await service.setContractPolicy('CA_WEEK', { retentionDays: 7 });
      const event10DaysOld = new Date(now - 10 * DAY_MS).toISOString();
      await insertProcessedEvent({
        eventId: 'evt-expired',
        contractAddress: 'CA_WEEK',
        processedAt: event10DaysOld,
      });

      // Contract A also has an event that is 2 days old (NOT expired)
      const event2DaysOld = new Date(now - 2 * DAY_MS).toISOString();
      await insertProcessedEvent({
        eventId: 'evt-valid',
        contractAddress: 'CA_WEEK',
        processedAt: event2DaysOld,
      });

      const cleanupResult = await service.cleanupExpiredEvents(new Date(now));

      expect(cleanupResult.totalDeleted).toBe(1);

      // Verify only expired event was removed
      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].event_id).toBe('evt-valid');
    });

    it('evaluates different retention policies correctly per contract in the same cleanup cycle', async () => {
      const now = Date.now();
      // Contract Short: 2-day retention
      await service.setContractPolicy('CA_SHORT', { retentionDays: 2 });
      // Contract Long: 60-day retention
      await service.setContractPolicy('CA_LONG', { retentionDays: 60 });
      // Contract Default: uses default 30 days

      const timestamp5DaysOld = new Date(now - 5 * DAY_MS).toISOString();

      // 5-day old event for CA_SHORT -> EXPIRED (> 2 days)
      await insertProcessedEvent({ eventId: 'short-5d', contractAddress: 'CA_SHORT', processedAt: timestamp5DaysOld });
      // 5-day old event for CA_LONG -> ACTIVE (< 60 days)
      await insertProcessedEvent({ eventId: 'long-5d', contractAddress: 'CA_LONG', processedAt: timestamp5DaysOld });
      // 5-day old event for CA_DEFAULT -> ACTIVE (< 30 days default)
      await insertProcessedEvent({ eventId: 'default-5d', contractAddress: 'CA_DEFAULT', processedAt: timestamp5DaysOld });

      const result = await service.cleanupExpiredEvents(new Date(now));

      expect(result.totalDeleted).toBe(1);
      expect(result.detailsPerContract['CA_SHORT'].deleted).toBe(1);
      expect(result.detailsPerContract['CA_LONG'].deleted).toBe(0);
      expect(result.detailsPerContract['CA_DEFAULT'].deleted).toBe(0);

      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events ORDER BY event_id ASC');
      expect(remaining.map((r) => r.event_id)).toEqual(['default-5d', 'long-5d']);
    });
  });

  // ── Requirement 4: Active Retention Holds ──────────────────────────────────

  describe('Active Retention Holds', () => {
    it('protects events subject to active retention holds from cleanup regardless of age', async () => {
      const now = Date.now();
      await service.setContractPolicy('CA_AUDIT', { retentionDays: 5 });

      // Create an event that is 100 days old (well past retention)
      const event100DaysOld = new Date(now - 100 * DAY_MS).toISOString();
      await insertProcessedEvent({
        eventId: 'evt-held-1',
        contractAddress: 'CA_AUDIT',
        processedAt: event100DaysOld,
      });

      // Also create an expired event that is NOT held
      await insertProcessedEvent({
        eventId: 'evt-unheld',
        contractAddress: 'CA_AUDIT',
        processedAt: event100DaysOld,
      });

      // Apply retention hold to evt-held-1
      const hold = await service.applyHold({
        contractAddress: 'CA_AUDIT',
        eventId: 'evt-held-1',
        reason: 'Pending legal and regulatory discovery',
        heldBy: 'legal_team',
      });

      expect(hold.status).toBe('ACTIVE');
      expect(await service.isEventHeld('CA_AUDIT', 'evt-held-1')).toBe(true);
      expect(await service.isEventHeld('CA_AUDIT', 'evt-unheld')).toBe(false);

      // Run cleanup
      const result = await service.cleanupExpiredEvents(new Date(now));

      expect(result.totalDeleted).toBe(1); // evt-unheld deleted
      expect(result.totalProtectedByHolds).toBe(1); // evt-held-1 protected

      // Verify the held event still exists
      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].event_id).toBe('evt-held-1');
    });

    it('protects all events under a contract when a contract-wide hold is active', async () => {
      const now = Date.now();
      await service.setDefaultPolicy({ retentionDays: 1 });

      const oldTimestamp = new Date(now - 10 * DAY_MS).toISOString();
      await insertProcessedEvent({ eventId: 'c1-e1', contractAddress: 'CA_FROZEN', processedAt: oldTimestamp });
      await insertProcessedEvent({ eventId: 'c1-e2', contractAddress: 'CA_FROZEN', processedAt: oldTimestamp });
      await insertProcessedEvent({ eventId: 'c2-e1', contractAddress: 'CA_NORMAL', processedAt: oldTimestamp });

      // Apply contract-wide hold to CA_FROZEN
      await service.applyHold({
        contractAddress: 'CA_FROZEN',
        reason: 'Contract-wide compliance audit',
        heldBy: 'regulator',
      });

      const result = await service.cleanupExpiredEvents(new Date(now));

      expect(result.totalDeleted).toBe(1); // CA_NORMAL deleted
      expect(result.totalProtectedByHolds).toBe(2); // both CA_FROZEN events protected

      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events ORDER BY event_id ASC');
      expect(remaining.map((r) => r.event_id)).toEqual(['c1-e1', 'c1-e2']);
    });

    it('cleans up previously held events once the retention hold is released', async () => {
      const now = Date.now();
      await service.setDefaultPolicy({ retentionDays: 7 });

      const oldTimestamp = new Date(now - 30 * DAY_MS).toISOString();
      await insertProcessedEvent({ eventId: 'evt-temp-hold', contractAddress: 'CA_XYZ', processedAt: oldTimestamp });

      // Apply hold
      const hold = await service.applyHold({
        contractAddress: 'CA_XYZ',
        eventId: 'evt-temp-hold',
        reason: 'Investigation',
      });

      // Cleanup 1: protected by hold
      let result = await service.cleanupExpiredEvents(new Date(now));
      expect(result.totalDeleted).toBe(0);
      expect(result.totalProtectedByHolds).toBe(1);

      // Release hold
      await service.releaseHold(hold.id, { reason: 'Investigation completed', releasedBy: 'officer' });
      expect(await service.isEventHeld('CA_XYZ', 'evt-temp-hold')).toBe(false);

      // Cleanup 2: now eligible for cleanup
      result = await service.cleanupExpiredEvents(new Date(now));
      expect(result.totalDeleted).toBe(1);
      expect(result.totalProtectedByHolds).toBe(0);

      const count = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM processed_events');
      expect(count?.count).toBe(0);
    });

    it('rejects releasing non-existent or already released holds', async () => {
      await expect(service.releaseHold('non-existent')).rejects.toThrow(/not found/i);

      const hold = await service.applyHold({
        contractAddress: 'CA_TEST',
        reason: 'Test',
      });
      await service.releaseHold(hold.id);

      await expect(service.releaseHold(hold.id)).rejects.toThrow(/already released/i);
    });

    it('atomically prevents deletion when a hold is applied after initial hold lookup (race condition protection)', async () => {
      const now = Date.now();
      await service.setContractPolicy('CA_RACE', { retentionDays: 1 });

      const expiredTime = new Date(now - 5 * DAY_MS).toISOString();
      await insertProcessedEvent({
        eventId: 'evt-race-held',
        contractAddress: 'CA_RACE',
        processedAt: expiredTime,
      });

      // Insert an active hold directly into DB without service's getActiveHolds knowing (simulate hold applied mid-cleanup)
      // Spy on getActiveHolds to return an empty array (simulating hold arriving AFTER initial in-memory lookup)
      jest.spyOn(service, 'getActiveHolds').mockResolvedValueOnce([]);

      // Apply the active hold in the database
      await db.run(
        `INSERT INTO event_retention_holds (
          id, contract_address, event_id, fingerprint, reason, held_by, created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        ['hold-race-1', 'CA_RACE', 'evt-race-held', 'CA_RACE:evt-race-held', 'Concurrent legal hold', 'compliance', new Date().toISOString()],
      );

      // Run cleanup - candidate pre-filtering will NOT see the hold, but the atomic DB DELETE query MUST block deletion
      const cleanupResult = await service.cleanupExpiredEvents(new Date(now));

      expect(cleanupResult.totalDeleted).toBe(0);
      expect(cleanupResult.totalProtectedByHolds).toBe(1);

      // Verify the event was not deleted
      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events WHERE event_id = ?', ['evt-race-held']);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].event_id).toBe('evt-race-held');
    });
  });

  // ── Requirement 5: Auditable Retention Actions ─────────────────────────────

  describe('Auditable Retention Actions', () => {
    it('creates immutable audit logs for policy changes, holds, and cleanups', async () => {
      // 1. Policy Set
      await service.setContractPolicy('CA_AUDITED', { retentionDays: 14 }, 'admin_alice');

      // 2. Policy Update
      await service.setContractPolicy('CA_AUDITED', { retentionDays: 21 }, 'admin_bob');

      // 3. Hold Applied
      const hold = await service.applyHold({
        contractAddress: 'CA_AUDITED',
        eventId: 'evt-audit-1',
        reason: 'Security incident review',
        heldBy: 'sec_team',
      });

      // 4. Hold Released
      await service.releaseHold(hold.id, {
        reason: 'Review passed',
        releasedBy: 'sec_lead',
      });

      // 5. Cleanup Executed
      await service.cleanupExpiredEvents();

      // Retrieve full audit history
      const history = await service.getAuditHistory();
      expect(history.length).toBeGreaterThanOrEqual(5);

      const actions = history.map((h) => h.action);
      expect(actions).toContain('POLICY_SET');
      expect(actions).toContain('POLICY_UPDATED');
      expect(actions).toContain('HOLD_APPLIED');
      expect(actions).toContain('HOLD_RELEASED');
      expect(actions).toContain('CLEANUP_EXECUTED');

      // Verify specific audit attributes
      const policySetEntry = history.find((h) => h.action === 'POLICY_SET');
      expect(policySetEntry?.contractAddress).toBe('CA_AUDITED');
      expect(policySetEntry?.actor).toBe('admin_alice');

      const cleanupEntry = history.find((h) => h.action === 'CLEANUP_EXECUTED');
      expect(cleanupEntry?.details).toHaveProperty('runId');
      expect(cleanupEntry?.details).toHaveProperty('totalDeleted');
    });
  });

  // ── Integration with Cleanup Services ──────────────────────────────────────

  describe('Integration with Database Cleanup Jobs', () => {
    it('integrates with DatabaseCleanupJob to enforce per-contract retention and holds', async () => {
      const now = Date.now();
      const jobRetentionService = new EventRetentionService(db, { defaultRetentionMs: 30 * DAY_MS });
      await jobRetentionService.ensureSchema();
      await jobRetentionService.setContractPolicy('CA_SPECIFIC', { retentionDays: 5 });

      const timestamp10DaysOld = new Date(now - 10 * DAY_MS).toISOString();

      // CA_SPECIFIC (5-day retention): expired
      await insertProcessedEvent({ eventId: 'e-spec', contractAddress: 'CA_SPECIFIC', processedAt: timestamp10DaysOld });
      // CA_DEFAULT (30-day retention): NOT expired
      await insertProcessedEvent({ eventId: 'e-def', contractAddress: 'CA_DEFAULT', processedAt: timestamp10DaysOld });
      // CA_HELD (5-day retention, but held): protected
      await insertProcessedEvent({ eventId: 'e-held', contractAddress: 'CA_SPECIFIC', processedAt: timestamp10DaysOld });
      await jobRetentionService.applyHold({ contractAddress: 'CA_SPECIFIC', eventId: 'e-held', reason: 'Audit hold' });

      const cleanupJob = new DatabaseCleanupJob(
        db,
        {
          enabled: true,
          intervalMs: 60000,
          retentionDays: 30,
          notificationRetentionMs: DAY_MS * 7,
          rateLimitEventRetentionMs: DAY_MS,
          eventRetentionMs: DAY_MS,
          processedEventRetentionMs: DAY_MS * 30,
          executionLogRetentionMs: DAY_MS * 90,
        },
        undefined,
        jobRetentionService,
      );

      const runResult = await cleanupJob.runOnce();
      expect(runResult?.deletedCounts['processed_events']).toBe(1); // only e-spec deleted

      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events ORDER BY event_id ASC');
      expect(remaining.map((r) => r.event_id)).toEqual(['e-def', 'e-held']);
    });

    it('integrates with CleanupService to execute hold-aware and policy-aware cleanup', async () => {
      const now = Date.now();
      const cleanupRetentionService = new EventRetentionService(db, { defaultRetentionMs: 7 * DAY_MS });
      await cleanupRetentionService.ensureSchema();

      const oldDate = new Date(now - 14 * DAY_MS).toISOString();
      await insertProcessedEvent({ eventId: 'cs-old', contractAddress: 'CA_ONE', processedAt: oldDate });
      await insertProcessedEvent({ eventId: 'cs-held', contractAddress: 'CA_ONE', processedAt: oldDate });
      await cleanupRetentionService.applyHold({ contractAddress: 'CA_ONE', eventId: 'cs-held', reason: 'Hold' });

      const cleanupService = new CleanupService(
        db,
        new EventRegistry(),
        {
          intervalMs: 60000,
          processedEventRetentionMs: 7 * DAY_MS,
        },
        cleanupRetentionService,
      );

      const result = await cleanupService.runDbCleanup();
      expect(result.processedEvents).toBe(1); // only cs-old deleted

      const remaining = await db.all<{ event_id: string }>('SELECT event_id FROM processed_events');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].event_id).toBe('cs-held');
    });
  });

  // ── Background Runner Lifecycle ────────────────────────────────────────────

  describe('Background Cleanup Runner', () => {
    it('starts and stops safely without lingering background handles', async () => {
      service.start(100);
      await service.stop();
      // Second stop is safe and idempotent
      await service.stop();
    });
  });
});
