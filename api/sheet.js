// Preus del full de càlcul de Google (GOOGLEFINANCE), validats.
// GET /api/sheet → {source, fetchedAt, stats, rows: {TICKER: SheetRow}}
//
// La resposta es desa 10 minuts al CDN (i fins a 30 minuts més mentre es
// renova), de manera que Google rep com a molt unes poques peticions per hora,
// encara que hi hagi molts visitants. Els errors no es desen.
import {enforceClientLimit,noCache,failure,httpError} from './_market.js';
import {DEFAULT_SHEET_ID,FX_TAB,fetchSheetCsv,parseFxTab,parseSheet} from './_sheet.js';

export default async function handler(req,res){
 noCache(res);if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  await enforceClientLimit(req);
  // Sense paràmetres: una sola URL i, per tant, una sola entrada a la memòria cau del CDN.
  if(Object.keys(req.query||{}).length)throw httpError('NON_CANONICAL_QUERY',400);
  const sheetId=process.env.MARKET_SHEET_ID||DEFAULT_SHEET_ID;
  // Les dues pestanyes en paral·lel. La de tipus de canvi és opcional: si falla o no existeix, fx = {}.
  const [text,fx]=await Promise.all([
   fetchSheetCsv(sheetId),
   fetchSheetCsv(sheetId,undefined,FX_TAB).then(parseFxTab).catch(()=>({})),
  ]);
  const {rows,stats}=parseSheet(text);
  if(!stats.withPrice)return res.status(502).json({error:'SHEET_EMPTY'});
  if(Object.keys(stats.rejected).length)console.warn('[sheet] files descartades',stats.rejected);
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=600, stale-while-revalidate=1800');
  return res.status(200).json({source:'Google Finance (full de càlcul)',fetchedAt:new Date().toISOString(),stats,rows,fx});
 }catch(e){
  if(['SHEET_NOT_CONFIGURED','SHEET_NOT_PUBLIC','SHEET_TIMEOUT','SHEET_UNAVAILABLE','SHEET_TOO_LARGE','SHEET_FORMAT_CHANGED'].includes(e.message)){
   console.warn('[sheet]',e.message);
   return res.status(e.status||502).json({error:e.message});
  }
  return failure(res,e);
 }
}
