import {EXTRA} from '../src/universe.js';
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
export const asNumber=x=>{if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)?n:null};
export async function provider(endpoint,stock,extra={}){
 const key=process.env.TWELVE_DATA_API_KEY;
 if(!key){const e=new Error('PROVIDER_NOT_CONFIGURED');e.status=503;throw e}
 const url=new URL('https://api.twelvedata.com/'+endpoint);
 url.searchParams.set('symbol',stock.symbol);
 // Segment MICs for Nasdaq vary by listing; use the major exchange label.
 if(stock.mic==='XNAS')url.searchParams.set('exchange','NASDAQ');
 else if(stock.mic==='XNYS')url.searchParams.set('exchange','NYSE');
 else url.searchParams.set('mic_code',stock.mic);
 for(const [k,v] of Object.entries(extra))url.searchParams.set(k,String(v));
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
   console.warn('[market-data]',endpoint,stock.symbol,stock.mic,code);
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
export function lookup(req){const symbols=String(req.query.symbol||req.query.symbols||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);if(symbols.length!==1||!INSTRUMENTS[symbols[0]]){const e=new Error('UNKNOWN_OR_MULTIPLE_SYMBOLS');e.status=400;throw e}return {ticker:symbols[0],stock:INSTRUMENTS[symbols[0]]}}
export function failure(res,e){
 const known=new Set(['PROVIDER_NOT_CONFIGURED','INVALID_PROVIDER_KEY','MARKET_NOT_INCLUDED_IN_PLAN','INSTRUMENT_NOT_FOUND','INVALID_INSTRUMENT_OR_QUERY','RATE_LIMIT_REACHED','PROVIDER_TEMPORARILY_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_NETWORK_ERROR','UPSTREAM_INVALID_RESPONSE','UNKNOWN_OR_MULTIPLE_SYMBOLS']);
 return res.status(e.status||502).json({error:known.has(e.message)?e.message:'DATA_UNAVAILABLE'});
}
