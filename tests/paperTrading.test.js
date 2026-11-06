// Tests de les regles del simulador: preu verificat i recent, EUR o USD, conversió a EUR.
import {describe, expect, it, vi} from 'vitest';
import {
  MAX_FX_AGE_MS, MAX_QUOTE_AGE_MS, OrderBlock, checkOrder, executeOrder, holdingsValueEur, priceStatus,
} from '../src/paperTrading.js';
import {createFxLoader} from '../src/quoteLoader.js';
import {sanitizeSaved} from '../src/storage.js';

const NOW = 1_800_000_000_000;

/** Empresa amb preu verificat pel proveïdor i rebut ara mateix. */
const NVDA = {symbol: 'NVDA', name: 'Nvidia', currency: 'USD', price: 100, asOf: '2026-11-06T15:00:00.000Z', receivedAt: NOW};
const ASML = {symbol: 'ASML', name: 'ASML Holding', currency: 'EUR', price: 600, asOf: '2026-11-06T15:00:00.000Z', receivedAt: NOW};
const FX = {USD: {rate: 0.9, asOf: '2026-11-06T15:00:00.000Z', receivedAt: NOW}};

/**
 * Ordre per defecte, amb canvis opcionals.
 * @param {object} [change] Camps a substituir.
 */
const order = (change = {}) => ({
  stock: NVDA, side: 'buy', quantity: '2', limit: '100', cash: 1000, held: 0, fxRates: FX, now: NOW, ...change,
});

describe('priceStatus', () => {
  it('bloqueja els preus històrics (sense asOf del proveïdor)', () => {
    const historic = {symbol: 'BNP', name: 'BNP', currency: 'EUR', price: 87.65};
    expect(priceStatus(historic, FX, NOW)).toEqual({block: OrderBlock.NO_VERIFIED_QUOTE});
  });

  it('bloqueja monedes no admeses, com GBP', () => {
    expect(priceStatus({...ASML, currency: 'GBP'}, FX, NOW)).toEqual({block: OrderBlock.CURRENCY_NOT_SUPPORTED});
  });

  it('bloqueja una cotització rebuda fa més de 15 minuts', () => {
    expect(priceStatus(ASML, FX, NOW + MAX_QUOTE_AGE_MS).block).toBeNull();
    expect(priceStatus(ASML, FX, NOW + MAX_QUOTE_AGE_MS + 1)).toEqual({block: OrderBlock.QUOTE_TOO_OLD});
    expect(priceStatus({...ASML, receivedAt: undefined}, FX, NOW)).toEqual({block: OrderBlock.QUOTE_TOO_OLD});
  });

  it('en USD exigeix un tipus de canvi recent', () => {
    expect(priceStatus(NVDA, FX, NOW)).toEqual({block: null, rate: 0.9});
    expect(priceStatus(NVDA, {}, NOW)).toEqual({block: OrderBlock.FX_UNAVAILABLE});
    const oldFx = {USD: {...FX.USD, receivedAt: NOW - MAX_FX_AGE_MS - 1}};
    expect(priceStatus(NVDA, oldFx, NOW)).toEqual({block: OrderBlock.FX_UNAVAILABLE});
  });

  it('en EUR no necessita tipus de canvi', () => {
    expect(priceStatus(ASML, {}, NOW)).toEqual({block: null, rate: 1});
  });
});

describe('checkOrder', () => {
  it('calcula l\'import en USD i en EUR', () => {
    expect(checkOrder(order())).toEqual({ok: true, qty: 2, price: 100, rate: 0.9, total: 200, totalEur: 180});
  });

  it.each([
    ['quantitat decimal', {quantity: '1.5'}, OrderBlock.INVALID_INPUT],
    ['quantitat zero', {quantity: '0'}, OrderBlock.INVALID_INPUT],
    ['límit buit', {limit: ''}, OrderBlock.INVALID_INPUT],
    ['saldo insuficient (cost al límit convertit a EUR)', {quantity: '11', limit: '101', cash: 999}, OrderBlock.INSUFFICIENT_CASH],
    ['vendre accions que no es tenen', {side: 'sell', held: 1}, OrderBlock.NOT_HELD],
    ['compra amb límit per sota del preu', {limit: '99'}, OrderBlock.LIMIT_NOT_MET],
    ['venda amb límit per sobre del preu', {side: 'sell', held: 5, limit: '101'}, OrderBlock.LIMIT_NOT_MET],
    ['sense tipus de canvi', {fxRates: {}}, OrderBlock.FX_UNAVAILABLE],
  ])('bloqueja: %s', (_name, change, block) => {
    expect(checkOrder(order(change))).toEqual({ok: false, block});
  });

  it('el saldo es compara en EUR, no en la moneda de l\'acció', () => {
    // 10 × 100 USD = 1.000 USD = 900 EUR: amb 900 EUR n'hi ha prou.
    expect(checkOrder(order({quantity: '10', cash: 900})).ok).toBe(true);
  });
});

describe('executeOrder', () => {
  it('descompta l\'import en EUR i registra el tipus de canvi', () => {
    const account = {cash: 1000, holdings: {}, trades: []};
    const result = executeOrder(account, NVDA, 'buy', checkOrder(order()), NOW);
    expect(result.cash).toBe(820);
    expect(result.holdings).toEqual({NVDA: 2});
    expect(result.trades[0]).toMatchObject({
      symbol: 'NVDA', side: 'buy', qty: 2, price: 100, currency: 'USD', reference: 'provider',
      priceAsOf: NVDA.asOf, fxRate: 0.9, eurAmount: 180,
    });
  });

  it('una venda suma l\'import en EUR i redueix la posició', () => {
    const account = {cash: 820, holdings: {NVDA: 2}, trades: []};
    const sell = checkOrder(order({side: 'sell', held: 2, quantity: '1', limit: '100'}));
    const result = executeOrder(account, NVDA, 'sell', sell, NOW);
    expect(result.cash).toBe(910);
    expect(result.holdings).toEqual({NVDA: 1});
  });

  it('les operacions noves superen la validació de les dades desades', () => {
    const account = executeOrder({cash: 1000, holdings: {}, trades: []}, NVDA, 'buy', checkOrder(order()), NOW);
    expect(sanitizeSaved({account})).toEqual({data: {account}, repaired: false});
  });
});

describe('holdingsValueEur', () => {
  it('converteix les posicions en USD i indica les que no es poden valorar', () => {
    const stocks = {NVDA, ASML, BNP: {currency: 'EUR', price: null}, VOD: {currency: 'GBP', price: 70}};
    const result = holdingsValueEur({NVDA: 2, ASML: 1, BNP: 3, VOD: 1, AIR: 0}, (s) => stocks[s], FX);
    expect(result.value).toBe(780); // 2 × 100 × 0,9 + 600
    expect(result.unvalued).toEqual(['BNP', 'VOD']);
  });
});

describe('createFxLoader', () => {
  it('demana el parell canònic i valida la resposta', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({pair: 'USD/EUR', rate: 0.9, asOf: '2026-11-06T15:00:00Z'})));
    const loader = createFxLoader({fetchImpl, now: () => NOW});
    await expect(loader.get('USD')).resolves.toMatchObject({fx: {pair: 'USD/EUR', rate: 0.9}, cached: false, fetchedAt: NOW});
    expect(fetchImpl).toHaveBeenCalledWith('/api/fx?pair=USD%2FEUR');
    await loader.get('USD');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rebutja una resposta d\'un altre parell', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({pair: 'EUR/USD', rate: 1.1, asOf: '2026-11-06T15:00:00Z'}));
    await expect(createFxLoader({fetchImpl}).get('USD')).rejects.toThrow('FX_NOT_VERIFIED');
  });
});
