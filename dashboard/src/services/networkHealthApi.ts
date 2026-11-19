import { parseNetworkHealth, type NetworkHealthSnapshot } from '../utils/networkHealth';

/**
 * Fetch the listener's /health report (issue #1154). The listener answers 503
 * with a full body when a dependency is down, so that body is still parsed.
 */
export async function fetchNetworkHealth(
  healthUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<NetworkHealthSnapshot> {
  const response = await fetch(healthUrl, { signal: options.signal });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Network health request failed: ${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (body === null) {
    throw new Error('Network health response was not valid JSON');
  }
  return parseNetworkHealth(body);
}
