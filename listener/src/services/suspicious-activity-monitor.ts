import logger from '../utils/logger';

export interface MonitoringRule {
  /** Unique rule identifier */
  id: string;
  /** Max notifications allowed in `windowMs` before an alert fires */
  maxNotificationsPerWindow: number;
  /** Max consecutive failures before an alert fires */
  maxConsecutiveFailures: number;
  /** Max retry attempts for a single event before an alert fires */
  maxRetriesPerEvent: number;
  /** Rolling window in milliseconds (default: 60 000) */
  windowMs: number;
}

export interface ActivityAlert {
  ruleId: string;
  contractAddress: string;
  reason: string;
  triggeredAt: number;
  metadata: Record<string, unknown>;
}

export type AlertHandler = (alert: ActivityAlert) => void;

interface ContractWindow {
  notifications: number[];   // timestamps
  consecutiveFailures: number;
}

const DEFAULT_RULE: MonitoringRule = {
  id: 'default',
  maxNotificationsPerWindow: 100,
  maxConsecutiveFailures: 5,
  maxRetriesPerEvent: 3,
  windowMs: 60_000,
};

export class SuspiciousActivityMonitor {
  private readonly rules: Map<string, MonitoringRule> = new Map();
  private readonly windows: Map<string, ContractWindow> = new Map();
  private readonly alertHandlers: AlertHandler[] = [];

  constructor(rules: MonitoringRule[] = [DEFAULT_RULE]) {
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  addRule(rule: MonitoringRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(id: string): void {
    this.rules.delete(id);
  }

  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  recordNotification(contractAddress: string): void {
    const win = this.getOrCreateWindow(contractAddress);
    const now = Date.now();
    win.notifications.push(now);
    win.consecutiveFailures = 0;
    this.checkBurstRule(contractAddress, win, now);
  }

  recordFailure(contractAddress: string): void {
    const win = this.getOrCreateWindow(contractAddress);
    win.consecutiveFailures++;
    this.checkConsecutiveFailureRule(contractAddress, win);
  }

  recordRetry(contractAddress: string, eventId: string, retryCount: number): void {
    this.checkRetryRule(contractAddress, eventId, retryCount);
  }

  getWindowMetrics(contractAddress: string): { notificationsInWindow: number; consecutiveFailures: number } | null {
    const win = this.windows.get(contractAddress);
    if (!win) return null;
    const windowMs = this.getMaxWindowMs();
    const cutoff = Date.now() - windowMs;
    return {
      notificationsInWindow: win.notifications.filter((t) => t >= cutoff).length,
      consecutiveFailures: win.consecutiveFailures,
    };
  }

  private getOrCreateWindow(contractAddress: string): ContractWindow {
    let win = this.windows.get(contractAddress);
    if (!win) {
      win = { notifications: [], consecutiveFailures: 0 };
      this.windows.set(contractAddress, win);
    }
    return win;
  }

  private pruneWindow(win: ContractWindow, windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    win.notifications = win.notifications.filter((t) => t >= cutoff);
  }

  private getMaxWindowMs(): number {
    let max = DEFAULT_RULE.windowMs;
    for (const rule of this.rules.values()) {
      if (rule.windowMs > max) max = rule.windowMs;
    }
    return max;
  }

  private checkBurstRule(contractAddress: string, win: ContractWindow, now: number): void {
    for (const rule of this.rules.values()) {
      this.pruneWindow(win, rule.windowMs);
      if (win.notifications.length > rule.maxNotificationsPerWindow) {
        this.fireAlert({
          ruleId: rule.id,
          contractAddress,
          reason: `Burst: ${win.notifications.length} notifications in ${rule.windowMs}ms window (limit: ${rule.maxNotificationsPerWindow})`,
          triggeredAt: now,
          metadata: { count: win.notifications.length, windowMs: rule.windowMs },
        });
      }
    }
  }

  private checkConsecutiveFailureRule(contractAddress: string, win: ContractWindow): void {
    for (const rule of this.rules.values()) {
      if (win.consecutiveFailures >= rule.maxConsecutiveFailures) {
        this.fireAlert({
          ruleId: rule.id,
          contractAddress,
          reason: `High failure rate: ${win.consecutiveFailures} consecutive failures (limit: ${rule.maxConsecutiveFailures})`,
          triggeredAt: Date.now(),
          metadata: { consecutiveFailures: win.consecutiveFailures },
        });
      }
    }
  }

  private checkRetryRule(contractAddress: string, eventId: string, retryCount: number): void {
    for (const rule of this.rules.values()) {
      if (retryCount >= rule.maxRetriesPerEvent) {
        this.fireAlert({
          ruleId: rule.id,
          contractAddress,
          reason: `Excessive retries: event ${eventId} has been retried ${retryCount} times (limit: ${rule.maxRetriesPerEvent})`,
          triggeredAt: Date.now(),
          metadata: { eventId, retryCount },
        });
      }
    }
  }

  private fireAlert(alert: ActivityAlert): void {
    logger.warn('Suspicious activity detected', {
      ruleId: alert.ruleId,
      contractAddress: alert.contractAddress,
      reason: alert.reason,
      triggeredAt: new Date(alert.triggeredAt).toISOString(),
      metadata: alert.metadata,
    });
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (err) {
        logger.error('Alert handler threw an error', { error: err });
      }
    }
  }
}

let defaultMonitor: SuspiciousActivityMonitor | null = null;

export function getSuspiciousActivityMonitor(): SuspiciousActivityMonitor {
  if (!defaultMonitor) {
    defaultMonitor = new SuspiciousActivityMonitor();
    logger.info('Suspicious activity monitor initialized');
  }
  return defaultMonitor;
}

export function setSuspiciousActivityMonitor(instance: SuspiciousActivityMonitor | null): void {
  defaultMonitor = instance;
}
