import { ConfigError, loadConfig, validateConfig } from './config';

describe('Config validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // CONTRACT_ADDRESSES is a required variable; give it a valid default so
    // tests unrelated to required-variable validation aren't affected.
    process.env.CONTRACT_ADDRESSES = JSON.stringify([{ address: 'CTEST', events: ['*'] }]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws a descriptive error when DISCORD_WEBHOOK_ID is set without DISCORD_WEBHOOK_URL', () => {
    process.env.DISCORD_WEBHOOK_ID = '123';

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(
      'DISCORD_WEBHOOK_URL is required when DISCORD_WEBHOOK_ID is provided.'
    );
  });

  it('throws a descriptive error when DISCORD_WEBHOOK_URL is set without DISCORD_WEBHOOK_ID', () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(
      'DISCORD_WEBHOOK_ID is required when DISCORD_WEBHOOK_URL is provided.'
    );
  });

  it('throws a descriptive error for invalid CONTRACT_ADDRESSES JSON', () => {
    process.env.CONTRACT_ADDRESSES = 'not-json';

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow('CONTRACT_ADDRESSES must be valid JSON. Received: not-json');
  });

  it('throws a descriptive error when a required environment variable is missing', () => {
    delete process.env.CONTRACT_ADDRESSES;

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow(
      'Missing required environment variable(s): CONTRACT_ADDRESSES.'
    );
  });

  it('throws a descriptive error for invalid integer variables', () => {
    process.env.EVENTS_API_PORT = 'eighty';

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow('EVENTS_API_PORT must be a valid integer, got "eighty"');
  });

  it('loads default values when optional environment variables are omitted', () => {
    process.env.CONTRACT_ADDRESSES = JSON.stringify([{ address: 'CTEST', events: ['*'] }]);
    delete process.env.STELLAR_NETWORK;
    delete process.env.STELLAR_RPC_URL;
    delete process.env.POLL_INTERVAL_MS;
    delete process.env.MAX_RECONNECT_ATTEMPTS;
    delete process.env.RECONNECT_DELAY_MS;
    delete process.env.EVENTS_API_PORT;
    delete process.env.EVENTS_API_CORS_ORIGIN;
    delete process.env.RETRY_BASE_DELAY_MS;
    delete process.env.RETRY_MAX_RETRIES;
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK_ID;
    delete process.env.NOTIFICATION_DEDUPLICATION_WINDOW_MS;
    delete process.env.NOTIFICATION_DEDUPLICATION_MAX_SIZE;

    const config = loadConfig();

    expect(config).toMatchObject({
      stellarNetwork: 'testnet',
      stellarRpcUrl: 'https://soroban-testnet.stellar.org:443',
      contractAddresses: [{ address: 'CTEST', events: ['*'] }],
      pollIntervalMs: 30000,
      maxReconnectAttempts: 5,
      reconnectDelayMs: 5000,
      eventsApiPort: 8787,
      eventsApiCorsOrigin: 'http://localhost:5173',
      retryQueue: {
        baseDelayMs: 5000,
        maxRetries: 5,
      },
      analytics: {
        enabled: true,
        maxRecords: 10000,
        maxBuckets: 168,
        persistIntervalMs: 300000,
        snapshotRetentionDays: 30,
      },
      cleanup: {
        intervalMs: 3600000,
        notificationRetentionMs: 604800000,
        rateLimitEventRetentionMs: 86400000,
        eventRetentionMs: 86400000,
        processedEventRetentionMs: 2592000000,
        executionLogRetentionMs: 7776000000,
      },
    });
  });

  it('loads a configured processed event retention duration', () => {
    process.env.PROCESSED_EVENT_RETENTION_MS = '3600000';

    expect(loadConfig().cleanup?.processedEventRetentionMs).toBe(3600000);
  });

  it('rejects invalid processed event retention configuration', () => {
    process.env.PROCESSED_EVENT_RETENTION_MS = 'not-a-duration';

    expect(() => loadConfig()).toThrow(
      'PROCESSED_EVENT_RETENTION_MS must be a valid integer, got "not-a-duration"'
    );
  });

  it('rejects processed event retention shorter than one minute', () => {
    process.env.PROCESSED_EVENT_RETENTION_MS = '59999';

    const config = loadConfig();

    expect(() => validateConfig(config)).toThrow(
      'PROCESSED_EVENT_RETENTION_MS must be >= 60000 ms (received: 59999).'
    );
  });

  it('loads notification deduplication settings when Discord is configured', () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';
    process.env.DISCORD_WEBHOOK_ID = '123';
    process.env.NOTIFICATION_DEDUPLICATION_WINDOW_MS = '15000';
    process.env.NOTIFICATION_DEDUPLICATION_MAX_SIZE = '250';

    const config = loadConfig();

    expect(config.discord).toMatchObject({
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      webhookId: '123',
      deduplicationWindowMs: 15000,
      deduplicationMaxSize: 250,
    });
  });

  describe('EXPIRATION_CONFIG', () => {
    it('loads default expiration settings when not specified', () => {
      delete process.env.EXPIRATION_ENABLED;
      delete process.env.EXPIRATION_DEFAULT_MS;
      delete process.env.EXPIRATION_PER_EVENT_TYPE;

      const config = loadConfig();

      expect(config.expiration).toMatchObject({
        enabled: true,
        defaultExpirationMs: 86400000, // 24 hours
        perEventTypeExpiration: undefined,
      });
    });

    it('loads custom default expiration time', () => {
      process.env.EXPIRATION_DEFAULT_MS = '3600000'; // 1 hour
      delete process.env.EXPIRATION_PER_EVENT_TYPE;

      const config = loadConfig();

      expect(config.expiration).toMatchObject({
        enabled: true,
        defaultExpirationMs: 3600000,
      });
    });

    it('loads per-event-type expiration settings', () => {
      process.env.EXPIRATION_PER_EVENT_TYPE = JSON.stringify({
        notification_scheduled: 3600000,
        alert: 604800000,
      });

      const config = loadConfig();

      expect(config.expiration?.perEventTypeExpiration).toEqual({
        notification_scheduled: 3600000,
        alert: 604800000,
      });
    });

    it('disables expiration when EXPIRATION_ENABLED is false', () => {
      process.env.EXPIRATION_ENABLED = 'false';

      const config = loadConfig();

      expect(config.expiration?.enabled).toBe(false);
    });

    it('throws ConfigError for invalid EXPIRATION_DEFAULT_MS', () => {
      process.env.EXPIRATION_DEFAULT_MS = 'not-a-number';

      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow(
        'EXPIRATION_DEFAULT_MS must be a valid integer, got "not-a-number"'
      );
    });

    it('throws ConfigError for invalid EXPIRATION_PER_EVENT_TYPE JSON', () => {
      process.env.EXPIRATION_PER_EVENT_TYPE = 'not-json';

      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow(
        'EXPIRATION_PER_EVENT_TYPE must be valid JSON. Received: not-json'
      );
    });

    it('throws ConfigError when EXPIRATION_PER_EVENT_TYPE is not an object', () => {
      process.env.EXPIRATION_PER_EVENT_TYPE = '["array", "value"]';

      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow(
        'EXPIRATION_PER_EVENT_TYPE must be a valid JSON object'
      );
    });
  });

  describe('WEBHOOK_SECRETS', () => {
    it('defaults to an empty array when not set', () => {
      delete process.env.WEBHOOK_SECRETS;
      const config = loadConfig();
      expect(config.webhookSecrets).toEqual([]);
    });

    it('parses valid webhook secrets', () => {
      process.env.WEBHOOK_SECRETS = JSON.stringify([
        { id: 'key-1', secret: 'whsec_abc' },
        { id: 'key-2', secret: 'whsec_def' },
      ]);

      const config = loadConfig();
      expect(config.webhookSecrets).toEqual([
        { id: 'key-1', secret: 'whsec_abc' },
        { id: 'key-2', secret: 'whsec_def' },
      ]);
    });

    it('throws ConfigError for invalid JSON', () => {
      process.env.WEBHOOK_SECRETS = 'not-json';
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('WEBHOOK_SECRETS must be valid JSON');
    });

    it('throws ConfigError when item is missing id', () => {
      process.env.WEBHOOK_SECRETS = JSON.stringify([{ secret: 'whsec_abc' }]);
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('WEBHOOK_SECRETS[0].id must be a non-empty string');
    });

    it('throws ConfigError when item is missing secret', () => {
      process.env.WEBHOOK_SECRETS = JSON.stringify([{ id: 'key-1' }]);
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('WEBHOOK_SECRETS[0].secret must be a non-empty string');
    });

    it('throws ConfigError when value is not an array', () => {
      process.env.WEBHOOK_SECRETS = '"string-value"';
      expect(() => loadConfig()).toThrow(ConfigError);
      expect(() => loadConfig()).toThrow('WEBHOOK_SECRETS must be a JSON array');
    });
  });
});
