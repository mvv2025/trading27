import React,{useMemo,useState} from 'react';
import {TrendingDown,ShieldAlert,Search,Info} from 'lucide-react';

// Screening evidence, not an investment recommendation. 52-week high is NOT the all-time high.
const LANG={
 ca:{title:'Radar de recuperació',intro:'Detecta caigudes respecte del màxim de 52 setmanes i diferencia indicis de valoració de possibles trampes. No són prediccions ni ordres de compra.',threshold:'Caiguda mínima',all:'Totes',review:'Estudiar',risk:'Risc de trampa',unknown:'Dades insuficients',total:'Empreses filtrades',sort:'Ordenació',fall:'Caiguda més gran',valuation:'PER més baix',name:'Empresa',result:'Valoració preliminar',price:'Cotització',pe:'PER',peak:'Màxim 52 setmanes',fallLabel:'Des del màxim 52 setmanes',source:'Font',date:'Data',open:'Obrir fitxa',noResults:'Cap empresa compleix els criteris amb dades vàlides.',why:'Per què?',warning:'La magnitud de la caiguda no demostra una oportunitat. El sistema no disposa encara de dades verificades de deute, flux de caixa lliure ni evolució dels beneficis.',stale:'Dada antiga: no es classifica',missing:'Preu o màxim anual absent o inconsistent',future:'Data de cotització invàlida',loss:'PER no positiu: possibles pèrdues o beneficis no representatius',lowPE:'PER molt baix: cal comprovar la sostenibilitat dels beneficis',highPE:'PER elevat: valoració exigent malgrat la caiguda',fairPE:'PER positiu dins un interval orientatiu',noPE:'PER no disponible: valoració incompleta',strong:'Caiguda rellevant amb un PER orientatiu; analitzar fonamentals',moderate:'Caiguda detectada; encara falta evidència de valoració',needs:'La informació disponible no permet distingir recuperació i trampa',age:'Antiguitat màxima: 45 dies',only52:'El càlcul usa màxim de 52 setmanes, no màxim històric',disclaimer:'Cribratge educatiu; no substitueix una anàlisi financera ni verifica preus en temps real.'},
 es:{title:'Radar de recuperación',intro:'Detecta caídas desde el máximo de 52 semanas y separa indicios de valoración de posibles trampas. No son predicciones ni señales de compra.',threshold:'Caída mínima',all:'Todas',review:'Estudiar',risk:'Riesgo de trampa',unknown:'Datos insuficientes',total:'Empresas filtradas',sort:'Ordenar',fall:'Mayor caída',valuation:'PER más bajo',name:'Empresa',result:'Valoración preliminar',price:'Cotización',pe:'PER',peak:'Máximo 52 semanas',fallLabel:'Desde máximo de 52 semanas',source:'Fuente',date:'Fecha',open:'Abrir ficha',noResults:'Ninguna empresa cumple los criterios con datos válidos.',why:'¿Por qué?',warning:'La caída no demuestra una oportunidad. Faltan datos verificados de deuda, flujo de caja libre y evolución de beneficios.',stale:'Dato antiguo: no se clasifica',missing:'Precio o máximo anual ausente o inconsistente',future:'Fecha de cotización inválida',loss:'PER no positivo: posibles pérdidas o beneficios no representativos',lowPE:'PER muy bajo: comprobar sostenibilidad del beneficio',highPE:'PER elevado pese a la caída',fairPE:'PER positivo en un intervalo orientativo',noPE:'PER no disponible',strong:'Caída significativa y PER orientativo; revisar fundamentales',moderate:'Caída detectada; faltan más pruebas',needs:'No hay información suficiente para diferenciar recuperación y trampa',age:'Antigüedad máxima: 45 días',only52:'Se usa el máximo de 52 semanas, no el histórico',disclaimer:'Cribado educativo; sin cotizaciones verificadas en tiempo real.'},
 en:{title:'Recovery radar',intro:'Screen declines from 52-week highs and distinguish valuation clues from possible value traps. These are not forecasts or buy signals.',threshold:'Minimum decline',all:'All',review:'Review',risk:'Value-trap risk',unknown:'Insufficient data',total:'Matching companies',sort:'Sort',fall:'Largest decline',valuation:'Lowest P/E',name:'Company',result:'Preliminary assessment',price:'Quote',pe:'P/E',peak:'52-week high',fallLabel:'From 52-week high',source:'Source',date:'Date',open:'Open company',noResults:'No companies match with valid data.',why:'Why?',warning:'A price decline alone proves no opportunity. Verified debt, free cash flow and earnings trends are not yet available.',stale:'Stale quote: not classified',missing:'Missing or inconsistent price / 52-week high',future:'Invalid quote date',loss:'Non-positive P/E: loss-making or distorted earnings',lowPE:'Very low P/E: verify earnings sustainability',highPE:'High P/E despite the decline',fairPE:'Positive P/E in an indicative range',noPE:'P/E unavailable',strong:'Large decline and indicative P/E; investigate fundamentals',moderate:'Decline detected; more evidence needed',needs:'Available data cannot distinguish a recovery from a trap',age:'Maximum quote age: 45 days',only52:'Based on 52-week high, not all-time high',disclaimer:'Educational screen; not a substitute for financial research or verified live quotes.'}
};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function assessDrawdown(s,language='ca',now=Date.now()){
 const t=LANG[language]||LANG.ca;
 const p=s.price,h=s.high,pe=s.pe;
 if(!finite(p)||!finite(h)||p<=0||h<=0||p>h)return {status:'unknown',drop:null,reason:t.missing};
 const date=Date.parse(s.asOf||'');
 if(!Number.isFinite(date)||date>now+86400000)return {status:'unknown',drop:null,reason:t.future};
 const drop=(1-p/h)*100;
 if(now-date>45*86400000)return {status:'unknown',drop,reason:t.stale};
 if(!finite(pe))return {status:'unknown',drop,reason:t.noPE};
 if(pe<=0)return {status:'risk',drop,reason:t.loss};
 if(pe<6)return {status:'risk',drop,reason:t.lowPE};
 if(pe>45)return {status:'risk',drop,reason:t.highPE};
 if(drop>=30 && pe<=25)return {status:'review',drop,reason:t.strong};
 return {status:'unknown',drop,reason:t.moderate};
}
export default function RecoveryRadar({stocks=[],language='ca',onOpen}){
 const t=LANG[language]||LANG.ca;
 const [threshold,setThreshold]=useState(25),[status,setStatus]=useState('all'),[sort,setSort]=useState('fall'),[query,setQuery]=useState('');
 const locale=language==='en'?'en-US':language==='es'?'es-ES':'ca-ES';
 const rows=useMemo(()=>stocks.map(s=>({...s,assessment:assessDrawdown(s,language)})).filter(s=>s.assessment.drop!==null&&s.assessment.drop>=threshold&&(!query||[s.name,s.symbol].join(' ').toLowerCase().includes(query.toLowerCase()))&&(status==='all'||s.assessment.status===status)).sort((a,b)=>sort==='valuation'?(finite(a.pe)&&a.pe>0?a.pe:Infinity)-(finite(b.pe)&&b.pe>0?b.pe:Infinity):b.assessment.drop-a.assessment.drop),[stocks,language,threshold,status,sort,query]);
 const pct=x=>new Intl.NumberFormat(locale,{maximumFractionDigits:1,minimumFractionDigits:1}).format(x)+' %';
 const money=(v,c)=>new Intl.NumberFormat(locale,{style:'currency',currency:c||'EUR',maximumFractionDigits:2}).format(v);
 const statuses={review:t.review,risk:t.risk,unknown:t.unknown};
 return <section className="recovery">
  <header className="recoveryIntro"><span className="smallCaps">TRADING27 · RADAR</span><h1>{t.title}</h1><p>{t.intro}</p></header>
  <div className="recoveryControls">
   <label>{t.threshold}<select value={threshold} onChange={e=>setThreshold(Number(e.target.value))}>{[15,20,25,30,40,50,60].map(v=><option value={v} key={v}>−{v} %</option>)}</select></label>
   <label>{t.result}<select value={status} onChange={e=>setStatus(e.target.value)}>{['all','review','risk','unknown'].map(v=><option key={v} value={v}>{statuses[v]||t.all}</option>)}</select></label>
   <label>{t.sort}<select value={sort} onChange={e=>setSort(e.target.value)}><option value="fall">{t.fall}</option><option value="valuation">{t.valuation}</option></select></label>
   <label>{t.name}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ticker / company"/></label>
  </div>
  <p className="recoveryCaveat"><Info size={18}/>{t.only52}. {t.age}. {t.disclaimer}</p>
  <div className="recoveryCount"><strong>{rows.length}</strong> {t.total}</div>
  <div className="recoveryList">
   {rows.map(s=><article className="recoveryCard" key={s.market+':'+s.symbol}>
     <div className="recoveryCardHead"><div><h2>{s.name}</h2><span>{s.market}:{s.symbol} · {s.currency}</span></div><strong className="recoveryDrop">−{pct(s.assessment.drop)}</strong></div>
     <div className="recoveryMeasures"><div><small>{t.price}</small><strong>{money(s.price,s.currency)}</strong></div><div><small>{t.peak}</small><strong>{money(s.high,s.currency)}</strong></div><div><small>{t.pe}</small><strong>{finite(s.pe)?s.pe.toFixed(2):'—'}</strong></div></div>
     <div className="recoveryInterpret"><span className={'recoveryStatus recovery-'+s.assessment.status}>{statuses[s.assessment.status]}</span><p><strong>{t.why}</strong> {s.assessment.reason}</p></div>
     <footer><span>{t.source}: {s.dataSource||'Font de la fitxa'} · {t.date}: {s.asOf?new Date(s.asOf).toLocaleDateString(locale):'—'}</span><button type="button" onClick={()=>onOpen(s.symbol)}>{t.open} →</button></footer>
   </article>)}
   {rows.length===0&&<div className="recoveryEmpty">{t.noResults}</div>}
  </div>
  <p className="recoveryWarning"><ShieldAlert size={18}/>{t.warning}</p>
 </section>;
}
