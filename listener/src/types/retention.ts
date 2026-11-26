export type RetentionAuditAction =
  | 'POLICY_SET'
  | 'POLICY_UPDATED'
  | 'POLICY_REMOVED'
  | 'HOLD_APPLIED'
  | 'HOLD_RELEASED'
  | 'CLEANUP_EXECUTED';

export interface RetentionPolicy {
  contractAddress?: string;
  retentionPeriodMs: number;
  retentionDays: number;
  description?: string;
  updatedAt: Date;
  updatedBy: string;
  isOverride: boolean;
}

export interface SetRetentionPolicyInput {
  retentionPeriodMs?: number;
  retentionDays?: number;
  description?: string;
  actor?: string;
}

export interface EventRetentionHold {
  id: string;
  contractAddress?: string;
  eventId?: string;
  fingerprint?: string;
  reason: string;
  heldBy: string;
  createdAt: Date;
  status: 'ACTIVE' | 'RELEASED';
  releasedAt?: Date;
  releasedBy?: string;
  releaseReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ApplyRetentionHoldInput {
  holdId?: string;
  contractAddress?: string;
  eventId?: string;
  fingerprint?: string;
  reason: string;
  heldBy?: string;
  metadata?: Record<string, unknown>;
}

export interface ReleaseRetentionHoldInput {
  reason?: string;
  releasedBy?: string;
}

export interface RetentionAuditRecord {
  id: number;
  action: RetentionAuditAction;
  contractAddress: string | null;
  eventId: string | null;
  fingerprint: string | null;
  actor: string;
  timestamp: Date;
  details: Record<string, unknown> | null;
}

export interface RetentionAuditRecordRow {
  id: number;
  action: string;
  contract_address: string | null;
  event_id: string | null;
  fingerprint: string | null;
  actor: string;
  timestamp: string;
  details: string | null;
}

export interface RetentionAuditFilters {
  action?: RetentionAuditAction;
  contractAddress?: string;
  eventId?: string;
  fingerprint?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export interface RecordRetentionAuditInput {
  action: RetentionAuditAction;
  contractAddress?: string | null;
  eventId?: string | null;
  fingerprint?: string | null;
  actor?: string;
  details?: Record<string, unknown> | null;
}

export interface RetentionCleanupContractDetail {
  retentionPeriodMs: number;
  cutoff: string;
  evaluated: number;
  deleted: number;
  protectedByHolds: number;
}

export interface RetentionCleanupResult {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  totalDeleted: number;
  totalProtectedByHolds: number;
  contractsEvaluated: number;
  detailsPerContract: Record<string, RetentionCleanupContractDetail>;
}
