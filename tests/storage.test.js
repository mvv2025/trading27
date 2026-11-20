// Tests de la validació de les dades desades al navegador.
import {describe, expect, it, vi} from 'vitest';
import {BACKUP_KEY, DEFAULT_CASH, STORAGE_KEY, loadSaved, sanitizeSaved} from '../src/storage.js';

/** Operació vàlida de referència. */
const TRADE = {
  id: 1793980800000, symbol: 'BNP', name: 'BNP Paribas', side: 'buy', qty: 2, price: 87.65,
  currency: 'EUR', at: '2026-11-06T10:00:00.000Z', reference: 'FT-2026-11-01',
};

/** Estat vàlid de referència. */
const VALID = {
  account: {cash: 4824.7, holdings: {BNP: 2, SU: 0}, trades: [TRADE]},
  watch: ['BNP', 'SU', '0700'],
  notes: {BNP: 'Revisar dividend'},
};

/**
 * Emmagatzematge en memòria compatible amb localStorage.
 * @param {Record<string, string>} [initial] Contingut inicial.
 */
function memoryStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => { items.set(k, String(v)); },
  };
}

describe('sanitizeSaved', () => {
  it('manté intactes les dades vàlides', () => {
    expect(sanitizeSaved(structuredClone(VALID))).toEqual({data: VALID, repaired: false});
  });

  it('accepta l\'estat buit o absent sense marcar-lo com a reparat', () => {
    expect(sanitizeSaved(null)).toEqual({data: {}, repaired: false});
    expect(sanitizeSaved({})).toEqual({data: {}, repaired: false});
  });

  it.each([
    ['un nombre', 5],
    ['un text', 'hola'],
    ['una llista', [1, 2]],
  ])('descarta un estat que és %s', (_name, raw) => {
    expect(sanitizeSaved(raw)).toEqual({data: {}, repaired: true});
  });

  it.each([
    ['text', 'abc'],
    ['NaN (com a null en JSON)', null],
    ['negatiu', -10],
    ['infinit', Infinity],
  ])('substitueix un saldo %s pel saldo per defecte', (_name, cash) => {
    const {data, repaired} = sanitizeSaved({account: {cash, holdings: {}, trades: []}});
    expect(repaired).toBe(true);
    expect(data.account.cash).toBe(DEFAULT_CASH);
  });

  it('conserva les operacions vàlides encara que el saldo no ho sigui', () => {
    const {data} = sanitizeSaved({account: {cash: 'x', holdings: {BNP: 2}, trades: [TRADE]}});
    expect(data.account).toEqual({cash: DEFAULT_CASH, holdings: {BNP: 2}, trades: [TRADE]});
  });

  it('corregeix posicions i operacions amb formes incorrectes', () => {
    const {data, repaired} = sanitizeSaved({account: {cash: 100, holdings: null, trades: 'x'}});
    expect(repaired).toBe(true);
    expect(data.account).toEqual({cash: 100, holdings: {}, trades: []});
  });

  it('descarta posicions amb quantitats o símbols no vàlids', () => {
    const {data, repaired} = sanitizeSaved({
      account: {cash: 100, holdings: {BNP: 2, SU: -1, AIR: 1.5, TTE: '3', '<img>': 1}, trades: []},
    });
    expect(repaired).toBe(true);
    expect(data.account.holdings).toEqual({BNP: 2});
  });

  it.each([
    ['moneda no vàlida (fa fallar Intl.NumberFormat)', {currency: 'EURO'}],
    ['costat desconegut', {side: 'short'}],
    ['quantitat decimal', {qty: 1.5}],
    ['preu zero', {price: 0}],
    ['data no vàlida', {at: 'ahir'}],
    ['nom massa llarg', {name: 'x'.repeat(201)}],
    ['símbol no vàlid', {symbol: 'bnp'}],
    ['sense id', {id: undefined}],
  ])('descarta una operació amb %s', (_name, change) => {
    const {data, repaired} = sanitizeSaved({account: {cash: 1, holdings: {}, trades: [{...TRADE, ...change}, TRADE]}});
    expect(repaired).toBe(true);
    expect(data.account.trades).toEqual([TRADE]);
  });

  it('elimina camps desconeguts de les operacions', () => {
    const {data} = sanitizeSaved({account: {cash: 1, holdings: {}, trades: [{...TRADE, extra: '<script>'}]}});
    expect(data.account.trades[0]).toEqual(TRADE);
  });

  it('limita el nombre d\'operacions', () => {
    const trades = Array.from({length: 1005}, (_, i) => ({...TRADE, id: i}));
    const {data, repaired} = sanitizeSaved({account: {cash: 1, holdings: {}, trades}});
    expect(data.account.trades).toHaveLength(1000);
    expect(repaired).toBe(true);
  });

  it('corregeix la llista desada: només símbols vàlids i sense duplicats', () => {
    expect(sanitizeSaved({watch: ['BNP', 'BNP', 42, null, 'SU']})).toEqual({data: {watch: ['BNP', 'SU']}, repaired: true});
    expect(sanitizeSaved({watch: 'BNP'})).toEqual({data: {}, repaired: true});
  });

  it('corregeix les notes: només text i amb una mida màxima', () => {
    const {data, repaired} = sanitizeSaved({notes: {BNP: 'ok', SU: 5, AIR: 'x'.repeat(10001)}});
    expect(repaired).toBe(true);
    expect(data.notes.BNP).toBe('ok');
    expect(data.notes.SU).toBeUndefined();
    expect(data.notes.AIR).toHaveLength(10000);
    expect(sanitizeSaved({notes: null})).toEqual({data: {}, repaired: true});
  });
});

describe('loadSaved', () => {
  it('llegeix dades vàlides sense fer cap còpia de seguretat', () => {
    const storage = memoryStorage({[STORAGE_KEY]: JSON.stringify(VALID)});
    expect(loadSaved(storage)).toEqual({data: VALID, repaired: false});
    expect(storage.items.has(BACKUP_KEY)).toBe(false);
  });

  it('desa una còpia del contingut original si cal reparar-lo', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = '{"account":{"cash":"abc","holdings":null,"trades":7}}';
    const storage = memoryStorage({[STORAGE_KEY]: original});
    const result = loadSaved(storage);
    expect(result.repaired).toBe(true);
    expect(result.data.account).toEqual({cash: DEFAULT_CASH, holdings: {}, trades: []});
    expect(storage.items.get(BACKUP_KEY)).toBe(original);
  });

  it('tracta un JSON trencat com a dades buides i en desa còpia', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = memoryStorage({[STORAGE_KEY]: '{"account":'});
    expect(loadSaved(storage)).toEqual({data: {}, repaired: true});
    expect(storage.items.get(BACKUP_KEY)).toBe('{"account":');
  });

  it('funciona sense localStorage o si llegir-lo llança una excepció', () => {
    expect(loadSaved(null)).toEqual({data: {}, repaired: false});
    const throwing = {getItem: () => { throw new Error('SecurityError'); }, setItem: () => {}};
    expect(loadSaved(throwing)).toEqual({data: {}, repaired: false});
  });
});
