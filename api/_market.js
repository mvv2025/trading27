import {EXTRA} from '../src/universe.js';
import {consume,envLimit,clientIp,hashIdentity} from './_ratelimit.js';
// Shared server-only Twelve Data adapter. Never import this from src/.
// Exchange MIC and expected currency stop ambiguous ticker matches.
const BASE_INSTRUMENTS={
 BNP:{symbol:'BNP',mic:'XPAR',currency:'EUR'},SU:{symbol:'SU',mic:'XPAR',currency:'EUR'},
 AIR:{symbol:'AIR',mic:'XPAR',currency:'EUR'},TTE:{symbol:'TTE',mic:'XPAR',currency:'EUR'},
 RACE:{symbol:'RACE',mic:'XMIL',currency:'EUR'},BMW:{symbol:'BMW',mic:'XETR',currency:'EUR'},
 MBG:{symbol:'MBG',mic:'XETR',currency:'EUR'},ASML:{symbol:'ASML',mic:'XAMS',currency:'EUR'},
 '9988':{symbol:'9988',mic:'XHKG',currency:'HKD'},'0700':{symbol:'0700',mic:'XHKG',currency:'HKD'},
 '1211':{symbol:'1211',mic:'XHKG',currency:'HKD'},'7203':{symbol:'7203',mic:'XTKS',currency:'JPY'},
 SHOP:{symbol:'SHOP',mic:'XTSE',currency:'CAD'},NVDA:{symbol:'NVDA',mic:'XNAS',currency:'USD'},
 GOOGL:{symbol:'GOOGL',mic:'XNAS',currency:'USD'},MSFT:{symbol:'MSFT',mic:'XNAS',currency:'USD'}
};
export const INSTRUMENTS={...BASE_INSTRUMENTS,...Object.fromEntries(EXTRA.map(s=>[s.symbol,{symbol:s.symbol,mic:s.mic,currency:s.currency,market:s.market}]))};
export function noCache(res){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff')}
export function cacheSuccessfulQuote(res){res.setHeader('Cache-Control','public, max-age=0, s-maxage=90, stale-while-revalidate=45')}
export function cacheSuccessfulFx(res){res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=300')}
export function cacheSuccessfulHistory(res){res.setHeader('Cache-Control','public, max-age=0, s-maxage=1800, stale-while-revalidate=3600')}
export const asNumber=x=>{if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)?n:null};
/**
 * Crida a un instrument cotitzat: afegeix el símbol i la borsa als paràmetres.
 * @param {string} endpoint Endpoint de Twelve Data (quote, time_series...).
 * @param {{symbol: string, mic: string}} stock Instrument.
 * @param {Record<string, string|number>} [extra] Paràmetres addicionals.
 * @returns {Promise<any>} Cos JSON del proveïdor.
 */
export async function provider(endpoint,stock,extra={}){
 const params={symbol:stock.symbol};
 // Segment MICs for Nasdaq vary by listing; use the major exchange label.
 if(stock.mic==='XNAS')params.exchange='NASDAQ';
 else if(stock.mic==='XNYS')params.exchange='NYSE';
 else params.mic_code=stock.mic;
 return providerRequest(endpoint,{...params,...extra},stock.symbol+' '+stock.mic);
}

/**
 * Crida genèrica a Twelve Data, amb pressupost de crèdits, temps límit i
 * traducció dels errors a codis públics.
 * @param {string} endpoint Endpoint de Twelve Data.
 * @param {Record<string, string|number>} params Paràmetres de consulta.
 * @param {string} label Descripció per als registres (sense secrets).
 * @returns {Promise<any>} Cos JSON del proveïdor.
 */
export async function providerRequest(endpoint,params,label){
 const key=process.env.TWELVE_DATA_API_KEY;
 if(!key){const e=new Error('PROVIDER_NOT_CONFIGURED');e.status=503;throw e}
 // Cada crida real al proveïdor gasta un crèdit: es comprova el pressupost global abans.
 await consumeProviderBudget();
 const url=new URL('https://api.twelvedata.com/'+endpoint);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 // Keep the secret server-side and avoid exposing it in browser URLs or errors.
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetch(url.toString(),{headers:{Accept:'application/json','Authorization':'apikey '+key},signal:controller.signal});
  // Twelve Data error bodies can be JSON even for non-2xx status.
  let data;
  try{data=await response.json()}catch{const e=new Error('UPSTREAM_INVALID_RESPONSE');e.status=502;throw e}
  const errorCode=Number(data?.code)||response.status;
  if(!response.ok||data?.status==='error'||Number(data?.code)>=400){
   const code=errorCode===400?'INVALID_INSTRUMENT_OR_QUERY':errorCode===401?'INVALID_PROVIDER_KEY':
    errorCode===403?'MARKET_NOT_INCLUDED_IN_PLAN':errorCode===404?'INSTRUMENT_NOT_FOUND':
    errorCode===429?'RATE_LIMIT_REACHED':errorCode>=500?'PROVIDER_TEMPORARILY_UNAVAILABLE':'DATA_UNAVAILABLE';
   const e=new Error(code);e.status=errorCode===429?429:errorCode===403?403:errorCode===401?401:502;
   if(e.status===429)e.retryAfter=60;
   console.warn('[market-data]',endpoint,label,code);
   throw e;
  }
  return data;
 }catch(e){
  if(e.name==='AbortError'){const timeoutError=new Error('PROVIDER_TIMEOUT');timeoutError.status=504;throw timeoutError}
  if(e.status)throw e;
  const networkError=new Error('PROVIDER_NETWORK_ERROR');networkError.status=502;throw networkError;
 }finally{clearTimeout(timeout)}
}
export function verifiedCurrency(data,stock){return String(data.currency||data.meta?.currency||'').toUpperCase()===stock.currency}
export function verifiedMic(data,stock){const given=String(data.mic_code||data.meta?.mic_code||'').toUpperCase();return !given||given===stock.mic||(stock.mic==='XNAS'&&['XNGS','XNCM','XNMS'].includes(given))}
/**
 * Crea un error amb codi HTTP i, opcionalment, segons per tornar-ho a provar.
 * @param {string} code Codi d'error públic.
 * @param {number} status Codi HTTP.
 * @param {number} [retryAfter] Segons per a la capçalera Retry-After.
 * @returns {Error & {status: number, retryAfter?: number}}
 */
export function httpError(code,status,retryAfter){const e=new Error(code);e.status=status;if(retryAfter)e.retryAfter=retryAfter;return e}

/**
 * Valida que la consulta tingui una forma única (canònica).
 *
 * La memòria cau del CDN de Vercel fa servir la URL sencera com a clau. Si
 * s'acceptessin paràmetres extra (`&x=1`), minúscules (`nvda`) o àlies
 * (`symbols=`), cada variant seria una entrada nova de memòria cau i una
 * crida nova (i un crèdit) al proveïdor. Per això es rebutja tot el que no
 * sigui exactament la forma documentada.
 *
 * @param {{query?: Record<string, unknown>}} req Petició.
 * @param {string[]} [allowed] Paràmetres admesos, a més de `symbol`.
 * @returns {{ticker: string, stock: {symbol: string, mic: string, currency: string}}}
 * @throws {Error} 400 NON_CANONICAL_QUERY o UNKNOWN_OR_MULTIPLE_SYMBOLS.
 */
export function lookup(req,allowed=[]){
 const query=req.query||{};
 const permitted=new Set(['symbol',...allowed]);
 if(Object.keys(query).some(k=>!permitted.has(k)))throw httpError('NON_CANONICAL_QUERY',400);
 const raw=query.symbol;
 if(typeof raw!=='string'||!raw)throw httpError('UNKNOWN_OR_MULTIPLE_SYMBOLS',400);
 if(Object.hasOwn(INSTRUMENTS,raw))return {ticker:raw,stock:INSTRUMENTS[raw]};
 // Símbol conegut però escrit diferent (minúscules, espais): no és canònic.
 if(Object.hasOwn(INSTRUMENTS,raw.trim().toUpperCase()))throw httpError('NON_CANONICAL_QUERY',400);
 throw httpError('UNKNOWN_OR_MULTIPLE_SYMBOLS',400);
}

/**
 * Límit de peticions per IP. Només compta les peticions que arriben a la
 * funció (les respostes servides pel CDN no la invoquen).
 * Configurable amb RATE_LIMIT_PER_IP_PER_MINUTE (per defecte 30).
 * @param {object} req Petició.
 * @returns {Promise<void>}
 * @throws {Error} 429 TOO_MANY_REQUESTS amb retryAfter.
 */
export async function enforceClientLimit(req){
 const rule={name:'ip',limit:envLimit('RATE_LIMIT_PER_IP_PER_MINUTE',30),windowSeconds:60};
 const result=await consume(rule,hashIdentity(clientIp(req)));
 if(!result.allowed){console.warn('[rate-limit] IP limitada',result.store);throw httpError('TOO_MANY_REQUESTS',429,result.retryAfter)}
}

/**
 * Pressupost global de crèdits del proveïdor (per minut i per dia UTC),
 * per no esgotar la quota compartida. Per defecte coincideix amb el pla
 * Basic de Twelve Data: MARKET_DATA_CREDITS_PER_MINUTE=8 i
 * MARKET_DATA_CREDITS_PER_DAY=800.
 * @returns {Promise<void>}
 * @throws {Error} 503 PROVIDER_BUDGET_EXHAUSTED amb retryAfter.
 */
export async function consumeProviderBudget(){
 const rules=[
  {name:'credits-min',limit:envLimit('MARKET_DATA_CREDITS_PER_MINUTE',8),windowSeconds:60},
  {name:'credits-day',limit:envLimit('MARKET_DATA_CREDITS_PER_DAY',800),windowSeconds:86400}
 ];
 for(const rule of rules){
  const result=await consume(rule,'global');
  if(!result.allowed){console.warn('[rate-limit] pressupost esgotat',rule.name,result.store);throw httpError('PROVIDER_BUDGET_EXHAUSTED',503,result.retryAfter)}
 }
}
export function failure(res,e){
 const known=new Set(['PROVIDER_NOT_CONFIGURED','INVALID_PROVIDER_KEY','MARKET_NOT_INCLUDED_IN_PLAN','INSTRUMENT_NOT_FOUND','INVALID_INSTRUMENT_OR_QUERY','RATE_LIMIT_REACHED','PROVIDER_TEMPORARILY_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_NETWORK_ERROR','UPSTREAM_INVALID_RESPONSE','UNKNOWN_OR_MULTIPLE_SYMBOLS','NON_CANONICAL_QUERY','TOO_MANY_REQUESTS','PROVIDER_BUDGET_EXHAUSTED','UNKNOWN_PAIR']);
 if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));
 return res.status(e.status||502).json({error:known.has(e.message)?e.message:'DATA_UNAVAILABLE'});
}
