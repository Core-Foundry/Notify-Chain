import {
  CURRENT_NOTIFICATION_VERSION,
  ensureNotificationVersion,
} from './notification-version';

describe('notification versioning', () => {
  it('documents the current version as 1', () => {
    expect(CURRENT_NOTIFICATION_VERSION).toBe(1);
  });

  it('stamps current version when missing', () => {
    const result = ensureNotificationVersion({ content: 'hi' });
    expect(result.version).toBe(CURRENT_NOTIFICATION_VERSION);
    expect(result.content).toBe('hi');
  });

  it('accepts the current version', () => {
    const result = ensureNotificationVersion({ version: 1, body: 'x' });
    expect(result.version).toBe(1);
  });

  it('rejects future versions', () => {
    expect(() => ensureNotificationVersion({ version: 999 })).toThrow(
      /Unsupported notification version/
    );
  });

  it('rejects non-positive versions', () => {
    expect(() => ensureNotificationVersion({ version: 0 })).toThrow(
      /Unsupported notification version/
    );
  });
});
