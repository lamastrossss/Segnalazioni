import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

async function freshDb() {
  const db = new PGlite();
  await db.exec(read('tests/db/supabase-shim.sql'));
  for (const m of ['001_schema.sql', '002_rls.sql', '003_storage_realtime.sql']) {
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
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-4000-8000-000000000001', 'c@thewavestudio.it', '{"name":"Chiara"}')`);
    const r = await db.query<{ name: string; color: string }>('select name, color from public.profiles');
    expect(r.rows[0].name).toBe('Chiara');
    expect(r.rows[0].color).toMatch(/^#[0-9A-F]{6}$/i);
  }, 30_000);
});
