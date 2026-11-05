-- Stage Review — 004: utenti eliminabili senza perdere lo storico.
-- Il profilo (nome e colore) non viene più cancellato insieme all'account: siti, segnalazioni e
-- risposte restano con il nome di chi le ha scritte. L'utente eliminato non può più accedere.
alter table public.profiles drop constraint if exists profiles_id_fkey;
