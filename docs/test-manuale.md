# Prova reale — checklist

Due persone (A e B), Chrome desktop, stage di Rica, 15 minuti.
Prima: setup completato (LEGGIMI.md), pulsante Revisiona installato da entrambi.

| # | Passi | Esito atteso | ✅/❌ |
|---|---|---|---|
| 1 | A apre lo stage, clicca Revisiona, si registra con l'email dello studio, conferma l'email, accede | Compare la proposta "Crea nuovo sito", poi la barra con il nome del sito | |
| 2 | A crea il sito; B apre lo stesso stage e accede | B vede la barra e l'avatar di A | |
| 3 | A preme C, autorizza la condivisione della scheda, clicca un titolo, scrive e salva | Pin con le iniziali di A; messaggio "Segnalazione #1 salvata" | |
| 4 | B guarda la stessa pagina senza ricaricare | Il pin di A compare entro ~1 s | |
| 5 | B preme C e clicca lo stesso titolo | Il composer mostra "Già segnalato qui" con la #1; B mette +1 | |
| 6 | A apre un menu a tendina, preme C (senza muovere il mouse), clicca una voce | Lo screenshot nel thread mostra il menu aperto | |
| 7 | A copia un frame in Figma e lo incolla (Cmd+V) nel composer | Miniatura dell'immagine; salvata come allegato | |
| 8 | A clicca Mobile nella barra | Finestra 375 px con il tool già attivo; pin desktop nascosti, visibili con "Tutte le viewport" | |
| 9 | Sviluppatore apre la board, filtra per viewport, apre la #1, la mette "In lavorazione" e risponde | A vede il cambio di stato e la risposta live nel thread | |
| 10 | Dalla board, "Apri nel sito" → clic su Revisiona | Il tool scorre al pin e lo fa pulsare | |
| 11 | Si modifica il tema in modo che l'elemento della #1 sparisca, poi si ricarica | Il pin resta, tratteggiato, con "Elemento spostato o rimosso" | |
| 12 | Dopo 10 minuti si apre il Google Doc del sito | Blocchi #1… con stato aggiornato, risposte, screenshot e allegati | |

## Review Focus
| # | Passi | Esito atteso | ✅/❌ |
|---|---|---|---|
| R1 | In modalità Commenta clicca i pulsanti della barra | Nessuna segnalazione creata | |
| R2 | Su una pagina prodotto cambia variante (l'URL cambia senza ricaricare), poi vai a un'altra pagina con un link interno senza ricarica | I pin si aggiornano per la nuova pagina | |
| R3 | Segnala un elemento dell'header fisso e scorri la pagina | Il pin resta sull'header | |
| R4 | Scrivi `<img src=x onerror=alert(1)>` come testo di una segnalazione | Appare come testo nel tool, nella board e nel Doc; nessun alert | |
| R5 | Scrivi una segnalazione, poi da un'altra scheda esci dalla board ("Esci") e torna a salvare | Compare il login; dopo l'accesso la bozza si salva | |
