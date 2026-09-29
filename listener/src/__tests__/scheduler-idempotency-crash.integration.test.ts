import { spawn } from 'node:child_process';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Database } from '../database/database';

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('keeps one receiver effect after both sides restart and the retry scheduler replays delivery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'idempotent-restart-'));
  const listener = resolve(__dirname, '../..');
  const attempts: { key: string; body: string }[] = [];
  let receiver: Database;
  let server: Server | undefined;
  let port = 0;

  async function startReceiver(): Promise<void> {
    receiver = new Database(join(directory, 'receiver.db'));
    await receiver.initialize();
    // This insert IS the receiver's business effect and its durable receipt.
    // A real receiver must provide the same atomicity for its own side effect.
    await receiver.exec(
      'CREATE TABLE IF NOT EXISTS receiver_effects (delivery_key TEXT PRIMARY KEY, body TEXT NOT NULL)',
    );
    server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        void (async () => {
          const key = request.headers['idempotency-key'];
          if (typeof key !== 'string' || !key) {
            response.writeHead(400).end();
            return;
          }
          attempts.push({ key, body });
          await receiver.run(
            'INSERT INTO receiver_effects (delivery_key, body) VALUES (?, ?) ON CONFLICT(delivery_key) DO NOTHING',
            [key, body],
          );
          const receipt = await receiver.get<{ body: string }>(
            'SELECT body FROM receiver_effects WHERE delivery_key = ?',
            [key],
          );
          response.writeHead(receipt?.body === body ? 200 : 409).end();
        })().catch((error) => {
          response.writeHead(500).end(String(error));
        });
      });
    });
    await new Promise<void>((resolveListening, reject) => {
      server!.once('error', reject);
      server!.listen(port, '127.0.0.1', resolveListening);
    });
    port = (server.address() as AddressInfo).port;
  }

  async function stopReceiver(): Promise<void> {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolveClosed, reject) =>
        server!.close((error) => (error ? reject(error) : resolveClosed())),
      );
      server = undefined;
    }
    await receiver.close();
  }

  async function runProcess(mode: string): Promise<number | null> {
    return new Promise((resolveProcess, reject) => {
      const child = spawn(
        process.execPath,
        [
          join(listener, 'node_modules/jest/bin/jest.js'),
          '--config',
          join(listener, 'jest.config.js'),
          '--runInBand',
          '--detectOpenHandles',
          '--roots',
          join(listener, 'test-fixtures'),
          '--testMatch=**/restart-delivery.worker.ts',
          '--cacheDirectory',
          join(directory, 'jest-cache'),
          '--runTestsByPath',
          join(listener, 'test-fixtures/restart-delivery.worker.ts'),
        ],
        {
          cwd: listener,
          windowsHide: true,
          env: {
            ...process.env,
            IDEMPOTENCY_PROBE_DIRECTORY: directory,
            IDEMPOTENCY_PROBE_ENDPOINT: `http://127.0.0.1:${port}/notifications`,
            IDEMPOTENCY_PROBE_MODE: mode,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 20_000);
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        const expected = mode === 'crash' ? 79 : 0;
        if (timedOut || code !== expected) {
          reject(
            new Error(
              `${mode} process exited ${code}; timedOut=${timedOut}\n${output.slice(-4000)}`,
            ),
          );
        } else resolveProcess(code);
      });
    });
  }

  try {
    await startReceiver();
    expect(await runProcess('crash')).toBe(79);
    expect(attempts).toHaveLength(1);
    const key = attempts[0].key;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    await stopReceiver();
    await startReceiver();
    expect(await receiver!.get('SELECT count(*) AS count FROM receiver_effects')).toEqual({
      count: 1,
    });
    expect(await runProcess('recover')).toBe(0);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(await receiver!.get('SELECT count(*) AS count FROM receiver_effects')).toEqual({
      count: 1,
    });
    expect(await runProcess('completed')).toBe(0);
    expect(attempts).toHaveLength(2);

    // Reusing an identity for different content is rejected, not silently lost.
    const conflict = await fetch(`http://127.0.0.1:${port}/notifications`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: '{"different":true}',
    });
    expect(conflict.status).toBe(409);
    expect(await receiver!.get('SELECT count(*) AS count FROM receiver_effects')).toEqual({
      count: 1,
    });
    const distinctJob = await fetch(`http://127.0.0.1:${port}/notifications`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'another-logical-job' },
      body: attempts[0].body,
    });
    expect(distinctJob.status).toBe(200);
    expect(await receiver!.get('SELECT count(*) AS count FROM receiver_effects')).toEqual({
      count: 2,
    });
  } finally {
    await stopReceiver();
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);
