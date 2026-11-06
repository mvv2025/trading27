// Lectura segura de les dades desades al navegador (localStorage).
//
// Les dades de localStorage poden estar corruptes (una versió antiga, una
// escriptura tallada) o modificades a mà des de les eines del navegador. Abans
// d'aquest mòdul, valors com `holdings: null`, `trades: "x"` o una moneda no
// vàlida feien caure tota l'aplicació, i un `cash` no numèric permetia comprar
// amb un saldo NaN. Ara cada camp es valida i el que no és vàlid es descarta o
// es substitueix pel valor per defecte. Si cal reparar alguna cosa, es fa una
// còpia de seguretat del contingut original abans de sobreescriure'l.

export const STORAGE_KEY = 'trading27-v1';
export const BACKUP_KEY = 'trading27-v1-backup';
export const DEFAULT_CASH = 5000;

const SYMBOL = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_TRADES = 1000;
const MAX_WATCH = 500;
const MAX_TEXT = 200;
const MAX_NOTE = 10000;

/**
 * @typedef {object} Trade
 * @property {number} id
 * @property {string} symbol
 * @property {string} name
 * @property {'buy'|'sell'} side
 * @property {number} qty
 * @property {number} price
 * @property {string} currency
 * @property {string} at Data ISO.
 * @property {string} reference Origen del preu.
 * @property {string} [priceAsOf] Data del preu del proveïdor.
 * @property {number} [fxRate] EUR per unitat de la moneda (1 en EUR).
 * @property {number} [eurAmount] Import de l'operació en EUR.
 */

/**
 * @typedef {object} Account
 * @property {number} cash Saldo fictici en EUR.
 * @property {Record<string, number>} holdings Accions per símbol.
 * @property {Trade[]} trades Operacions, de la més recent a la més antiga.
 */

/**
 * @typedef {object} SavedState
 * @property {Account} [account]
 * @property {string[]} [watch] Símbols desats.
 * @property {Record<string, string>} [notes] Notes per símbol.
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @param {unknown} v @returns {boolean} */
const isSymbol = (v) => typeof v === 'string' && SYMBOL.test(v);

/** @param {unknown} v @returns {boolean} */
const isShortText = (v) => typeof v === 'string' && v.length <= MAX_TEXT;

/**
 * Valida una operació desada.
 * @param {unknown} t Operació.
 * @returns {Trade | null} L'operació, o null si no és vàlida.
 */
function sanitizeTrade(t) {
  if (!isPlainObject(t)) return null;
  const valid = Number.isFinite(t.id) &&
    isSymbol(t.symbol) &&
    isShortText(t.name) &&
    (t.side === 'buy' || t.side === 'sell') &&
    Number.isInteger(t.qty) && t.qty > 0 &&
    Number.isFinite(t.price) && t.price > 0 &&
    typeof t.currency === 'string' && CURRENCY.test(t.currency) &&
    typeof t.at === 'string' && !Number.isNaN(Date.parse(t.at)) &&
    isShortText(t.reference);
  if (!valid) return null;
  const {id, symbol, name, side, qty, price, currency, at, reference} = t;
  const trade = {id, symbol, name, side, qty, price, currency, at, reference};
  // Camps opcionals (operacions fetes des de la versió amb conversió de divises).
  const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (t.priceAsOf !== undefined) {
    if (typeof t.priceAsOf !== 'string' || Number.isNaN(Date.parse(t.priceAsOf))) return null;
    trade.priceAsOf = t.priceAsOf;
  }
  if (t.fxRate !== undefined) { if (!positive(t.fxRate)) return null; trade.fxRate = t.fxRate; }
  if (t.eurAmount !== undefined) { if (!positive(t.eurAmount)) return null; trade.eurAmount = t.eurAmount; }
  return /** @type {Trade} */ (trade);
}

/**
 * Valida el compte de simulació.
 * @param {unknown} raw Compte desat.
 * @param {() => void} repair Es crida si s'ha hagut de corregir alguna cosa.
 * @returns {Account | undefined} Compte vàlid, o undefined si no se'n pot recuperar res.
 */
function sanitizeAccount(raw, repair) {
  if (!isPlainObject(raw)) { repair(); return undefined; }

  let cash = raw.cash;
  if (typeof cash !== 'number' || !Number.isFinite(cash) || cash < 0) { repair(); cash = DEFAULT_CASH; }

  /** @type {Record<string, number>} */
  const holdings = {};
  if (isPlainObject(raw.holdings)) {
    for (const [symbol, qty] of Object.entries(raw.holdings)) {
      if (isSymbol(symbol) && Number.isInteger(qty) && qty >= 0) holdings[symbol] = /** @type {number} */ (qty);
      else repair();
    }
  } else if (raw.holdings !== undefined) repair();

  /** @type {Trade[]} */
  const trades = [];
  if (Array.isArray(raw.trades)) {
    for (const t of raw.trades.slice(0, MAX_TRADES)) {
      const trade = sanitizeTrade(t);
      if (trade) trades.push(trade); else repair();
    }
    if (raw.trades.length > MAX_TRADES) repair();
  } else if (raw.trades !== undefined) repair();

  return {cash: /** @type {number} */ (cash), holdings, trades};
}

/**
 * Valida tot l'estat desat.
 * @param {unknown} raw Valor llegit de localStorage (ja convertit de JSON).
 * @returns {{data: SavedState, repaired: boolean}} Dades vàlides i si s'ha hagut de corregir alguna cosa.
 */
export function sanitizeSaved(raw) {
  let repaired = false;
  const repair = () => { repaired = true; };
  if (raw === null || raw === undefined) return {data: {}, repaired};
  if (!isPlainObject(raw)) return {data: {}, repaired: true};

  /** @type {SavedState} */
  const data = {};
  if (raw.account !== undefined) {
    const account = sanitizeAccount(raw.account, repair);
    if (account) data.account = account;
  }
  if (raw.watch !== undefined) {
    if (Array.isArray(raw.watch)) {
      const watch = [...new Set(raw.watch.filter(isSymbol))].slice(0, MAX_WATCH);
      if (watch.length !== raw.watch.length) repair();
      data.watch = /** @type {string[]} */ (watch);
    } else repair();
  }
  if (raw.notes !== undefined) {
    if (isPlainObject(raw.notes)) {
      /** @type {Record<string, string>} */
      const notes = {};
      for (const [symbol, note] of Object.entries(raw.notes)) {
        if (isSymbol(symbol) && typeof note === 'string') notes[symbol] = note.slice(0, MAX_NOTE);
        if (!isSymbol(symbol) || typeof note !== 'string' || note.length > MAX_NOTE) repair();
      }
      data.notes = notes;
    } else repair();
  }
  return {data, repaired};
}

/**
 * Retorna localStorage si és accessible (en navegació privada o amb les
 * dades de llocs bloquejades, només accedir-hi ja pot llançar una excepció).
 * @returns {Storage | null}
 */
export function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Llegeix i valida l'estat desat. Si les dades no eren vàlides, en desa una
 * còpia de seguretat sense modificar a BACKUP_KEY.
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [storage] Emmagatzematge.
 * @returns {{data: SavedState, repaired: boolean}}
 */
export function loadSaved(storage = getStorage()) {
  if (!storage) return {data: {}, repaired: false};
  let text;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return {data: {}, repaired: false};
  }
  if (text === null) return {data: {}, repaired: false};

  let result;
  try {
    result = sanitizeSaved(JSON.parse(text));
  } catch {
    result = {data: {}, repaired: true};
  }
  if (result.repaired) {
    try { storage.setItem(BACKUP_KEY, text); } catch { /* sense espai: no es pot fer la còpia */ }
    console.warn('[storage] Dades locals no vàlides; s\'han corregit. Còpia original a', BACKUP_KEY);
  }
  return result;
}
