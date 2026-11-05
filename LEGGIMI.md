# Stage Review

Tool interno di The Wave Studio per lasciare segnalazioni direttamente sugli
stage: pin agganciati agli elementi, screenshot automatico, viewport, immagini
allegate, collaborazione live tra designer e una board per gli sviluppatori.
Tutte le segnalazioni finiscono anche in un Google Doc per sito.

- **Pulsante Revisiona** (bookmarklet): apre il tool sopra qualsiasi stage, senza codice sul sito.
- **Board**: <https://lamastrossss.github.io/Segnalazioni/>
- **Installazione del pulsante**: <https://lamastrossss.github.io/Segnalazioni/install.html>

Funziona su Chrome desktop. Tutto gratuito: GitHub Pages + Supabase (piano free) + Google Apps Script.

## Come si usa
1. Apri lo stage e clicca **Revisiona** nei preferiti (la prima volta: accesso con l'email dello studio).
2. Premi **C** (o *Commenta*), clicca l'elemento e scrivi. Lo screenshot si fa da solo; puoi incollare immagini con Cmd+V.
3. **Mobile / Tablet / Desktop** apre la pagina in una finestra di quella larghezza.
4. I pin dei colleghi compaiono live; se clicchi su qualcosa già segnalato, il tool te lo mostra prima.
5. Gli sviluppatori lavorano dalla board: filtri, stato, risposte, *Apri nel sito*.

## Setup (una volta)
1. **Database.** In Supabase → *SQL Editor* incolla ed esegui `supabase/setup-database.sql`
   (le migrazioni 001-003 in un file). Poi, in una **query separata**, esegui
   `supabase/tests/rls-check.sql`: deve rispondere **RLS OK**. Non unirli: il controllo
   annulla tutto ciò che è nella stessa esecuzione.
2. **Accessi (niente registrazione libera).** Supabase → *Authentication → Sign In / Providers*:
   disattiva *Allow new users to sign up*. Gli account li crea l'amministratore:
   *Authentication → Users → Add user → Create new user*, con email @thewavestudio.it,
   una password provvisoria e *Auto Confirm User* spuntato. Ognuno poi la cambia dalla
   board con **Cambia password**.
3. **Pubblicazione.** Su GitHub, nel repository `Segnalazioni`: *Settings → Pages → Source: GitHub Actions*.
   Ogni push su `main` esegue i test e pubblica (`.github/workflows/pages.yml`).
4. **Pulsante.** Apri la pagina di installazione e trascina **Revisiona** nella barra dei preferiti.
5. **Archivio.** Segui `archive/LEGGIMI.md`.

## Limiti del piano gratuito
- Supabase va in pausa dopo **7 giorni** senza uso: il tool mostra "database in pausa".
  Si riattiva con un clic dal pannello Supabase.
- **1 GB** per screenshot e allegati, circa 3.000 segnalazioni. Dall'80% la board e il tool avvisano.

## Fuori dalla demo
Disegno a mano sugli screenshot, @menzioni, notifiche email, cancellazione definitiva,
modifiche dal Google Doc verso il tool, integrazioni (Jira/Slack/Asana), accesso clienti,
browser diversi da Chrome.

## Sviluppo
```bash
npm install
npm test        # test (inclusi database con PGlite e archivio simulato)
npm run build   # dist/: board + tool.js
```
Le variabili sono in `.env.local` (vedi `.env.example`). Specifica e piano: `docs/superpowers/`.
