// Tests del carregador d'històric: respostes desordenades, memòria cau i validació.
import {describe, expect, it, vi} from 'vitest';
import {createHistoryLoader, fetchHistory, historyKey} from '../src/historyLoader.js';

/**
 * Resposta d'API d'històric vàlida.
 * @param {string} symbol Símbol.
 * @param {string} range Període.
 * @param {number} close Preu de tancament per identificar la resposta.
 */
function historyResponse(symbol, range, close) {
  return new Response(JSON.stringify({symbol, range, candles: [{date: '2026-11-05', close}]}), {status: 200});
}

/** Promesa que es resol des de fora, per controlar l'ordre d'arribada de les respostes. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return {promise, resolve};
}

describe('createHistoryLoader', () => {
  it('ignora una resposta antiga que arriba després de la nova', async () => {
    const pending = {NVDA: deferred(), AAPL: deferred()};
    const fetchImpl = vi.fn((url) => pending[new URL(url, 'http://x').searchParams.get('symbol')].promise);
    const updates = [];
    const loader = createHistoryLoader({onUpdate: (v) => updates.push(v), fetchImpl});

    const first = loader.load('NVDA', '6M');
    const second = loader.load('AAPL', '6M');
    // AAPL (la selecció actual) respon primer; NVDA (antiga) respon després.
    pending.AAPL.resolve(historyResponse('AAPL', '6M', 200));
    await second;
    pending.NVDA.resolve(historyResponse('NVDA', '6M', 100));
    await first;

    const last = updates.at(-1);
    expect(last).toEqual({key: 'AAPL|6M', candles: [{date: '2026-11-05', close: 200}], error: '', loading: false});
    expect(updates.some((v) => v.key === 'NVDA|6M' && !v.loading)).toBe(false);
  });

  it('desa la resposta antiga a la memòria cau sense mostrar-la', async () => {
    const pending = {NVDA: deferred(), AAPL: deferred()};
    const fetchImpl = vi.fn((url) => pending[new URL(url, 'http://x').searchParams.get('symbol')].promise);
    const updates = [];
    const loader = createHistoryLoader({onUpdate: (v) => updates.push(v), fetchImpl});

    const first = loader.load('NVDA', '6M');
    const second = loader.load('AAPL', '6M');
    pending.NVDA.resolve(historyResponse('NVDA', '6M', 100));
    pending.AAPL.resolve(historyResponse('AAPL', '6M', 200));
    await Promise.all([first, second]);

    // Tornar a NVDA no fa cap petició nova.
    await loader.load('NVDA', '6M');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({key: 'NVDA|6M', loading: false, candles: [{close: 100}]});
  });

  it('un error antic no tapa les dades de la selecció actual', async () => {
    const pending = {NVDA: deferred(), AAPL: deferred()};
    const fetchImpl = vi.fn((url) => pending[new URL(url, 'http://x').searchParams.get('symbol')].promise);
    const updates = [];
    const loader = createHistoryLoader({onUpdate: (v) => updates.push(v), fetchImpl});

    const first = loader.load('NVDA', '6M');
    const second = loader.load('AAPL', '6M');
    pending.AAPL.resolve(historyResponse('AAPL', '6M', 200));
    await second;
    pending.NVDA.resolve(new Response(JSON.stringify({error: 'RATE_LIMIT_REACHED'}), {status: 429}));
    await first;

    expect(updates.at(-1)).toMatchObject({key: 'AAPL|6M', error: '', loading: false});
  });

  it('també protegeix els canvis de període de la mateixa empresa', async () => {
    const pending = {'6M': deferred(), '1Y': deferred()};
    const fetchImpl = vi.fn((url) => pending[new URL(url, 'http://x').searchParams.get('range')].promise);
    const updates = [];
    const loader = createHistoryLoader({onUpdate: (v) => updates.push(v), fetchImpl});

    const first = loader.load('NVDA', '6M');
    const second = loader.load('NVDA', '1Y');
    pending['1Y'].resolve(historyResponse('NVDA', '1Y', 300));
    await second;
    pending['6M'].resolve(historyResponse('NVDA', '6M', 100));
    await first;

    expect(updates.at(-1)).toMatchObject({key: 'NVDA|1Y', candles: [{close: 300}]});
  });

  it('caduca la memòria cau de dades correctes', async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(historyResponse('NVDA', '6M', 1))
      .mockResolvedValueOnce(historyResponse('NVDA', '6M', 2));
    const updates = [];
    const loader = createHistoryLoader({onUpdate: (v) => updates.push(v), fetchImpl, now: () => clock, ttl: 1000});

    await loader.load('NVDA', '6M');
    await loader.load('NVDA', '6M'); // dins del TTL: memòria cau
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 1000;
    await loader.load('NVDA', '6M'); // caducat
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({candles: [{close: 2}]});
  });

  it('recorda un error durant el temps d\'espera i no torna a cridar l\'API', async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({error: 'MARKET_NOT_INCLUDED_IN_PLAN'}), {status: 403}))
      .mockResolvedValueOnce(historyResponse('BNP', '6M', 50));
    const updates = [];
    const loader = createHistoryLoader({onUpdate: (v) => updates.push(v), fetchImpl, now: () => clock});

    await loader.load('BNP', '6M');
    clock = 14 * 60 * 1000;
    await loader.load('BNP', '6M'); // l'usuari torna a l'empresa: no es gasta cap crèdit
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toMatchObject({key: 'BNP|6M', error: 'MARKET_NOT_INCLUDED_IN_PLAN', loading: false});
    clock = 15 * 60 * 1000;
    await loader.load('BNP', '6M'); // passat el temps d'espera, es torna a provar
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(updates.at(-1)).toMatchObject({error: '', candles: [{close: 50}]});
  });
});

describe('fetchHistory', () => {
  it('construeix la URL canònica', async () => {
    const fetchImpl = vi.fn(async () => historyResponse('0700', '1Y', 1));
    await fetchHistory('0700', '1Y', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('/api/history?symbol=0700&range=1Y');
  });

  it.each([
    [{symbol: 'AAPL', range: '6M', candles: []}, 'símbol diferent'],
    [{symbol: 'NVDA', range: '1Y', candles: []}, 'període diferent'],
    [{symbol: 'NVDA', range: '6M'}, 'sense espelmes'],
  ])('rebutja una resposta que no correspon a la consulta (%#: %s)', async (body) => {
    const fetchImpl = async () => new Response(JSON.stringify(body), {status: 200});
    await expect(fetchHistory('NVDA', '6M', fetchImpl)).rejects.toThrow('HISTORY_NOT_VERIFIED');
  });

  it('retorna el codi d\'error de l\'API o DATA_UNAVAILABLE si no és JSON', async () => {
    await expect(fetchHistory('NVDA', '6M', async () => new Response('{"error":"EMPTY_HISTORY"}', {status: 502})))
      .rejects.toThrow('EMPTY_HISTORY');
    await expect(fetchHistory('NVDA', '6M', async () => new Response('<html>', {status: 500})))
      .rejects.toThrow('DATA_UNAVAILABLE');
  });

  it('historyKey combina símbol i període', () => {
    expect(historyKey('NVDA', '6M')).toBe('NVDA|6M');
  });
});
