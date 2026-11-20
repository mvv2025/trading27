// Errors de l'API de mercat al client i temps d'espera abans de tornar a provar.
//
// Les respostes d'error de /api/* no es desen a la memòria cau del CDN
// (Cache-Control: no-store). Per tant, cada reintent del client arriba al
// servidor i pot gastar un crèdit del proveïdor. Per evitar-ho, el client
// recorda cada error durant un temps que depèn del tipus d'error.

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Errors de límit de peticions: s'espera el que diu Retry-After (o 60 s). */
const RATE_LIMIT_CODES = new Set(['RATE_LIMIT_REACHED', 'TOO_MANY_REQUESTS', 'PROVIDER_BUDGET_EXHAUSTED']);

/** Errors que no canviaran aviat (pla, símbol, verificació): 15 minuts. */
const STABLE_CODES = new Set([
  'MARKET_NOT_INCLUDED_IN_PLAN', 'INSTRUMENT_NOT_FOUND', 'INVALID_INSTRUMENT_OR_QUERY',
  'QUOTE_NOT_VERIFIED', 'HISTORY_NOT_VERIFIED', 'EMPTY_HISTORY',
  'UNKNOWN_OR_MULTIPLE_SYMBOLS', 'NON_CANONICAL_QUERY', 'INVALID_RANGE', 'UNKNOWN_PAIR',
]);

/** Errors de configuració del servidor (clau absent o no vàlida): 5 minuts. */
const CONFIG_CODES = new Set(['PROVIDER_NOT_CONFIGURED', 'INVALID_PROVIDER_KEY']);

/** Temps màxim d'espera, encara que el servidor demani més (p. ex. pressupost diari). */
const MAX_WAIT_MS = 60 * MINUTE;

/** Errors transitoris (temps d'espera, xarxa, 5xx): 20 segons. */
const TRANSIENT_WAIT_MS = 20 * SECOND;

/**
 * @typedef {Error & {retryAfter?: number}} ApiError
 * El missatge és el codi d'error (p. ex. "RATE_LIMIT_REACHED").
 */

/**
 * Crea un error de l'API.
 * @param {string} code Codi d'error.
 * @param {number} [retryAfter] Segons indicats pel servidor a Retry-After.
 * @returns {ApiError}
 */
export function apiError(code, retryAfter) {
  const error = /** @type {ApiError} */ (new Error(code || 'DATA_UNAVAILABLE'));
  if (retryAfter) error.retryAfter = retryAfter;
  return error;
}

/**
 * Llegeix la capçalera Retry-After en segons.
 * @param {{headers?: {get?: (name: string) => string | null}}} response Resposta HTTP.
 * @returns {number | undefined} Segons, o undefined si no hi és o no és vàlida.
 */
export function retryAfterSeconds(response) {
  const value = Number(response?.headers?.get?.('Retry-After'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Quant de temps cal esperar abans de tornar a demanar una dada que ha fallat.
 * @param {string} code Codi d'error.
 * @param {number} [retryAfter] Segons indicats pel servidor.
 * @returns {number} Mil·lisegons d'espera.
 */
export function failureWaitMs(code, retryAfter) {
  if (RATE_LIMIT_CODES.has(code)) return Math.min((retryAfter || 60) * SECOND, MAX_WAIT_MS);
  if (STABLE_CODES.has(code)) return 15 * MINUTE;
  if (CONFIG_CODES.has(code)) return 5 * MINUTE;
  return retryAfter ? Math.min(retryAfter * SECOND, MAX_WAIT_MS) : TRANSIENT_WAIT_MS;
}

/**
 * Llegeix el cos JSON d'una resposta i llança un ApiError si no és correcta.
 * @param {Response} response Resposta de fetch.
 * @returns {Promise<any>} Cos JSON.
 * @throws {ApiError}
 */
export async function readApiResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    throw apiError('DATA_UNAVAILABLE', retryAfterSeconds(response));
  }
  if (!response.ok) throw apiError(data?.error || 'DATA_UNAVAILABLE', retryAfterSeconds(response));
  return data;
}
