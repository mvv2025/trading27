# Trading27 — Decision Canvas

**Una interfície d'inversió que prioritza la comprensió abans de l'acció.** Redisseny integral, editorial i poka-yoke de Trading27. El codi de la versió anterior continua consultable a `archive/terminal-v1.jsx.txt`.

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
npm install
npm run dev
npm run build
```

Compatible amb Vercel: framework **Vite**, directori de sortida **dist**, construcció **npm run build**. GitHub inclou una comprovació automàtica del build a `.github/workflows/build.yml`.

## Cotitzacions actuals i dades històriques reals

Trading27 integra ara **Twelve Data** a través de funcions de servidor de Vercel:

- `GET /api/quotes?symbol=NVDA`: cotització del proveïdor, variació, marca temporal i estat de mercat.
- `GET /api/history?symbol=NVDA&range=6M`: tancaments i OHLC diaris reals, ajustats per desdoblaments. Períodes disponibles: `1M`, `3M`, `6M`, `1Y`, `3Y`, `5Y`.
- A **Explorar**, la fitxa d'una empresa mostra un gràfic amb dates i el botó per comprovar el preu de referència. Cap punt del gràfic és simulat quan el proveïdor està configurat.
- Les funcions comproven símbol autoritzat, MIC de la borsa quan el proveïdor el retorna, moneda, rang i validesa del preu. No hi ha cap substitució silenciosa per dades d'una empresa homònima.

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

**Només hi ha simulació.** Les operacions de prova es calculen amb preus de referència i es guarden al navegador, sense comissions ni divises convertides. La simulació no constitueix un backtest realista. Les accions que no cotitzen en EUR o no tenen preu disponible no es poden negociar en mode demo.

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
