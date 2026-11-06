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

- **Dia**: marfil, paper, verd petroli, terracota i or apagat.
- **Nit**: tinta blavosa, pissarra profunda, jade i corall fumat.
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

## Dades de mercat

**Les cotitzacions inicials són històriques, extretes de les taules del Financial Times de l'1 de novembre de 2026.** No són preus negociables ni es presenten com a temps real.

Per a dades externes, es pot definir `VITE_QUOTES_ENDPOINT` amb un endpoint HTTPS que retorni:

```json
{
  "quotes": [
    {
      "symbol": "BNP",
      "currency": "EUR",
      "price": 88.12,
      "change": 0.21,
      "asOf": "2026-11-06T09:15:00+01:00"
    }
  ]
}
```

**No introduïu claus secretes en variables `VITE_`** perquè són accessibles des del navegador. Per a cotitzacions en streaming i accés protegit, caldrà un servidor de dades autoritzat, subscripcions i gestió de connexions. La consulta actual és manual, no contínua.

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
