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

-- Accesso riservato allo studio
create function public.is_studio() returns boolean
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) like '%@thewavestudio.it'
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
