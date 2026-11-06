import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const as = (id: string, email: string) => `set role authenticated; set request.jwt.claims = '{"sub":"${id}","email":"${email}"}';`;

async function db() {
  const d = new PGlite();
  await d.exec(read('tests/db/supabase-shim.sql'));
  await d.exec(read('supabase/setup-database.sql'));
  await d.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${A}', 'a@thewavestudio.it', now()), ('${B}', 'b@thewavestudio.it', now());
    insert into public.projects (id, name) values ('00000000-0000-4000-8000-0000000000f1', 'Rica');
    insert into public.issues (id, project_id, page_path, page_url, viewport_class, viewport_width, anchor, body, author_id)
      values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1', '/', 'https://x/', 'mobile', 375, '{}', 'testo', '${A}');
  `);
  return d;
}

describe('modifica di una segnalazione', () => {
  it('l\'autore modifica il testo e viene segnata la data di modifica', async () => {
    const d = await db();
    await d.exec(as(A, 'a@thewavestudio.it') + ` update public.issues set body = 'testo corretto';`);
    await d.exec('reset role;');
    const r = await d.query<{ body: string; edited_at: string | null }>('select body, edited_at from public.issues');
    expect(r.rows[0].body).toBe('testo corretto');
    expect(r.rows[0].edited_at).not.toBeNull();
  }, 30_000);

  it('un collega non può modificare il testo, ma può cambiare lo stato (senza segnarla come modificata)', async () => {
    const d = await db();
    await expect(d.exec(as(B, 'b@thewavestudio.it') + ` update public.issues set body = 'non mio';`)).rejects.toThrow(/solo l'autore può modificare/);
    await d.exec('reset role;');
    await d.exec(as(B, 'b@thewavestudio.it') + ` update public.issues set status = 'resolved';`);
    await d.exec('reset role;');
    const r = await d.query<{ body: string; status: string; edited_at: string | null }>('select body, status, edited_at from public.issues');
    expect(r.rows[0]).toEqual({ body: 'testo', status: 'resolved', edited_at: null });
  }, 30_000);

  it('edited_at non si può impostare a mano', async () => {
    const d = await db();
    await d.exec(as(A, 'a@thewavestudio.it') + ` update public.issues set edited_at = '2020-01-01';`);
    await d.exec('reset role;');
    expect((await d.query<{ edited_at: string | null }>('select edited_at from public.issues')).rows[0].edited_at).toBeNull();
  }, 30_000);
});
