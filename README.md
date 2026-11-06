# Trading27 · Investment Intelligence

Primera versió funcional de **Trading27**, una aplicació web educativa d'anàlisi borsària i simulació (*paper trading*), preparada per connectar-se a Vercel.

## Idiomes i internacionalització (i18n)

- **Català (ca)**, **castellà (es)** i **anglès (en)** disponibles des del selector visible de la capçalera.
- Català per defecte; preferència persistent a `localStorage` (`trading27-language`).
- Catàleg centralitzat a `src/i18n.js`. El codi de mercat (ticker, ISO de moneda, API i identitat d’empreses) és independent de l’idioma.
- Traduccions de menús, ajuda contextual, glossari financer, lliçons, agents, missatges de risc i confirmacions de simulació.
- Imports i números formatats segons les convencions de `ca-ES`, `es-ES` i `en-US` sense convertir la moneda de les accions.
- Les notes de l’usuari no es tradueixen automàticament; es conserven tal com s’han escrit.
- Per afegir traduccions, afegeix una entrada amb el text català i els seus equivalents `es`/`en` a `src/i18n.js`.

## Visualització de dia i de nit

- A la capçalera de l'aplicació hi ha el selector visible **☀ Dia / ☾ Nit**.
- El **mode de nit** conserva el terminal fosc; el **mode de dia** utilitza fons clars i colors de contrast alt.
- La selecció es conserva al navegador mitjançant `localStorage` (`trading27-theme`) i es restaura en reobrir l'aplicació.
- El canvi és immediat, no modifica les dades, ni la cartera ni les operacions.
- En pantalles petites, els botons mostren icones compactes amb etiquetes accessibles.

## Disseny poka-yoke (actualització)

- **Camí inicial de tres passos**: aprendre, escollir empresa, practicar sense diners.
- **Vista senzilla per defecte**: preu i canvi; la resta de columnes s'obren amb «Mostrar totes les dades».
- **Ajuda a cada capçalera**: explica el concepte quan es prem ⓘ.
- **Fonts etiquetades**: els preus antics es marquen com a històrics.
- **Simulació inequívoca**: botó «Confirmar prova fictícia · NO compra real» i confirmació abans del registre.
- **Errors recuperables**: instruccions específiques quan el saldo o el límit no permeten completar la prova.

## Què inclou (v0.1.0)

- Terminal responsive inspirat en les taules del Financial Times: **Price, +/Chg, High/Low 52 setmanes, Yld, P/E, MV(b)**.
- Explicacions didàctiques en català de cada columna.
- Cerca i filtratge per mercat; fitxes d'empresa; avisos de risc explicables.
- Llista de seguiment i notes per empresa desades al navegador.
- Simulació amb saldo inicial de 5.000 €, compres/vendes limitades en mode **DEMO**, cartera i registre.
- Sis mòduls visuals amb responsabilitats diferenciades: **Scanner, Rug Check, Sizer, Executor, Logger i Equity**.
- Preparació per a un proveïdor extern mitjançant `VITE_QUOTES_ENDPOINT`.

**Cap connexió a un broker, cap ordre real ni cap IA autònoma en aquesta versió.** La pantalla no presenta com a temps real les dades que no ho són. La font inicial són dades **històriques del Financial Times de l'1/11/2026** proporcionades per l'usuari; les dades de les empreses dels EUA no s'inventen i es mostren buides si no hi ha font externa.

## Instal·lació local

Necessites Node.js 20 o superior.

```bash
npm install
npm run dev
```

Per compilar:

```bash
npm run build
npm run preview
```

## Publicació a Vercel

1. A Vercel, **Add New → Project** i importa el repositori **mvv2025/trading27**.
2. Framework: **Vite**; build: `npm run build`; directori de sortida: `dist`.
3. Publica. No cal cap clau per a la versió històrica/demo.
4. Configura el domini desitjat al projecte Vercel.

## API de cotitzacions (contracte inicial)

Per connectar dades de mercat, configura la variable `VITE_QUOTES_ENDPOINT` amb una URL HTTPS que retorni JSON segons el format següent:

```json
{
  "quotes": [
    {
      "symbol": "BNP",
      "currency": "EUR",
      "price": 88.12,
      "change": 0.21,
      "asOf": "2026-11-06T09:15:00+01:00",
      "quality": "realtime"
    }
  ]
}
```

La interfície rebutja les cotitzacions sense marca de temps, preu positiu o moneda coincident. **No exposis claus API privades a la variable VITE_**, ja que Vite les incorpora al JavaScript del navegador. Si el proveïdor requereix secret, crea una API de servidor a Vercel, amb secrets gestionats a les variables d'entorn del servidor. Implementa CORS amb una política restrictiva, límits de peticions, tractament d'errors, normalització de símbols i validació robusta del proveïdor.

El botó *Actualitzar API* fa una sol·licitud manual. **Això encara no és streaming en temps real**: per eliminar la cadència de consulta caldrà incorporar WebSockets o SSE mitjançant una infraestructura compatible amb connexions persistents, amb subscripcions autoritzades i gestió de reconnect, heartbeats i qualitat de dades. També s'haurà de contractar un proveïdor que doni accés legal a cotitzacions en temps real a les borses que interessen.

## Brokers: arquitectura futura

Els brokers **no es connecten mitjançant les credencials introduïdes a la web**. Les integracions han d'utilitzar exclusivament APIs oficials i els fluxos d'autorització compatibles amb cada proveïdor.

Ordre recomanat:
1. Consulta de cartera, només lectura.
2. Reconciliació de posicions, saldos i ordres.
3. Entorn *paper* del broker amb ordres aprovades per l'usuari.
4. Comprovacions preoperació: mercat obert, tick size, límits de capital per posició/dia, conversió FX, duplicitats, *kill switch*, permisos i traça d'auditoria.
5. Finalment, i només amb autorització explícita, revisió de seguretat i compliment regulatori, execució real.

**No hi ha cap botó d'execució real habilitat.** Les ordres simulades s'executen contra un preu de referència (que pot ser històric): no representen una prova realista de rendiment ni garanteixen execució efectiva. No hi ha palanquejament ni vendes en curt.

## Privacitat

Les notes, llista de seguiment i operacions demo s'emmagatzemen a `localStorage` de cada navegador; no hi ha sincronització entre dispositius ni còpies al servidor. No hi guardis claus ni dades bancàries sensibles. Abans d'obrir registres multiusuari caldrà autenticació, autorització per registre, base de dades i política de retenció de dades.

## Full de ruta

- **v0.2**: selector de proveïdors, streaming autoritzat, estat de latència i historial verificat.
- **v0.3**: gràfics, indicadors tècnics i fonamentals, screener avançat i backtesting amb dades correctament ajustades.
- **v0.4**: base de dades, comptes d'usuari, alertes i diari amb auditoria.
- **v0.5**: API de broker en només lectura i simulador d'ordres realista.
- **v1.0**: permisos granulars, monitoratge operatiu, gestió de risc professional i, si escau, execució real després de verificacions legals i tècniques.

## Avís

Aplicació educativa, no assessorament financer. La rendibilitat no està garantida. La captura d'una xarxa social que declara passar de 44,82 USD a 11.643,21 USD no prova que aquests guanys siguin reals, reproduïbles o que provinguin d'operacions amb diners reals. Trading27 no ha d'utilitzar aquesta afirmació com a objectiu de rendibilitat.
