import { Database } from '../database/database';
import { RetentionAuditTrail } from './retention-audit-trail';
import { RetentionAuditAction } from '../types/retention';

describe('RetentionAuditTrail (#1115)', () => {
  let db: Database;
  let auditTrail: RetentionAuditTrail;

  beforeEach(async () => {
    db = new Database(':memory:');
    await db.initialize();
    auditTrail = new RetentionAuditTrail(db);
    await auditTrail.ensureSchema();
  });

  afterEach(async () => {
    await db.close();
  });

  it('records retention actions and queries them by contract and action', async () => {
    const id1 = await auditTrail.record({
      action: 'POLICY_SET',
      contractAddress: 'CA111',
      actor: 'admin',
      details: { retentionDays: 7 },
    });

    const id2 = await auditTrail.record({
      action: 'HOLD_APPLIED',
      contractAddress: 'CA111',
      eventId: 'evt-1',
      fingerprint: 'CA111:evt-1',
      actor: 'compliance_officer',
      details: { reason: 'Legal inquiry' },
    });

    const id3 = await auditTrail.record({
      action: 'HOLD_RELEASED',
      contractAddress: 'CA111',
      eventId: 'evt-1',
      fingerprint: 'CA111:evt-1',
      actor: 'compliance_officer',
      details: { reason: 'Inquiry resolved' },
    });

    const id4 = await auditTrail.record({
      action: 'CLEANUP_EXECUTED',
      contractAddress: null,
      actor: 'system',
      details: { totalDeleted: 42, totalProtectedByHolds: 2 },
    });

    expect(id1).toBeGreaterThan(0);
    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
    expect(id4).toBeGreaterThan(id3);

    // Query by contract
    const contractRecords = await auditTrail.getByContract('CA111');
    expect(contractRecords).toHaveLength(3);
    expect(contractRecords[0].action).toBe('HOLD_RELEASED'); // order by timestamp desc
    expect(contractRecords[0].details).toEqual({ reason: 'Inquiry resolved' });

    // Query by action
    const cleanupRecords = await auditTrail.getByAction('CLEANUP_EXECUTED');
    expect(cleanupRecords).toHaveLength(1);
    expect(cleanupRecords[0].details).toEqual({ totalDeleted: 42, totalProtectedByHolds: 2 });
  });

  it('supports time-range filtering and pagination', async () => {
    const now = new Date();
    await auditTrail.record({
      action: 'POLICY_SET',
      contractAddress: 'CA_TEST',
      actor: 'user1',
      details: { test: true },
    });

    const results = await auditTrail.query({
      contractAddress: 'CA_TEST',
      since: new Date(now.getTime() - 10000),
      until: new Date(now.getTime() + 10000),
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0].contractAddress).toBe('CA_TEST');
    expect(results[0].actor).toBe('user1');
  });

  it('enforces immutability via database triggers preventing UPDATE and DELETE', async () => {
    const auditId = await auditTrail.record({
      action: 'POLICY_SET',
      contractAddress: 'CA_IMMUTABLE',
      actor: 'admin',
      details: { retentionPeriodMs: 1000 },
    });

    // Attempting to UPDATE the audit record must fail
    await expect(
      db.run('UPDATE retention_audit_log SET actor = ? WHERE id = ?', ['malicious_user', auditId]),
    ).rejects.toThrow(/immutable/i);

    // Attempting to DELETE the audit record must fail
    await expect(
      db.run('DELETE FROM retention_audit_log WHERE id = ?', [auditId]),
    ).rejects.toThrow(/immutable/i);

    // Verify record was untouched
    const records = await auditTrail.query({ contractAddress: 'CA_IMMUTABLE' });
    expect(records).toHaveLength(1);
    expect(records[0].actor).toBe('admin');
  });
});
