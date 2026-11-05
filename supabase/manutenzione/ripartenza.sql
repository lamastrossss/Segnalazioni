-- Stage Review — RIPARTENZA DA ZERO. Da eseguire nel SQL Editor di Supabase. IRREVERSIBILE.
-- Cancella tutte le segnalazioni con risposte, allegati e +1.
-- I siti (nome e stage collegati) restano e la numerazione riparte da #1.
-- Gli utenti non vengono toccati: quelli di prova si eliminano poi da Authentication → Users.
-- Le immagini nello Storage vanno cancellate a parte (Storage → media).

-- 004: profili indipendenti dagli account (così gli utenti di prova si possono eliminare)
alter table public.profiles drop constraint if exists profiles_id_fkey;

delete from public.attachments;
delete from public.plus_ones;
delete from public.replies;
delete from public.issues;
update public.projects set next_issue_number = 1, archive_doc_url = null, created_by = null;
update public.archive_status set last_run_at = null, last_ok_at = null, last_error = null;
-- profili rimasti senza account (utenti già eliminati)
delete from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id);

select (select count(*) from public.issues)::int as segnalazioni,
       (select count(*) from public.replies)::int as risposte,
       (select count(*) from public.attachments)::int as allegati,
       (select count(*) from public.projects)::int as siti;
