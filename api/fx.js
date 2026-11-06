// Tipus de canvi per al simulador: converteix operacions en altres monedes a EUR.
// GET /api/fx?pair=USD/EUR → {pair, rate, asOf, source}
// `rate` és quants EUR val 1 unitat de la moneda d'origen.
import {enforceClientLimit,providerRequest,noCache,cacheSuccessfulFx,asNumber,failure,httpError} from './_market.js';

/**
 * Parells admesos. Només USD: les accions de Londres (GBP) poden cotitzar en
 * penics (GBp) i caldria tractar-ho a part abans d'acceptar-les al simulador.
 */
export const FX_PAIRS=new Set(['USD/EUR']);

/** Antiguitat màxima acceptada per al tipus de canvi del proveïdor (3 dies, per cobrir caps de setmana). */
const MAX_FX_AGE_SECONDS=3*24*3600;

export default async function handler(req,res){
 noCache(res);if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  await enforceClientLimit(req);
  const query=req.query||{};
  // Consulta canònica, com a les altres rutes: un sol paràmetre i un valor exacte.
  if(Object.keys(query).some(k=>k!=='pair'))throw httpError('NON_CANONICAL_QUERY',400);
  const pair=query.pair;
  if(typeof pair!=='string'||!FX_PAIRS.has(pair))throw httpError('UNKNOWN_PAIR',400);
  const data=await providerRequest('exchange_rate',{symbol:pair},pair);
  const rate=asNumber(data.rate),timestamp=asNumber(data.timestamp);
  const age=timestamp?Date.now()/1000-timestamp:Infinity;
  // El parell retornat ha de ser el demanat i la dada ha de ser recent i positiva.
  if(String(data.symbol||'').toUpperCase()!==pair||rate===null||rate<=0||!(age<MAX_FX_AGE_SECONDS))
   return res.status(502).json({error:'FX_NOT_VERIFIED'});
  cacheSuccessfulFx(res);
  return res.status(200).json({pair,rate,asOf:new Date(timestamp*1000).toISOString(),source:'Twelve Data'});
 }catch(e){return failure(res,e)}
}
