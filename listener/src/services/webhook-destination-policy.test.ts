/**
 * #994 - Prevent DNS rebinding in outbound webhook requests.
 *
 * The resolver is injected so we can simulate a hostname whose DNS answer
 * changes between calls (the rebinding case) without touching real DNS.
 */
import {
  assertSafeWebhookDestination,
  isPrivateAddress,
  isUnsafeWebhookDestinationError,
  UnsafeWebhookDestinationError,
} from './webhook-destination-policy';

describe('isPrivateAddress (#994)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111'])(
    'treats %s as public',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );

  it('treats a non-IP value as private (fail closed)', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('assertSafeWebhookDestination (#994)', () => {
  it('accepts a hostname that resolves only to public addresses', async () => {
    const addresses = await assertSafeWebhookDestination(
      'https://hooks.example.com/x',
      { resolve: async () => ['93.184.216.34'] },
    );
    expect(addresses).toEqual(['93.184.216.34']);
  });

  it('rejects a hostname that resolves to loopback', async () => {
    await expect(
      assertSafeWebhookDestination('https://evil.example.com/x', {
        resolve: async () => ['127.0.0.1'],
      }),
    ).rejects.toBeInstanceOf(UnsafeWebhookDestinationError);
  });

  it('rejects a hostname that resolves to the metadata endpoint', async () => {
    let caught: unknown;
    try {
      await assertSafeWebhookDestination('https://rebind.example.com/x', {
        resolve: async () => ['169.254.169.254'],
      });
    } catch (error) {
      caught = error;
    }
    expect(isUnsafeWebhookDestinationError(caught)).toBe(true);
    expect((caught as UnsafeWebhookDestinationError).addresses).toContain(
      '169.254.169.254',
    );
  });

  it('rejects a literal private IP without any DNS lookup', async () => {
    let looked = false;
    await expect(
      assertSafeWebhookDestination('http://127.0.0.1:8080/hook', {
        resolve: async () => {
          looked = true;
          return [];
        },
      }),
    ).rejects.toBeInstanceOf(UnsafeWebhookDestinationError);
    expect(looked).toBe(false);
  });

  it('accepts a literal public IP', async () => {
    const addresses = await assertSafeWebhookDestination(
      'https://8.8.8.8/hook',
    );
    expect(addresses).toEqual(['8.8.8.8']);
  });

  it('rejects a hostname that fails to resolve', async () => {
    await expect(
      assertSafeWebhookDestination('https://nope.invalid/x', {
        resolve: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    ).rejects.toBeInstanceOf(UnsafeWebhookDestinationError);
  });

  it('rejects when any of several answers is private (partial rebind)', async () => {
    await expect(
      assertSafeWebhookDestination('https://mixed.example.com/x', {
        resolve: async () => ['93.184.216.34', '10.0.0.5'],
      }),
    ).rejects.toBeInstanceOf(UnsafeWebhookDestinationError);
  });

  it('demonstrates rebinding: a hostname safe on first check, private on delivery', async () => {
    // First resolution (registration-time validation) looks public...
    const first = await assertSafeWebhookDestination(
      'https://rebind.example.com/x',
      { resolve: async () => ['93.184.216.34'] },
    );
    expect(first).toEqual(['93.184.216.34']);

    // ...but the delivery-time re-resolution sees the attacker's new record.
    await expect(
      assertSafeWebhookDestination('https://rebind.example.com/x', {
        resolve: async () => ['127.0.0.1'],
      }),
    ).rejects.toBeInstanceOf(UnsafeWebhookDestinationError);
  });

  it('honours allowPrivate for self-hosted receivers', async () => {
    const addresses = await assertSafeWebhookDestination(
      'http://127.0.0.1:9000/hook',
      { allowPrivate: true },
    );
    expect(addresses).toEqual(['127.0.0.1']);
  });
});
