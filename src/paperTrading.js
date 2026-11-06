// Regles del simulador d'operacions (sense React, per poder-les provar).
//
// Regles:
//  - Només s'opera amb un preu confirmat pel proveïdor (`asOf`) i rebut pel
//    client fa menys de MAX_QUOTE_AGE_MS. Els preus històrics del catàleg
//    (Financial Times, 01/11/2026) es mostren però no serveixen per operar.
//  - Monedes admeses: EUR i USD. El saldo és en EUR; les operacions en USD es
//    converteixen amb el tipus de canvi del proveïdor, rebut fa menys de
//    MAX_FX_AGE_MS.
//  - Les ordres són limitades: el preu del proveïdor ha de complir el límit.

/** Monedes amb què es pot operar al simulador. */
export const TRADABLE_CURRENCIES = Object.freeze(['EUR', 'USD']);

/** Antiguitat màxima (des que el client l'ha rebuda) d'una cotització per operar. */
export const MAX_QUOTE_AGE_MS = 15 * 60 * 1000;

/** Antiguitat màxima (des que el client l'ha rebut) d'un tipus de canvi per operar. */
export const MAX_FX_AGE_MS = 15 * 60 * 1000;

/**
 * Motius pels quals no es pot fer una ordre.
 * @readonly
 * @enum {string}
 */
export const OrderBlock = Object.freeze({
  CURRENCY_NOT_SUPPORTED: 'CURRENCY_NOT_SUPPORTED',
  NO_VERIFIED_QUOTE: 'NO_VERIFIED_QUOTE',
  QUOTE_TOO_OLD: 'QUOTE_TOO_OLD',
  FX_UNAVAILABLE: 'FX_UNAVAILABLE',
  INVALID_INPUT: 'INVALID_INPUT',
  INSUFFICIENT_CASH: 'INSUFFICIENT_CASH',
  NOT_HELD: 'NOT_HELD',
  LIMIT_NOT_MET: 'LIMIT_NOT_MET',
});

/**
 * @typedef {object} TradableStock
 * @property {string} symbol
 * @property {string} name
 * @property {string} currency
 * @property {number|null} price Preu actual mostrat.
 * @property {string} [asOf] Data del proveïdor; absent si el preu és històric.
 * @property {number} [receivedAt] Moment (ms) en què el client va rebre la cotització.
 */

/**
 * @typedef {object} FxQuote
 * @property {number} rate EUR per unitat de la moneda.
 * @property {string} asOf Data del proveïdor.
 * @property {number} receivedAt Moment (ms) en què el client el va rebre.
 */

/**
 * Arrodoneix un import a cèntims.
 * @param {number} value Import.
 * @returns {number}
 */
export const roundCents = (value) => Math.round(value * 100) / 100;

/**
 * Comprova si l'empresa té un preu i, si cal, un tipus de canvi vàlids per operar
 * (independentment de la quantitat i el límit).
 * @param {TradableStock} stock Empresa.
 * @param {Record<string, FxQuote>} fxRates Tipus de canvi per moneda.
 * @param {number} now Moment actual en ms.
 * @returns {{block: string} | {block: null, rate: number}}
 */
export function priceStatus(stock, fxRates, now) {
  if (!TRADABLE_CURRENCIES.includes(stock.currency)) return {block: OrderBlock.CURRENCY_NOT_SUPPORTED};
  if (!stock.asOf || !Number.isFinite(stock.price) || stock.price <= 0) return {block: OrderBlock.NO_VERIFIED_QUOTE};
  if (!Number.isFinite(stock.receivedAt) || now - stock.receivedAt > MAX_QUOTE_AGE_MS) return {block: OrderBlock.QUOTE_TOO_OLD};
  if (stock.currency === 'EUR') return {block: null, rate: 1};
  const fx = fxRates[stock.currency];
  if (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0 || now - fx.receivedAt > MAX_FX_AGE_MS) {
    return {block: OrderBlock.FX_UNAVAILABLE};
  }
  return {block: null, rate: fx.rate};
}

/**
 * Valida una ordre completa.
 * @param {object} input
 * @param {TradableStock} input.stock Empresa.
 * @param {'buy'|'sell'} input.side Compra o venda.
 * @param {string|number} input.quantity Nombre d'accions (enter positiu).
 * @param {string|number} input.limit Preu límit en la moneda de l'acció.
 * @param {number} input.cash Saldo en EUR.
 * @param {number} input.held Accions que ja es tenen.
 * @param {Record<string, FxQuote>} input.fxRates Tipus de canvi.
 * @param {number} input.now Moment actual en ms.
 * @returns {{ok: false, block: string} | {ok: true, qty: number, price: number, rate: number, total: number, totalEur: number}}
 */
export function checkOrder({stock, side, quantity, limit, cash, held, fxRates, now}) {
  const status = priceStatus(stock, fxRates, now);
  if (status.block) return {ok: false, block: status.block};
  const qty = Number(quantity), limitPrice = Number(limit);
  if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(limitPrice) || limitPrice <= 0) {
    return {ok: false, block: OrderBlock.INVALID_INPUT};
  }
  const {rate} = status;
  // El cost màxim d'una compra es calcula amb el límit, com en una ordre limitada real.
  if (side === 'buy' && roundCents(qty * limitPrice * rate) > cash + 0.00001) return {ok: false, block: OrderBlock.INSUFFICIENT_CASH};
  if (side === 'sell' && qty > held) return {ok: false, block: OrderBlock.NOT_HELD};
  if ((side === 'buy' && stock.price > limitPrice) || (side === 'sell' && stock.price < limitPrice)) {
    return {ok: false, block: OrderBlock.LIMIT_NOT_MET};
  }
  const total = qty * stock.price;
  return {ok: true, qty, price: stock.price, rate, total, totalEur: roundCents(total * rate)};
}

/**
 * Aplica una ordre ja validada al compte i en retorna un de nou.
 * @param {import('./storage.js').Account} account Compte actual.
 * @param {TradableStock} stock Empresa.
 * @param {'buy'|'sell'} side Compra o venda.
 * @param {{qty: number, price: number, rate: number, totalEur: number}} order Resultat de checkOrder.
 * @param {number} now Moment actual en ms.
 * @returns {import('./storage.js').Account}
 */
export function executeOrder(account, stock, side, order, now) {
  const sign = side === 'buy' ? 1 : -1;
  return {
    ...account,
    cash: roundCents(account.cash - sign * order.totalEur),
    holdings: {...account.holdings, [stock.symbol]: (account.holdings[stock.symbol] || 0) + sign * order.qty},
    trades: [{
      id: now, symbol: stock.symbol, name: stock.name, side, qty: order.qty, price: order.price,
      currency: stock.currency, at: new Date(now).toISOString(), reference: 'provider',
      priceAsOf: stock.asOf, fxRate: order.rate, eurAmount: order.totalEur,
    }, ...account.trades],
  };
}

/**
 * Valor en EUR de les posicions obertes.
 * @param {Record<string, number>} holdings Accions per símbol.
 * @param {(symbol: string) => {currency: string, price: number|null} | undefined} findStock Cerca d'empresa.
 * @param {Record<string, FxQuote>} fxRates Tipus de canvi.
 * @returns {{value: number, unvalued: string[]}} Valor i símbols sense preu o sense tipus de canvi.
 */
export function holdingsValueEur(holdings, findStock, fxRates) {
  let value = 0;
  const unvalued = [];
  for (const [symbol, qty] of Object.entries(holdings)) {
    if (!(qty > 0)) continue;
    const stock = findStock(symbol);
    const rate = stock?.currency === 'EUR' ? 1 : fxRates[stock?.currency]?.rate;
    if (!stock || stock.price == null || !Number.isFinite(rate)) { unvalued.push(symbol); continue; }
    value += qty * stock.price * rate;
  }
  return {value: roundCents(value), unvalued};
}
