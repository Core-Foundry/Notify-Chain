/**
 * Notification payload protocol versioning.
 *
 * Off-chain consumers should read `version` from every stored notification
 * and reject unsupported versions before delivery.
 */

/** Current notification payload protocol version. */
export const CURRENT_NOTIFICATION_VERSION = 1;

/**
 * Version history
 * | Version | Date       | Notes                                   |
 * |---------|------------|-----------------------------------------|
 * | 1       | 2026-07-26 | Initial versioned notification payloads |
 */

/**
 * Ensure a payload carries a supported protocol version.
 * Mutates `payload` to stamp the current version when absent.
 *
 * @throws Error when an explicit unsupported version is present.
 */
export function ensureNotificationVersion(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const raw = payload.version;
  if (raw === undefined || raw === null) {
    return { ...payload, version: CURRENT_NOTIFICATION_VERSION };
  }

  const version = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Unsupported notification version: ${raw}`);
  }
  if (version > CURRENT_NOTIFICATION_VERSION) {
    throw new Error(
      `Unsupported notification version ${version}; current is ${CURRENT_NOTIFICATION_VERSION}`
    );
  }

  return { ...payload, version };
}
