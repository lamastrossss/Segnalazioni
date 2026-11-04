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
