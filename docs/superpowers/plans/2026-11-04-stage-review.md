# Stage Review — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool gratuito con cui i designer dello studio annotano gli stage (pin, screenshot, allegati, viewport) in collaborazione live, con board per gli sviluppatori e archivio automatico su Google Docs.

**Architecture:** Il bookmarklet inietta `tool.js` (IIFE, UI in Shadow DOM) nella pagina dello stage. Tool e board sono statici su GitHub Pages e parlano direttamente con Supabase (Auth, Postgres+RLS, Realtime, Storage). Uno script Google Apps Script copia ogni 10 minuti le segnalazioni in un Google Doc per sito.

**Tech Stack:** TypeScript 5, Vite (build multipagina per la board e build libreria IIFE per il tool), `@supabase/supabase-js` v2, Vitest + jsdom, SQL Postgres (Supabase), Google Apps Script (V8), GitHub Actions → GitHub Pages. Node ≥ 20.

**Spec:** `docs/superpowers/specs/2026-11-04-stage-review-design.md`, da leggere insieme a questo piano. I riferimenti `§n` rimandano alle sue sezioni.

## Global Constraints

- Lingua dell'interfaccia: **italiano** (tool, board, Doc).
- Browser supportato: solo Chrome desktop.
- Viewport: `mobile` < 768, `tablet` 768–1279, `desktop` ≥ 1280. Preset finestre: Mobile 375×812, Tablet 768×1024, Desktop 1440×900.
- Screenshot: WebP qualità 0.8, lato lungo massimo 1600 px.
- Allegati: massimo 5 per segnalazione e 5 per risposta. PNG/JPG/WebP ridimensionati a 2000 px sul lato lungo e compressi verso 500 KB in WebP. GIF accettate fino a 2 MB senza ricompressione. Altri tipi rifiutati.
- Ancoraggio: testo di 60 caratteri, profondità massima del selettore 8, throttle mutazioni 100 ms.
- Accesso: solo email che finiscono in `@thewavestudio.it`. Su Supabase va attivato "Confirm email".
- Nessun `DELETE` reale, né su tabelle né su storage: solo eliminazione morbida (`deleted_at`).
- La `service_role` key non va mai nel client né nel repository: esiste solo nelle Proprietà dello script Apps Script.
- Il testo inserito dagli utenti va sempre reso con `textContent`: mai `innerHTML` con dati utente, né nel tool, né nella board, né nel Doc.
- L'UI del tool vive in un Shadow DOM montato su `#stage-review-root`, con `z-index: 2147483647`.
- Archivio: trigger ogni 10 minuti, immagini nel Doc larghe 480 px. Board in rosso se l'ultimo archivio riuscito ha più di 30 minuti o se c'è `last_error`.
- Avviso spazio dall'80% di 1 GB (`1_073_741_824` byte).
- Hash di focus: `#stage-review=<issueId>`.
- Le variabili di build sono `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_PUBLIC_BASE_URL` (URL di GitHub Pages con `/` finale).

## Review Focus

1. **Clic sull'interfaccia del tool in modalità Commenta** (barra, pin, composer): non deve creare segnalazioni. Test nel Task 8.
2. **Navigazione senza ricarica** (temi Shopify che cambiano URL con `history.pushState`, per esempio le varianti prodotto): i pin si devono aggiornare per il nuovo `page_path`. Test nel Task 7.
3. **Elementi `position: fixed/sticky`** (header): durante lo scroll il pin deve restare sull'elemento, non scorrere via. Test nel Task 8.
4. **Testo con markup** (`<img src=x onerror=…>`) in segnalazioni e risposte: deve apparire come testo, ovunque. Test nei Task 1, 9, 11 e 12.
5. **Sessione scaduta mentre si scrive:** la bozza resta e dopo il login si può salvare. Test nel Task 9.

## Prerequisiti manuali (utente)

Prima del Task 2:
- creare il progetto Supabase gratuito (regione EU, Francoforte) e attivare "Confirm email";
- fornire `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Prima del Task 7: indicare l'account GitHub e creare il repository `stage-review` con GitHub Pages da Actions.

Chi esegue il piano non crea account e non inserisce credenziali al posto dell'utente.

## Struttura dei file

```
stage-review/
  package.json  tsconfig.json  vitest.config.ts
  vite.config.ts            # board multipagina (root: board/)
  vite.tool.config.ts       # build IIFE → dist/tool.js
  .env.example  .gitignore
  .github/workflows/pages.yml
  board/index.html  board/site.html  board/install.html
  src/config.ts
  src/shared/types.ts  viewport.ts  page.ts  dom.ts  media.ts
  src/shared/supabase.ts  auth.ts  auth-ui.ts  api.ts  errors.ts  live.ts  usage.ts
  src/tool/main.ts  boot.ts  root.ts  styles.ts  toolbar.ts
  src/tool/location.ts  project-picker.ts
  src/tool/anchor.ts  pin-logic.ts  pins.ts  comment-mode.ts
  src/tool/capture.ts  composer.ts  viewport-window.ts
  src/bookmarklet.ts
  src/board/home.ts  site.ts  detail.ts  install.ts  logic.ts  board.css
  supabase/migrations/001_schema.sql  002_rls.sql  003_storage_realtime.sql
  supabase/tests/rls-check.sql
  archive/format.js  archive/sync.js  archive/appsscript.json  archive/LEGGIMI.md
  tests/**/*.test.ts
  docs/test-manuale.md  LEGGIMI.md
```

---

### Task 1: Scaffold, tipi e utility pure

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts` (environment `jsdom`), `.gitignore` (`node_modules`, `dist`, `.env*` tranne `.env.example`), `.env.example`, `src/config.ts`, `src/shared/types.ts`, `src/shared/viewport.ts`, `src/shared/page.ts`, `src/shared/dom.ts`
- Test: `tests/shared/viewport.test.ts`, `tests/shared/page.test.ts`, `tests/shared/dom.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type ViewportClass = 'mobile' | 'tablet' | 'desktop';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';
export interface Anchor { selector: string; tag: string; text: string;
  offset: { x: number; y: number }; page: { x: number; y: number; docHeight: number } }
export interface Profile { id: string; name: string; color: string }
export interface Project { id: string; name: string; archive_doc_url: string | null; domains: string[] }
export interface Attachment { id: string; issue_id: string; reply_id: string | null; path: string;
  width: number; height: number; bytes: number; created_at: string; deleted_at: string | null }
export interface Reply { id: string; issue_id: string; author_id: string; body: string;
  created_at: string; deleted_at: string | null; attachments: Attachment[] }
export interface Issue { id: string; project_id: string; number: number; page_path: string; page_url: string;
  viewport_class: ViewportClass; viewport_width: number; browser: string; anchor: Anchor; body: string;
  status: IssueStatus; author_id: string; screenshot_path: string | null; screenshot_bytes: number;
  created_at: string; updated_at: string; deleted_at: string | null; deleted_by: string | null;
  plus_ones: string[]; replies_count: number }
export interface IssueDetail extends Issue { replies: Reply[]; attachments: Attachment[] }
export interface ArchiveStatus { last_run_at: string | null; last_ok_at: string | null; last_error: string | null }
```
- Produces: `classifyViewport(width: number): ViewportClass`; `VIEWPORT_PRESETS: { id: ViewportClass; label: 'Mobile'|'Tablet'|'Desktop'; width: number; height: number }[]`; `VIEWPORT_LABEL: Record<ViewportClass, string>`
- Produces: `pagePathOf(url: string): string` (pathname senza query/hash, senza `/` finale tranne la root); `parseFocusHash(hash: string): string | null`; `withFocusHash(pageUrl: string, issueId: string): string`
- Produces: `el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: { class?: string; text?: string; attrs?: Record<string,string>; on?: Partial<Record<string,(e: Event)=>void>> }, children?: (Node|string)[]): HTMLElementTagNameMap[K]`. Imposta il testo solo con `textContent`; le stringhe tra i figli diventano nodi di testo.
- Produces (`config.ts`): `CONFIG = { supabaseUrl, supabaseAnonKey, publicBaseUrl, studioDomain: 'thewavestudio.it', storageLimitBytes: 1_073_741_824 }` letto da `import.meta.env`.

- [ ] **Step 1: Inizializzare il repository**

Run: `git init && npm init -y && npm i @supabase/supabase-js && npm i -D typescript vite vitest jsdom @types/node`
Expected: `package.json` con le dipendenze. Script: `"test": "vitest run"`, `"build": "vite build && vite build -c vite.tool.config.ts"`, `"dev": "vite"`.

- [ ] **Step 2: Scrivere i test che falliscono**

```ts
// viewport.test.ts
expect(classifyViewport(767)).toBe('mobile');
expect(classifyViewport(768)).toBe('tablet');
expect(classifyViewport(1279)).toBe('tablet');
expect(classifyViewport(1280)).toBe('desktop');
expect(VIEWPORT_PRESETS.map(p => [p.width, p.height])).toEqual([[375,812],[768,1024],[1440,900]]);
// page.test.ts
expect(pagePathOf('https://x.myshopify.com/products/a/?preview_theme_id=1#top')).toBe('/products/a');
expect(pagePathOf('https://x.myshopify.com/')).toBe('/');
expect(parseFocusHash('#stage-review=abc-123')).toBe('abc-123');
expect(parseFocusHash('#altro')).toBeNull();
expect(withFocusHash('https://x.com/p?v=1#old', 'id1')).toBe('https://x.com/p?v=1#stage-review=id1');
// dom.test.ts
const n = el('p', { text: '<img src=x onerror=alert(1)>' });
expect(n.querySelector('img')).toBeNull();
expect(n.textContent).toBe('<img src=x onerror=alert(1)>');
```

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL (moduli mancanti).

- [ ] **Step 4: Implementare `types.ts`, `viewport.ts`, `page.ts`, `dom.ts` e `config.ts`**

- [ ] **Step 5: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold progetto, tipi e utility pure"
```

---

### Task 2: Database Supabase (schema, regole, storage, realtime)

**Files:**
- Create: `supabase/migrations/001_schema.sql`, `002_rls.sql`, `003_storage_realtime.sql`
- Test: `supabase/tests/rls-check.sql`

**Interfaces:**
- Produces le tabelle del §4 della spec, con queste aggiunte:
  - `projects.next_issue_number int not null default 1`;
  - `profiles.color` assegnato all'inserimento da una palette di 8 colori, tramite hash dell'id;
  - enum `viewport_class` e `issue_status`.
- Produces le funzioni e i trigger:
  - `public.is_studio() returns boolean`: `coalesce(auth.jwt()->>'email','') ilike '%@thewavestudio.it'`;
  - `handle_new_user` su `auth.users` insert: crea `profiles(id, name = raw_user_meta_data->>'name', color)`;
  - `assign_issue_number` before insert su `issues`: `update projects set next_issue_number = next_issue_number + 1 where id = new.project_id returning next_issue_number - 1 into new.number`;
  - `touch_issue` after insert/update/delete su `replies`, `attachments`, `plus_ones`: `update issues set updated_at = now() where id = <issue_id>`; più un before update su `issues` che imposta `updated_at = now()`;
  - `guard_soft_delete` before update su `issues` e `replies`: se `deleted_at` cambia e `auth.uid()` è diverso dall'autore, `raise exception 'solo l''autore può eliminare'`; se `deleted_at` passa da non null a null, eccezione; su `issues` imposta `deleted_by = auth.uid()`. Su `attachments` vale la stessa regola, con l'autore preso dalla segnalazione o dalla risposta madre.
  - vista `project_usage(project_id, bytes)` con `security_invoker = true`;
  - funzione `total_usage_bytes() returns bigint`.
- Produces RLS (`002`): tutte le tabelle con RLS attivo; policy `select`/`insert`/`update` `to authenticated using/with check (is_studio())`; `insert` su `issues`/`replies` con `author_id = auth.uid()`; `plus_ones` insert/delete solo con `user_id = auth.uid()`. È l'unica eccezione al divieto di `DELETE`: togliere un +1 non è un dato da archiviare. Nessuna policy `delete` sulle altre tabelle. `archive_status` è solo in lettura per lo studio.
- Produces (`003`): bucket privato `media`, policy su `storage.objects` per `bucket_id = 'media'` con `select`/`insert` per `is_studio()`, nessun update o delete; `alter publication supabase_realtime add table public.issues`.

- [ ] **Step 1: Scrivere `rls-check.sql`, che deve fallire senza schema**

Lo script gira in un'unica transazione chiusa da `rollback` e crea due utenti in `auth.users`: `a@thewavestudio.it` e `x@gmail.com`. Per ogni controllo imposta `set local role authenticated` e `set local request.jwt.claims = '{"sub":"<uuid>","email":"<email>"}'`, e usa blocchi `do $$ … $$` che lanciano `raise exception 'FAIL: …'` se un'operazione proibita riesce o se una consentita fallisce. Asserzioni:
- l'utente esterno: `select count(*) from issues` restituisce 0 con una segnalazione presente; `insert into projects` fallisce; `select` da `storage.objects` restituisce 0;
- lo studio A crea un progetto e due segnalazioni, che ricevono `number` 1 e 2;
- lo studio B (`b@thewavestudio.it`) imposta `deleted_at` sulla segnalazione di A e fallisce; cambia lo `status` della segnalazione di A e riesce;
- `delete from issues` non elimina righe per nessun utente (`get diagnostics` restituisce 0);
- dopo l'inserimento di una risposta, `updated_at` della segnalazione cresce;
- l'ultima riga è `select 'RLS OK';`.

- [ ] **Step 2: Verificare che fallisca**

Run (utente o chi esegue, nel SQL Editor di Supabase): incollare `rls-check.sql`.
Expected: errore (tabelle inesistenti).

- [ ] **Step 3: Scrivere `001`, `002` e `003` secondo le Interfaces e applicarli in ordine nel SQL Editor**

- [ ] **Step 4: Rieseguire `rls-check.sql`**

Expected: risultato `RLS OK`, nessuna eccezione, nessun dato rimasto (rollback).

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat(db): schema, RLS, storage e realtime"
```

---

### Task 3: Preparazione immagini

**Files:**
- Create: `src/shared/media.ts`
- Test: `tests/shared/media.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PreparedImage { blob: Blob; width: number; height: number; bytes: number; ext: 'webp'|'gif'; name: string }
export type AttachmentRejection = { name: string; reason: 'tipo' | 'troppo-grande' | 'troppi' };
export function targetSize(w: number, h: number, maxSide: number): { width: number; height: number }
export function validateAttachments(files: File[], already: number): { accepted: File[]; rejected: AttachmentRejection[] }
export async function prepareAttachment(file: File): Promise<PreparedImage>
export async function encodeCanvas(canvas: HTMLCanvasElement | OffscreenCanvas, opts: { maxSide: number; quality: number; targetBytes?: number }): Promise<PreparedImage>
```
- Messaggi italiani di rifiuto, usati dal composer: `tipo` → "Formato non supportato (solo PNG, JPG, WebP, GIF)"; `troppo-grande` → "GIF oltre 2 MB"; `troppi` → "Massimo 5 immagini".

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
expect(targetSize(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
expect(targetSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
const f = (n: string, t: string, s: number) => new File([new Uint8Array(s)], n, { type: t });
const r = validateAttachments([f('a.png','image/png',10), f('b.pdf','application/pdf',10), f('c.gif','image/gif',3_000_000)], 0);
expect(r.accepted.map(x => x.name)).toEqual(['a.png']);
expect(r.rejected).toEqual([{ name: 'b.pdf', reason: 'tipo' }, { name: 'c.gif', reason: 'troppo-grande' }]);
expect(validateAttachments([f('a.png','image/png',1), f('b.png','image/png',1)], 4).rejected).toEqual([{ name: 'b.png', reason: 'troppi' }]);
const gif = f('g.gif','image/gif',1000);
expect((await prepareAttachment(gif)).blob).toBe(gif); // GIF non ricompressa
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/shared/media.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare**

`prepareAttachment` per le immagini non GIF: `createImageBitmap` → canvas a `targetSize(…, 2000)` → `encodeCanvas` con `quality 0.8` e `targetBytes 500_000`. `encodeCanvas` riprova a 0.7, 0.6 e 0.5 finché supera `targetBytes`, poi accetta il risultato. Per le GIF legge le dimensioni da `createImageBitmap`; se fallisce (jsdom), usa 0×0.

- [ ] **Step 4: Eseguire e verificare che passino**

Run: `npx vitest run tests/shared/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/media.ts tests/shared/media.test.ts && git commit -m "feat: preparazione e validazione immagini"
```

---

### Task 4: Ancoraggio dei pin

**Files:**
- Create: `src/tool/anchor.ts`
- Test: `tests/tool/anchor.test.ts`

**Interfaces:**
- Consumes: `Anchor` (Task 1).
- Produces:
```ts
export function buildSelector(el: Element, maxDepth?: number /* 8 */): string
export function createAnchor(el: Element, clientX: number, clientY: number, win: Window): Anchor
export type ResolvedAnchor = { element: Element; moved: false } | { element: null; moved: true };
export function resolveAnchor(anchor: Anchor, doc: Document): ResolvedAnchor
export function anchorPoint(anchor: Anchor, resolved: ResolvedAnchor, win: Window): { x: number; y: number } // coordinate viewport (client)
```
- Regole (§5): un id è "stabile" se non corrisponde a `/\d{4,}|[a-f0-9]{8,}/i`, con eccezione per gli id che iniziano con `shopify-section-`, sempre stabili. Il testo si normalizza così: spazi compressi, trim, primi 60 caratteri. L'uguaglianza del testo è "simile" se, normalizzati, uno inizia con l'altro, sui primi 30 caratteri. `anchorPoint` per un pin spostato usa `page.x` e `page.y * (scrollHeight attuale / docHeight)`, meno lo scroll.

- [ ] **Step 1: Scrivere i test che falliscono**

Fixture DOM in jsdom. `getBoundingClientRect` è mockato con `vi.spyOn` per restituire `{left:100, top:200, width:200, height:100}`.
```ts
// selettore con id Shopify
expect(buildSelector(h2InShopifySection)).toBe('#shopify-section-template--123__main > div:nth-of-type(2) > h2:nth-of-type(1)');
// id casuale ignorato
expect(buildSelector(elWithId('a8f3c9d2e1'))).not.toContain('#a8f3c9d2e1');
// offset
expect(createAnchor(h2, 150, 230, window).offset).toEqual({ x: 0.25, y: 0.3 });
// ritrovamento diretto
expect(resolveAnchor(a, document)).toEqual({ element: h2, moved: false });
// struttura cambiata, testo uguale → trovato per testo
// testo cambiato e selettore rotto → moved
expect(resolveAnchor(aBroken, document)).toEqual({ element: null, moved: true });
// tag diverso sullo stesso selettore → non accettato
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/tool/anchor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare `anchor.ts`**

- [ ] **Step 4: Eseguire e verificare che passino**

Run: `npx vitest run tests/tool/anchor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tool/anchor.ts tests/tool/anchor.test.ts && git commit -m "feat(tool): ancoraggio e ritrovamento pin"
```

---

### Task 5: Logica dei pin e dei doppioni

**Files:**
- Create: `src/tool/pin-logic.ts`
- Test: `tests/tool/pin-logic.test.ts`

**Interfaces:**
- Consumes: `Issue`, `ViewportClass`, `ResolvedAnchor`.
- Produces:
```ts
export interface PinCtx { pagePath: string; viewportClass: ViewportClass; showAllViewports: boolean; showResolved: boolean }
export function visiblePins(issues: Issue[], ctx: PinCtx): { issue: Issue; muted: boolean }[]
export interface DuplicateMatch { issue: Issue; relation: 'same' | 'ancestor' | 'descendant'; sameViewport: boolean }
export function findDuplicates(clicked: Element, candidates: { issue: Issue; resolved: ResolvedAnchor }[], ctx: { pagePath: string; viewportClass: ViewportClass }): DuplicateMatch[]
```
- `visiblePins` esclude sempre le segnalazioni con `deleted_at` e quelle di altre pagine, ed esclude le `resolved` se `!showResolved`. Le altre viewport compaiono solo con `showAllViewports`, con `muted: true`.
- `findDuplicates` considera solo segnalazioni non eliminate, non `resolved`, della stessa pagina e con `resolved.element` non nullo. `relation` vale: `same` se l'elemento è lo stesso, `ancestor` se l'elemento della segnalazione contiene quello cliccato, `descendant` nel caso opposto. Ordinamento: prima `sameViewport`, poi `same` < `ancestor` < `descendant`, poi `created_at` dal più recente.

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
expect(visiblePins([mob, tab, delMob, resMob, otherPage], { pagePath:'/p', viewportClass:'mobile', showAllViewports:false, showResolved:false }).map(p=>p.issue.id)).toEqual(['mob']);
expect(visiblePins([mob, tab], { …, showAllViewports:true }).find(p=>p.issue.id==='tab')!.muted).toBe(true);
const d = findDuplicates(span, [{issue: onSection, resolved:{element: section, moved:false}}, {issue: onSpan, resolved:{element: span, moved:false}}, {issue: resolvedOne, …}, {issue: movedOne, resolved:{element:null, moved:true}}], { pagePath:'/p', viewportClass:'mobile' });
expect(d.map(m => [m.issue.id, m.relation])).toEqual([['onSpan','same'], ['onSection','ancestor']]);
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/tool/pin-logic.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare `pin-logic.ts`**

- [ ] **Step 4: Eseguire e verificare che passino**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tool/pin-logic.ts tests/tool/pin-logic.test.ts && git commit -m "feat(tool): filtri dei pin e rilevamento doppioni"
```

---

### Task 6: Livello dati (client, auth, API, live)

**Files:**
- Create: `src/shared/supabase.ts`, `src/shared/errors.ts`, `src/shared/auth.ts`, `src/shared/api.ts`, `src/shared/live.ts`
- Test: `tests/shared/api.test.ts`, `tests/shared/auth.test.ts`, `tests/shared/errors.test.ts`

**Interfaces:**
- Produces:
```ts
// supabase.ts
export function getClient(storageKeySuffix?: string): SupabaseClient // singleton; persistSession true
// errors.ts
export type ApiError = { kind: 'offline' | 'unreachable' | 'auth' | 'forbidden' | 'unknown'; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };
export async function classifyError(e: unknown, probe?: () => Promise<boolean>): Promise<ApiError>
export const ERROR_TEXT: Record<ApiError['kind'], string>
// auth.ts
export function isStudioEmail(email: string): boolean
export function createAuth(client: SupabaseClient): {
  current(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<Result<Profile>>;
  signUp(email: string, password: string, name: string): Promise<Result<'check-email'>>;
  onChange(cb: (p: Profile | null) => void): () => void; }
// api.ts
export interface NewIssue { project_id: string; page_path: string; page_url: string; viewport_class: ViewportClass;
  viewport_width: number; browser: string; anchor: Anchor; body: string }
export interface ProjectSummary extends Project { open: number; in_progress: number; resolved: number; last_activity: string | null; bytes: number }
export function createApi(client: SupabaseClient): {
  findProjectByDomain(domain: string): Promise<Result<Project | null>>;
  listProjects(): Promise<Result<ProjectSummary[]>>;
  createProject(name: string, domain: string): Promise<Result<Project>>;
  linkDomain(projectId: string, domain: string): Promise<Result<void>>;
  listIssues(projectId: string): Promise<Result<Issue[]>>;            // esclude eliminate
  getIssue(id: string): Promise<Result<IssueDetail>>;
  createIssue(input: NewIssue, screenshot: PreparedImage | null, images: PreparedImage[]): Promise<Result<{ issue: Issue; failed: PreparedImage[] }>>;
  addReply(issueId: string, body: string, images: PreparedImage[]): Promise<Result<{ reply: Reply; failed: PreparedImage[] }>>;
  uploadAttachment(issue: Pick<Issue,'id'|'project_id'>, img: PreparedImage, replyId: string | null): Promise<Result<Attachment>>;
  setStatus(issueId: string, status: IssueStatus): Promise<Result<void>>;
  softDeleteIssue(issueId: string): Promise<Result<void>>;
  softDeleteReply(replyId: string): Promise<Result<void>>;
  togglePlusOne(issueId: string, userId: string): Promise<Result<boolean>>;
  signedUrl(path: string): Promise<Result<string>>;                   // scadenza 3600 s
  profiles(): Promise<Result<Profile[]>>;
  archiveStatus(): Promise<Result<ArchiveStatus>>;
  totalUsageBytes(): Promise<Result<number>>; }
export type Api = ReturnType<typeof createApi>;
// live.ts
export interface PresenceState { userId: string; name: string; color: string; page_path: string; viewport_class: ViewportClass }
export function subscribeProject(client: SupabaseClient, projectId: string, onIssueChanged: (issueId: string) => void): () => void
export function joinPresence(client: SupabaseClient, projectId: string, me: PresenceState, onSync: (others: PresenceState[]) => void): { update(p: Partial<PresenceState>): void; leave(): void }
```
- Percorsi di storage: `{project_id}/{issue_id}/screenshot.webp` e `{project_id}/{issue_id}/att-{uuid}.{ext}`.
- `createIssue`: (1) insert della riga; se fallisce, `ok: false`. (2) Upload dello screenshot e update di `screenshot_path`/`screenshot_bytes`; se fallisce, la segnalazione resta senza screenshot. (3) Upload di ogni immagine; quelle fallite finiscono in `failed`.
- `classifyError`: `TypeError` di rete con `navigator.onLine === false` → `offline`; `TypeError` di rete online con `probe()` falso (GET `${supabaseUrl}/auth/v1/health`) → `unreachable`; status 401 → `auth`; 403 o codice Postgres `42501` → `forbidden`.
- `ERROR_TEXT.unreachable`: "Supabase non risponde: il database potrebbe essere in pausa. Riattivalo dal pannello Supabase." con link `https://supabase.com/dashboard`.
- `subscribeProject` ascolta `postgres_changes` (`INSERT`/`UPDATE`) su `issues` con filtro `project_id=eq.<id>`; bastano gli eventi su `issues`, grazie a `touch_issue` (Task 2). Canale di presenza: `project:<id>`.

- [ ] **Step 1: Scrivere i test che falliscono, con un client finto**

`tests/helpers/fake-supabase.ts` registra le chiamate `from().insert/update/select` e `storage.from().upload`, e permette di far fallire un'operazione scelta.
```ts
expect(isStudioEmail('Ale@TheWaveStudio.it')).toBe(true);
expect(isStudioEmail('ale@gmail.com')).toBe(false);
expect((await createAuth(fake).signUp('x@gmail.com','pw12345678','X')).ok).toBe(false); // rifiutato lato client
// createIssue: insert ok, upload screenshot ok, 1 allegato su 2 fallisce
const r = await api.createIssue(input, shot, [imgA, imgB]);
expect(r.ok && r.value.failed).toEqual([imgB]);
expect(fake.uploads.map(u => u.path)).toEqual([`p1/i1/screenshot.webp`, expect.stringMatching(/^p1\/i1\/att-.+\.webp$/)]);
// insert fallito → nessun upload
expect(fake.uploads).toHaveLength(0);
// classifyError
expect((await classifyError(new TypeError('Failed to fetch'), async () => false)).kind).toBe('unreachable');
expect((await classifyError({ status: 401 })).kind).toBe('auth');
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/shared`
Expected: FAIL.

- [ ] **Step 3: Implementare i cinque moduli**

- [ ] **Step 4: Eseguire e verificare che passino**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared tests && git commit -m "feat: livello dati Supabase (auth, api, live)"
```

---

### Task 7: Guscio del tool, bookmarklet e deploy

**Files:**
- Create: `src/tool/main.ts`, `boot.ts`, `root.ts`, `styles.ts`, `toolbar.ts`, `location.ts`, `project-picker.ts`, `src/shared/auth-ui.ts`, `src/bookmarklet.ts`, `vite.tool.config.ts`, `vite.config.ts`, `board/install.html`, `src/board/install.ts`, `.github/workflows/pages.yml`
- Test: `tests/tool/boot.test.ts`, `tests/tool/location.test.ts`, `tests/bookmarklet.test.ts`

**Interfaces:**
- Consumes: `getClient`, `createAuth`, `createApi`, `pagePathOf`, `classifyViewport`, `el`.
- Produces:
```ts
// bookmarklet.ts
export function buildBookmarklet(baseUrl: string): string
// root.ts
export function mountRoot(doc: Document): { host: HTMLElement; shadow: ShadowRoot; destroy(): void }
// boot.ts
export interface ToolInstance { destroy(): void }
export async function boot(win: Window, deps?: Partial<{ api: Api; auth: ReturnType<typeof createAuth> }>): Promise<ToolInstance | null> // null = era già attivo ed è stato chiuso
// location.ts
export function watchLocation(win: Window, onChange: (url: string) => void): () => void
// toolbar.ts
export interface ToolbarHandlers { onToggleComment(): void; onViewport(id: ViewportClass): void; onToggleAllViewports(): void;
  onToggleResolved(): void; onOpenList(): void; onOpenBoard(): void; onClose(): void }
export function createToolbar(shadow: ShadowRoot, h: ToolbarHandlers): {
  setCommenting(on: boolean): void; setViewport(cls: ViewportClass, width: number): void;
  setPresence(others: PresenceState[]): void; setCount(n: number): void; showMessage(text: string, kind: 'info'|'error'): void; destroy(): void }
// project-picker.ts
export function pickProject(shadow: ShadowRoot, api: Api, domain: string): Promise<Project | null>
// auth-ui.ts
export function renderAuthForm(container: HTMLElement | ShadowRoot, auth: ReturnType<typeof createAuth>): Promise<Profile>
```
- Bookmarklet: `javascript:(()=>{var w=window;if(w.__stageReview){w.__stageReview.destroy();return}var s=document.createElement('script');s.src='<base>tool.js?v='+Date.now();s.onerror=function(){alert('Stage Review: questo sito blocca il tool.')};document.body.appendChild(s)})()`
- `boot` imposta `win.__stageReview`. Ordine di avvio: monta la root → login con `renderAuthForm` se manca la sessione → `findProjectByDomain(location.hostname)` → se null, `pickProject` ("Crea nuovo sito" con nome di default l'hostname, oppure "Collega a un sito esistente") → toolbar.
- `watchLocation` intercetta `history.pushState`/`replaceState`, ascolta `popstate`, e controlla `location.href` ogni 500 ms come rete di sicurezza. Chiama `onChange` solo quando `pagePathOf` cambia.
- `vite.tool.config.ts`: `build.lib = { entry: 'src/tool/main.ts', formats: ['iife'], name: 'StageReview', fileName: () => 'tool.js' }`, `emptyOutDir: false`, `outDir: 'dist'`.
- `install.html` mostra il pulsante `<a href={buildBookmarklet(CONFIG.publicBaseUrl)}>Revisiona</a>` con le istruzioni in tre passi: 1) mostra la barra dei preferiti (Cmd+Shift+B); 2) trascina **Revisiona** nella barra; 3) apri uno stage e clicca **Revisiona**.
- `pages.yml`: su push a `main`, `npm ci && npm test && npm run build` con le `vars` del repository, poi `actions/upload-pages-artifact` di `dist` e `actions/deploy-pages`.

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
expect(buildBookmarklet('https://u.github.io/stage-review/')).toMatch(/^javascript:/);
expect(buildBookmarklet('https://u.github.io/stage-review/')).toContain("https://u.github.io/stage-review/tool.js?v='");
// toggle: secondo boot chiude il primo
const i1 = await boot(window, fakeDeps); expect(document.querySelectorAll('#stage-review-root')).toHaveLength(1);
const i2 = await boot(window, fakeDeps); expect(i2).toBeNull(); expect(document.querySelector('#stage-review-root')).toBeNull();
// SPA (Review Focus 2)
const seen: string[] = []; const stop = watchLocation(window, u => seen.push(pagePathOf(u)));
history.pushState({}, '', '/products/b?variant=2'); history.pushState({}, '', '/products/b?variant=3');
expect(seen).toEqual(['/products/b']); stop();
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/tool/boot.test.ts tests/tool/location.test.ts tests/bookmarklet.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare i moduli e le configurazioni di build**

- [ ] **Step 4: Eseguire i test e la build**

Run: `npm test && npm run build`
Expected: PASS, e `dist/tool.js`, `dist/install.html` e `dist/index.html` esistono.

- [ ] **Step 5: Commit, push e verifica su uno stage reale**

```bash
git add -A && git commit -m "feat(tool): guscio, login, scelta sito, bookmarklet e deploy Pages"
```

Il push lo fa l'utente, oppure chi esegue dopo il suo ok. Poi si apre lo stage di Rica, si clicca **Revisiona** e si controlla che: compaia il login, si possa registrare un account `@thewavestudio.it`, venga proposto "Crea nuovo sito", compaia la barra, e un secondo clic la chiuda. Lo stage è HTTPS, quindi il tool va provato dalla versione su GitHub Pages, non da localhost.

---

### Task 8: Livello pin e modalità Commenta

**Files:**
- Create: `src/tool/pins.ts`, `src/tool/comment-mode.ts`
- Modify: `src/tool/boot.ts` (collega toolbar, pin e lista; gestisce l'hash di focus)
- Test: `tests/tool/comment-mode.test.ts`, `tests/tool/pins.test.ts`

**Interfaces:**
- Consumes: `resolveAnchor`, `anchorPoint` (Task 4); `visiblePins` (Task 5); `parseFocusHash` (Task 1).
- Produces:
```ts
export function createCommentMode(doc: Document, isOwnUi: (t: EventTarget | null) => boolean,
  onPick: (el: Element, clientX: number, clientY: number) => void): { enable(): void; disable(): void; toggle(): void; isOn(): boolean; destroy(): void }
export function createPinLayer(shadow: ShadowRoot, win: Window, profilesById: Map<string, Profile>,
  onOpen: (issueId: string) => void): { render(items: { issue: Issue; muted: boolean }[]): void; focus(issueId: string): boolean; destroy(): void }
```
- Modalità Commenta:
  - il tasto `c` fa toggle, ignorato quando il focus è in `input`, `textarea`, `select` o `[contenteditable]`, anche nel nostro Shadow DOM; `Escape` disattiva;
  - listener in fase di cattura su `click`, `mousedown`, `mouseup`, `pointerdown` e `pointerup`, con `preventDefault` + `stopPropagation` quando il target non è UI nostra;
  - `onPick` solo su `click`; il riquadro di evidenziazione segue `mousemove`.
- Livello pin: contenitore `position: fixed; inset: 0; pointer-events: none`, con i pin `pointer-events: auto`. Le posizioni vengono da `anchorPoint` e si aggiornano con `requestAnimationFrame` su `scroll` (anche in cattura, per gli scroll interni) e `resize`. `MutationObserver` sul `body` rifà il `resolveAnchor` con throttle di 100 ms. Pin spostato: bordo tratteggiato e title "Elemento spostato o rimosso". Pin muted: grigio con l'etichetta della viewport. Il pin mostra iniziali e colore dell'autore.
- All'avvio, se `parseFocusHash(location.hash)` dà un id, `focus(id)` scorre fino al pin e lo fa pulsare per 2 secondi.

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
// Review Focus 1: clic sulla nostra UI non crea pin
mode.enable(); toolbarButton.click(); expect(onPick).not.toHaveBeenCalled();
// clic sul sito: intercettato e consegnato
const link = document.querySelector('a')!; const nav = vi.fn(); link.addEventListener('click', nav);
link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }));
expect(onPick).toHaveBeenCalledWith(link, 5, 6); expect(nav).not.toHaveBeenCalled();
// 'c' dentro textarea non attiva
// Esc disattiva
// Review Focus 3: elemento sticky — dopo scroll il pin segue il rect corrente
mockRect(header, { top: 0, left: 0, width: 1000, height: 80 }); layer.render([{ issue: onHeader, muted: false }]);
window.scrollY = 500; window.dispatchEvent(new Event('scroll')); await nextFrame();
expect(pinEl.style.transform).toBe('translate(400px, 24px)'); // offset 0.4/0.3 sul rect, non spostato di 500
// focus su id inesistente → false
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/tool/comment-mode.test.ts tests/tool/pins.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare e collegare in `boot.ts`**

In `boot.ts`: carica `listIssues` e i profili, e con `render(visiblePins(...))` disegna i pin; al cambio di viewport, di filtri o di pagina (`watchLocation`) ridisegna. `onOpenList` apre nel Shadow DOM un pannello laterale con le segnalazioni visibili della pagina (`#n`, testo troncato a 80 caratteri, autore, stato, etichetta viewport); il clic su una riga chiama `focus(id)`. `setCount` mostra quante sono. Al pannello si aggiunge un test: clic su una riga → `focus` chiamato con quell'id.

- [ ] **Step 4: Eseguire e verificare che passino**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tool tests/tool && git commit -m "feat(tool): pin agganciati e modalità Commenta"
```

---

### Task 9: Screenshot, composer, thread e allegati

**Files:**
- Create: `src/tool/capture.ts`, `src/tool/composer.ts`
- Modify: `src/tool/boot.ts` (`onPick` → cattura → doppioni → composer; clic su un pin → thread)
- Test: `tests/tool/composer.test.ts`, `tests/tool/capture.test.ts`

**Interfaces:**
- Consumes: `encodeCanvas`, `validateAttachments`, `prepareAttachment` (Task 3); `findDuplicates`, `DuplicateMatch` (Task 5); `Api`, `ERROR_TEXT` (Task 6); `createAnchor` (Task 4); `renderAuthForm` (Task 7).
- Produces:
```ts
// capture.ts
export interface Capturer { start(): Promise<boolean>; grab(opts: { hide: HTMLElement; pin: { x: number; y: number } }): Promise<PreparedImage | null>; stop(): void }
export function createCapturer(win: Window): Capturer
export function frameScale(frameWidth: number, innerWidth: number): number
// composer.ts
export interface NewIssueContext { anchor: Anchor; pagePath: string; pageUrl: string; viewportClass: ViewportClass; viewportWidth: number; screenshot: PreparedImage | null; duplicates: DuplicateMatch[] }
export function createComposer(shadow: ShadowRoot, deps: { api: Api; me: () => Profile | null; projectId: string;
  reauth: () => Promise<Profile>; onSaved: (issueId: string) => void; profilesById: Map<string, Profile> }): {
  openNew(ctx: NewIssueContext): void; openThread(issueId: string): Promise<void>; close(): void; isOpen(): boolean }
```
- `start()` viene chiamato alla **prima attivazione** della modalità Commenta, che è un gesto utente, con `getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true, selfBrowserSurface: 'include', audio: false })`. Se negato restituisce `false`, e `grab` restituisce `null`.
- `grab`: imposta `hide.style.visibility = 'hidden'`, attende 2 rAF, disegna il frame da un `<video>` nascosto, ripristina la visibilità, disegna un cerchio di 14 px del colore dell'autore in `pin * frameScale`, poi `encodeCanvas` con `{ maxSide: 1600, quality: 0.8 }`.
- Composer "nuova segnalazione":
  - in cima la lista dei doppioni (n. #, testo troncato a 80 caratteri, autore, etichetta viewport), con i pulsanti "+1", "Rispondi" (apre il thread) e "Crea comunque nuova";
  - textarea; zona allegati con trascinamento, `paste` (`clipboardData.files`) e input file, con miniature e motivi di rifiuto;
  - pulsanti "Salva" e "Annulla"; `browser` = `navigator.userAgent`.
- Errore al salvataggio: testo e allegati restano, compare `ERROR_TEXT[kind]` con "Riprova". Se `kind === 'auth'`: `await reauth()`, poi un nuovo tentativo con la bozza intatta. Gli allegati in `failed` restano come miniature con errore e "Riprova" (`uploadAttachment`).
- Senza screenshot (`null`) compare l'avviso "Screenshot non disponibile: la segnalazione verrà salvata senza".
- Thread:
  - testo, screenshot (URL firmato), allegati con clic per ingrandire, risposte con allegati;
  - selettore di stato (Aperta / In lavorazione / Risolta), "+1", "Elimina" solo per l'autore con conferma "Eliminare la segnalazione? Resterà nell'archivio.";
  - campo risposta con le stesse regole di allegati ed errori.
  Tutti i testi utente sono resi con `el()`.

- [ ] **Step 1: Scrivere i test che falliscono, con api finta**

```ts
expect(frameScale(2880, 1440)).toBe(2);
// Review Focus 4
composer.openNew({ ...ctx, duplicates: [{ issue: { ...iss, body: '<img src=x onerror=alert(1)>' }, relation:'same', sameViewport:true }] });
expect(shadow.querySelector('.sr-dup img')).toBeNull();
// salvataggio offline: bozza conservata, poi Riprova riesce
api.createIssue.mockResolvedValueOnce({ ok:false, error:{ kind:'offline', message:'' } });
type(textarea, 'Titolo troppo vicino'); click(save);
expect(textarea.value).toBe('Titolo troppo vicino'); expect(text(shadow)).toContain(ERROR_TEXT.offline);
click(retry); await flush(); expect(api.createIssue).toHaveBeenCalledTimes(2); expect(onSaved).toHaveBeenCalled();
// Review Focus 5: sessione scaduta
api.createIssue.mockResolvedValueOnce({ ok:false, error:{ kind:'auth', message:'' } }).mockResolvedValueOnce({ ok:true, value:{ issue, failed:[] } });
click(save); await flush(); expect(reauth).toHaveBeenCalled(); expect(api.createIssue.mock.calls[1][0].body).toBe('Titolo troppo vicino');
// 6 immagini incollate → 5 accettate, messaggio "Massimo 5 immagini"
// screenshot null → avviso visibile, salvataggio consentito
// "Elimina" non presente se me().id !== author_id
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/tool/composer.test.ts tests/tool/capture.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare e collegare in `boot.ts`**

Flusso di `onPick(el, x, y)`: `grab({ hide: root.host, pin: { x, y } })` → `createAnchor` → `findDuplicates` sui pin della pagina → `composer.openNew`.

- [ ] **Step 4: Eseguire e verificare che passino**

Expected: PASS.

- [ ] **Step 5: Commit e verifica su stage**

```bash
git add src/tool tests/tool && git commit -m "feat(tool): screenshot, composer, thread e allegati"
```

Dopo il deploy, sullo stage: aprire un menu, premere `C`, cliccare sul menu, verificare che lo screenshot mostri il menu aperto, incollare un frame copiato da Figma e salvare.

---

### Task 10: Live, presenza e finestre-viewport

**Files:**
- Create: `src/tool/viewport-window.ts`
- Modify: `src/tool/boot.ts`, `src/tool/toolbar.ts`
- Test: `tests/tool/viewport-window.test.ts`, `tests/tool/live-wiring.test.ts`

**Interfaces:**
- Consumes: `subscribeProject`, `joinPresence` (Task 6); `VIEWPORT_PRESETS` (Task 1).
- Produces:
```ts
export function nextResizeDelta(targetInnerWidth: number, currentInnerWidth: number): number // 0 se |diff| <= 1
export function openViewportWindow(win: Window, presetId: ViewportClass, toolSrc: string): Window | null
```
- `openViewportWindow`: `win.open(location.href, 'sr-' + presetId, 'width=W,height=H')`; al `load` del popup (stessa origine) inietta `<script src=toolSrc>`; poi fino a 5 volte `popup.resizeBy(nextResizeDelta(W, popup.innerWidth), 0)` a 150 ms l'una dall'altra. Se `open` restituisce null, la toolbar mostra "Chrome ha bloccato la finestra: consenti i popup per questo sito".
- Wiring in `boot.ts`:
  - `subscribeProject(onIssueChanged)` → `getIssue(id)` → sostituisce o aggiunge la segnalazione nella lista locale e ridisegna i pin; se il thread aperto è quello, lo ricarica;
  - `joinPresence` con `page_path` e `viewport_class` aggiornati su `watchLocation` e `resize`;
  - la toolbar mostra gli avatar (iniziali e colore), con title "Nome · /pagina · Mobile";
  - su `resize` ricalcola `classifyViewport` e ridisegna;
  - all'avvio legge `totalUsageBytes()`; se `usageLevel(bytes).warn`, la toolbar mostra "Spazio quasi pieno (NN%): fate pulizia dalla board".
- Crea anche `src/shared/usage.ts`: `usageLevel(bytes: number): { ratio: number; warn: boolean }`, con avviso da 0.8 × `CONFIG.storageLimitBytes`. La usa anche la board (Task 11).

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
expect(nextResizeDelta(375, 360)).toBe(15);
expect(nextResizeDelta(375, 376)).toBe(0);
// live: evento su issue nuova → getIssue chiamato e pin aggiunto
fakeLive.emit('i9'); await flush(); expect(api.getIssue).toHaveBeenCalledWith('i9'); expect(pinIds()).toContain('i9');
// presenza: me escluso dagli avatar
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/tool/viewport-window.test.ts tests/tool/live-wiring.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementare**

- [ ] **Step 4: Eseguire e verificare che passino**

Expected: PASS.

- [ ] **Step 5: Commit e verifica con due browser**

```bash
git add src/tool tests/tool && git commit -m "feat(tool): aggiornamenti live, presenza e finestre viewport"
```

Verifica con due profili Chrome sullo stesso stage: un pin creato in A compare in B entro circa 1 s, e gli avatar mostrano l'altro utente.

---

### Task 11: Board

**Files:**
- Create: `board/index.html`, `board/site.html`, `src/board/home.ts`, `src/board/site.ts`, `src/board/detail.ts`, `src/board/logic.ts`, `src/board/board.css`
- Modify: `vite.config.ts` (input multipagina: `index`, `site`, `install`)
- Test: `tests/board/logic.test.ts`, `tests/board/detail.test.ts`

**Interfaces:**
- Consumes: `Api`, `createAuth`, `renderAuthForm`, `subscribeProject`, `withFocusHash`, `el`, `VIEWPORT_LABEL`, `usageLevel` (`src/shared/usage.ts`, Task 10).
- Produces (`logic.ts`):
```ts
export interface IssueFilters { pagePath?: string; viewportClass?: ViewportClass; status?: IssueStatus; authorId?: string }
export function filterIssues(issues: Issue[], f: IssueFilters): Issue[] // esclude eliminate; ordina per created_at desc
export function archiveHealth(s: ArchiveStatus, now: Date): 'ok' | 'stale' | 'error' // error se last_error; stale se last_ok_at null o > 30 min
export const STATUS_LABEL: Record<IssueStatus, string> // 'Aperta' | 'In lavorazione' | 'Risolta'
```
- Home (`index.html`): login, card per sito (§10) con conteggi, ultima attività, link "Archivio (Google Doc)" se `archive_doc_url`, barra dello spazio totale con avviso, "Ultimo archivio: hh:mm" rosso per `stale`/`error` e tooltip con `last_error`. Link a `install.html`.
- `site.html?id=`: filtri (pagina, viewport, stato, autore) nell'URL query; lista live via `subscribeProject`; righe con miniatura, `#n`, testo troncato a 120 caratteri, autore, +1 e numero di risposte.
- Dettaglio (pannello laterale in `site.html`): come il thread del Task 9 (stato, risposte con allegati, +1, elimina solo per l'autore). "Apri nel sito" apre `withFocusHash(page_url, id)` in una nuova scheda; sotto c'è il promemoria "Poi clicca **Revisiona** nei preferiti".

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
const now = new Date('2026-11-04T10:00:00Z');
expect(archiveHealth({ last_run_at:null, last_ok_at:'2026-11-04T09:45:00Z', last_error:null }, now)).toBe('ok');
expect(archiveHealth({ last_run_at:null, last_ok_at:'2026-11-04T09:29:00Z', last_error:null }, now)).toBe('stale');
expect(archiveHealth({ last_run_at:null, last_ok_at:'2026-11-04T09:59:00Z', last_error:'boom' }, now)).toBe('error');
expect(usageLevel(858_993_459).warn).toBe(false); expect(usageLevel(858_993_460).warn).toBe(true);
expect(filterIssues([a, deleted, b], { status:'open' }).map(i=>i.id)).toEqual(['b','a']);
// Review Focus 4 nel dettaglio
renderDetail(container, { ...detail, body:'<script>x</script>', replies:[{ ...r, body:'<b>y</b>' }] });
expect(container.querySelector('script, b')).toBeNull();
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/board`
Expected: FAIL.

- [ ] **Step 3: Implementare**

- [ ] **Step 4: Eseguire test e build**

Run: `npm test && npm run build`
Expected: PASS, e `dist/site.html` esiste.

- [ ] **Step 5: Commit**

```bash
git add board src/board tests/board vite.config.ts && git commit -m "feat(board): home, lista con filtri e dettaglio live"
```

---

### Task 12: Archivio su Google Docs (Apps Script)

**Files:**
- Create: `archive/format.js`, `archive/sync.js`, `archive/appsscript.json`, `archive/LEGGIMI.md`
- Test: `tests/archive/format.test.ts`

**Interfaces:**
- `format.js` contiene funzioni pure, senza import, ed esporta per i test con `if (typeof module !== 'undefined') module.exports = { … }`:
```js
formatTitle(issue)        // '#42 · /products/opuntia-oil-mask · Mobile 375'
formatMeta(issue, profilesById, tz)
// 'Alessandra · 04/11/2026 10:12 · Stato: Aperta · +1: 2 · Apri nel sito: <page_url>'
// se deleted_at: aggiunge ' · Eliminata il 04/11/2026 11:00 da Marco'
formatReplyHeader(reply, profilesById, tz) // 'Marco · 04/11/2026 10:30' (+ ' · eliminata' se deleted_at)
planBlockUpdate(issue, known)
// known = { imgs: string[], replies: string[] } | null
// → { create: boolean, newImageIds: string[], newReplyIds: string[], deletedReplyIds: string[] }
```
  Fuso `Europe/Rome`, formato `dd/MM/yyyy HH:mm`. Gli id immagine sono `'shot'` per lo screenshot e gli id degli allegati.
- `sync.js` (Apps Script):
  - `syncArchive()` è l'entry point del trigger; `installTrigger()` crea `ScriptApp.newTrigger('syncArchive').timeBased().everyMinutes(10)` dopo aver rimosso i trigger precedenti.
  - Proprietà dello script: `SUPABASE_URL`, `SERVICE_ROLE_KEY`, `FOLDER_ID`, `WATERMARK` (`<updated_at>|<id>`), `doc:<projectId>`, `blk:<issueId>` (JSON `{ doc, imgs, replies }`).
  - Query REST: `issues?select=*,replies(*),attachments(*),plus_ones(user_id)&or=(updated_at.gt.<T>,and(updated_at.eq.<T>,id.gt.<ID>))&order=updated_at.asc,id.asc&limit=50`, con header `apikey` e `Authorization: Bearer <service_role>`. In più `profiles` e `projects`.
  - Doc per progetto: se manca `doc:<projectId>`, crea "Stage Review — <nome>" con `DocumentApp.create`, lo sposta in `FOLDER_ID` e fa `PATCH projects.archive_doc_url`.
  - Blocco: Named Range `sr-<id>` sull'intero blocco e `sr-<id>-meta` sul paragrafo meta. `planBlockUpdate` decide cosa fare: crea il blocco in fondo (titolo `HEADING2`, meta, corpo, immagini, risposte); aggiorna solo il testo meta; inserisce dopo l'ultimo elemento del blocco le immagini e le risposte nuove; aggiunge " · eliminata" all'intestazione delle risposte eliminate; ricrea `sr-<id>` sull'estensione nuova.
  - Immagini: GET `storage/v1/object/media/<path>` con service role, `insertInlineImage` con larghezza 480 e altezza proporzionale. Se fallisce, inserisce il paragrafo "[immagine non disponibile]".
  - Dopo ogni segnalazione salva `WATERMARK` e `blk:`. Si ferma a 5 minuti di esecuzione.
  - A fine giro: upsert `archive_status` (id 1) con `last_run_at`, `last_ok_at` (solo se il giro è riuscito) e `last_error`.
- `LEGGIMI.md`: passi in italiano per l'utente:
  1. creare la cartella Drive "Stage Review" e condividerla solo con lo studio;
  2. su script.google.com creare un nuovo progetto e incollare `format.js` e `sync.js` come due file `.gs`, più `appsscript.json` (manifest visibile);
  3. impostare le Proprietà dello script `SUPABASE_URL`, `SERVICE_ROLE_KEY` (presa da Supabase → Settings → API, da inserire **solo qui**) e `FOLDER_ID` (dall'URL della cartella);
  4. eseguire `installTrigger` una volta e autorizzare;
  5. eseguire `syncArchive` a mano e controllare il Doc.

- [ ] **Step 1: Scrivere i test che falliscono**

```ts
const { formatTitle, formatMeta, formatReplyHeader, planBlockUpdate } = createRequire(import.meta.url)('../../archive/format.js');
expect(formatTitle({ number:42, page_path:'/products/opuntia-oil-mask', viewport_class:'mobile', viewport_width:375 })).toBe('#42 · /products/opuntia-oil-mask · Mobile 375');
expect(formatMeta({ ...iss, status:'in_progress', plus_ones:['u2','u3'], created_at:'2026-11-04T09:12:00Z' }, profiles, 'Europe/Rome'))
  .toBe('Alessandra · 04/11/2026 10:12 · Stato: In lavorazione · +1: 2 · Apri nel sito: https://x.myshopify.com/p');
expect(formatMeta({ ...iss, deleted_at:'2026-11-04T10:00:00Z', deleted_by:'u2' }, profiles, 'Europe/Rome')).toContain('Eliminata il 04/11/2026 11:00 da Marco');
expect(planBlockUpdate(issWithShotAnd2Atts1Reply, null)).toEqual({ create:true, newImageIds:['shot','a1','a2'], newReplyIds:['r1'], deletedReplyIds:[] });
expect(planBlockUpdate(sameButReplyR1DeletedAndNewR2, { imgs:['shot','a1','a2'], replies:['r1'] }))
  .toEqual({ create:false, newImageIds:[], newReplyIds:['r2'], deletedReplyIds:['r1'] });
// Review Focus 4: il testo con markup resta testo (formatMeta/format non interpretano HTML; il Doc usa setText)
```

- [ ] **Step 2: Eseguire e verificare che falliscano**

Run: `npx vitest run tests/archive`
Expected: FAIL.

- [ ] **Step 3: Implementare `format.js`, poi `sync.js`, `appsscript.json` (`timeZone: Europe/Rome`, `runtimeVersion: V8`, scope `documents`, `drive`, `script.external_request`, `script.scriptapp`) e `LEGGIMI.md`**

- [ ] **Step 4: Eseguire e verificare che passino**

Expected: PASS.

- [ ] **Step 5: Verifica manuale su cartella di test (con l'utente)**

Sequenza: installazione secondo `LEGGIMI.md` → `syncArchive` a mano: il Doc del sito contiene i blocchi → seconda esecuzione: nessun doppione → cambio di stato e nuova risposta dal tool, poi `syncArchive`: blocco aggiornato al suo posto → eliminazione morbida: meta con "Eliminata il …" → con due siti nascono due Doc → la board mostra "Ultimo archivio" verde.

- [ ] **Step 6: Commit**

```bash
git add archive tests/archive && git commit -m "feat(archive): sincronizzazione Supabase → Google Docs"
```

---

### Task 13: Prova reale e documentazione

**Files:**
- Create: `docs/test-manuale.md`, `LEGGIMI.md`

**Interfaces:**
- `LEGGIMI.md` (italiano): cos'è il tool, setup (prerequisiti, ordine delle migrazioni SQL ed esecuzione di `rls-check.sql`, variabili `vars` del repository GitHub, abilitazione di Pages da Actions, installazione del bookmarklet, archivio con rimando a `archive/LEGGIMI.md`), limiti del piano gratuito (pausa dopo 7 giorni, 1 GB), cosa resta fuori (§12).
- `docs/test-manuale.md`: checklist della prova reale del §13 della spec, più i cinque punti della Review Focus, ognuno con passi ed esito atteso.

- [ ] **Step 1: Scrivere `docs/test-manuale.md` e `LEGGIMI.md`**

- [ ] **Step 2: Eseguire la checklist con l'utente e un collega sullo stage di Rica (15 minuti)**

Expected: tutte le voci ✅. Ogni voce ❌ diventa un fix con un test che la riproduce, prima di chiudere.

- [ ] **Step 3: Commit**

```bash
git add docs/test-manuale.md LEGGIMI.md && git commit -m "docs: guida di setup e checklist di prova reale"
```
