# Estensione Chrome — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estensione Chrome (MV3, cartella non pacchettizzata) che apre/chiude Stage Review, lo riattiva da sola sui siti "sempre attivi", fa gli screenshot senza dialogo e ha la scorciatoia Alt+Shift+R.

**Architecture:** L'estensione inietta nella scheda un ponte (`bridge.js`, mondo isolato) e un loader nel mondo MAIN che aggiunge `<script src=…/tool.js>` da GitHub Pages, come il bookmarklet. Il tool riconosce il ponte e gli chiede gli screenshot, che il service worker fa con `captureVisibleTab`. La logica dell'estensione sta in moduli puri (`extension/lib/*.js`) testati con un `chrome` simulato.

**Tech Stack:** Chrome Manifest V3 (service worker ES module), JavaScript semplice per l'estensione, TypeScript per il tool esistente, Vitest + jsdom, `zip` da riga di comando per il pacchetto.

**Spec:** `docs/superpowers/specs/2026-11-04-estensione-chrome-design.md` (estende `2026-11-04-stage-review-design.md`).

## Global Constraints

- Nome: **Stage Review**. Versione manifest `1.0.0`. Testi in italiano.
- URL base del tool: `https://lamastrossss.github.io/Segnalazioni/` (`extension/config.js`, `TOOL_BASE`).
- Permessi: `activeTab`, `scripting`, `storage`; `optional_host_permissions: ["https://*/*", "http://*/*"]`. Nessun `host_permissions` fisso.
- Scorciatoia: comando `toggle-stage-review`, `suggested_key` `Alt+Shift+R` (mac: `Alt+Shift+R`).
- Modalità di iniezione: `toggle` (apre/chiude) e `auto` (apre solo se non attivo né in caricamento, non chiude mai).
- Flag di pagina: `window.__stageReview` (istanza), `window.__stageReviewLoading` (caricamento in corso). Parametro `auto=1` nell'URL di `tool.js` per l'avvio automatico.
- Ponte: segno `document.documentElement.dataset.stageReviewExt = "1"`; messaggi `{ source: 'stage-review', type: 'capture', id }` → `{ source: 'stage-review-ext', type: 'capture-result', id, dataUrl }`; timeout lato tool 3000 ms; risposte solo se esiste `#stage-review-root`.
- `captureVisibleTab` con `{ format: 'jpeg', quality: 90 }`, al massimo una chiamata ogni 500 ms.
- Pagine non scriptabili: tutto ciò che non è `http:`/`https:`, più `https://chromewebstore.google.com/*` e `https://chrome.google.com/webstore/*`.
- Elenco "sempre attivo": `chrome.storage.sync`, chiave `alwaysOn`, array di origini (`https://x.myshopify.com`).
- Pacchetto: `dist/stage-review-estensione.zip` con dentro la cartella `stage-review-estensione/`; `dist/extension-version.json` = `{ "version": "1.0.0" }`.

## Review Focus

1. **Doppio avvio** (finestra-viewport + "sempre attivo" che iniettano insieme): il tool deve restare aperto una sola volta e non chiudersi. Test nei Task 1 e 3.
2. **Pagine non scriptabili** (`chrome://extensions`, Web Store, `file://`): niente eccezioni non gestite nel service worker; menu con avviso. Test nei Task 3 e 4.
3. **Messaggi falsi dalla pagina** (script del sito che inviano `capture` a raffica): limite di frequenza e risposta solo con il tool aperto. Test nei Task 3 e 2.
4. **Screenshot che non arriva** (permesso activeTab scaduto dopo una ricarica senza "sempre attivo"): il tool non resta appeso; dopo 3 s mostra "screenshot non disponibile". Test nel Task 2.
5. **Permesso negato** per "sempre attivo": l'interruttore torna spento e niente viene salvato. Test nel Task 4.

## Struttura dei file

```
extension/
  manifest.json  config.js  background.js  bridge.js  popup.html  popup.css  popup.js
  lib/core.js     # isScriptable, originOf, pageLoader, isActiveProbe, createController
  lib/popup.js    # initPopup(doc, chrome, opts)
  icons/icon16.png icon32.png icon48.png icon128.png
scripts/make-icons.py      # genera le icone (PNG senza dipendenze)
scripts/build-extension.mjs
src/tool/main.ts, boot.ts, capture.ts, viewport-window.ts   (modifiche)
src/bookmarklet.ts                                         (modifica)
src/board/install.ts                                       (sezione Estensione)
tests/extension/core.test.ts  bridge.test.ts  popup.test.ts  build.test.ts
```

---

### Task 1: Tool — avvio automatico e niente doppi caricamenti

**Files:**
- Modify: `src/tool/boot.ts`, `src/tool/main.ts`, `src/bookmarklet.ts`, `src/tool/viewport-window.ts`
- Test: `tests/tool/boot.test.ts`, `tests/bookmarklet.test.ts`, `tests/tool/viewport-window.test.ts`

**Interfaces:**
- Produces: `boot(win: Window, deps?: Partial<BootDeps>, opts?: { auto?: boolean }): Promise<ToolInstance | null>`. Con `opts.auto` e un'istanza già attiva restituisce `null` **senza** chiuderla. All'inizio di ogni avvio imposta `win.__stageReviewLoading = false`.
- `main.ts`: `auto = new URL((document.currentScript as HTMLScriptElement)?.src ?? location.href).searchParams.get('auto') === '1'`.
- Bookmarklet: se `w.__stageReviewLoading` è vero non fa niente; altrimenti lo imposta a `true` prima di aggiungere lo script e lo rimette a `false` in `onerror`.
- `openViewportWindow`: salta l'iniezione se il popup ha `__stageReview` **oppure** `__stageReviewLoading`; prima di iniettare imposta `popup.__stageReviewLoading = true`.

- [ ] **Step 1: Test che falliscono**
```ts
// boot.test.ts
const i1 = await boot(window, deps());
expect(await boot(window, deps(), { auto: true })).toBeNull();
expect(document.querySelectorAll('#stage-review-root')).toHaveLength(1); // non chiuso (Review Focus 1)
expect((window as any).__stageReviewLoading).toBe(false);
// bookmarklet.test.ts
const w: any = { __stageReviewLoading: true }; runBookmarklet(b, w, doc); expect(doc.querySelectorAll('script')).toHaveLength(0);
// viewport-window.test.ts
popup.__stageReviewLoading = true; vi.advanceTimersByTime(600); expect(scripts()).toHaveLength(0);
```
(`runBookmarklet` esegue il codice del bookmarklet con `new Function('window','document', body)`.)

- [ ] **Step 2:** `npx vitest run tests/tool/boot.test.ts tests/bookmarklet.test.ts tests/tool/viewport-window.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** Stessi test, poi `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tool): avvio automatico senza chiusure e guardia sui doppi caricamenti`.

---

### Task 2: Tool — screenshot tramite il ponte dell'estensione

**Files:**
- Modify: `src/tool/capture.ts`
- Test: `tests/tool/capture.test.ts`

**Interfaces:**
- Produces: `hasExtensionBridge(doc: Document): boolean` (`dataset.stageReviewExt === '1'`); `requestBridgeCapture(win: Window, timeoutMs = 3000): Promise<string | null>` (postMessage con `id = crypto.randomUUID()`, attende la risposta con lo stesso `id` e `source: 'stage-review-ext'`, `null` a timeout).
- `createCapturer(win)`: `start()` restituisce `true` subito se c'è il ponte, senza `getDisplayMedia`. `grab()` con il ponte: nasconde `hide`, 2 frame, `requestBridgeCapture`, ripristina, decodifica il data URL (`fetch(dataUrl).then(r => r.blob())` → `createImageBitmap`), disegna il pin con `frameScale(bitmap.width, innerWidth)`, `encodeCanvas` come oggi. Su qualunque errore restituisce `null`.

- [ ] **Step 1: Test che falliscono**
```ts
document.documentElement.dataset.stageReviewExt = '1';
const gdm = vi.fn(); Object.defineProperty(navigator, 'mediaDevices', { value: { getDisplayMedia: gdm }, configurable: true });
expect(await createCapturer(window).start()).toBe(true); expect(gdm).not.toHaveBeenCalled();
// risposta del ponte con lo stesso id
window.addEventListener('message', e => { if (e.data?.type === 'capture') window.postMessage({ source: 'stage-review-ext', type: 'capture-result', id: e.data.id, dataUrl: 'data:x' }, '*'); });
expect(await requestBridgeCapture(window)).toBe('data:x');
// nessuna risposta → null entro il timeout (Review Focus 4)
vi.useFakeTimers(); const p = requestBridgeCapture(window, 3000); vi.advanceTimersByTime(3001); expect(await p).toBeNull();
// risposta con id diverso o source diversa ignorata
```
- [ ] **Step 2:** `npx vitest run tests/tool/capture.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** Test, poi `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tool): screenshot tramite l'estensione quando presente`.

---

### Task 3: Estensione — manifest, service worker, ponte, icone

**Files:**
- Create: `extension/manifest.json`, `extension/config.js`, `extension/lib/core.js`, `extension/background.js`, `extension/bridge.js`, `scripts/make-icons.py`, `extension/icons/*.png`
- Test: `tests/extension/core.test.ts`, `tests/extension/bridge.test.ts`

**Interfaces:**
- `config.js`: `export const TOOL_BASE = 'https://lamastrossss.github.io/Segnalazioni/'; export const BOARD_URL = TOOL_BASE;`
- `lib/core.js` (ES module, nessuna dipendenza):
```js
export function isScriptable(url)            // boolean
export function originOf(url)                // 'https://host'
export function pageLoader(toolUrl, mode)    // eseguita nel mondo MAIN; ritorna 'opened' | 'closed' | 'active' | 'loading'
export function isActiveProbe()              // eseguita nel mondo MAIN; !!window.__stageReview
export function createController(chrome, { toolUrl, now = () => Date.now() }) → {
  inject(tabId, mode): Promise<string>,       // bridge.js poi pageLoader nel mondo MAIN
  toggle(tab): Promise<string>,               // 'unsupported' se non scriptabile
  isActive(tab): Promise<boolean>,
  getAlwaysOn(): Promise<string[]>, setAlwaysOn(origin, on): Promise<void>,  // on=false revoca anche il permesso
  onTabUpdated(tabId, info, tab): Promise<void>,  // solo status 'complete', origine in elenco, permesso presente → inject 'auto' + badge 'ON'
  capture(sender): Promise<string | null>,    // captureVisibleTab(sender.tab.windowId, {format:'jpeg',quality:90}); se meno di 500 ms dall'ultima → null
}
```
  `pageLoader`:
  - se `window.__stageReview` c'è: con `toggle` chiama `destroy()` e restituisce `'closed'`, altrimenti `'active'`;
  - se c'è `__stageReviewLoading` restituisce `'loading'`;
  - altrimenti imposta `__stageReviewLoading`, aggiunge lo script `toolUrl?v=…` (più `&auto=1` in modalità `auto`) con `onerror` che azzera il flag e mostra `alert('Stage Review: questo sito blocca il tool.')`, e restituisce `'opened'`.
- `background.js`: collega `chrome.commands.onCommand` (`toggle-stage-review` → `toggle(activeTab)`), `chrome.tabs.onUpdated` → `onTabUpdated`, `chrome.runtime.onMessage` (`{type:'capture'}` → `sendResponse({ dataUrl })`, ritorna `true`). Ogni handler è avvolto in try/catch (Review Focus 2).
- `bridge.js` (script classico, mondo isolato):
  - una volta sola per pagina (`globalThis.__srBridge`);
  - imposta il segno su `document.documentElement`;
  - inoltra solo messaggi con `e.source === window`, `source === 'stage-review'`, `type === 'capture'`, e solo se esiste `#stage-review-root`;
  - risponde con `postMessage(…, location.origin)`.
- Icone: quadrato nero arrotondato con un pin bianco (cerchio con puntale), 16/32/48/128 px, generate da `scripts/make-icons.py` (PNG scritto a mano con `zlib`, senza librerie esterne).

- [ ] **Step 1: Test che falliscono** (`chrome` simulato in `tests/helpers/fake-chrome.ts`: `scripting.executeScript` registra le chiamate e restituisce `[{ result }]`; `storage.sync`, `permissions.contains/remove`, `tabs.captureVisibleTab`, `action.setBadgeText`)
```ts
expect(isScriptable('chrome://extensions')).toBe(false);
expect(isScriptable('https://chromewebstore.google.com/detail/x')).toBe(false);
expect(isScriptable('https://rica.myshopify.com/p')).toBe(true);
// toggle: prima bridge.js (isolato), poi pageLoader nel MAIN con mode 'toggle'
await c.toggle({ id: 1, url: 'https://rica.myshopify.com/' });
expect(chrome.calls.map(x => [x.files?.[0] ?? x.func.name, x.world ?? 'ISOLATED', x.args?.[1]])).toEqual([['bridge.js','ISOLATED',undefined],['pageLoader','MAIN','toggle']]);
expect(await c.toggle({ id: 1, url: 'chrome://extensions' })).toBe('unsupported');
// onTabUpdated: solo complete + elenco + permesso
await c.setAlwaysOn('https://rica.myshopify.com', true); chrome.grant('https://rica.myshopify.com/*');
await c.onTabUpdated(1, { status: 'loading' }, tab); expect(injections()).toBe(0);
await c.onTabUpdated(1, { status: 'complete' }, tab); expect(lastMode()).toBe('auto');
await c.onTabUpdated(2, { status: 'complete' }, { id: 2, url: 'https://altro.com/' }); expect(injections()).toBe(1);
// capture limitata (Review Focus 3)
expect(await c.capture({ tab: { windowId: 9 } })).toBe('data:img'); expect(await c.capture({ tab: { windowId: 9 } })).toBeNull();
// pageLoader in jsdom
window.__stageReview = { destroy: vi.fn() }; expect(pageLoader('u', 'auto')).toBe('active'); expect(pageLoader('u', 'toggle')).toBe('closed');
// bridge.js (eseguito in jsdom con chrome.runtime.sendMessage finto)
// senza #stage-review-root → nessun sendMessage; con messaggio da altra source → ignorato; risposta con lo stesso id
```
- [ ] **Step 2:** `npx vitest run tests/extension`. Expected: FAIL.
- [ ] **Step 3:** Implementare; `python3 scripts/make-icons.py` per generare le icone.
- [ ] **Step 4:** Test (`npx vitest run tests/extension`), poi `npm test`. Expected: PASS. Controllo: `python3 -c "import json;json.load(open('extension/manifest.json'))"`.
- [ ] **Step 5:** Commit `feat(estensione): service worker, ponte per gli screenshot e icone`.

---

### Task 4: Estensione — menu dell'icona

**Files:**
- Create: `extension/popup.html`, `extension/popup.css`, `extension/popup.js`, `extension/lib/popup.js`
- Test: `tests/extension/popup.test.ts`

**Interfaces:**
- `initPopup(doc, chrome, { toolBase, version, fetchVersion = url => fetch(url).then(r => r.json()) }): Promise<void>`.
  - Legge la scheda attiva (`chrome.tabs.query({ active: true, currentWindow: true })`).
  - Pagina non scriptabile: mostra solo "Stage Review non può aprirsi su questa pagina." e il link alla board (Review Focus 2).
  - Altrimenti mostra:
    - nome host;
    - pulsante `#sr-toggle` con "Apri Stage Review" o "Chiudi Stage Review" (da `isActive`); al clic fa `toggle` e chiude il popup (`window.close`);
    - interruttore `#sr-always` "Sempre attivo su questo sito": accenderlo chiama `chrome.permissions.request({ origins: [origin + '/*'] })`; se concesso, `setAlwaysOn(origin, true)` e `inject(tab.id, 'auto')`; se negato torna spento senza salvare (Review Focus 5). Spegnerlo chiama `setAlwaysOn(origin, false)`;
    - link "Apri la board" (`toolBase`);
    - avviso "È disponibile una nuova versione dell'estensione" con link a `install.html`, se `fetchVersion(toolBase + 'extension-version.json').version` è maggiore di `version` (confronto semver numerico). Errori di rete ignorati.
- `popup.js`: `initPopup(document, chrome, { toolBase: TOOL_BASE, version: chrome.runtime.getManifest().version })`.
- Grafica: 280 px di larghezza, stile della board (nero/bianco, pulsante principale nero pieno).

- [ ] **Step 1: Test che falliscono**
```ts
await initPopup(document, chromeOn('chrome://newtab'), opts); expect(text()).toContain('non può aprirsi su questa pagina'); expect(q('#sr-toggle')).toBeNull();
await initPopup(document, chromeOn('https://rica.myshopify.com/p', { active: true }), opts); expect(q('#sr-toggle').textContent).toBe('Chiudi Stage Review');
chrome.permissions.request = async () => false; click(q('#sr-always')); await flush();
expect(q('#sr-always').checked).toBe(false); expect(await chrome.storage.sync.get('alwaysOn')).toEqual({});
chrome.permissions.request = async () => true; click(q('#sr-always')); await flush(); expect(stored()).toEqual(['https://rica.myshopify.com']); expect(lastMode()).toBe('auto');
await initPopup(document, chromeOn(url), { ...opts, version: '1.0.0', fetchVersion: async () => ({ version: '1.1.0' }) }); expect(text()).toContain('nuova versione');
```
- [ ] **Step 2:** `npx vitest run tests/extension/popup.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** Test, poi `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(estensione): menu dell'icona con apri/chiudi e sempre attivo`.

---

### Task 5: Pacchetto e pagina di installazione

**Files:**
- Create: `scripts/build-extension.mjs`
- Modify: `package.json` (`build` aggiunge `&& node scripts/build-extension.mjs`), `src/board/install.ts`
- Test: `tests/extension/build.test.ts`

**Interfaces:**
- `build-extension.mjs`:
  - copia `extension/` in `dist/stage-review-estensione/`;
  - verifica che `manifest.json` sia valido e che i file citati esistano;
  - crea lo zip con `zip -r -X` dalla cartella `dist`;
  - scrive `dist/extension-version.json`.
- `install.ts`: in cima la sezione "Estensione Chrome (consigliata)" con:
  - pulsante di download `./stage-review-estensione.zip`;
  - quattro passi: estrai lo zip → apri `chrome://extensions` → attiva **Modalità sviluppatore** → **Carica estensione non pacchettizzata** e scegli la cartella `stage-review-estensione`;
  - nota sull'icona da fissare (puntina) e sulla scorciatoia Alt+Shift+R.

  Sotto, la sezione attuale intitolata "Alternativa senza estensione: pulsante nei preferiti".

- [ ] **Step 1: Test che falliscono**
```ts
execFileSync('node', ['scripts/build-extension.mjs']);
expect(existsSync('dist/stage-review-estensione/manifest.json')).toBe(true);
expect(JSON.parse(readFileSync('dist/extension-version.json','utf8'))).toEqual({ version: '1.0.0' });
expect(execFileSync('unzip', ['-l', 'dist/stage-review-estensione.zip']).toString()).toContain('stage-review-estensione/background.js');
```
- [ ] **Step 2:** `npx vitest run tests/extension/build.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementare lo script e la sezione della pagina.
- [ ] **Step 4:** `npm test && npm run build`. Expected: PASS; `dist/` contiene lo zip, `extension-version.json` e `install.html`.
- [ ] **Step 5:** Controllo visivo di `install.html` (anteprima locale di `dist/`), poi commit `feat(estensione): pacchetto zip e istruzioni di installazione`.

---

### Task 6: Revisione finale e pubblicazione

- [ ] **Step 1:** Revisione dell'intero ramo con un revisore indipendente (Review Focus sopra), correzioni con test RED→GREEN.
- [ ] **Step 2:** Push su GitHub **solo dopo l'ok dell'utente**; verifica che `stage-review-estensione.zip` e `extension-version.json` siano raggiungibili su Pages.
- [ ] **Step 3:** Prova reale con l'utente: caricare la cartella e ripetere i casi del §1 della spec.
