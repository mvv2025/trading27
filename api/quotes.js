import {enforceClientLimit,lookup,provider,noCache,cacheSuccessfulQuote,asNumber,verifiedCurrency,verifiedMic,failure} from './_market.js';
export default async function handler(req,res){
 noCache(res);if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  await enforceClientLimit(req);
  const {ticker,stock}=lookup(req);
  const data=await provider('quote',stock);
  const price=asNumber(data.close);
  // Never silently accept a quote from the wrong listing or a quote without a timestamp.
  const timestamp=asNumber(data.last_quote_at)||asNumber(data.timestamp);
  if(!verifiedCurrency(data,stock)||!verifiedMic(data,stock)||price===null||price<=0||!timestamp)
   return res.status(502).json({error:'QUOTE_NOT_VERIFIED'});
  const asOf=new Date(timestamp*1000).toISOString();
  cacheSuccessfulQuote(res);
  return res.status(200).json({source:'Twelve Data',quotes:[{
    symbol:ticker,exchange:stock.mic,currency:stock.currency,price,change:asNumber(data.change),percentChange:asNumber(data.percent_change),
    high52:asNumber(data.fifty_two_week?.high),low52:asNumber(data.fifty_two_week?.low),
    isMarketOpen:data.is_market_open===true,asOf,quality:'provider_unverified_latency',type:'quote'
  }]});
 }catch(e){return failure(res,e)}
}
