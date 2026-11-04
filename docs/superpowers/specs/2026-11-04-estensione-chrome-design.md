# Stage Review — Estensione Chrome (design)

Data: 2026-11-04 · Autrice: Alessandra Mastroeni · Stato: in revisione
Estende: `2026-11-04-stage-review-design.md` (la "spec principale").

## 1. Obiettivo

Aprire Stage Review da un'estensione Chrome invece che da un pulsante nei
preferiti, con tre vantaggi:

1. **Screenshot senza richiesta**, cioè senza il dialogo "Condividi questa scheda".
2. **Sempre attivo** sugli stage scelti: il tool si riapre da solo a ogni caricamento.
3. **Scorciatoia da tastiera** per aprirlo e chiuderlo.

Il pulsante Revisiona resta disponibile e invariato.

**Successo:**
- una designer installa la cartella;
- apre lo stage di Rica e attiva il tool dall'icona;
- fa una segnalazione con screenshot senza alcun dialogo;
- attiva "Sempre attivo";
- ricarica la pagina e il tool è già lì;
- apre la finestra Mobile e anche lì il tool è attivo (lo screenshot lì chiede "Condividi scheda": limite di Chrome, §3).

## 2. Vincoli decisi

| Vincolo | Conseguenza |
|---|---|
| Installazione gratuita | Cartella non pacchettizzata (Modalità sviluppatore), niente Chrome Web Store |
| Aggiornamenti senza reinstallare | L'estensione carica `tool.js` da GitHub Pages, come il bookmarklet; contiene solo il codice "di contorno" |
| Funzioni | Screenshot senza richiesta, Sempre attivo, scorciatoia Alt+Shift+R |
| Solo Chrome desktop | Manifest V3 |

## 3. Architettura

```
extension/  (Manifest V3, caricata come cartella)
├─ manifest.json
├─ background.js     service worker: apri/chiudi, sempre attivo, screenshot
├─ popup.html/.js    menu dell'icona: Apri/Chiudi + "Sempre attivo su <sito>"
├─ bridge.js         content script (mondo isolato): ponte pagina ↔ estensione
└─ icons/            16, 32, 48, 128 px

Pagina dello stage (mondo MAIN)
└─ <script src="https://lamastrossss.github.io/Segnalazioni/tool.js?…">  ← stesso tool di sempre
```

**Iniezione.** `chrome.scripting.executeScript` inietta:
1. `bridge.js` nel mondo isolato;
2. una piccola funzione nel mondo MAIN, che aggiunge alla pagina il `<script>` di `tool.js`.

Modalità di iniezione:

| Modalità | Quando | Comportamento |
|---|---|---|
| `toggle` | Clic su "Apri/Chiudi", scorciatoia | Se il tool è attivo lo chiude, altrimenti lo apre |
| `auto` | Sito "sempre attivo" | Lo apre solo se non è già attivo o in caricamento; non chiude mai |

- La pagina segna `window.__stageReviewLoading = true` finché `tool.js` non si
  avvia. Così né l'estensione né il riavvio delle finestre-viewport (spec
  principale §7) caricano il tool due volte.
- `tool.js` legge da `document.currentScript.src` il parametro `auto=1`: se il
  tool è già attivo non fa niente (oggi `boot` lo chiuderebbe).

**Ponte per gli screenshot.**
- `bridge.js` segna `document.documentElement.dataset.stageReviewExt = "1"`.
- Il tool, se vede il segno, usa il ponte invece di `getDisplayMedia`:
  1. nasconde la propria UI;
  2. attende 2 frame;
  3. invia `window.postMessage({ source: 'stage-review', type: 'capture', id })`;
  4. il ponte inoltra a `background.js`, che chiama
     `chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 90 })`;
  5. la risposta torna con lo stesso `id`;
  6. il tool disegna il pin e comprime come oggi (JPEG, 1600 px).
- Errore o tempo scaduto (3 s): `null`, cioè "screenshot non disponibile", come oggi.
- Il ponte risponde solo a messaggi della stessa finestra con
  `source: 'stage-review'`, con il tool aperto, e al massimo 2 al secondo (limite di Chrome).
  Il service worker fotografa solo per il frame principale di una scheda visibile.
- Se l'estensione viene ricaricata o aggiornata, il ponte rimasto nella pagina toglie il
  segno e il tool ripiega su "Condividi scheda" fino al ricaricamento.

**Permessi.**

| Permesso | Perché |
|---|---|
| `activeTab` | Iniezione e screenshot nella scheda in cui si clicca l'icona o si usa la scorciatoia |
| `scripting` | Iniezione di ponte e loader |
| `optional_host_permissions: ["https://*/*", "http://*/*"]` | Richiesti **un sito alla volta**, solo quando si accende "Sempre attivo" |

**Sempre attivo.**
- L'interruttore nel menu dell'icona chiama `chrome.permissions.request({ origins: ['<origine>/*'] })`.
  Va chiamato da una pagina dell'estensione, quindi dal menu e non dalla barra del tool.
- "Sempre attivo" **coincide con il permesso concesso** per quel sito: nessun elenco a parte.
  Così resta valido anche se il menu si chiude mentre Chrome mostra la richiesta.
  Spegnendo l'interruttore il permesso viene revocato.
- `chrome.tabs.onUpdated` (status `complete`): se c'è il permesso per l'origine della
  scheda, inietta in modalità `auto`. Vale anche per le finestre Mobile/Tablet/Desktop,
  che sono schede a tutti gli effetti.
- **Limite di Chrome:** la cattura senza dialogo (`captureVisibleTab`) è permessa solo
  nella scheda in cui si è cliccata l'icona o usata la scorciatoia. Nelle altre schede e
  nelle finestre-viewport aperte da "sempre attivo" il tool lo verifica all'attivazione
  della modalità Commenta e ripiega sulla richiesta "Condividi scheda".

**Scorciatoia.** `commands.toggle-stage-review`, suggerita `Alt+Shift+R`, fa un
`toggle` nella scheda attiva.

**Stato dell'icona.** Il badge mostra "ON" sulle schede di un sito sempre attivo.

## 4. Menu dell'icona (popup)

- Titolo "Stage Review" e nome del sito (hostname).
- Pulsante principale **Apri Stage Review**, oppure **Chiudi Stage Review** se
  attivo. Lo stato si legge con una funzione iniettata che restituisce
  `!!window.__stageReview`.
- Interruttore **Sempre attivo su questo sito**.
- Su pagine non `http(s)` (`chrome://`, Web Store, PDF) il menu mostra "Stage
  Review non può aprirsi su questa pagina" e nient'altro.
- Link **Apri la board**.

## 5. Distribuzione

- `npm run build` produce anche `dist/stage-review-estensione.zip`, contenente la
  cartella `stage-review-estensione/` pronta da caricare.
- La pagina di installazione aggiunge in cima la sezione **Estensione Chrome
  (consigliata)**: pulsante di download più quattro passi (estrai → `chrome://extensions`
  → Modalità sviluppatore → Carica estensione non pacchettizzata) e una nota sulla
  scorciatoia. Il pulsante Revisiona resta sotto, come "Alternativa senza estensione".
- Versione dell'estensione nel manifest (`1.0.0`). Il menu mostra un avviso se la
  pagina di installazione pubblica una versione più nuova (file `extension-version.json`
  su Pages).

## 6. Errori

| Caso | Comportamento |
|---|---|
| Pagina non scriptabile (`chrome://`, Web Store) | Menu con avviso; scorciatoia: nessuna azione |
| `tool.js` non caricabile (rete, CSP) | `alert` come il bookmarklet (il badge "!" è stato scartato: il loader non conosce l'esito del caricamento) |
| Permesso "sempre attivo" negato | L'interruttore torna spento, nessun salvataggio |
| Screenshot via ponte fallito o > 3 s | `null`, avviso "screenshot non disponibile" già esistente |
| Estensione obsoleta | Avviso nel menu con link alla pagina di installazione |

## 7. Test

**Automatici (Vitest, Chrome simulato):**
- `background`: toggle; `auto` che non chiude un tool già attivo; iniezione su
  `onUpdated` solo per origini in elenco e con permesso; rifiuto delle pagine non
  http(s); `captureVisibleTab` instradato e limitato a 2/s.
- `bridge`: risponde solo a `source: 'stage-review'` dalla stessa finestra; inoltra e rimanda l'`id`.
- `tool`: `auto=1` non chiude un'istanza attiva; `__stageReviewLoading` evita
  doppi caricamenti; il capturer usa il ponte se c'è il segno, altrimenti `getDisplayMedia`.
- `popup`: testo e stato del pulsante; interruttore che chiede il permesso e salva l'origine.

**Prova reale (utente):** caricare la cartella e ripetere i casi del §1.

## 8. Fuori da questa versione

Pubblicazione sul Chrome Web Store, Firefox/Safari, impostazioni avanzate
(scelta della scorciatoia dal menu), notifiche.
