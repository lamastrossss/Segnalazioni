-- Stage Review — 006: l'autore può modificare il testo di una segnalazione; resta segnata la data di modifica.
alter table public.issues add column if not exists edited_at timestamptz;

create or replace function public.guard_issue_update() returns trigger
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
  -- testo: lo modifica solo l'autore, e la data di modifica la mette il database
  new.edited_at := old.edited_at;
  if new.body is distinct from old.body then
    if auth.uid() is distinct from old.author_id then
      raise exception using errcode = 'SR001', message = 'solo l''autore può modificare il testo';
    end if;
    new.edited_at := clock_timestamp();
  end if;
  -- strettamente crescente: l'archivio usa updated_at come segnaposto
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end $$;
