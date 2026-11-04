# Archivio su Google Docs — installazione (5 minuti)

Ogni 10 minuti uno script Google copia tutte le segnalazioni, con screenshot e
allegati, in un Google Doc per ogni sito. Gira sul tuo account Google, gratis.

## 1. Cartella Drive
1. Su Google Drive crea una cartella **Stage Review**.
2. Condividila **solo con lo studio**: i Doc al suo interno ereditano la condivisione.
3. Apri la cartella e copia il suo ID dall'indirizzo: è la parte dopo
   `/folders/`, per esempio `https://drive.google.com/drive/folders/`**`1AbC…xyz`**.

## 2. Progetto Apps Script
1. Vai su <https://script.google.com> → **Nuovo progetto**. Chiamalo "Stage Review archivio".
2. Rinomina `Codice.gs` in `format.gs` e incolla il contenuto di `archive/format.js`.
3. **+ → Script**, chiamalo `sync`, e incolla il contenuto di `archive/sync.js`.
4. **Impostazioni progetto** (ingranaggio) → spunta *Mostra il file manifest "appsscript.json"*.
   Torna all'editor, apri `appsscript.json` e sostituiscilo con `archive/appsscript.json`.

## 3. Proprietà dello script
**Impostazioni progetto → Proprietà dello script → Aggiungi**:

| Proprietà | Valore |
|---|---|
| `SUPABASE_URL` | `https://htdtwimhfooiuikcxxmd.supabase.co` |
| `SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → chiave **service_role** (o *secret*) |
| `FOLDER_ID` | l'ID della cartella del punto 1 |

> La chiave service_role dà accesso completo al database: va **solo qui**.
> Non incollarla in chat, nel codice o su GitHub.

## 4. Attivazione
1. Nell'editor scegli la funzione **installTrigger** ed esegui ▶︎. Google chiede
   di autorizzare l'accesso a Docs, Drive e servizi esterni: consenti.
2. Scegli **syncArchive** ed esegui ▶︎ una volta a mano.
3. Nella cartella compare **Stage Review — <nome sito>**. Nella board la riga
   *Ultimo archivio* diventa verde con l'orario.

## Buono a sapersi
- L'archivio va in una sola direzione: quello che scrivi a mano nel Doc non torna
  nel tool, ma non viene toccato.
- Non cancellare i blocchi delle segnalazioni. Se succede, al giro successivo
  il blocco viene riscritto in fondo.
- Se un giro fallisce, Google ti manda un'email e la board mostra l'errore. Il
  giro dopo riprende da dove si era fermato, senza perdere niente.
