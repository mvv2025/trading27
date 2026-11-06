import React, {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity, BarChart3, BookOpen, Bot, ChevronDown, CircleAlert, Clock3, ExternalLink, Filter, Globe2, GraduationCap, LayoutDashboard, LockKeyhole, Plus, Radio, RefreshCw, Search, ShieldCheck, TrendingDown, TrendingUp, Wallet, X} from 'lucide-react';
import './styles.css';

const SEED=[
 {symbol:'BNP',name:'BNP Paribas',market:'PAR',country:'França',currency:'EUR',price:87.65,change:0.45,high:113.82,low:65.12,yield:6.62,pe:9.16,mv:97.89,sector:'Banca'},
 {symbol:'SU',name:'Schneider Electric',market:'PAR',country:'França',currency:'EUR',price:247.60,change:1.40,high:312.30,low:220.40,yield:1.70,pe:28.82,mv:149.45,sector:'Indústria'},
 {symbol:'AIR',name:'Airbus',market:'PAR',country:'França',currency:'EUR',price:196.34,change:4.42,high:221.30,low:157.42,yield:1.63,pe:36.63,mv:155.56,sector:'Aeronàutica'},
 {symbol:'TTE',name:'TotalEnergies',market:'PAR',country:'França',currency:'EUR',price:84.60,change:1,high:84,low:52.40,yield:null,pe:12.28,mv:193.03,sector:'Energia'},
 {symbol:'RACE',name:'Ferrari',market:'MIL',country:'Itàlia',currency:'EUR',price:357.20,change:5.05,high:377.50,low:269,yield:.84,pe:51.69,mv:63.32,sector:'Automoció'},
 {symbol:'BMW',name:'BMW',market:'GER',country:'Alemanya',currency:'EUR',price:57.68,change:.3,high:97.92,low:51.98,yield:7.63,pe:4.85,mv:35.52,sector:'Automoció'},
 {symbol:'MBG',name:'Mercedes-Benz',market:'GER',country:'Alemanya',currency:'EUR',price:40.76,change:.94,high:62.34,low:38.89,yield:8.59,pe:4,mv:39.25,sector:'Automoció'},
 {symbol:'ASML',name:'ASML Holding',market:'AMS',country:'Països Baixos',currency:'EUR',price:1504.80,change:15.2,high:1741,low:822.20,yield:.54,pe:75.58,mv:584.08,sector:'Semiconductors'},
 {symbol:'9988',name:'Alibaba Group',market:'HKG',country:'Xina / Hong Kong',currency:'HKD',price:96.10,change:-2.80,high:174.80,low:88.65,yield:1.07,pe:115.78,mv:1912.58,sector:'Tecnologia'},
 {symbol:'0700',name:'Tencent Holdings',market:'HKG',country:'Xina / Hong Kong',currency:'HKD',price:377.60,change:-10,high:664,low:378,yield:1.40,pe:15.26,mv:3433.38,sector:'Tecnologia'},
 {symbol:'1211',name:'BYD',market:'HKG',country:'Xina / Hong Kong',currency:'HKD',price:68.65,change:-1.8,high:113.4,low:67.10,yield:.60,pe:19.18,mv:252.87,sector:'Automoció'},
 {symbol:'7203',name:'Toyota Motor',market:'TYO',country:'Japó',currency:'JPY',price:3077,change:26,high:4000,low:2685,yield:3.25,pe:10.42,mv:44093.78,sector:'Automoció'},
 {symbol:'SHOP',name:'Shopify',market:'TOR',country:'Canadà',currency:'CAD',price:233.70,change:-1.77,high:255.95,low:129.01,yield:0,pe:156.85,mv:282.44,sector:'Tecnologia'},
 {symbol:'NVDA',name:'Nvidia',market:'NASDAQ',country:'Estats Units',currency:'USD',price:null,change:null,high:null,low:null,yield:null,pe:null,mv:null,sector:'Semiconductors'},
 {symbol:'GOOGL',name:'Alphabet',market:'NASDAQ',country:'Estats Units',currency:'USD',price:null,change:null,high:null,low:null,yield:null,pe:null,mv:null,sector:'Tecnologia'},
 {symbol:'MSFT',name:'Microsoft',market:'NASDAQ',country:'Estats Units',currency:'USD',price:null,change:null,high:null,low:null,yield:null,pe:null,mv:null,sector:'Tecnologia'}
];
const KEY='trading27-v1';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{}}catch{return {}}};
const money=(v,c='EUR')=>v==null?'—':new Intl.NumberFormat('ca-ES',{style:'currency',currency:c,maximumFractionDigits:c==='JPY'?0:2}).format(v);
const num=(v,d=2)=>v==null?'—':new Intl.NumberFormat('ca-ES',{maximumFractionDigits:d,minimumFractionDigits:d}).format(v);
const date=()=>new Date().toLocaleString('ca-ES');
const asNumber=v=>Number.isFinite(Number(v))?Number(v):null;
const risk=stock=>{const warnings=[];if(stock.price==null) warnings.push('Sense preu verificat: no es pot simular una compra.');if(stock.pe!=null&&stock.pe>35)warnings.push('PER elevat: valoració exigent.');if(stock.pe!=null&&stock.pe>0&&stock.pe<6)warnings.push('PER molt baix: comprova si els beneficis són sostenibles.');if(stock.yield!=null&&stock.yield>7)warnings.push('Dividend alt: comprova cobertura i sostenibilitat.');if(stock.low!=null&&stock.high!=null&&stock.price!=null){const p=(stock.price-stock.low)/(stock.high-stock.low);if(p<.15)warnings.push('Cotització propera al mínim anual: possible debilitat.');}if(stock.currency!=='EUR')warnings.push('Risc de divisa respecte de l’euro.');if(stock.country.includes('Xina'))warnings.push('Risc regulador i geopolític.');return warnings.length?warnings:['Cap alerta automàtica amb les dades disponibles. No equival a una anàlisi fonamental.']};
const LESSONS=[
 {title:'Price · Preu',body:'Import que costa una acció en la moneda del mercat. Una acció de 5 € no és necessàriament més barata que una de 500 €: importa també quantes accions existeixen.'},
 {title:'+/Chg · Variació',body:'Canvi absolut respecte del tancament anterior. El percentatge es calcula dividint el canvi pel preu anterior i multiplicant per 100.'},
 {title:'52 Week High/Low',body:'Màxim i mínim de cotització de les darreres 52 setmanes. Estar prop del mínim no implica automàticament una oportunitat.'},
 {title:'Yld · Dividend yield',body:'Dividend anual de referència dividit pel preu de l’acció, expressat en %. No està garantit. Un 0 imprès pot ser una dada absent o no actualitzada.'},
 {title:'P/E · PER',body:'Preu dividit pel benefici per acció. Un PER 10 equival a pagar deu vegades el benefici anual de referència; no és una promesa de recuperar els diners en deu anys.'},
 {title:'MV(b) · Capitalització',body:'Valor borsari aproximat en milers de milions de la moneda de la taula. És preu × nombre d’accions i no equival a caixa disponible.'},
 {title:'Ordres limitades i slippage',body:'Una ordre limitada fixa el màxim a pagar o el mínim a cobrar. Un stop no garanteix un preu d’execució; pot haver-hi salts de cotització.'},
 {title:'Dades històriques vs. temps real',body:'Les files del Financial Times són una fotografia de l’1 de novembre de 2026. Una API de mercat autoritzada i un backend de streaming són necessaris per mostrar dades realment en directe.'}
];
function App(){
 const [saved,setSaved]=useState(load);
 const [tab,setTab]=useState('terminal'),[query,setQuery]=useState(''),[country,setCountry]=useState('Tots'),[selected,setSelected]=useState('BNP');
 const [side,setSide]=useState('analysis'),[qty,setQty]=useState('1'),[sideOrder,setSideOrder]=useState('buy'),[limit,setLimit]=useState('');
 const [live,setLive]=useState({}),[source,setSource]=useState('FT · 01/11/2026'),[fetching,setFetching]=useState(false),[error,setError]=useState('');
 const [extra,setExtra]=useState({symbol:'',name:'',currency:'EUR',price:''});
 const [paperAmount,setPaperAmount]=useState('5000');
 const account=saved.account||{cash:5000,holdings:{},trades:[]};
 const watch=saved.watch||['BNP','SU','AIR','TTE','RACE','GOOGL','9988'];
 const notes=saved.notes||{};
 const catalog=useMemo(()=>[...SEED,...(saved.extra||[])].map(s=>({...s,...(live[s.symbol]||{})})),[saved.extra,live]);
 const stock=catalog.find(s=>s.symbol===selected)||catalog[0];
 const persist=(next)=>{setSaved(next);localStorage.setItem(KEY,JSON.stringify(next))};
 const countries=['Tots',...new Set(catalog.map(s=>s.country))];
 const filtered=catalog.filter(s=>(country==='Tots'||s.country===country)&&[s.name,s.symbol,s.sector].join(' ').toLowerCase().includes(query.toLowerCase()));
 const cash=account.cash;
 const val=Object.entries(account.holdings).reduce((t,[sym,q])=>{const s=catalog.find(x=>x.symbol===sym);return t+(s?.currency==='EUR'&&s.price!=null?s.price*q:0)},0);
 const selectedNotes=notes[selected]||'';
 useEffect(()=>{setLimit(stock?.price==null?'':String(stock.price))},[selected]);
 async function refresh(){
  const endpoint=import.meta.env.VITE_QUOTES_ENDPOINT;
  if(!endpoint){setError('No hi ha cap proveïdor de dades configurat. Les cotitzacions del FT continuen etiquetades com a històriques.');return}
  setFetching(true);setError('');
  try{
   const r=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json();if(!Array.isArray(j.quotes))throw Error('Resposta incorrecta: falta quotes[]');
   const by={};
   for(const q of j.quotes){const s=catalog.find(x=>x.symbol===q.symbol);if(!s||!Number.isFinite(q.price)||q.price<=0||!q.asOf||!q.currency||q.currency!==s.currency)continue;by[q.symbol]={price:q.price,change:asNumber(q.change),asOf:q.asOf,quality:q.quality||'proveïdor'};}
   if(!Object.keys(by).length)throw Error('Cap cotització vàlida.');
   setLive(by);setSource('API externa · '+date());
  }catch(e){setError('No s’han pogut actualitzar les dades: '+e.message)}finally{setFetching(false)}
 }
 function trade(){
   const q=Number(qty),p=Number(limit);
   if(!Number.isInteger(q)||q<=0||!Number.isFinite(p)||p<=0){setError('Introdueix una quantitat sencera positiva i un preu límit vàlid.');return}
   if(stock.price==null||stock.currency!=='EUR'){setError('La simulació només admet accions amb cotització disponible en EUR. Per a altres divises cal un canvi FX verificat.');return}
   const held=account.holdings[selected]||0;
   if(sideOrder==='buy'&&q*p>account.cash){setError('Saldo de simulació insuficient.');return}
   if(sideOrder==='sell'&&q>held){setError('No tens prou accions simulades per vendre.');return}
   // Paper-trading limit order: does not automatically fill unless historically displayed price meets limit.
   const match=sideOrder==='buy'?stock.price<=p:stock.price>=p;
   if(!match){setError('Ordre no executada: el preu de referència no compleix el límit. No es guarden ordres pendents amb dades històriques.');return}
   const holdings={...account.holdings,[selected]:held+(sideOrder==='buy'?q:-q)};
   const next={...account,cash:account.cash+(sideOrder==='buy'?-1:1)*q*stock.price,holdings,trades:[{id:Date.now(),symbol:selected,name:stock.name,side:sideOrder,qty:q,price:stock.price,currency:'EUR',at:date(),reference:source},...account.trades]};
   persist({...saved,account:next});setError('');setTab('portfolio');
 }
 function resetPaper(){if(!window.confirm('Vols reiniciar tota la cartera de simulació i el registre d’operacions?'))return;persist({...saved,account:{cash:Math.max(0,Number(paperAmount)||5000),holdings:{},trades:[]}})}
 const safePercent=(stock.price!=null&&stock.low!=null&&stock.high!=null&&stock.high>stock.low)?Math.min(100,Math.max(0,100*(stock.price-stock.low)/(stock.high-stock.low))):null;
 const nav=[['terminal','Terminal',LayoutDashboard],['academy','Acadèmia',GraduationCap],['agents','6 agents',Bot],['portfolio','Cartera demo',Wallet],['journal','Registre',BookOpen]];
 return <div className="app">
  <aside className="sidebar"><div className="brand"><div className="brandmark"><Activity size={23}/></div><div><strong>TRADING<span>27</span></strong><small>INVESTMENT INTELLIGENCE</small></div></div><div className="sidenav">{nav.map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={19}/>{label}</button>)}</div><div className="sidefoot"><div className="safe"><ShieldCheck size={17}/> PAPER MODE</div><p>Cap ordre real. Sense connexió a comptes bancaris.</p><p className="tiny">v0.1.0 · Evolució modular</p></div></aside>
  <main className="main">
   <header className="top"><div className="crumb">WORKSPACE <span>/</span> {nav.find(n=>n[0]===tab)?.[1].toUpperCase()}</div><div className="topright"><span className="status"><span className="dot"/> {Object.keys(live).length?'API externa':'Dades FT històriques'}</span><span className="clock"><Clock3 size={14}/> {new Date().toLocaleDateString('ca-ES')}</span></div></header>
   <div className="content">
    <div className="headline"><div><div className="eyebrow">ANALITZA · APRÈN · SIMULA</div><h1>{tab==='terminal'?'Terminal de mercats':tab==='academy'?'Acadèmia borsària':tab==='agents'?'Sis agents de control':tab==='portfolio'?'Cartera de simulació':'Diari de decisions'}</h1><p>{tab==='terminal'?'Entén les cotitzacions, explora empreses i posa a prova hipòtesis.':tab==='academy'?'Cada columna de la taula, explicada sense tecnicismes innecessaris.':tab==='agents'?'Arquitectura inspirada en el flux de les captures. Regles transparents, no promeses de rendiment.':tab==='portfolio'?'Simulador separat dels diners reals: aprèn a gestionar posicions i riscos.':'Traçabilitat de les operacions simulades i les notes d’anàlisi.'}</p></div><div className="headline-actions"><span className="pill"><LockKeyhole size={14}/> DEMO / NO LIVE ORDERS</span></div></div>
    {error&&<div className="alert"><CircleAlert size={18}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Tanca"><X size={16}/></button></div>}
    {tab==='terminal'&&<>
     <div className="metrics"><div className="metric"><span>UNIVERS D’ACCIONS</span><strong>{catalog.length}</strong><small>Europa · EUA · Àsia</small></div><div className="metric"><span>LLISTA DE SEGUIMENT</span><strong>{watch.length}</strong><small>Valors seleccionats</small></div><div className="metric"><span>DADES DISPONIBLES</span><strong>{catalog.filter(s=>s.price!=null).length}</strong><small>{Object.keys(live).length?'Inclou API externa':'FT · 1 nov. 2026'}</small></div><div className="metric"><span>MODE D’OPERACIÓ</span><strong className="green">DEMO</strong><small>Sense broker connectat</small></div></div>
     <div className="gridmain"><section className="panel tablepanel"><div className="panelhead"><div><h2>Mercats globals</h2><p>Valors de la selecció · dades històriques identificades</p></div><button className="outline" onClick={refresh} disabled={fetching}><RefreshCw size={15} className={fetching?'spin':''}/>{fetching?'Consultant…':'Actualitzar API'}</button></div><div className="toolbar"><div className="search"><Search size={17}/><input aria-label="Cerca accions" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Empresa, ticker o sector"/></div><div className="selectwrap"><Filter size={15}/><select aria-label="Filtra per país" value={country} onChange={e=>setCountry(e.target.value)}>{countries.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={14}/></div></div>
      <div className="tablewrap"><table><thead><tr><th>Empresa / Ticker</th><th>Price</th><th>+/Chg</th><th>52W High</th><th>52W Low</th><th>Yld %</th><th>P/E</th><th>MV(b)</th></tr></thead><tbody>{filtered.map(s=><tr key={s.symbol} onClick={()=>{setSelected(s.symbol);setSide('analysis')}} className={selected===s.symbol?'selected':''}><td><div className="name">{s.name}</div><small>{s.symbol} · {s.market}</small></td><td className="mono">{num(s.price)}</td><td className={'mono '+(s.change==null?'':s.change>=0?'positive':'negative')}>{s.change==null?'—':(s.change>0?'+':'')+num(s.change)}</td><td className="mono">{num(s.high)}</td><td className="mono">{num(s.low)}</td><td className="mono">{num(s.yield)}</td><td className="mono">{num(s.pe)}</td><td className="mono">{num(s.mv)}</td></tr>)}</tbody></table></div><div className="tablefoot"><span>{filtered.length} empreses</span><span><Radio size={13}/> Les dades del FT NO són en directe</span></div></section>
      <section className="panel detail"><div className="panelhead"><div><h2>Fitxa del valor</h2><p>{stock.symbol} · {stock.market} · {stock.currency}</p></div><button className="iconbtn" onClick={()=>persist({...saved,watch:watch.includes(selected)?watch.filter(s=>s!==selected):[...watch,selected]})} title="Afegir o treure de seguiment">{watch.includes(selected)?'★':'☆'}</button></div><h3>{stock.name}</h3><div className="price">{money(stock.price,stock.currency)}</div><div className="source">{stock.asOf?'Proveïdor · '+stock.asOf:'FT · referència històrica 01/11/2026'}</div>
       <div className="tabs"><button className={side==='analysis'?'on':''} onClick={()=>setSide('analysis')}>Anàlisi</button><button className={side==='paper'?'on':''} onClick={()=>setSide('paper')}>Simular</button><button className={side==='notes'?'on':''} onClick={()=>setSide('notes')}>Notes</button></div>
       {side==='analysis'&&<><div className="kv"><span>Dividend yield</span><b>{num(stock.yield)}%</b></div><div className="kv"><span>PER</span><b>{num(stock.pe)}</b></div><div className="kv"><span>Capitalització (b)</span><b>{num(stock.mv)}</b></div><div className="range"><div className="rangehead"><span>Mínim anual</span><span>Màxim anual</span></div><div className="track">{safePercent!=null&&<div className="pin" style={{left:safePercent+'%'}}/>}</div><div className="rangehead"><strong>{num(stock.low)}</strong><strong>{num(stock.high)}</strong></div></div><div className="warninglist"><h4><ShieldCheck size={16}/> Comprovador de riscos</h4>{risk(stock).map((w,i)=><p key={i}>• {w}</p>)}</div></>}
       {side==='paper'&&<div className="order"><div className="notice"><LockKeyhole size={15}/> Simulació, mai ordres reals. Preus històrics no executables.</div><div className="seg"><button className={sideOrder==='buy'?'on':''} onClick={()=>setSideOrder('buy')}>Comprar demo</button><button className={sideOrder==='sell'?'on':''} onClick={()=>setSideOrder('sell')}>Vendre demo</button></div><label>Quantitat d’accions<input type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/></label><label>Preu límit ({stock.currency})<input type="number" step=".01" min=".01" value={limit} onChange={e=>setLimit(e.target.value)}/></label><div className="kv"><span>Import límit</span><b>{money(Number(qty)*Number(limit),stock.currency)}</b></div><button className="primary" onClick={trade}>Executar simulació</button></div>}
       {side==='notes'&&<div className="notes"><label>Hipòtesi, catalitzadors i riscos<textarea rows="7" placeholder="Per què compraries aquesta empresa? Què et faria canviar d'opinió?" value={selectedNotes} onChange={e=>persist({...saved,notes:{...notes,[selected]:e.target.value}})}/></label><small>Notes desades només en aquest navegador.</small></div>}
      </section></div>
     <div className="disclaimer"><CircleAlert size={17}/> Les xifres del Financial Times són una fotografia històrica. Sense proveïdor de mercat autoritzat no es presenten com a dades en temps real. No són recomanacions personalitzades.</div>
    </>}
    {tab==='academy'&&<div className="lessonGrid">{LESSONS.map((l,i)=><article className="panel lesson" key={l.title}><span>LLIÇÓ {String(i+1).padStart(2,'0')}</span><h2>{l.title}</h2><p>{l.body}</p></article>)}</div>}
    {tab==='agents'&&<><div className="notice big"><Bot size={20}/> Sis mòduls amb regles explicables. Encara no hi ha agents d’IA autònoms ni operacions reals.</div><div className="agents">{[{n:'SCANNER',text:'Explora accions, filtra empreses i detecta canvis. Requereix un proveïdor extern per a flux continu.'},{n:'RUG CHECK',text:'Filtra anomalies i alertes de valoració. Una comprovació bàsica no garanteix absència de frau.'},{n:'SIZER',text:'Calcula la dimensió màxima de les operacions segons el saldo disponible; no autoritza palanquejament.'},{n:'EXECUTOR',text:'Executa només simulacions explícites de l’usuari. Les connexions reals a broker estan inhabilitades.'},{n:'LOGGER',text:'Desa operacions i una referència de la font. Les decisions s’han de poder auditar.'},{n:'EQUITY',text:'Resumeix saldo, posicions i estat de la cartera simulada. No barreja divises sense FX verificat.'}].map((a,i)=><div key={a.n} className="panel agent"><div className="agentnum">0{i+1}</div><h2>{a.n}</h2><p>{a.text}</p><span className="tag">{i===3?'SIMULACIÓ':'REGLA LOCAL'}</span></div>)}</div><div className="panel roadmap"><h2>Full de ruta fins a un terminal professional</h2><ol><li>Font de dades autoritzada amb timestamps, dret de redistribució i WebSockets per a flux continu.</li><li>Backend Vercel amb secrets al servidor, autenticació d’usuaris, base de dades i registres persistents.</li><li>Integració inicial amb broker amb API oficial i entorn paper; permisos de només lectura per defecte.</li><li>Controls previs: límits de capital, risc per ordre, ordres duplicades, hores de mercat, reconciliació i botó d’aturada.</li><li>Proves extensives, observabilitat i revisió legal/regulatòria abans d’habilitar diners reals.</li></ol></div></>}
    {tab==='portfolio'&&<><div className="metrics"><div className="metric"><span>SALDO SIMULAT (EUR)</span><strong>{money(cash)}</strong><small>Saldo no bancari</small></div><div className="metric"><span>POSICIONS EUR</span><strong>{money(val)}</strong><small>Valor orientatiu amb preus de referència</small></div><div className="metric"><span>CAPITAL TOTAL ESTIMAT</span><strong>{money(cash+val)}</strong><small>Sense comissions ni FX</small></div><div className="metric"><span>OPERACIONS DEMO</span><strong>{account.trades.length}</strong><small>Cap operació real</small></div></div><section className="panel"><div className="panelhead"><div><h2>Posicions simulades</h2><p>Les quotes en euros s'avaluen amb preus de referència que poden ser històrics.</p></div><button className="outline" onClick={resetPaper}>Reiniciar demo</button></div><div className="tablewrap"><table><thead><tr><th>Empresa</th><th>Quantitat</th><th>Preu ref.</th><th>Valor orientatiu</th></tr></thead><tbody>{Object.entries(account.holdings).filter(([,q])=>q>0).map(([sym,q])=>{const s=catalog.find(x=>x.symbol===sym);return <tr key={sym}><td>{s?.name||sym}</td><td>{q}</td><td>{money(s?.price,s?.currency)}</td><td>{s?.currency==='EUR'?money(q*s.price):'— (FX pendent)'}</td></tr>})}{!Object.values(account.holdings).some(v=>v>0)&&<tr><td colSpan="4" className="empty">Encara no hi ha posicions. Selecciona una empresa al terminal i obre «Simular».</td></tr>}</tbody></table></div></section><div className="panel setting"><h2>Capital inicial de la pròxima simulació</h2><div className="settingline"><input type="number" min="1" value={paperAmount} onChange={e=>setPaperAmount(e.target.value)}/><span>€ · El canvi només s’aplica quan es reinicia la demo.</span></div></div></>}
    {tab==='journal'&&<section className="panel"><div className="panelhead"><div><h2>Registre d'operacions de prova</h2><p>Traçabilitat de les decisions, sense ordres executades en mercats reals.</p></div></div><div className="tablewrap"><table><thead><tr><th>Data</th><th>Acció</th><th>Empresa</th><th>Quantitat</th><th>Preu demo</th><th>Font</th></tr></thead><tbody>{account.trades.map(t=><tr key={t.id}><td>{t.at}</td><td className={t.side==='buy'?'positive':'negative'}>{t.side==='buy'?'COMPRA':'VENDA'}</td><td>{t.name}</td><td>{t.qty}</td><td>{money(t.price,t.currency)}</td><td>{t.reference}</td></tr>)}{!account.trades.length&&<tr><td colSpan="6" className="empty">Encara no s'ha fet cap operació de simulació.</td></tr>}</tbody></table></div></section>}
    <footer>TRADING27 · Plataforma educativa i de simulació · Cap rendiment garantit · No és assessorament financer</footer>
   </div>
  </main>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
