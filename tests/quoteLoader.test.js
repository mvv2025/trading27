// Tests de la càrrega de cotitzacions: memòria cau, peticions compartides i espera després d'errors.
import {describe, expect, it, vi} from 'vitest';
import {QUOTE_TTL_MS, createQuoteLoader} from '../src/quoteLoader.js';
import {failureWaitMs, retryAfterSeconds} from '../src/apiErrors.js';

/**
 * Resposta d'API de cotització vàlida.
 * @param {string} symbol Símbol.
 * @param {number} price Preu.
 */
function quoteResponse(symbol, price) {
  return new Response(JSON.stringify({
    source: 'Twelve Data',
    quotes: [{symbol, price, change: 1, asOf: '2026-11-06T15:00:00.000Z', isMarketOpen: true, quality: 'q'}],
  }), {status: 200});
}

/**
 * Resposta d'error de l'API.
 * @param {string} code Codi d'error.
 * @param {number} status Codi HTTP.
 * @param {Record<string, string>} [headers] Capçaleres.
 */
function errorResponse(code, status, headers = {}) {
  return new Response(JSON.stringify({error: code}), {status, headers});
}

describe('createQuoteLoader', () => {
  it('reutilitza una cotització correcta durant 90 s si no es força', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => quoteResponse('NVDA', 120));
    const loader = createQuoteLoader({fetchImpl, now: () => clock});

    expect(await loader.get('NVDA')).toMatchObject({cached: false, quote: {price: 120}});
    expect(await loader.get('NVDA')).toMatchObject({cached: true});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await loader.get('NVDA', {force: true}); // el botó "comprovar preu" sí que demana dades noves
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    clock = QUOTE_TTL_MS;
    await loader.get('NVDA');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('comparteix la petició en curs per al mateix símbol', async () => {
    let resolve;
    const fetchImpl = vi.fn(() => new Promise((r) => { resolve = r; }));
    const loader = createQuoteLoader({fetchImpl});

    const a = loader.get('NVDA');
    const b = loader.get('NVDA', {force: true});
    resolve(quoteResponse('NVDA', 120));
    await Promise.all([a, b]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('no torna a cridar l\'API després d\'un error de pla, ni forçant-ho, fins passat el temps d\'espera', async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse('MARKET_NOT_INCLUDED_IN_PLAN', 403))
      .mockResolvedValueOnce(quoteResponse('BNP', 80));
    const loader = createQuoteLoader({fetchImpl, now: () => clock});

    await expect(loader.get('BNP')).rejects.toThrow('MARKET_NOT_INCLUDED_IN_PLAN');
    clock = 60 * 1000;
    await expect(loader.get('BNP')).rejects.toThrow('MARKET_NOT_INCLUDED_IN_PLAN');
    await expect(loader.get('BNP', {force: true})).rejects.toThrow('MARKET_NOT_INCLUDED_IN_PLAN');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 15 * 60 * 1000;
    expect(await loader.get('BNP')).toMatchObject({quote: {price: 80}});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('respecta Retry-After del servidor en errors de límit', async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(errorResponse('TOO_MANY_REQUESTS', 429, {'Retry-After': '30'}))
      .mockResolvedValueOnce(quoteResponse('NVDA', 120));
    const loader = createQuoteLoader({fetchImpl, now: () => clock});

    const error = await loader.get('NVDA').catch((e) => e);
    expect(error).toMatchObject({message: 'TOO_MANY_REQUESTS', retryAfter: 30});
    clock = 29_999;
    await expect(loader.get('NVDA', {force: true})).rejects.toThrow('TOO_MANY_REQUESTS');
    clock = 30_000;
    await expect(loader.get('NVDA')).resolves.toMatchObject({cached: false});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('un error d\'un símbol no afecta els altres', async () => {
    const fetchImpl = vi.fn(async (url) => (url.includes('BNP')
      ? errorResponse('MARKET_NOT_INCLUDED_IN_PLAN', 403)
      : quoteResponse('NVDA', 120)));
    const loader = createQuoteLoader({fetchImpl});

    await expect(loader.get('BNP')).rejects.toThrow();
    await expect(loader.get('NVDA')).resolves.toMatchObject({quote: {symbol: 'NVDA'}});
  });

  it.each([
    ['resposta d\'un altre símbol', async () => quoteResponse('AAPL', 1), 'QUOTE_NOT_VERIFIED'],
    ['preu zero', async () => quoteResponse('NVDA', 0), 'QUOTE_NOT_VERIFIED'],
    ['cos no JSON', async () => new Response('<html>', {status: 500}), 'DATA_UNAVAILABLE'],
    ['error de xarxa', async () => { throw new TypeError('Failed to fetch'); }, 'DATA_UNAVAILABLE'],
  ])('rebutja: %s', async (_name, fetchImpl, code) => {
    await expect(createQuoteLoader({fetchImpl}).get('NVDA')).rejects.toThrow(code);
  });
});

describe('failureWaitMs', () => {
  it.each([
    ['RATE_LIMIT_REACHED', undefined, 60_000],
    ['TOO_MANY_REQUESTS', 30, 30_000],
    ['PROVIDER_BUDGET_EXHAUSTED', 86_400, 3_600_000], // limitat a 1 hora
    ['MARKET_NOT_INCLUDED_IN_PLAN', undefined, 900_000],
    ['QUOTE_NOT_VERIFIED', undefined, 900_000],
    ['PROVIDER_NOT_CONFIGURED', undefined, 300_000],
    ['PROVIDER_TIMEOUT', undefined, 20_000],
    ['DATA_UNAVAILABLE', undefined, 20_000],
  ])('%s (Retry-After %s) → %i ms', (code, retryAfter, expected) => {
    expect(failureWaitMs(code, retryAfter)).toBe(expected);
  });

  it('llegeix Retry-After només si és un nombre positiu', () => {
    expect(retryAfterSeconds(new Response('', {headers: {'Retry-After': '12'}}))).toBe(12);
    expect(retryAfterSeconds(new Response('', {headers: {'Retry-After': 'abc'}}))).toBeUndefined();
    expect(retryAfterSeconds(new Response(''))).toBeUndefined();
  });
});
