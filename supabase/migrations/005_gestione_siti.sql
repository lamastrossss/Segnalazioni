-- Stage Review — 005: eliminare i siti (in modo recuperabile) e modificare gli stage collegati.

-- Eliminazione "morbida": il sito sparisce da board e tool, i dati restano per un eventuale recupero.
alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists deleted_domains text[];

create or replace function public.delete_project(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_studio() then
    raise exception using errcode = '42501', message = 'Non hai i permessi per eliminare questo sito.';
  end if;
  update public.projects
     set deleted_at = now(),
         deleted_domains = coalesce((select array_agg(domain order by domain) from public.project_domains where project_id = p_id), '{}')
   where id = p_id and deleted_at is null;
  -- lo stage si libera: si può ricollegare subito a un altro sito
  delete from public.project_domains where project_id = p_id;
end $$;
revoke execute on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;

-- Stage collegati: lo studio può toglierli (per sostituirli o correggerli)
grant delete on public.project_domains to authenticated;
drop policy if exists domains_delete on public.project_domains;
create policy domains_delete on public.project_domains for delete to authenticated using ((select public.is_studio()));

-- I siti eliminati non compaiono più nei riepiloghi della board
create or replace view public.project_summary with (security_invoker = true) as
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
where p.deleted_at is null
group by p.id;
