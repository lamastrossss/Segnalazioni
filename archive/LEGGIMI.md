# Archivio su Fogli Google — installazione (5 minuti)

Ogni 10 minuti uno script Google copia tutte le segnalazioni in un foglio Google per
ogni sito: una riga per segnalazione, con anteprima dello screenshot e link alle immagini
(link segreti validi 10 anni). Le segnalazioni eliminate vengono tolte dal foglio.
Gira sul tuo account Google, gratis.

## 1. Cartella Drive
1. Su Google Drive crea una cartella **Stage Review**.
2. Condividila **solo con lo studio**: i fogli al suo interno ereditano la condivisione.
3. Apri la cartella e copia il suo ID dall'indirizzo: è la parte dopo
   `/folders/`, per esempio `https://drive.google.com/drive/folders/`**`1AbC…xyz`**.

## 2. Progetto Apps Script
1. Vai su <https://script.google.com> → **Nuovo progetto**. Chiamalo "Stage Review archivio".
2. In `Codice.gs` incolla tutto il contenuto di `archive/archivio-completo.gs` (Cmd+A, Cmd+V, Cmd+S).

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
   di autorizzare l'accesso a Fogli, Drive e servizi esterni: consenti.
2. Scegli **syncArchive** ed esegui ▶︎ una volta a mano.
3. Nella cartella compare il foglio **Stage Review — <nome sito>**. Nella board la riga
   *Ultimo archivio* mostra l'orario.

## Buono a sapersi
- **Lo Stato si può cambiare dal foglio** (menu a tendina): viene salvato subito in Stage Review
  e la board si aggiorna. Se il salvataggio non riesce, sulla cella compare una nota.
- Le altre colonne vanno in una sola direzione: le modifiche fatte a mano non tornano nel
  tool e vengono sovrascritte alla modifica successiva della segnalazione.
- Google permette circa 20 "ascoltatori" per script: lo stato modificabile dal foglio
  funziona per circa 20 siti.
- Puoi aggiungere colonne tue a destra di "Apri nel sito": non vengono toccate.
- Se un giro fallisce, Google ti manda un'email e la board mostra l'errore. Il
  giro dopo riprende da dove si era fermato, senza perdere niente.
