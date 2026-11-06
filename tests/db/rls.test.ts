import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

async function freshDb() {
  const db = new PGlite();
  await db.exec(read('tests/db/supabase-shim.sql'));
  for (const m of ['001_schema.sql', '002_rls.sql', '003_storage_realtime.sql', '004_utenti_eliminabili.sql', '005_gestione_siti.sql', '006_modifica_segnalazioni.sql']) {
    await db.exec(read(`supabase/migrations/${m}`));
  }
  return db;
}

describe('database Supabase', () => {
  it('rls-check.sql termina con RLS OK', async () => {
    const db = await freshDb();
    const results = await db.exec(read('supabase/tests/rls-check.sql'));
    expect(results.at(-1)!.rows[0]).toEqual({ esito: 'RLS OK' });
  }, 30_000);

  it('la registrazione crea il profilo con nome e colore', async () => {
    const db = await freshDb();
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
      ('00000000-0000-4000-8000-000000000001', 'c@thewavestudio.it', '{"name":"Chiara"}', now())`);
    const r = await db.query<{ name: string; color: string }>('select name, color from public.profiles');
    expect(r.rows[0].name).toBe('Chiara');
    expect(r.rows[0].color).toMatch(/^#[0-9A-F]{6}$/i);
  }, 30_000);

  it('si può eliminare un utente che ha creato siti e segnalazioni: restano con il suo nome', async () => {
    const db = await freshDb();
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
        ('00000000-0000-4000-8000-0000000000a1', 'ale@thewavestudio.it', '{"name":"Alessandra"}', now());
      insert into public.projects (id, name, created_by) values ('00000000-0000-4000-8000-0000000000f1', 'Rica', '00000000-0000-4000-8000-0000000000a1');
      insert into public.issues (project_id, page_path, page_url, viewport_class, viewport_width, anchor, body, author_id)
        values ('00000000-0000-4000-8000-0000000000f1', '/', 'https://x/', 'mobile', 375, '{}', 'uno', '00000000-0000-4000-8000-0000000000a1');
      insert into public.replies (issue_id, body, author_id) select id, 'risposta', author_id from public.issues;
      delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
    `);
    const r = await db.query<{ body: string; name: string }>(
      'select i.body, p.name from public.issues i join public.profiles p on p.id = i.author_id');
    expect(r.rows).toEqual([{ body: 'uno', name: 'Alessandra' }]);
  }, 30_000);
});
