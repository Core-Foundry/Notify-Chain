import { csrfFetch } from './csrfFetch';

describe('csrfFetch', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('obtains a token and sends it with cookie credentials for state-changing requests', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'bound-token', expiresIn: 3600 }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    await csrfFetch('https://api.example.test/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL('https://api.example.test/api/csrf-token'),
      expect.objectContaining({ credentials: 'include' }),
    );
    const mutation = fetchMock.mock.calls[1][1]!;
    expect(mutation.credentials).toBe('include');
    expect(new Headers(mutation.headers).get('X-CSRF-Token')).toBe('bound-token');
    expect(mutation.method).toBe('POST');
  });

  it('does not send a mutation when token retrieval fails', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as Response);

    await expect(
      csrfFetch('https://api-failure.example.test/api/templates', { method: 'DELETE' }),
    ).rejects.toThrow('Failed to obtain CSRF token: 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not add CSRF traffic to read-only requests', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);

    await csrfFetch('https://api-read.example.test/api/templates');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api-read.example.test/api/templates', {});
  });
});
