import { JobMonitor, getJobMonitor, resetJobMonitor } from './job-monitor';

describe('JobMonitor', () => {
  let monitor: JobMonitor;

  beforeEach(() => {
    resetJobMonitor();
    monitor = new JobMonitor();
  });

  afterEach(() => {
    resetJobMonitor();
  });

  it('records job status through start and complete', () => {
    monitor.startJob('job-1', 'notification-poll', { batchSize: 10 });
    expect(monitor.getJob('job-1')?.status).toBe('running');

    monitor.completeJob('job-1', { processed: 3 });
    const job = monitor.getJob('job-1');
    expect(job?.status).toBe('completed');
    expect(job?.finishedAt).toBeDefined();
    expect(job?.durationMs).toBeGreaterThanOrEqual(0);
    expect(job?.metadata?.processed).toBe(3);
  });

  it('logs failed jobs with error details', () => {
    monitor.startJob('job-2', 'discord-delivery');
    monitor.failJob('job-2', 'webhook timeout');

    const failures = monitor.listFailures();
    expect(failures).toHaveLength(1);
    expect(failures[0].status).toBe('failed');
    expect(failures[0].error).toBe('webhook timeout');

    const snapshot = monitor.getSnapshot();
    expect(snapshot.failedCount).toBe(1);
    expect(snapshot.activeCount).toBe(0);
  });

  it('exposes a process-wide singleton', () => {
    const a = getJobMonitor();
    a.startJob('shared', 'scheduler-tick');
    const b = getJobMonitor();
    expect(b.getJob('shared')?.status).toBe('running');
  });
});
