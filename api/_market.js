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
 // NASDAQ's segment MICs (XNGS/XNCM/XNMS) vary by listing. Use the exchange name for reliable symbol lookup.
 if(stock.mic==='XNAS')url.searchParams.set('exchange','NASDAQ');
 else if(stock.mic==='XNYS')url.searchParams.set('exchange','NYSE');
 else url.searchParams.set('mic_code',stock.mic);
 url.searchParams.set('apikey',key);
 for(const [k,v] of Object.entries(extra))url.searchParams.set(k,String(v));
 const response=await fetch(url.toString(),{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok){const e=new Error('UPSTREAM_HTTP_'+response.status);e.status=502;throw e}
 const data=await response.json();
 if(data.status==='error'||data.code){const e=new Error('PROVIDER_'+String(data.code||'ERROR'));e.status=data.code===429?429:502;throw e}
 return data
}
export function verifiedCurrency(data,stock){return String(data.currency||data.meta?.currency||'').toUpperCase()===stock.currency}
export function verifiedMic(data,stock){const given=String(data.mic_code||data.meta?.mic_code||'').toUpperCase();return !given||given===stock.mic||(stock.mic==='XNAS'&&['XNGS','XNCM','XNMS'].includes(given))}
export function lookup(req){const symbols=String(req.query.symbol||req.query.symbols||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);if(symbols.length!==1||!INSTRUMENTS[symbols[0]]){const e=new Error('UNKNOWN_OR_MULTIPLE_SYMBOLS');e.status=400;throw e}return {ticker:symbols[0],stock:INSTRUMENTS[symbols[0]]}}
export function failure(res,e){return res.status(e.status||500).json({error:e.message==='PROVIDER_NOT_CONFIGURED'?'PROVIDER_NOT_CONFIGURED':e.message.startsWith('PROVIDER_')?e.message:e.message==='UNKNOWN_OR_MULTIPLE_SYMBOLS'?e.message:'DATA_UNAVAILABLE'})}
