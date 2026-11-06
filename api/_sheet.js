// Lectura i validació del full de càlcul de Google amb preus de GOOGLEFINANCE.
// No és una ruta pública (Vercel ignora els fitxers de /api que comencen per "_").
//
// El full és públic ("qualsevol persona amb l'enllaç") i el modifiquen persones,
// de manera que el seu contingut es tracta com a dada no fiable: només s'accepten
// símbols del catàleg (INSTRUMENTS), monedes coherents i nombres vàlids.
//
// Format esperat (configuració regional catalana/espanyola del full):
//   - Nombres: "1.295,95" (punt de milers, coma decimal).
//   - Percentatges: "3,81 %" o "(0,01) %" per als negatius.
//   - PER: "7,7x".
//   - Hora: "06/11/2026 17:35", hora local de la borsa.
// Si el full canvia de configuració regional, les files no es validaran i es descartaran.
import {INSTRUMENTS} from './_market.js';

/** Identificador per defecte del full (no és secret: el full és públic). */
export const DEFAULT_SHEET_ID = '1W_gFjoPao7ou8Qshs1G4lgdgG2l3o4BYtH-VvPVnEKc';

/** Mida màxima acceptada de la resposta de Google (el full actual fa uns 90 KB). */
const MAX_BYTES = 2 * 1024 * 1024;

/** Columnes que es fan servir, pel nom exacte de la capçalera del full. */
export const COLUMNS = Object.freeze({
  ticker: 'Ticker',
  price: 'Preu actual (moneda local)',
  marketCap: 'Capitalització (moneda local)',
  high52: 'Màxim 52 setmanes',
  low52: 'Mínim 52 setmanes',
  changePct: 'Variació diària (%)',
  googleCurrency: 'Moneda segons Google',
  pe: 'PER (vegades)',
  time: 'Hora última cotització',
});

/**
 * @typedef {object} SheetRow
 * @property {number} price Preu en la moneda de l'instrument (GBX convertit a GBP).
 * @property {number|null} high52
 * @property {number|null} low52
 * @property {number|null} changePct Variació diària en %.
 * @property {number|null} pe
 * @property {number|null} marketCapB Capitalització en milers de milions.
 * @property {string|null} time Hora de l'última cotització, hora local de la borsa.
 */

/**
 * Crea un error amb codi HTTP.
 * @param {string} code Codi públic.
 * @param {number} status Codi HTTP.
 */
function sheetError(code, status) {
  const e = new Error(code);
  e.status = status;
  return e;
}

/**
 * Analitza un CSV (RFC 4180: camps entre cometes, cometes dobles escapades).
 * @param {string} text Contingut CSV.
 * @returns {string[][]} Files de camps.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Converteix un nombre en format català/espanyol ("1.295,95") a Number.
 * @param {string} value Text.
 * @returns {number|null} Nombre, o null si està buit o no té el format esperat.
 */
export function parseLocaleNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(text)) return null;
  const number = Number(text.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

/**
 * Converteix un percentatge ("3,81 %" o "(0,01) %") a Number.
 * @param {string} value Text.
 * @returns {number|null}
 */
export function parsePercent(value) {
  const match = /^(\()?([\d.,]+)\)?\s*%$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const number = parseLocaleNumber(match[2]);
  return number === null ? null : match[1] ? -number : number;
}

/**
 * Converteix un múltiple ("7,7x") a Number.
 * @param {string} value Text.
 * @returns {number|null}
 */
export function parseMultiple(value) {
  const match = /^([\d.,]+)x$/.exec(String(value ?? '').trim());
  return match ? parseLocaleNumber(match[1]) : null;
}

/**
 * Valida i converteix el contingut del full.
 * @param {string} text CSV del full.
 * @returns {{rows: Record<string, SheetRow>, stats: {total: number, withPrice: number, withoutPrice: number, rejected: Record<string, string>}}}
 * @throws {Error} 502 SHEET_FORMAT_CHANGED si falten columnes.
 */
export function parseSheet(text) {
  const [header = [], ...lines] = parseCsv(text);
  const index = {};
  for (const [key, name] of Object.entries(COLUMNS)) {
    index[key] = header.indexOf(name);
    if (index[key] < 0) throw sheetError('SHEET_FORMAT_CHANGED', 502);
  }

  /** @type {Record<string, SheetRow>} */
  const rows = Object.create(null);
  /** @type {Record<string, string>} */
  const rejected = {};
  let withoutPrice = 0;
  const cell = (line, key) => String(line[index[key]] ?? '').trim();

  for (const line of lines) {
    const ticker = cell(line, 'ticker');
    if (!ticker) continue;
    if (!Object.hasOwn(INSTRUMENTS, ticker)) { rejected[ticker.slice(0, 20)] = 'UNKNOWN_TICKER'; continue; }
    if (Object.hasOwn(rows, ticker) || rejected[ticker]) { rejected[ticker] = 'DUPLICATE'; delete rows[ticker]; continue; }

    const price = parseLocaleNumber(cell(line, 'price'));
    if (price === null) { withoutPrice++; continue; }
    if (price <= 0) { rejected[ticker] = 'INVALID_PRICE'; continue; }

    // La moneda de Google ha de coincidir amb la de l'instrument. Excepció: les
    // accions de Londres (GBP) cotitzen en penics (GBX) i es divideixen per 100.
    const expected = INSTRUMENTS[ticker].currency;
    const given = cell(line, 'googleCurrency');
    let factor = 1;
    if (expected === 'GBP' && given === 'GBX') factor = 0.01;
    else if (given !== expected) { rejected[ticker] = 'CURRENCY_MISMATCH'; continue; }

    const scale = (v) => (v === null ? null : Math.round(v * factor * 10000) / 10000);
    let high52 = scale(parseLocaleNumber(cell(line, 'high52')));
    let low52 = scale(parseLocaleNumber(cell(line, 'low52')));
    if (high52 === null || low52 === null || high52 <= 0 || low52 <= 0 || high52 < low52) { high52 = null; low52 = null; }
    const marketCap = parseLocaleNumber(cell(line, 'marketCap'));
    const time = cell(line, 'time');

    rows[ticker] = {
      price: scale(price),
      high52,
      low52,
      changePct: parsePercent(cell(line, 'changePct')),
      pe: parseMultiple(cell(line, 'pe')),
      // La capitalització de les accions en GBX no és coherent al full (unitats barrejades): es descarta.
      marketCapB: factor === 1 && marketCap !== null && marketCap > 0 ? Math.round(marketCap / 1e7) / 100 : null,
      time: /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(time) ? time : null,
    };
  }
  const withPrice = Object.keys(rows).length;
  return {
    rows,
    stats: {total: withPrice + withoutPrice + Object.keys(rejected).length, withPrice, withoutPrice, rejected},
  };
}

/**
 * Descarrega el full com a CSV (endpoint gviz, que no redirigeix a altres dominis).
 * @param {string} sheetId Identificador del full.
 * @param {typeof fetch} [fetchImpl] Implementació de fetch.
 * @returns {Promise<string>} CSV.
 * @throws {Error} 503 SHEET_NOT_CONFIGURED, 502 SHEET_NOT_PUBLIC, 504 SHEET_TIMEOUT o 502 SHEET_UNAVAILABLE.
 */
export async function fetchSheetCsv(sheetId, fetchImpl = (...args) => fetch(...args)) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(sheetId)) throw sheetError('SHEET_NOT_CONFIGURED', 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetchImpl(
      `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`,
      {headers: {Accept: 'text/csv'}, redirect: 'manual', signal: controller.signal},
    );
    // 401/403 o una redirecció a la pàgina d'inici de sessió: el full ja no és públic.
    if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) throw sheetError('SHEET_NOT_PUBLIC', 502);
    if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/csv')) {
      throw sheetError('SHEET_UNAVAILABLE', 502);
    }
    const text = await response.text();
    if (text.length > MAX_BYTES) throw sheetError('SHEET_TOO_LARGE', 502);
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw sheetError('SHEET_TIMEOUT', 504);
    if (e.status) throw e;
    throw sheetError('SHEET_UNAVAILABLE', 502);
  } finally {
    clearTimeout(timeout);
  }
}
