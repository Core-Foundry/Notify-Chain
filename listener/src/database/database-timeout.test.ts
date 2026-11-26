import { Database, DatabaseQueryTimeoutError } from './database';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Database query execution limits', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database(':memory:', { queryTimeoutMs: 25 });
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  it('interrupts a query at its deadline and lets the next operation use the connection', async () => {
    const expensiveQuery = db.get(
      `WITH RECURSIVE sequence(value) AS (
         VALUES(1)
         UNION ALL
         SELECT value + 1 FROM sequence
       )
       SELECT sum(value) FROM sequence`,
    );
    const normalQuery = db.get<{ value: number }>('SELECT 42 AS value');

    await expect(expensiveQuery).rejects.toBeInstanceOf(DatabaseQueryTimeoutError);
    await expect(normalQuery).resolves.toEqual({ value: 42 });
  });

  it('runs ordinary queries unaffected when they finish within the limit', async () => {
    await expect(db.get<{ value: number }>('SELECT 7 AS value')).resolves.toEqual({ value: 7 });
  });

  it('keeps other operations outside a transaction until it commits', async () => {
    let markStarted!: () => void;
    let finishTransaction!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const transactionGate = new Promise<void>((resolve) => {
      finishTransaction = resolve;
    });

    const transaction = db.transaction(async () => {
      await db.run('CREATE TABLE transaction_lock_test (value INTEGER)');
      await db.run('INSERT INTO transaction_lock_test VALUES (1)');
      markStarted();
      await transactionGate;
      await db.run('INSERT INTO transaction_lock_test VALUES (2)');
    });

    await started;
    const outsideRead = db.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transaction_lock_test',
    );
    finishTransaction();
    await transaction;

    await expect(outsideRead).resolves.toEqual({ count: 2 });
  });

  it('rejects invalid execution limits', () => {
    expect(() => new Database(':memory:', { queryTimeoutMs: 0 })).toThrow(
      'queryTimeoutMs must be a positive finite number',
    );
    expect(() => new Database(':memory:', { queryTimeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      'queryTimeoutMs must be a positive finite number',
    );
  });
});
