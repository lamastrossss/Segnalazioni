-- Stage Review — creazione del database (da incollare UNA volta nel SQL Editor di Supabase).
-- Contiene le migrazioni 001-003, senza comandi di transazione: tutto viene salvato.
-- Esito atteso: "Success. No rows returned".
-- Il controllo di sicurezza (supabase/tests/rls-check.sql) va eseguito DOPO, in una query separata.

-- ===== supabase/migrations/001_schema.sql =====
-- Stage Review — 001: tabelle, trigger e viste
create type public.viewport_class as enum ('mobile', 'tablet', 'desktop');
create type public.issue_status as enum ('open', 'in_progress', 'resolved');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  color text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  archive_doc_url text,
  next_issue_number int not null default 1
);

create table public.project_domains (
  domain text primary key check (domain = lower(domain) and length(domain) > 0),
  project_id uuid not null references public.projects (id),
  created_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  number int not null default 0,
  page_path text not null,
  page_url text not null,
  viewport_class public.viewport_class not null,
  viewport_width int not null,
  browser text not null default '',
  anchor jsonb not null,
  body text not null,
  status public.issue_status not null default 'open',
  author_id uuid not null references public.profiles (id) default auth.uid(),
  screenshot_path text,
  screenshot_bytes int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id),
  unique (project_id, number)
);
create index issues_project_idx on public.issues (project_id, updated_at);
create index issues_sync_idx on public.issues (updated_at, id);

create table public.replies (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id),
  author_id uuid not null references public.profiles (id) default auth.uid(),
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index replies_issue_idx on public.replies (issue_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id),
  reply_id uuid references public.replies (id),
  path text not null,
  width int not null default 0,
  height int not null default 0,
  bytes int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index attachments_issue_idx on public.attachments (issue_id);

create table public.plus_ones (
  issue_id uuid not null references public.issues (id),
  user_id uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create table public.archive_status (
  id int primary key check (id = 1),
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text
);
insert into public.archive_status (id) values (1);

-- Accesso riservato allo studio: email @thewavestudio.it CONFERMATA (verificata su auth.users,
-- così resta sicuro anche se "Confirm email" venisse disattivato nel pannello).
create function public.is_studio() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and u.email_confirmed_at is not null
       and lower(u.email) like '%@thewavestudio.it'
  )
$$;

-- Profilo creato alla registrazione, con un colore dalla palette
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare palette text[] := array['#E4572E','#2E86AB','#A23B72','#3B8B5A','#F18F01','#6C5B7B','#C73E1D','#1B998B'];
begin
  insert into public.profiles (id, name, color)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
          palette[1 + abs(hashtext(new.id::text)) % 8]);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Numero progressivo per sito
create function public.assign_issue_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.projects set next_issue_number = next_issue_number + 1
   where id = new.project_id
  returning next_issue_number - 1 into new.number;
  if new.number is null then
    raise exception using errcode = 'SR002', message = 'progetto inesistente';
  end if;
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  return new;
end $$;
create trigger issues_assign_number before insert on public.issues
  for each row execute function public.assign_issue_number();

-- Regole di modifica delle segnalazioni: eliminazione morbida solo dell'autore,
-- nessun ripristino, campi identitari immutabili. updated_at sempre aggiornato.
create function public.guard_issue_update() returns trigger
language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id or new.project_id is distinct from old.project_id
     or new.number is distinct from old.number or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'SR001', message = 'campi non modificabili';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null then
      raise exception using errcode = 'SR001', message = 'una segnalazione eliminata non si ripristina';
    end if;
    if auth.uid() is distinct from old.author_id then
      raise exception using errcode = 'SR001', message = 'solo l''autore può eliminare';
    end if;
    new.deleted_by := auth.uid();
  elsif new.deleted_by is distinct from old.deleted_by then
    raise exception using errcode = 'SR001', message = 'campi non modificabili';
  end if;
  -- strettamente crescente: l'archivio usa updated_at come segnaposto
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;
create trigger issues_guard before update on public.issues
  for each row execute function public.guard_issue_update();

-- Risposte e allegati: si può cambiare solo deleted_at, solo dall'autore, senza ripristino
create function public.guard_child_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if tg_table_name = 'replies' then
    if new is distinct from old and (new.body, new.author_id, new.issue_id, new.created_at)
       is distinct from (old.body, old.author_id, old.issue_id, old.created_at) then
      raise exception using errcode = 'SR001', message = 'campi non modificabili';
    end if;
    owner := old.author_id;
  else
    if (new.path, new.issue_id, new.reply_id, new.bytes, new.created_at)
       is distinct from (old.path, old.issue_id, old.reply_id, old.bytes, old.created_at) then
      raise exception using errcode = 'SR001', message = 'campi non modificabili';
    end if;
    if old.reply_id is not null then
      select author_id into owner from public.replies where id = old.reply_id;
    else
      select author_id into owner from public.issues where id = old.issue_id;
    end if;
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null then
      raise exception using errcode = 'SR001', message = 'non si ripristina';
    end if;
    if auth.uid() is distinct from owner then
      raise exception using errcode = 'SR001', message = 'solo l''autore può eliminare';
    end if;
  end if;
  return new;
end $$;
create trigger replies_guard before update on public.replies
  for each row execute function public.guard_child_update();
create trigger attachments_guard before update on public.attachments
  for each row execute function public.guard_child_update();

-- Ogni modifica di risposte, allegati e +1 "tocca" la segnalazione madre
create function public.touch_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.issues set updated_at = updated_at  -- issues_guard lo fa avanzare
   where id = coalesce(new.issue_id, old.issue_id);
  return null;
end $$;
create trigger replies_touch after insert or update or delete on public.replies
  for each row execute function public.touch_issue();
create trigger attachments_touch after insert or update or delete on public.attachments
  for each row execute function public.touch_issue();
create trigger plus_ones_touch after insert or update or delete on public.plus_ones
  for each row execute function public.touch_issue();

-- Riepiloghi (rispettano le regole di chi legge)
create view public.project_summary with (security_invoker = true) as
select p.id, p.name, p.archive_doc_url,
  coalesce((select array_agg(d.domain order by d.domain) from public.project_domains d where d.project_id = p.id), '{}') as domains,
  count(i.id) filter (where i.deleted_at is null and i.status = 'open') as open,
  count(i.id) filter (where i.deleted_at is null and i.status = 'in_progress') as in_progress,
  count(i.id) filter (where i.deleted_at is null and i.status = 'resolved') as resolved,
  max(i.updated_at) as last_activity,
  coalesce(sum(i.screenshot_bytes), 0)
    + coalesce((select sum(a.bytes) from public.attachments a join public.issues ii on ii.id = a.issue_id
                 where ii.project_id = p.id), 0) as bytes
from public.projects p
left join public.issues i on i.project_id = p.id
group by p.id;

create function public.total_usage_bytes() returns bigint
language sql stable as $$
  select coalesce((select sum(screenshot_bytes) from public.issues), 0)
       + coalesce((select sum(bytes) from public.attachments), 0)
$$;

-- ===== supabase/migrations/002_rls.sql =====
-- Stage Review — 002: permessi e Row Level Security
-- Nessun accesso per anon; per gli utenti autenticati niente DELETE (tranne il proprio +1).
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.profiles, public.projects, public.project_domains, public.issues,
  public.replies, public.attachments, public.plus_ones, public.archive_status,
  public.project_summary to authenticated;
grant insert on public.projects, public.project_domains, public.issues, public.replies,
  public.attachments, public.plus_ones to authenticated;
grant update on public.profiles, public.projects, public.issues, public.replies,
  public.attachments to authenticated;
grant delete on public.plus_ones to authenticated;
revoke execute on function public.total_usage_bytes() from anon;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_domains enable row level security;
alter table public.issues enable row level security;
alter table public.replies enable row level security;
alter table public.attachments enable row level security;
alter table public.plus_ones enable row level security;
alter table public.archive_status enable row level security;

create policy profiles_select on public.profiles for select to authenticated using ((select public.is_studio()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_studio()) and id = auth.uid()) with check (id = auth.uid());

create policy projects_select on public.projects for select to authenticated using ((select public.is_studio()));
create policy projects_insert on public.projects for insert to authenticated with check ((select public.is_studio()));
create policy projects_update on public.projects for update to authenticated
  using ((select public.is_studio())) with check ((select public.is_studio()));

create policy domains_select on public.project_domains for select to authenticated using ((select public.is_studio()));
create policy domains_insert on public.project_domains for insert to authenticated with check ((select public.is_studio()));

create policy issues_select on public.issues for select to authenticated using ((select public.is_studio()));
create policy issues_insert on public.issues for insert to authenticated
  with check ((select public.is_studio()) and author_id = auth.uid());
create policy issues_update on public.issues for update to authenticated
  using ((select public.is_studio())) with check ((select public.is_studio()));

create policy replies_select on public.replies for select to authenticated using ((select public.is_studio()));
create policy replies_insert on public.replies for insert to authenticated
  with check ((select public.is_studio()) and author_id = auth.uid());
create policy replies_update on public.replies for update to authenticated
  using ((select public.is_studio())) with check ((select public.is_studio()));

create policy attachments_select on public.attachments for select to authenticated using ((select public.is_studio()));
create policy attachments_insert on public.attachments for insert to authenticated with check ((select public.is_studio()));
create policy attachments_update on public.attachments for update to authenticated
  using ((select public.is_studio())) with check ((select public.is_studio()));

create policy plus_ones_select on public.plus_ones for select to authenticated using ((select public.is_studio()));
create policy plus_ones_insert on public.plus_ones for insert to authenticated
  with check ((select public.is_studio()) and user_id = auth.uid());
create policy plus_ones_delete on public.plus_ones for delete to authenticated
  using ((select public.is_studio()) and user_id = auth.uid());

create policy archive_status_select on public.archive_status for select to authenticated using ((select public.is_studio()));

-- ===== supabase/migrations/003_storage_realtime.sql =====
-- Stage Review — 003: bucket privato per immagini e realtime
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 3145728, array['image/jpeg', 'image/gif'])
on conflict (id) do nothing;

-- Lettura e caricamento solo per lo studio; nessuna modifica né cancellazione
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_studio()));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_studio()));

alter publication supabase_realtime add table public.issues;
