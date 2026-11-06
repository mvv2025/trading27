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

/**
 * Crea un carregador de cotitzacions.
 *
 * - Èxit: es reutilitza durant QUOTE_TTL_MS, tret que es forci.
 * - Error: es recorda durant el temps que marca failureWaitMs (també quan es
 *   força: tornar-ho a provar abans no donaria un altre resultat i gastaria crèdits).
 * - Si ja hi ha una petició en curs per al mateix símbol, es comparteix.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] Implementació de fetch (injectable per a tests).
 * @param {() => number} [options.now] Rellotge en ms (injectable per a tests).
 * @returns {{get: (symbol: string, options?: {force?: boolean}) => Promise<QuoteResult>}}
 */
export function createQuoteLoader({fetchImpl = (...args) => fetch(...args), now = Date.now} = {}) {
  /** @type {Map<string, {at: number, quote: Quote, source: string}>} */
  const successes = new Map();
  /** @type {Map<string, {until: number, error: Error}>} */
  const failures = new Map();
  /** @type {Map<string, Promise<QuoteResult>>} */
  const inFlight = new Map();

  return {
    get(symbol, {force = false} = {}) {
      const pending = inFlight.get(symbol);
      if (pending) return pending;

      const failure = failures.get(symbol);
      if (failure && now() < failure.until) return Promise.reject(failure.error);

      const success = successes.get(symbol);
      if (!force && success && now() - success.at < QUOTE_TTL_MS) {
        return Promise.resolve({quote: success.quote, source: success.source, cached: true});
      }

      const request = fetchQuote(symbol, fetchImpl)
        .then(({quote, source}) => {
          successes.set(symbol, {at: now(), quote, source});
          failures.delete(symbol);
          return {quote, source, cached: false};
        })
        .catch((error) => {
          failures.set(symbol, {until: now() + failureWaitMs(error.message, error.retryAfter), error});
          throw error;
        })
        .finally(() => inFlight.delete(symbol));
      inFlight.set(symbol, request);
      return request;
    },
  };
}
