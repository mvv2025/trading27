import {lookup,provider,noCache,asNumber,verifiedCurrency,verifiedMic,failure} from './_market.js';
const SIZES={'1M':30,'3M':90,'6M':180,'1Y':270,'3Y':810,'5Y':1350};
export default async function handler(req,res){
 noCache(res);if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  const {ticker,stock}=lookup(req);
  const range=String(req.query.range||'6M').toUpperCase();
  if(!SIZES[range])return res.status(400).json({error:'INVALID_RANGE'});
  const data=await provider('time_series',stock,{interval:'1day',outputsize:SIZES[range],adjust:'splits'});
  if(!verifiedCurrency(data,stock)||!verifiedMic(data,stock)||!Array.isArray(data.values))
   return res.status(502).json({error:'HISTORY_NOT_VERIFIED'});
  const candles=data.values.map(v=>({date:String(v.datetime||'').slice(0,10),open:asNumber(v.open),high:asNumber(v.high),low:asNumber(v.low),close:asNumber(v.close),volume:asNumber(v.volume)}))
    .filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&v.close!==null&&v.close>0).reverse();
  if(!candles.length)return res.status(502).json({error:'EMPTY_HISTORY'});
  return res.status(200).json({symbol:ticker,currency:stock.currency,exchange:stock.mic,range,interval:'1day',adjustment:'splits',source:'Twelve Data',timezone:data.meta?.exchange_timezone||null,asOf:candles[candles.length-1].date,candles});
 }catch(e){return failure(res,e)}
}
