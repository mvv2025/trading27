// Càrrega de cotitzacions al client, amb memòria cau, peticions compartides i
// espera després d'un error, per no gastar crèdits del proveïdor en reintents.
import {apiError, failureWaitMs, readApiResponse} from './apiErrors.js';

/** Validesa d'una cotització correcta a la memòria cau del client (90 s, com el CDN). */
export const QUOTE_TTL_MS = 90 * 1000;

/**
 * @typedef {object} Quote
 * @property {string} symbol
 * @property {number} price
 * @property {number|null} change
 * @property {number|null} high52
 * @property {number|null} low52
 * @property {string} asOf Data ISO del proveïdor.
 * @property {boolean} isMarketOpen
 * @property {string} quality
 */

/**
 * @typedef {object} QuoteResult
 * @property {Quote} quote Cotització verificada.
 * @property {string} source Proveïdor de dades.
 * @property {boolean} cached Cert si no s'ha fet cap petició nova.
 */

/**
 * Demana una cotització a l'API i comprova que correspon al símbol demanat.
 * @param {string} symbol Símbol.
 * @param {typeof fetch} fetchImpl Implementació de fetch.
 * @returns {Promise<{quote: Quote, source: string}>}
 * @throws {import('./apiErrors.js').ApiError}
 */
export async function fetchQuote(symbol, fetchImpl) {
  let response;
  try {
    response = await fetchImpl('/api/quotes?symbol=' + encodeURIComponent(symbol));
  } catch {
    throw apiError('DATA_UNAVAILABLE');
  }
  const data = await readApiResponse(response);
  const quote = Array.isArray(data?.quotes) ? data.quotes[0] : undefined;
  if (!quote) throw apiError('DATA_UNAVAILABLE');
  if (quote.symbol !== symbol || !Number.isFinite(quote.price) || quote.price <= 0 || !quote.asOf) {
    throw apiError('QUOTE_NOT_VERIFIED');
  }
  return {quote, source: data.source || 'Twelve Data'};
}

/** Validesa d'un tipus de canvi correcte a la memòria cau del client (5 min, com el CDN). */
export const FX_TTL_MS = 5 * 60 * 1000;

/**
 * @typedef {object} FxRate
 * @property {string} pair Parell, p. ex. "USD/EUR".
 * @property {number} rate EUR per unitat de la moneda d'origen.
 * @property {string} asOf Data ISO del proveïdor.
 */

/**
 * Demana el tipus de canvi d'una moneda a EUR i en comprova la resposta.
 * @param {string} currency Moneda d'origen (p. ex. "USD").
 * @param {typeof fetch} fetchImpl Implementació de fetch.
 * @returns {Promise<{fx: FxRate}>}
 * @throws {import('./apiErrors.js').ApiError}
 */
export async function fetchFxRate(currency, fetchImpl) {
  const pair = currency + '/EUR';
  let response;
  try {
    response = await fetchImpl('/api/fx?pair=' + encodeURIComponent(pair));
  } catch {
    throw apiError('DATA_UNAVAILABLE');
  }
  const data = await readApiResponse(response);
  if (data?.pair !== pair || !Number.isFinite(data?.rate) || data.rate <= 0 || !data?.asOf) {
    throw apiError('FX_NOT_VERIFIED');
  }
  return {fx: {pair, rate: data.rate, asOf: data.asOf}};
}

/**
 * Crea un carregador genèric amb memòria cau, peticions compartides i espera després d'un error.
 *
 * - Èxit: es reutilitza durant `ttlMs`, tret que es forci.
 * - Error: es recorda durant el temps que marca failureWaitMs (també quan es
 *   força: tornar-ho a provar abans no donaria un altre resultat i gastaria crèdits).
 * - Si ja hi ha una petició en curs per a la mateixa clau, es comparteix.
 *
 * @template {object} T
 * @param {object} options
 * @param {(key: string) => Promise<T>} options.fetchOne Funció que obté una dada.
 * @param {number} options.ttlMs Validesa d'un èxit en ms.
 * @param {() => number} [options.now] Rellotge en ms (injectable per a tests).
 * @returns {{get: (key: string, options?: {force?: boolean}) => Promise<T & {cached: boolean, fetchedAt: number}>}}
 */
export function createResourceLoader({fetchOne, ttlMs, now = Date.now}) {
  /** @type {Map<string, {at: number, value: T}>} */
  const successes = new Map();
  /** @type {Map<string, {until: number, error: Error}>} */
  const failures = new Map();
  /** @type {Map<string, Promise<any>>} */
  const inFlight = new Map();

  return {
    get(key, {force = false} = {}) {
      const pending = inFlight.get(key);
      if (pending) return pending;

      const failure = failures.get(key);
      if (failure && now() < failure.until) return Promise.reject(failure.error);

      const success = successes.get(key);
      if (!force && success && now() - success.at < ttlMs) {
        return Promise.resolve({...success.value, cached: true, fetchedAt: success.at});
      }

      const request = fetchOne(key)
        .then((value) => {
          const at = now();
          successes.set(key, {at, value});
          failures.delete(key);
          return {...value, cached: false, fetchedAt: at};
        })
        .catch((error) => {
          failures.set(key, {until: now() + failureWaitMs(error.message, error.retryAfter), error});
          throw error;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
      return request;
    },
  };
}

/**
 * Carregador de cotitzacions (memòria cau de 90 s).
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] Implementació de fetch (injectable per a tests).
 * @param {() => number} [options.now] Rellotge en ms.
 */
export function createQuoteLoader({fetchImpl = (...args) => fetch(...args), now = Date.now} = {}) {
  return createResourceLoader({fetchOne: (symbol) => fetchQuote(symbol, fetchImpl), ttlMs: QUOTE_TTL_MS, now});
}

/**
 * Carregador de tipus de canvi a EUR (memòria cau de 5 min). La clau és la moneda d'origen.
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] Implementació de fetch.
 * @param {() => number} [options.now] Rellotge en ms.
 */
export function createFxLoader({fetchImpl = (...args) => fetch(...args), now = Date.now} = {}) {
  return createResourceLoader({fetchOne: (currency) => fetchFxRate(currency, fetchImpl), ttlMs: FX_TTL_MS, now});
}
