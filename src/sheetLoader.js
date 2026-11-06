// Preus de Google Finance (via el full de càlcul) al client.
//
// Ordre de preferència de les dades d'una empresa:
//   1. Cotització verificada de Twelve Data (té `asOf`; és l'única que serveix per operar).
//   2. Full de Google Finance (amb retard; `source: 'sheet'`).
//   3. Fotografia del Financial Times de l'01/11/2026 (només algunes empreses del catàleg original).
import {apiError, readApiResponse} from './apiErrors.js';
import {createResourceLoader} from './quoteLoader.js';

/** Validesa al client: igual que la memòria cau del CDN (10 minuts). */
export const SHEET_TTL_MS = 10 * 60 * 1000;

/**
 * @typedef {object} SheetRow
 * @property {number} price
 * @property {number|null} high52
 * @property {number|null} low52
 * @property {number|null} changePct
 * @property {number|null} pe
 * @property {number|null} marketCapB
 * @property {string|null} time Hora local de la borsa ("dd/mm/aaaa hh:mm").
 */

/** @param {unknown} v @returns {number|null} */
const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Descarrega i valida les dades del full.
 * @param {typeof fetch} fetchImpl Implementació de fetch.
 * @returns {Promise<{rows: Record<string, SheetRow>, fetchedAt: string}>}
 * @throws {import('./apiErrors.js').ApiError}
 */
export async function fetchSheet(fetchImpl) {
  let response;
  try {
    response = await fetchImpl('/api/sheet');
  } catch {
    throw apiError('DATA_UNAVAILABLE');
  }
  const data = await readApiResponse(response);
  if (!data || typeof data.rows !== 'object' || data.rows === null) throw apiError('SHEET_FORMAT_CHANGED');
  /** @type {Record<string, SheetRow>} */
  const rows = {};
  for (const [symbol, row] of Object.entries(data.rows)) {
    const price = finiteOrNull(row?.price);
    if (price === null || price <= 0) continue;
    rows[symbol] = {
      price,
      high52: finiteOrNull(row.high52),
      low52: finiteOrNull(row.low52),
      changePct: finiteOrNull(row.changePct),
      pe: finiteOrNull(row.pe),
      marketCapB: finiteOrNull(row.marketCapB),
      time: typeof row.time === 'string' ? row.time.slice(0, 16) : null,
    };
  }
  return {rows, fetchedAt: typeof data.fetchedAt === 'string' ? data.fetchedAt : ''};
}

/**
 * Carregador del full (una sola clau, memòria cau de 10 minuts i espera després d'un error).
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] Implementació de fetch.
 * @param {() => number} [options.now] Rellotge en ms.
 * @returns {{get: (options?: {force?: boolean}) => Promise<{rows: Record<string, SheetRow>, fetchedAt: string, cached: boolean}>}}
 */
export function createSheetLoader({fetchImpl = (...args) => fetch(...args), now = Date.now} = {}) {
  const loader = createResourceLoader({fetchOne: () => fetchSheet(fetchImpl), ttlMs: SHEET_TTL_MS, now});
  return {get: (options) => loader.get('sheet', options)};
}

/**
 * Aplica la fila del full a una empresa del catàleg. Substitueix els camps de
 * preu (preu, variació, màxim i mínim anuals, PER i capitalització) perquè no
 * es barregin dades de dates diferents; el dividend (que el full no té) es manté.
 * @template {{price: number|null, change: number|null, high: number|null, low: number|null, pe: number|null, mv: number|null}} S
 * @param {S} stock Empresa del catàleg.
 * @param {SheetRow | undefined} row Fila del full.
 * @returns {S | (S & {source: 'sheet', sheetTime: string|null})}
 */
export function applySheetRow(stock, row) {
  if (!row) return stock;
  const {price, changePct} = row;
  // El full dona la variació en %, l'aplicació la mostra en unitats monetàries.
  const change = changePct === null ? null : Math.round((price * changePct / (100 + changePct)) * 100) / 100;
  return {
    ...stock,
    price,
    change,
    high: row.high52,
    low: row.low52,
    pe: row.pe,
    mv: row.marketCapB,
    source: 'sheet',
    sheetTime: row.time,
  };
}
