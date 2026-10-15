/**
 * #995 - Safe webhook redirect policy.
 *
 * Drives `sendWebhook` against a real local HTTP server so the assertion is on
 * what the network stack actually does, not on a mocked fetch.
 */
import * as http from 'http';
import {
  sendWebhook,
  isWebhookRedirectError,
  WebhookRedirectError,
} from './webhook-sender';

interface ServerHandle {
  url: string;
  close: () => Promise<void>;
  hits: string[];
}

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<ServerHandle> {
  const hits: string[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      hits.push(req.url ?? '/');
      handler(req, res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        hits,
        close: () =>
          new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe('sendWebhook redirect policy (#995)', () => {
  it('does not follow a redirect to another destination', async () => {
    const target = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    const redirector = await startServer((_req, res) => {
      res.writeHead(302, { Location: `${target.url}/internal` });
      res.end();
    });

    try {
      await expect(
        sendWebhook(`${redirector.url}/hook`, { a: 1 }),
      ).rejects.toBeInstanceOf(WebhookRedirectError);

      // The critical assertion: the redirect target was never contacted.
      expect(target.hits).toHaveLength(0);
    } finally {
      await redirector.close();
      await target.close();
    }
  });

  it('surfaces the redirect status and Location on the error', async () => {
    const target = await startServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    const redirector = await startServer((_req, res) => {
      res.writeHead(301, { Location: `${target.url}/elsewhere` });
      res.end();
    });

    try {
      let caught: unknown;
      try {
        await sendWebhook(`${redirector.url}/hook`, { a: 1 });
      } catch (error) {
        caught = error;
      }
      expect(isWebhookRedirectError(caught)).toBe(true);
      const err = caught as WebhookRedirectError;
      expect(err.status).toBe(301);
      expect(err.location).toContain('/elsewhere');
    } finally {
      await redirector.close();
      await target.close();
    }
  });

  it('returns the response normally for a 2xx destination', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"delivered":true}');
    });
    try {
      const response = await sendWebhook(`${server.url}/hook`, { a: 1 });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ delivered: true });
    } finally {
      await server.close();
    }
  });

  it('treats a 3xx as a policy violation even for 308 (method-preserving)', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(308, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    try {
      await expect(
        sendWebhook(`${server.url}/hook`, { a: 1 }),
      ).rejects.toBeInstanceOf(WebhookRedirectError);
    } finally {
      await server.close();
    }
  });
});
