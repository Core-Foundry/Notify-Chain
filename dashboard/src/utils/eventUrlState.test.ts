import {
  buildEventShareUrl,
  isValidEventId,
  parseSelectedEventId,
  resolveEventRoute,
} from './eventUrlState';

// Issue #1153: shareable dashboard event URLs.

const events = [{ eventId: 'evt-1' }, { eventId: '0000123-0001' }];

describe('shareable event URLs', () => {
  it('builds a stable link that only carries the event id', () => {
    const url = buildEventShareUrl('evt-1', {
      origin: 'https://dash.example',
      pathname: '/app/',
    });
    expect(url).toBe('https://dash.example/app/?eventId=evt-1#explorer');
  });

  it('never copies other query parameters (credentials) into the link', () => {
    window.history.replaceState({}, '', '/?apiKey=secret&token=abc&page=2#explorer');
    const url = buildEventShareUrl('evt-1');
    expect(url).not.toMatch(/secret|token|apiKey|page=/);
    expect(new URL(url).searchParams.get('eventId')).toBe('evt-1');
  });

  it('encodes unusual characters safely', () => {
    const url = buildEventShareUrl('a b&c', { origin: 'https://d.example', pathname: '/' });
    expect(new URL(url).searchParams.get('eventId')).toBe('a b&c');
  });

  it('parses the event id from the query string', () => {
    expect(parseSelectedEventId('?eventId=%20evt-1%20')).toBe('evt-1');
    expect(parseSelectedEventId('?eventId=')).toBeNull();
    expect(parseSelectedEventId('')).toBeNull();
  });

  it('validates event ids', () => {
    expect(isValidEventId('0000123-0001')).toBe(true);
    expect(isValidEventId('evt:1.2_3')).toBe(true);
    expect(isValidEventId('event/42')).toBe(true);
    expect(isValidEventId('<script>')).toBe(false);
    expect(isValidEventId('a'.repeat(257))).toBe(false);
  });

  it('resolves a direct link once events have loaded', () => {
    expect(resolveEventRoute('?eventId=evt-1', events, true)).toEqual({
      kind: 'found',
      eventId: 'evt-1',
      event: events[0],
    });
  });

  it('waits for the first load before reporting an event missing', () => {
    expect(resolveEventRoute('?eventId=evt-9', [], false)).toEqual({
      kind: 'pending',
      eventId: 'evt-9',
    });
    expect(resolveEventRoute('?eventId=evt-9', events, true)).toEqual({
      kind: 'not-found',
      eventId: 'evt-9',
    });
  });

  it('reports malformed ids and the absence of an id', () => {
    expect(resolveEventRoute('?eventId=%3Cbad%3E', events, true).kind).toBe('invalid');
    expect(resolveEventRoute('?page=2', events, true)).toEqual({ kind: 'none' });
  });
});
