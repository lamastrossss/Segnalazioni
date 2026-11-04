-- Stage Review — verifica delle regole di accesso.
-- Da incollare nel SQL Editor di Supabase DOPO le migrazioni 001-003.
-- Esito atteso: una riga "RLS OK". Qualsiasi "FAIL: ..." indica un problema.
-- Tutti i dati di prova vengono annullati (rollback).
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'a@thewavestudio.it', '{"name":"Test A"}'),
  ('00000000-0000-4000-8000-00000000000b', 'b@thewavestudio.it', '{"name":"Test B"}'),
  ('00000000-0000-4000-8000-0000000000ee', 'x@gmail.com',        '{"name":"Esterno"}');

-- Studio A: crea progetto, dominio, due segnalazioni e un file
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000a","email":"a@thewavestudio.it"}';
do $$
declare p uuid; i1 uuid; n1 int; n2 int;
begin
  insert into public.projects (name) values ('Test RLS') returning id into p;
  insert into public.project_domains (domain, project_id) values ('rls-test.example', p);
  insert into public.issues (project_id, page_path, page_url, viewport_class, viewport_width, anchor, body)
    values (p, '/', 'https://rls-test.example/', 'mobile', 375, '{}', 'uno') returning id, number into i1, n1;
  insert into public.issues (project_id, page_path, page_url, viewport_class, viewport_width, anchor, body)
    values (p, '/', 'https://rls-test.example/', 'desktop', 1440, '{}', 'due') returning number into n2;
  if n1 <> 1 or n2 <> 2 then raise exception 'FAIL: numerazione attesa 1,2 ottenuta %,%', n1, n2; end if;
  insert into storage.objects (bucket_id, name) values ('media', p || '/' || i1 || '/screenshot.jpg');
  perform set_config('sr.project', p::text, true);
  perform set_config('sr.issue', i1::text, true);
end $$;

-- Esterno: non vede e non scrive niente
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000ee","email":"x@gmail.com"}';
do $$
begin
  if (select count(*) from public.issues) <> 0 then raise exception 'FAIL: esterno vede segnalazioni'; end if;
  if (select count(*) from public.projects) <> 0 then raise exception 'FAIL: esterno vede progetti'; end if;
  if (select count(*) from public.profiles) <> 0 then raise exception 'FAIL: esterno vede profili'; end if;
  if (select count(*) from storage.objects where bucket_id = 'media') <> 0 then raise exception 'FAIL: esterno vede file'; end if;
  begin
    insert into public.projects (name) values ('Intruso');
    raise exception 'FAIL: esterno crea progetti';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('media', 'intruso.jpg');
    raise exception 'FAIL: esterno carica file';
  exception when insufficient_privilege then null; end;
end $$;

-- Studio B: può cambiare stato, non può eliminare la segnalazione di A
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000b","email":"b@thewavestudio.it"}';
do $$
declare i uuid := current_setting('sr.issue')::uuid; p uuid := current_setting('sr.project')::uuid;
  n int; before_ts timestamptz; after_ts timestamptz;
begin
  if (select count(*) from public.issues) <> 2 then raise exception 'FAIL: studio non vede le segnalazioni'; end if;
  begin
    update public.issues set deleted_at = now() where id = i;
    raise exception 'FAIL: B ha eliminato la segnalazione di A';
  exception when sqlstate 'SR001' then null; end;
  update public.issues set status = 'in_progress' where id = i;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B non riesce a cambiare stato'; end if;
  select updated_at into before_ts from public.issues where id = i;
  insert into public.replies (issue_id, body) values (i, 'risposta');
  select updated_at into after_ts from public.issues where id = i;
  if not after_ts > before_ts then raise exception 'FAIL: updated_at non aggiornato dalla risposta'; end if;
  insert into public.plus_ones (issue_id, user_id) values (i, auth.uid());
  begin
    insert into public.plus_ones (issue_id, user_id) values (i, '00000000-0000-4000-8000-00000000000a');
    raise exception 'FAIL: +1 a nome di un altro';
  exception when insufficient_privilege then null; end;
  delete from public.plus_ones where issue_id = i and user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B non riesce a togliere il proprio +1'; end if;
end $$;

-- Nessun DELETE vero, per nessuno
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000a","email":"a@thewavestudio.it"}';
do $$
declare n int;
begin
  begin delete from public.issues where body = 'due'; exception when insufficient_privilege then null; end;
  begin delete from public.replies; exception when insufficient_privilege then null; end;
  begin delete from public.projects; exception when insufficient_privilege then null; end;
  delete from storage.objects where bucket_id = 'media';
  if (select count(*) from public.issues) <> 2 then raise exception 'FAIL: segnalazioni cancellate davvero'; end if;
  if (select count(*) from public.replies) <> 1 then raise exception 'FAIL: risposte cancellate davvero'; end if;
  if (select count(*) from storage.objects where bucket_id = 'media') <> 1 then raise exception 'FAIL: file cancellati davvero'; end if;
end $$;

-- A elimina (morbido) la propria; non si può ripristinare
do $$
declare i uuid := current_setting('sr.issue')::uuid; who uuid;
begin
  update public.issues set deleted_at = now() where id = i;
  select deleted_by into who from public.issues where id = i;
  if who is distinct from auth.uid() then raise exception 'FAIL: deleted_by non impostato'; end if;
  begin
    update public.issues set deleted_at = null where id = i;
    raise exception 'FAIL: segnalazione ripristinata';
  exception when sqlstate 'SR001' then null; end;
  begin
    update public.issues set author_id = '00000000-0000-4000-8000-00000000000b' where id = i;
    raise exception 'FAIL: autore modificabile';
  exception when sqlstate 'SR001' then null; end;
end $$;

rollback;
select 'RLS OK' as esito;
