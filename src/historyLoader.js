// Càrrega de l'històric de cotitzacions, separada del component per poder-la provar.
//
// Problema que resol: si l'usuari canvia d'empresa (o de període) mentre una
// petició està en curs, la resposta antiga pot arribar després de la nova i
// sobreescriure-la, de manera que el gràfic mostraria l'històric d'una altra
// empresa amb el nom i la moneda de la seleccionada.
//
// Solució en dues capes:
//  1. Cada resultat porta la seva clau (`símbol|període`). El component només
//     dibuixa l'històric si la clau coincideix amb la selecció actual.
//  2. Només l'última petició pot actualitzar l'estat; les respostes antigues es
//     desen a la memòria cau (són dades vàlides) però no es mostren.

/** Temps de validesa de la memòria cau del client (10 minuts). */
export const HISTORY_TTL_MS = 10 * 60 * 1000;

/**
 * @typedef {object} Candle
 * @property {string} date Data AAAA-MM-DD.
 * @property {number|null} open
 * @property {number|null} high
 * @property {number|null} low
 * @property {number} close
 * @property {number|null} volume
 */

/**
 * @typedef {object} HistoryView
 * @property {string} key Clau `símbol|període` a la qual pertanyen les dades.
 * @property {Candle[]} candles Espelmes diàries, de la més antiga a la més recent.
 * @property {string} error Codi d'error de l'API (buit si no n'hi ha).
 * @property {boolean} loading Cert mentre la petició és en curs.
 */

/** Estat inicial: no correspon a cap selecció. */
export const EMPTY_HISTORY = Object.freeze({key: '', candles: [], error: '', loading: false});

/**
 * Clau única d'una consulta d'històric.
 * @param {string} symbol Símbol de l'empresa.
 * @param {string} range Període (1M, 3M, 6M, 1Y, 3Y, 5Y).
 * @returns {string}
 */
export function historyKey(symbol, range) {
  return symbol + '|' + range;
}

/**
 * Demana l'històric a l'API i comprova que la resposta correspon a la consulta.
 * @param {string} symbol Símbol de l'empresa.
 * @param {string} range Període.
 * @param {typeof fetch} [fetchImpl] Implementació de fetch (injectable per a tests).
 * @returns {Promise<Candle[]>}
 * @throws {Error} Amb el codi d'error de l'API com a missatge.
 */
export async function fetchHistory(symbol, range, fetchImpl = (...args) => fetch(...args)) {
  const response = await fetchImpl(
    '/api/history?symbol=' + encodeURIComponent(symbol) + '&range=' + encodeURIComponent(range),
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('DATA_UNAVAILABLE');
  }
  if (!response.ok) throw new Error(data?.error || 'DATA_UNAVAILABLE');
  // La resposta ha de ser exactament la que s'ha demanat: mateix símbol i mateix període.
  if (data?.symbol !== symbol || data?.range !== range || !Array.isArray(data?.candles)) {
    throw new Error('HISTORY_NOT_VERIFIED');
  }
  return data.candles;
}

/**
 * Crea un carregador d'històric amb memòria cau i protecció contra respostes desordenades.
 * @param {object} options
 * @param {(view: HistoryView) => void} options.onUpdate Rep cada nou estat (p. ex. un setState de React).
 * @param {typeof fetch} [options.fetchImpl] Implementació de fetch.
 * @param {() => number} [options.now] Rellotge en ms (injectable per a tests).
 * @param {number} [options.ttl] Validesa de la memòria cau en ms.
 * @returns {{load: (symbol: string, range: string) => Promise<void>}}
 */
export function createHistoryLoader({onUpdate, fetchImpl, now = Date.now, ttl = HISTORY_TTL_MS}) {
  /** @type {Map<string, {at: number, candles: Candle[]}>} */
  const cache = new Map();
  let latest = 0;

  return {
    async load(symbol, range) {
      const key = historyKey(symbol, range);
      const id = ++latest;
      const hit = cache.get(key);
      if (hit && now() - hit.at < ttl) {
        onUpdate({key, candles: hit.candles, error: '', loading: false});
        return;
      }
      onUpdate({key, candles: [], error: '', loading: true});
      try {
        const candles = await fetchHistory(symbol, range, fetchImpl);
        cache.set(key, {at: now(), candles});
        if (id === latest) onUpdate({key, candles, error: '', loading: false});
      } catch (e) {
        // Els errors no es desen a la memòria cau; tampoc es mostren si ja no és l'última petició.
        if (id === latest) onUpdate({key, candles: [], error: e.message || 'DATA_UNAVAILABLE', loading: false});
      }
    },
  };
}
