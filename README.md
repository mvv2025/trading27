# Trading27 — Decision Canvas

**Una interfície d'inversió que prioritza la comprensió abans de l'acció.** Redisseny integral, editorial i poka-yoke de Trading27. El codi de la versió anterior continua consultable a `archive/terminal-v1.jsx.txt`.

## Catàleg de companyies ampliat

- **329 empreses** incorporades: 16 fitxes de referència originals, 174 empreses de tecnologia/microxips/banca i 139 empreses de salut, farmacèutiques, biotecnologia, equipament mèdic i petroli i gas.
- Filtres sectorials **Tecnologia, Microxips, Intel·ligència artificial, Banca, Salut, Farmacèutica i Petroli i gas**. Els filtres són compatibles amb cerca de text, país i valors desats.
- Els sectors se superposen quan té sentit: empreses farmacèutiques formen part també de l'univers de salut.
- Llista inicial de 30 empreses; la resta es poden carregar de 30 en 30 per minimitzar la saturació.
- Les companyies es registren a `src/universe.js` i les rutes servidor validen el símbol amb `api/_market.js`. La presència al catàleg **no garanteix** cobertura del teu pla de Twelve Data.
- Cap preu fictici: els valors nous apareixen sense cotització fins que el proveïdor confirma moneda, símbol, borsa i marca temporal.
- La portada consulta tres empreses dels EUA (NVDA, AAPL i JPM). L'explorador consulta només l'empresa seleccionada; el client reutilitza cotitzacions durant 90 segons i històrics durant 10 minuts. El servidor autoritza memòria cau CDN durant 90 segons per a cotitzacions verificades i 30 minuts per a històrics, cosa que redueix consum de crèdits compartit entre visites. **Els errors no es desen a la memòria cau.**
- **No és una llista exhaustiva de totes les companyies mundials**. Per a cobertura completa caldrà integrar la descoberta i classificació sistemàtica del catàleg del proveïdor.

### Diagnòstic quan falten cotitzacions

- **Empresa europea sense dades:** la subscripció pot no incloure aquella borsa o el proveïdor pot necessitar una identificació diferent de l'instrument. No s'han de mostrar preus d'una altra borsa o divisa com a substitució.
- **MARKET_NOT_INCLUDED_IN_PLAN:** aquesta borsa no està coberta pel pla actiu.
- **INSTRUMENT_NOT_FOUND:** cal revisar el símbol i el mercat, no pressuposar que falten permisos.
- **RATE_LIMIT_REACHED:** s'han exhaurit els crèdits de consulta disponibles per minut.
- **INVALID_PROVIDER_KEY:** clau no vàlida o desactivada.
- **QUOTE_NOT_VERIFIED/HISTORY_NOT_VERIFIED:** les dades retornades no coincideixen amb els camps esperats.
- Si l'entorn actual és Basic, prova primer **NVDA**, **AAPL**, **JPM** o **LLY**, valors dels EUA que s'han comprovat contra l'API de producció el 6/11/2026.

La clau `TWELVE_DATA_API_KEY` ha de continuar exclusivament al servidor. El pla Basic permet dades d'accions nord-americanes però té límits de 8 crèdits API/minut i 800 al dia; pot no permetre mostrar dades al públic de manera redistribuïda; cal comprovar les **condicions de llicència i visualització** del pla abans d'obrir el servei a tercers.

## Experiència nova

- **Inici**: una portada diferenciada, amb un camí clar d'aprenentatge: entendre → comparar → practicar.
- **Explorar**: cerca i filtres d'empreses, una fitxa de lectura a la dreta, alertes explicades i llista de seguiment.
- **Comparar**: màxim tres empreses i indicadors alineats; advertència quan hi ha divises diferents.
- **Practicar**: full de simulació separat de qualsevol broker real, revisió prèvia obligatòria, saldo fictici i límits validats.
- **Aprendre**: lliçons progressives amb un sol concepte desplegat quan l'usuari ho demana.
- **Historial**: registre cronològic d'operacions de prova i notes personals.
- **Preferències**: capital de simulació, visualització i idioma.

## Identitat visual

- **Dia**: fons `#F8F9FA`, text `#212529`, blau primari `#4361EE`, turquesa `#2EC4B6`, èmfasi porpra `#7209B7`.
- **Nit**: fons `#121212`, text `#E9ECEF`, blau primari `#758BFD`, turquesa `#71DFE7`, èmfasi orquídia `#B5179E`.
- Els colors primaris indiquen controls i accions, els secundaris donen suport i el porpra assenyala l'èmfasi. Els missatges de risc mantenen etiquetes textuals, mai només colors.
- Una jerarquia editorial, sense widgets decoratius ni múltiples mètriques sense context.
- Responsive: navegació adaptada a pantalles tàctils, taules comparatives desplaçables i controls accessibles.

## Idiomes

Català (predeterminat), castellà i anglès, amb preferència guardada a `localStorage`. Les noves pantalles utilitzen el catàleg `COPY` a `src/main.jsx`; les lliçons i els textos financers reutilitzen `src/i18n.js`.

## Com executar el projecte

```bash
npm ci
npm run dev
npm test
npm run build
```

Compatible amb Vercel: framework **Vite**, directori de sortida **dist**, construcció **npm run build**. GitHub executa els tests i el build a `.github/workflows/build.yml` amb `npm ci` (versions fixades a `package-lock.json`). Nota: `npm run dev` només serveix el frontend; per provar les rutes `/api` en local cal `vercel dev`.

## Cotitzacions actuals i dades històriques reals

Trading27 integra ara **Twelve Data** a través de funcions de servidor de Vercel:

- `GET /api/quotes?symbol=NVDA`: cotització del proveïdor, variació, marca temporal i estat de mercat.
- `GET /api/fx?pair=USD/EUR`: tipus de canvi del proveïdor per convertir les operacions simulades en USD a EUR (memòria cau CDN de 5 minuts). Només s'admet `USD/EUR`.
- `GET /api/history?symbol=NVDA&range=6M`: tancaments i OHLC diaris reals, ajustats per desdoblaments. Períodes disponibles: `1M`, `3M`, `6M`, `1Y`, `3Y`, `5Y` (paràmetre obligatori, en majúscules).
- A **Explorar**, la fitxa d'una empresa mostra un gràfic amb dates i el botó per comprovar el preu de referència. Cap punt del gràfic és simulat quan el proveïdor està configurat.
- Les funcions comproven símbol autoritzat, MIC de la borsa quan el proveïdor el retorna, moneda, rang i validesa del preu. No hi ha cap substitució silenciosa per dades d'una empresa homònima.

### Preus de Google Finance (full de càlcul)

- `GET /api/sheet`: llegeix el full de càlcul públic del projecte (preus de `GOOGLEFINANCE`), en valida cada fila i el desa **10 minuts** al CDN. L'aplicació el torna a llegir cada 10 minuts mentre està oberta, de manera que els canvis del full arriben sols.
- **Ordre de preferència dels preus:** Twelve Data (verificat) → Google Finance (full, amb retard de fins a 20 minuts) → Financial Times (01/11/2026, històric). Cada preu porta l'etiqueta del seu origen.
- **Els preus del full no serveixen per operar al simulador**: no tenen una hora fiable en UTC ni la verificació de borsa de Twelve Data.
- **Validació:** només s'accepten símbols del catàleg (`src/universe.js`); afegir una empresa al full no l'afegeix a l'aplicació. La moneda de Google ha de coincidir amb la de l'empresa; les accions de Londres arriben en penics (GBX) i es divideixen per 100 (la seva capitalització es descarta perquè no és coherent). Les files sense preu (errors de `GOOGLEFINANCE`), amb fórmules o amb valors no numèrics es descarten.
- **Requisits del full:** ha d'estar compartit com a *Qualsevol persona que tingui l'enllaç → Lector*; ha de mantenir els noms de les columnes i la configuració regional catalana/espanyola (`1.295,95`, `(0,01) %`, `7,7x`). Si deixa de ser públic o canvien les columnes, la ruta retorna `SHEET_NOT_PUBLIC` o `SHEET_FORMAT_CHANGED` i l'aplicació continua amb els altres preus.
- Un altre full es pot configurar amb `MARKET_SHEET_ID`.
- El propietari del projecte ha confirmat que es poden mostrar públicament els preus de Google Finance.

### Protecció dels crèdits de l'API

Les rutes són públiques, de manera que tenen tres capes de protecció:

1. **Consulta canònica.** El CDN de Vercel desa les respostes segons la URL sencera. Per evitar que variants com `?symbol=NVDA&x=1`, `?symbol=nvda` o `?symbols=NVDA` esquivin la memòria cau, només s'accepten `symbol` (exacte, en majúscules) i, a l'històric, `range`. Qualsevol altra forma retorna `400 NON_CANONICAL_QUERY` sense consultar el proveïdor.
2. **Límit per IP:** 30 peticions/minut per defecte (`RATE_LIMIT_PER_IP_PER_MINUTE`). Si se supera, `429 TOO_MANY_REQUESTS` amb capçalera `Retry-After`. Les respostes servides pel CDN no compten.
3. **Pressupost global de crèdits:** 8 per minut i 800 per dia UTC per defecte, com el pla Basic (`MARKET_DATA_CREDITS_PER_MINUTE`, `MARKET_DATA_CREDITS_PER_DAY`). Si s'esgota, `503 PROVIDER_BUDGET_EXHAUSTED` amb `Retry-After`, sense gastar crèdits.

Els comptadors es guarden a **Upstash Redis** si hi ha `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL`/`KV_REST_API_TOKEN`, creades per la integració d'Upstash del Marketplace de Vercel). **Sense Redis, el comptador és en memòria de cada instància serverless i la protecció és només parcial**: per a producció cal configurar Redis. Les IP es desen com a hash, mai en clar. Si Redis falla, es fa servir el comptador local.

### Activar la font real a Vercel

1. Registra't a [Twelve Data](https://twelvedata.com/) i tria un pla que inclogui les borses, les freqüències i **els drets de visualització de dades** que necessita Trading27.
2. A **Vercel → trading27 → Settings → Environment Variables**, crea `TWELVE_DATA_API_KEY`, amb el valor de la clau privada. No l'enganxis en una conversa ni la posis a GitHub.
3. Selecciona l'entorn **Production** (i Preview si es necessita). Desa-la i **redeplega** la branca `main` per aplicar-la.
4. Obre [trading27.com](https://trading27.com), entra a **Explorar** i comprova el gràfic històric i la marca de temps.
5. Si apareix `PROVIDER_NOT_CONFIGURED` o un error del proveïdor, comprova el secret, els permisos del pla i la correspondència del símbol i la borsa.

**Estat actual:** el codi de les dues integracions està publicat, però encara no hi ha cap variable `TWELVE_DATA_API_KEY` configurada al projecte Vercel. Per tant, **la connexió no pot obtenir cotitzacions externes fins que es completi el pas 2**. L'aplicació continua mostrant clarament que els valors inicials del FT són històrics, i no inventa preus.

**Atenció:** la disponibilitat de cotitzacions realment en temps real, les dades intradia, la profunditat històrica, les borses accessibles i els drets de redistribució depenen del pla contractat. Les dades REST s'actualitzen quan es consulten i **no constitueixen streaming tick a tick**. Un futur servei de subscripció WebSocket autoritzada és necessari per a actualització contínua sense consultes manuals. No s'ha implementat ni habilitat aquest servei.

### Exemple de resposta de l'API

```json
{
  "source": "Twelve Data",
  "quotes": [
    {
      "symbol": "NVDA",
      "currency": "USD",
      "price": 0,
      "asOf": "2026-11-06T00:00:00.000Z"
    }
  ]
}
```

L'exemple anterior només documenta l'estructura de camps (no representa un preu real i no superarà la validació de valors positius). La resposta real s'obté exclusivament del proveïdor.

La variable `TWELVE_DATA_API_KEY` és *server-side*; **mai** s'ha de crear una variable `VITE_TWELVE_DATA_API_KEY` ni exposar el token en JavaScript de client. Els endpoints públics s'han de protegir amb autenticació, quotes i autorització de visualització abans de tenir múltiples usuaris o trànsit considerable.

## Inversions i integració amb brokers

**Només hi ha simulació.** Les operacions de prova es guarden al navegador, sense comissions, i no constitueixen un backtest realista. Regles del simulador (`src/paperTrading.js`):

- Només s'opera amb un **preu confirmat pel proveïdor** i rebut fa menys de 15 minuts. Els preus històrics del Financial Times (01/11/2026) es mostren com a referència però no serveixen per operar.
- Monedes admeses: **EUR i USD**. El saldo és en EUR; les operacions en USD es converteixen amb el tipus de canvi del proveïdor (`/api/fx`), rebut fa menys de 15 minuts. Cada operació registra el tipus de canvi i l'import en EUR.
- Les accions en GBP (Borsa de Londres) encara no s'admeten: el proveïdor pot donar-ne el preu en penics (GBp) i caldria tractar-ho a part.
- Les ordres són limitades: el preu del proveïdor ha de complir el límit, i el cost màxim d'una compra es calcula amb el límit.

La integració futura amb Interactive Brokers o altres intermediaris requerirà APIs oficials, autenticació segura, permisos de només lectura inicials, controls d'ordres i comprovació del compliment normatiu. No s'ha habilitat cap accés ni cap execució real.

## Principis poka-yoke

1. Una pantalla, una intenció principal.
2. Dades explicades quan es necessiten, amb possibilitat d'aprofundir.
3. Cada xifra porta informació sobre la seva font i disponibilitat.
4. La comparació està limitada per no saturar la interfície.
5. Les proves de compra o venda exigeixen revisió explícita i no es confonen amb operacions reals.
6. Errors de quantitat, saldo o preu límit tenen missatges recuperables.
7. Canviar la visualització o l'idioma no modifica saldos, ordres ni notes.

## Full de ruta

Dades realment en directe i autoritzades → persistència multiusuari → motor d'anàlisi documentat → connexions de només lectura amb brokers → simulació oficial de broker → verificació de seguretat i, eventualment, operativa real autoritzada.

La carpeta `archive/` conserva el terminal original com a referència. L'estil actiu és `src/decision.css`; `src/styles.css` es conserva com a estil antic, sense importar-lo a la nova interfície.

**Avís:** plataforma educativa, no assessorament financer. Cap rendibilitat garantida.
