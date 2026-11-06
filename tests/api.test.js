// Tests de les funcions de servidor: forma canònica de la consulta,
// límit per IP i pressupost global de crèdits del proveïdor.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import quotes from '../api/quotes.js';
import history from '../api/history.js';
import fx from '../api/fx.js';
import {lookup} from '../api/_market.js';
import {consume, resetMemoryStore, clientIp} from '../api/_ratelimit.js';

/**
 * Resposta simulada compatible amb l'API de Vercel (status/json/setHeader).
 * @returns {{statusCode: number, body: any, headers: Record<string, string>, status: Function, json: Function, setHeader: Function}}
 */
function mockRes() {
  const res = {statusCode: 200, body: undefined, headers: {}};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  return res;
}

/**
 * Petició simulada.
 * @param {Record<string, unknown>} query Paràmetres de consulta.
 * @param {string} [ip] IP del client.
 */
function mockReq(query, ip = '203.0.113.7') {
  return {method: 'GET', query, headers: {'x-real-ip': ip}};
}

/** Resposta vàlida de Twelve Data per a /quote. */
const QUOTE_OK = {
  close: '120.5', change: '1.2', percent_change: '1.0', currency: 'USD', mic_code: 'XNGS',
  timestamp: 1793923200, is_market_open: false, fifty_two_week: {high: '150', low: '80'},
};

let fetchMock;
beforeEach(() => {
  resetMemoryStore();
  process.env.TWELVE_DATA_API_KEY = 'test-key';
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.RATE_LIMIT_PER_IP_PER_MINUTE;
  delete process.env.MARKET_DATA_CREDITS_PER_MINUTE;
  delete process.env.MARKET_DATA_CREDITS_PER_DAY;
  fetchMock = vi.fn(async () => new Response(JSON.stringify(QUOTE_OK), {status: 200}));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lookup (consulta canònica)', () => {
  it('accepta un símbol conegut exacte', () => {
    expect(lookup({query: {symbol: 'NVDA'}}).ticker).toBe('NVDA');
  });

  it.each([
    [{symbol: 'NVDA', x: '1'}, 'NON_CANONICAL_QUERY'],
    [{symbol: 'nvda'}, 'NON_CANONICAL_QUERY'],
    [{symbol: ' NVDA'}, 'NON_CANONICAL_QUERY'],
    [{symbols: 'NVDA'}, 'NON_CANONICAL_QUERY'],
    [{symbol: ['NVDA', 'AAPL']}, 'UNKNOWN_OR_MULTIPLE_SYMBOLS'],
    [{symbol: 'NVDA,AAPL'}, 'UNKNOWN_OR_MULTIPLE_SYMBOLS'],
    [{symbol: 'ZZZZ'}, 'UNKNOWN_OR_MULTIPLE_SYMBOLS'],
    [{symbol: '__proto__'}, 'UNKNOWN_OR_MULTIPLE_SYMBOLS'],
    [{symbol: 'constructor'}, 'UNKNOWN_OR_MULTIPLE_SYMBOLS'],
    [{}, 'UNKNOWN_OR_MULTIPLE_SYMBOLS'],
  ])('rebutja %j amb %s', (query, code) => {
    expect(() => lookup({query})).toThrowError(code);
  });
});

describe('handler de cotitzacions', () => {
  it('retorna la cotització i autoritza memòria cau CDN', async () => {
    const res = mockRes();
    await quotes(mockReq({symbol: 'NVDA'}), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.quotes[0].price).toBe(120.5);
    expect(res.headers['cache-control']).toContain('s-maxage=90');
    // La clau viatja en una capçalera, mai a la URL.
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).not.toContain('test-key');
    expect(options.headers.Authorization).toBe('apikey test-key');
  });

  it('no crida el proveïdor si la consulta no és canònica', async () => {
    const res = mockRes();
    await quotes(mockReq({symbol: 'NVDA', cachebuster: '123'}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NON_CANONICAL_QUERY');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limita les peticions per IP i retorna Retry-After', async () => {
    process.env.RATE_LIMIT_PER_IP_PER_MINUTE = '2';
    for (let i = 0; i < 2; i++) {
      const res = mockRes();
      await quotes(mockReq({symbol: 'ZZZZ'}), res);
      expect(res.statusCode).toBe(400);
    }
    const blocked = mockRes();
    await quotes(mockReq({symbol: 'NVDA'}), blocked);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // Una altra IP no queda afectada.
    const other = mockRes();
    await quotes(mockReq({symbol: 'NVDA'}, '198.51.100.9'), other);
    expect(other.statusCode).toBe(200);
  });

  it('atura les crides quan s\'esgota el pressupost global de crèdits', async () => {
    process.env.MARKET_DATA_CREDITS_PER_MINUTE = '2';
    const ips = ['192.0.2.1', '192.0.2.2', '192.0.2.3'];
    const results = [];
    for (const ip of ips) {
      const res = mockRes();
      await quotes(mockReq({symbol: 'NVDA'}, ip), res);
      results.push(res);
    }
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 503]);
    expect(results[2].body.error).toBe('PROVIDER_BUDGET_EXHAUSTED');
    expect(results[2].headers['retry-after']).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('afegeix Retry-After quan el proveïdor retorna 429', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({code: 429, status: 'error'}), {status: 429}));
    const res = mockRes();
    await quotes(mockReq({symbol: 'NVDA'}), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('RATE_LIMIT_REACHED');
    expect(res.headers['retry-after']).toBe('60');
  });
});

describe('handler d\'històric', () => {
  it.each([
    [{symbol: 'NVDA'}],
    [{symbol: 'NVDA', range: '6m'}],
    [{symbol: 'NVDA', range: 'toString'}],
  ])('rebutja el període no canònic %j', async (query) => {
    const res = mockRes();
    await history(mockReq(query), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_RANGE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rebutja paràmetres extra', async () => {
    const res = mockRes();
    await history(mockReq({symbol: 'NVDA', range: '6M', outputsize: '5000'}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NON_CANONICAL_QUERY');
  });
});

describe('limitador', () => {
  const rule = {name: 't', limit: 2, windowSeconds: 60};

  it('reinicia el comptador a la finestra següent', async () => {
    const t0 = 1_800_000_000_000;
    expect((await consume(rule, 'a', t0)).allowed).toBe(true);
    expect((await consume(rule, 'a', t0)).allowed).toBe(true);
    const third = await consume(rule, 'a', t0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect(third.retryAfter).toBeLessThanOrEqual(60);
    expect((await consume(rule, 'a', t0 + 60_000)).allowed).toBe(true);
  });

  it('fa servir Redis si està configurat', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test/';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{result: 3}, {result: 1}]), {status: 200}));
    const result = await consume(rule, 'a');
    expect(result).toMatchObject({allowed: false, store: 'redis'});
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://redis.example.test/pipeline');
    expect(JSON.parse(options.body)[0][0]).toBe('INCR');
  });

  it('passa a memòria local si Redis falla', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const result = await consume(rule, 'b');
    expect(result).toMatchObject({allowed: true, store: 'memory'});
  });

  it('obté la IP de les capçaleres de Vercel', () => {
    expect(clientIp({headers: {'x-vercel-forwarded-for': '1.1.1.1', 'x-forwarded-for': '9.9.9.9'}})).toBe('1.1.1.1');
    expect(clientIp({headers: {'x-forwarded-for': '2.2.2.2, 10.0.0.1'}})).toBe('2.2.2.2');
    expect(clientIp({headers: {}})).toBe('unknown');
  });
});

describe('handler de tipus de canvi', () => {
  /** Resposta vàlida de Twelve Data per a /exchange_rate. */
  const fxOk = () => new Response(JSON.stringify({symbol: 'USD/EUR', rate: 0.92, timestamp: Math.floor(Date.now() / 1000) - 60}), {status: 200});

  it('retorna el tipus de canvi verificat amb memòria cau CDN', async () => {
    fetchMock.mockResolvedValueOnce(fxOk());
    const res = mockRes();
    await fx(mockReq({pair: 'USD/EUR'}), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({pair: 'USD/EUR', rate: 0.92, source: 'Twelve Data'});
    expect(res.headers['cache-control']).toContain('s-maxage=300');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/exchange_rate');
    expect(url.searchParams.get('symbol')).toBe('USD/EUR');
  });

  it.each([
    [{pair: 'GBP/EUR'}, 'UNKNOWN_PAIR'],
    [{pair: 'usd/eur'}, 'UNKNOWN_PAIR'],
    [{}, 'UNKNOWN_PAIR'],
    [{pair: 'USD/EUR', x: '1'}, 'NON_CANONICAL_QUERY'],
  ])('rebutja %j sense cridar el proveïdor', async (query, code) => {
    const res = mockRes();
    await fx(mockReq(query), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(code);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['un altre parell', {symbol: 'EUR/USD', rate: 1.08}],
    ['tipus zero', {symbol: 'USD/EUR', rate: 0}],
    ['sense data', {symbol: 'USD/EUR', rate: 0.92, timestamp: null}],
    ['dada massa antiga', {symbol: 'USD/EUR', rate: 0.92, timestamp: Math.floor(Date.now() / 1000) - 5 * 86400}],
  ])('no verifica una resposta amb %s', async (_name, body) => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({timestamp: Math.floor(Date.now() / 1000), ...body}), {status: 200}));
    const res = mockRes();
    await fx(mockReq({pair: 'USD/EUR'}), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toBe('FX_NOT_VERIFIED');
    expect(res.headers['cache-control']).toContain('no-store');
  });
});
