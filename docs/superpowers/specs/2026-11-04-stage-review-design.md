# Stage Review — Design (demo)

Data: 2026-11-04 · Autrice: Alessandra Mastroeni (The Wave Studio) · Stato: in revisione

## 1. Obiettivo

Un tool interno e gratuito con cui i designer dello studio lasciano segnalazioni
direttamente sui siti in stage — commento, screenshot automatico, viewport,
immagini allegate — e le vedono **live** tra loro, così nessuno segnala due
volte la stessa cosa. Gli sviluppatori prendono in carico le segnalazioni da una
board condivisa.

**Successo per la demo:** due designer revisionano lo stesso stage Shopify nello
stesso momento, nelle tre viewport; ognuno vede comparire i pin dell'altro entro
un secondo; un clic su un elemento già segnalato mostra la segnalazione esistente
prima di scriverne una nuova; lo sviluppatore apre la board, cambia lo stato e
risponde, e il designer vede il cambio live. Entro 10 minuti tutto (testo,
stato, risposte, screenshot e allegati) compare nel Google Doc del sito.

## 2. Vincoli (decisi con l'autrice)

| Vincolo | Conseguenza |
|---|---|
| Tool nostro, niente SaaS di feedback | Lo costruiamo |
| Nessun codice da aggiungere ai siti | Il tool entra nella pagina tramite un **bookmarklet** (pulsante nei preferiti) |
| Nessun hosting a pagamento, demo gratis | Pagine statiche su **GitHub Pages**, dati su **Supabase piano gratuito** |
| Collaborazione live tra più persone | Database condiviso con realtime + presenza |
| Allegati immagine sì; disegno a mano, @menzioni, notifiche email no | Vedi §12 |
| Le segnalazioni non devono andare perse | Archivio automatico su **Google Docs**, uno per sito (§10b), ed eliminazione solo "morbida" |

**Perché un bookmarklet e non una "copia" dello stage dentro il tool:** gli stage
Shopify rifiutano di essere caricati dentro un'altra pagina (verificato su
ricahaircare.com: `X-Frame-Options: DENY`, `frame-ancestors 'none'`). Senza un
server proxy l'unico modo è far girare il tool *dentro* la pagina dello stage.
La CSP di Shopify non limita gli script (`script-src` assente), quindi il
bookmarklet può caricare il nostro script.

**Browser supportato nella demo:** solo Chrome desktop (serve
`getDisplayMedia` con `preferCurrentTab` per gli screenshot).

## 3. Architettura

```
GitHub Pages (statico, gratis)              Supabase (piano gratuito)
├─ /               installazione + board    ├─ Auth (email + password)
├─ /tool.js        tool in pagina           ├─ Postgres + Row Level Security
└─ /board/...                               ├─ Realtime (modifiche + presenza)
                                            └─ Storage bucket privato "media"
Stage del cliente (es. *.myshopify.com)
└─ bookmarklet → carica tool.js → parla direttamente con Supabase

Google Apps Script (account Google dell'autrice, gratis)
└─ ogni 10 min legge da Supabase → scrive un Google Doc per sito
   nella cartella Drive "Stage Review"
```

Nessun server nostro. Sia il tool in pagina sia la board usano `supabase-js`
con la chiave pubblica (anon key); la protezione dei dati è tutta nelle regole
RLS del database (§8).

### Stack

- TypeScript, build con Vite in due uscite:
  - `tool.js`: un unico file IIFE autonomo (include `supabase-js`), iniettato dal bookmarklet.
  - board: pagina statica multipagina.
- Nessun framework UI: componenti DOM leggeri. L'interfaccia del tool vive in uno
  **Shadow DOM** per non ereditare né rompere gli stili del sito.
- Test: Vitest + jsdom.
- Deploy: GitHub Actions → GitHub Pages.
- Schema database: file SQL versionati in `supabase/migrations/`.

### Unità e responsabilità

| Unità | Cosa fa | Dipende da |
|---|---|---|
| `bookmarklet` | Una riga: inietta `tool.js` (con cache-busting). Se il tool è già attivo, lo chiude | — |
| `tool/boot` | Avvio: login, riconoscimento del sito, montaggio UI | auth, projects |
| `tool/toolbar` | Barra fissa: Commenta, viewport, "tutte le viewport", presenza, elenco pagina, link alla board, chiudi | — |
| `tool/anchor` | Genera l'ancoraggio di un elemento e lo ritrova (§5) | DOM |
| `tool/pins` | Disegna i pin in coordinate di documento e li riposiziona su scroll/resize/mutazioni | anchor |
| `tool/composer` | Campo per nuova segnalazione e risposte, allegati, avviso doppioni | media, duplicates |
| `tool/capture` | Screenshot della scheda (§6) | — |
| `tool/viewport` | Classificazione della larghezza e apertura delle finestre-viewport (§7) | — |
| `shared/media` | Compressione immagini e upload | Supabase Storage |
| `shared/duplicates` | Trova segnalazioni aperte sullo stesso elemento o elementi parenti | anchor |
| `shared/api` | Lettura e scrittura di progetti, segnalazioni, risposte, +1 | Supabase |
| `shared/live` | Iscrizione alle modifiche realtime e canale di presenza | Supabase Realtime |
| `board/*` | Home dei siti, pagina del sito con lista e filtri, dettaglio segnalazione, login/registrazione | shared/* |
| `archive/` (Apps Script) | Sincronizzazione periodica Supabase → Google Docs (§10b) | Supabase REST e Storage, DocumentApp, DriveApp |
| `archive/format` | Funzioni pure che trasformano una segnalazione nel contenuto del blocco del Doc (testate con Vitest) | — |

## 4. Modello dati

```
profiles       id (= auth.users.id), name, color, created_at
projects       id, name, created_by, created_at, archive_doc_url
project_domains domain (pk, es. "rica-stage.myshopify.com"), project_id
issues         id, project_id, number (progressivo per sito: #1, #2…),
               page_path, page_url, viewport_class
               ('mobile'|'tablet'|'desktop'), viewport_width, browser,
               anchor jsonb, body, status ('open'|'in_progress'|'resolved'),
               author_id, screenshot_path, screenshot_bytes,
               created_at, updated_at, deleted_at, deleted_by
replies        id, issue_id, author_id, body, created_at, deleted_at
attachments    id, issue_id, reply_id (null se sulla segnalazione), path,
               width, height, bytes, created_at, deleted_at
plus_ones      issue_id + user_id (pk composta), created_at
archive_status id = 1, last_run_at, last_ok_at, last_error
```

- **Eliminazione morbida:** "elimina" imposta `deleted_at`/`deleted_by` e non
  cancella mai le righe né i file. Gli elementi eliminati spariscono da tool e
  board, ma restano nel database e nell'archivio (§10b). La cancellazione
  definitiva non esiste nella demo.
- **`updated_at` si propaga:** un trigger aggiorna `issues.updated_at` quando
  cambiano le sue risposte, gli allegati o i +1, così l'archivio trova ogni
  modifica guardando solo `issues`.
- `number` è assegnato da un trigger all'inserimento (massimo del progetto + 1).

- **Un sito, più domini.** Le anteprime Shopify possono avere domini diversi
  (`*.myshopify.com`, `*.shopifypreview.com`), quindi un progetto ha N domini
  collegati. Quando apri il tool su un dominio sconosciuto scegli tra "crea
  nuovo sito" e "collega a un sito esistente".
- **Identità della pagina:** `page_path` = pathname senza query né hash.
  Parametri come `preview_theme_id` vengono ignorati per raggruppare, ma
  `page_url` li conserva per "Apri nel sito".
- **Spazio usato:** vista `project_usage` = somma di `screenshot_bytes` e
  `attachments.bytes`. Sul totale del progetto Supabase si calcola la soglia
  di avviso dell'80% di 1 GB.

## 5. Pin e ancoraggio

**Ancoraggio salvato (`anchor`):**
```json
{
  "selector": "#shopify-section-template--123__main > div:nth-of-type(2) > h2",
  "tag": "H2",
  "text": "Opuntia Oil Mask",
  "offset": { "x": 0.42, "y": 0.30 },
  "page": { "x": 512, "y": 1840, "docHeight": 6200 }
}
```
- Generazione del selettore: si usa l'`id` più vicino se stabile (non numerico
  casuale; gli id di sezione Shopify sono stabili), altrimenti un percorso
  `tag:nth-of-type` fino a un antenato con id, con profondità massima di 8.
- `offset` è la posizione del clic in percentuale dentro il riquadro
  dell'elemento, così il pin segue l'elemento anche quando cambia dimensione.
- `text` contiene i primi 60 caratteri del testo visibile dell'elemento.

**Ritrovamento:**
1. `querySelector(selector)`: lo si accetta se `tag` coincide e il testo è simile
   (stessa parte iniziale; tollerante a spazi).
2. Altrimenti si cerca tra gli elementi con lo stesso `tag` quello con il testo
   uguale.
3. Altrimenti il pin va in `page.x/y`, scalato sull'altezza attuale del documento,
   e appare **tratteggiato** con la scritta "elemento spostato o rimosso".

I pin vengono ricalcolati su scroll, resize e mutazioni del DOM (con throttle a
100 ms). Colore e iniziali sono quelli dell'autore. Le segnalazioni risolte
sono nascoste di default; un filtro nella barra le mostra.

**Modalità Commenta:**
- Si attiva dal pulsante o con il tasto **C**. La scorciatoia serve a non
  muovere il mouse e non perdere hover e menu aperti.
- In modalità Commenta l'elemento sotto il cursore viene evidenziato. Il clic
  viene intercettato (link e pulsanti del sito non scattano), lo screenshot
  viene catturato **subito**, poi si apre il composer.
- **Esc** annulla. Fuori dalla modalità Commenta il sito funziona normalmente.

## 6. Screenshot e allegati

**Screenshot automatico:**
- Alla prima segnalazione della sessione il tool chiede a Chrome di condividere
  la scheda corrente (`getDisplayMedia`, `preferCurrentTab: true`). Lo stream
  resta aperto per tutta la sessione, quindi il permesso si dà una volta per
  finestra.
- Al clic: l'UI del tool viene nascosta per un frame, si cattura il frame, si
  disegna sopra il pin e si comprime in WebP qualità 0.8, lato lungo massimo
  1600 px (circa 200–300 KB).
- Permesso negato o stream interrotto: la segnalazione si salva senza
  screenshot e compare l'avviso "screenshot non disponibile".

**Allegati immagine:**
- Fino a 5 per segnalazione e 5 per risposta.
- PNG, JPG e WebP vengono ridimensionate a 2000 px sul lato lungo e compresse
  a circa 500 KB (WebP).
- Le GIF si accettano fino a 2 MB senza ricompressione, per non perdere
  l'animazione.
- Si aggiungono con trascinamento, incolla (Cmd+V) o selezione file.
  Compaiono come miniature e un clic le apre a grandezza piena.
- Storage: bucket privato `media`, percorsi `{project_id}/{issue_id}/…`, letti
  con URL firmati a scadenza.

## 7. Viewport

- Classificazione su `window.innerWidth`: **mobile** < 768, **tablet**
  768–1279, **desktop** ≥ 1280. Si salva anche la larghezza esatta.
- Il selettore nella barra apre la stessa pagina in una finestra popup:
  - Mobile 375×812, Tablet 768×1024, Desktop 1440×900;
  - dopo l'apertura la finestra viene corretta con `resizeBy` finché
    `innerWidth` corrisponde;
  - la popup è sullo stesso dominio, quindi il tool viene iniettato in
    automatico senza riclicare il bookmarklet.
- Ridimensionare la finestra a mano va bene uguale: la categoria si aggiorna
  live.
- Di default vedi i pin della categoria corrente. L'interruttore "tutte le
  viewport" mostra anche gli altri, in grigio e con l'etichetta della viewport.

## 8. Accessi e sicurezza

- Account con **email + password** di Supabase Auth, una conferma email per
  persona alla registrazione. Il magic link è scartato: i limiti di invio del
  piano gratuito sono troppo bassi e il redirect non torna sui domini stage.
- **Solo email `@thewavestudio.it`:** la funzione `is_studio()` verifica che
  l'email del JWT finisca con quel dominio e sia confermata. Tutte le policy RLS
  la richiedono. Chi si registra con un'altra email riceve un account che non
  vede niente: niente progetti, niente segnalazioni, niente immagini.
- Permessi: un utente dello studio legge e scrive tutto e cambia lo stato di
  qualsiasi segnalazione. Elimina (in modo morbido) solo le proprie
  segnalazioni, risposte e allegati. Nessun utente può fare `DELETE` vero: le
  policy RLS non lo permettono su nessuna tabella e su nessun file del bucket.
- L'archivio usa la **service_role key** di Supabase, salvata solo nelle
  Proprietà dello script di Apps Script, nell'account Google dell'autrice.
- La sessione è salvata per dominio, quindi si fa login una volta su ogni stage
  e dopo resta attiva. Chrome può ricordare la password.
- La anon key di Supabase è pubblica per design e sta nel codice. La
  service_role key non viene mai usata nel client né salvata nel repository.

## 9. Live

- Canale realtime per progetto: modifiche su `issues`, `replies`, `plus_ones`
  e `attachments`, filtrate per `project_id`. Tool e board aggiornano la vista
  entro circa 1 s.
- Canale di presenza `project:{id}`: `{ name, color, page_path,
  viewport_class }`. La barra mostra gli avatar di chi è sullo stesso sito e,
  al passaggio del mouse, la pagina in cui si trova.
- **Doppioni:** al clic in modalità Commenta, `duplicates` cerca segnalazioni
  non risolte sulla stessa pagina il cui elemento ritrovato è lo stesso, un
  antenato o un discendente dell'elemento cliccato. Mostra prima quelle della
  stessa viewport, poi le altre. Il composer le presenta in cima con le azioni
  "+1", "Rispondi" e "Crea comunque nuova".

## 10. Board

- **Accesso:** login e registrazione.
- **Home:** card per sito con nome, domini, segnalazioni aperte / in
  lavorazione / risolte, ultima attività, link **Archivio (Google Doc)**,
  spazio usato totale con avviso dall'80%, e "Ultimo archivio: hh:mm" (rosso
  se più vecchio di 30 minuti o se `last_error` è valorizzato).
- **Pagina del sito:** lista live con filtri per pagina, viewport, stato e
  autore, e ordinamento per data. Ogni riga mostra la miniatura dello
  screenshot, l'inizio del testo, l'autore, i +1 e il numero di risposte.
- **Dettaglio:**
  - screenshot grande e allegati;
  - thread delle risposte con la possibilità di rispondere e allegare;
  - cambio di stato;
  - eliminazione morbida, solo per l'autore (§4);
  - **Apri nel sito**, che apre `page_url#stage-review=<id>`; quando l'utente
    clicca Revisiona il tool legge l'hash, scorre al pin e lo evidenzia;
  - prima di aprire lo stage la board mostra il promemoria "poi clicca
    Revisiona nei preferiti", perché senza codice sul sito il tool non può
    partire da solo.
- **Installazione:** pulsante da trascinare nei preferiti e istruzioni in
  tre passi.

## 10b. Archivio su Google Docs

Serve a non perdere nessuna segnalazione, nemmeno se Supabase si ferma o un
dato viene eliminato.

- **Dove:** un Google Doc per sito, "Stage Review — <nome sito>", nella cartella
  Drive "Stage Review" dell'autrice. Il Doc viene creato alla prima
  segnalazione del sito e il suo URL è salvato in `projects.archive_doc_url`.
  La condivisione segue quella della cartella, che va condivisa solo con lo
  studio.
- **Quando:** un trigger a tempo di Apps Script ogni 10 minuti. Ritardo massimo
  di circa 10 minuti; non dipende dal tool aperto nel browser di qualcuno.
- **Cosa legge:** le segnalazioni con `updated_at` successivo all'ultimo
  segnaposto salvato (Proprietà dello script), in ordine crescente, comprese
  quelle eliminate. Il segnaposto avanza dopo ogni segnalazione scritta, quindi
  un giro interrotto (limite di 6 minuti di Apps Script) riprende da lì al
  giro successivo.
- **Blocco di una segnalazione nel Doc** (un Named Range `sr-<id>`):
  1. titolo: `#42 · /products/opuntia-oil-mask · Mobile 375`;
  2. riga meta: autore, data, **stato**, +1, link "Apri nel sito";
     se eliminata: *Eliminata il … da …*;
  3. testo della segnalazione;
  4. screenshot (larghezza 480 px) e allegati, scaricati dal bucket e
     inseriti come immagini vere, non come link;
  5. risposte in ordine, ognuna con autore, data, testo e allegati.
- **Aggiornamento:** se il blocco esiste già, vengono riscritti la riga meta e
  la sezione risposte; le immagini già inserite non vengono riscaricate e
  quelle nuove si aggiungono. Una nuova segnalazione si aggiunge in fondo.
  Lo stesso giro eseguito due volte non crea doppioni.
- **Sola andata:** le modifiche fatte a mano nel Doc non tornano nel tool.
  Testo scritto fuori dai blocchi viene lasciato intatto.
- **Stato:** a fine giro scrive `archive_status` (orario, esito, errore), che la
  board mostra.

## 11. Gestione errori

| Caso | Comportamento |
|---|---|
| Salvataggio fallito / offline | Testo e immagini restano nel composer, pulsante "Riprova"; nessuna perdita |
| Upload immagine fallito | La singola miniatura mostra l'errore e "Riprova"; il resto si salva |
| Screenshot negato | Salva senza screenshot con avviso |
| Supabase in pausa (7 giorni di inattività) | Messaggio "database in pausa" con link al pannello Supabase per riattivarlo |
| Sessione scaduta | Ritorno al login senza perdere la bozza |
| Sito che blocca lo script (CSP) | Il bookmarklet rileva il fallimento del caricamento e mostra un `alert` esplicativo |
| Spazio ≥ 80% | Avviso nella board e nel tool |
| Elemento non ritrovato | Pin tratteggiato (§5) |
| Giro di archivio fallito o interrotto | Il segnaposto non avanza oltre l'ultima segnalazione scritta; il giro successivo riprende. `archive_status.last_error` è visibile in board; Google invia anche la sua email automatica di errore del trigger all'autrice |
| Immagine non scaricabile per l'archivio | Nel Doc compare "[immagine non disponibile]" e la segnalazione viene comunque scritta |

## 12. Fuori dalla demo

Disegno a mano sullo screenshot, @menzioni, notifiche email, cancellazione
definitiva, sincronizzazione dal Google Doc verso il tool, integrazioni
(Jira/Slack/Asana), accesso per i clienti, browser diversi da Chrome, ripiego
con snapshot lato server, app mobile.

## 13. Test

**Automatici (Vitest + jsdom):**
- `anchor`: generazione e ritrovamento su DOM di prova, inclusi elemento
  spostato, testo cambiato ed elemento rimosso (→ ripiego).
- `viewport`: classificazione ai bordi (767/768, 1279/1280).
- `media`: ridimensionamento e limiti (numero, peso, GIF intatte).
- `duplicates`: stesso elemento, antenato, discendente, segnalazioni risolte
  ed eliminate ignorate.
- `archive/format`: contenuto del blocco per segnalazione nuova, aggiornata,
  con risposte, eliminata.

**Archivio (prova su un progetto di test e una cartella Drive di test):** giro
ripetuto senza doppioni, aggiornamento di stato e risposte nel blocco giusto,
segnalazione eliminata marcata, ripresa dopo un giro interrotto, Doc separati
per due siti.

**Sicurezza (script contro il progetto Supabase):** con un account esterno
allo studio, lettura e scrittura di ogni tabella e del bucket devono fallire;
con un account dello studio, eliminare la segnalazione di un altro deve
fallire, e un `DELETE` vero su qualsiasi tabella o file deve fallire per tutti.

**Prova reale:** due persone sullo stage di Rica, tre viewport, 15 minuti. Si
verificano: pin live entro circa 1 s, avviso dei doppioni, screenshot con hover
e menu aperti, allegati incollati da Figma, cambio di stato dalla board visto
live nel tool, pin tratteggiato dopo una modifica del tema.

## 14. Setup (cosa serve dall'autrice)

1. Creare un account Supabase gratuito e un progetto (regione EU, Francoforte),
   poi comunicare **Project URL** e **anon key**. La service_role key non va
   condivisa.
2. Indicare l'account GitHub dove pubblicare (es. quello che ospita
   `thewavestudio-editor`) e creare il repository `stage-review`.
3. Lo schema SQL si applica incollando la migrazione nel SQL Editor di
   Supabase; i passi esatti saranno nel piano.
4. Archivio: creare la cartella Drive "Stage Review" condivisa con lo studio,
   incollare lo script su script.google.com, inserire nelle Proprietà dello
   script la service_role key (solo lì), autorizzare l'accesso a Drive/Docs e
   attivare il trigger dei 10 minuti. Le istruzioni passo passo saranno nel
   piano.

## 15. Rischi

- **Domini di anteprima Shopify** che cambiano: gestiti con i domini collegati
  al progetto, ma serve un passo manuale la prima volta.
- **Permesso di condivisione della scheda** da dare una volta per finestra:
  piccolo attrito, da verificare nella prova reale.
- **Pausa del piano gratuito** dopo 7 giorni di inattività.
- **Siti non Shopify con CSP restrittiva** potrebbero bloccare il tool.
- **Doc molto lunghi:** un sito con centinaia di segnalazioni rende il Doc lento;
  il Doc per sito limita il problema. Se serve, in futuro si divide per giro
  di revisione.
- **Service_role key nell'account Google:** dà accesso completo al database;
  resta nelle Proprietà dello script, che solo l'autrice vede.
- **Ancoraggio** su temi con markup molto dinamico (slider, contenuti caricati
  dopo): il ripiego evita di perdere pin, ma il pin può risultare tratteggiato.
