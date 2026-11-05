import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const A = '00000000-0000-4000-8000-0000000000a1';
const X = '00000000-0000-4000-8000-0000000000e1';
const P = '00000000-0000-4000-8000-0000000000f1';

async function db() {
  const d = new PGlite();
  await d.exec(read('tests/db/supabase-shim.sql'));
  await d.exec(read('supabase/setup-database.sql'));
  await d.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${A}', 'a@thewavestudio.it', now()), ('${X}', 'x@gmail.com', now());
    insert into public.projects (id, name) values ('${P}', 'Rica');
    insert into public.project_domains (domain, project_id) values ('rica.myshopify.com', '${P}');
    insert into public.issues (project_id, page_path, page_url, viewport_class, viewport_width, anchor, body, author_id)
      values ('${P}', '/', 'https://x/', 'mobile', 375, '{}', 'uno', '${A}');
  `);
  return d;
}
const as = (id: string, email: string) =>
  `set role authenticated; set request.jwt.claims = '{"sub":"${id}","email":"${email}"}';`;

describe('gestione siti', () => {
  it('lo studio elimina un sito: sparisce dai riepiloghi, libera lo stage, i dati restano', async () => {
    const d = await db();
    await d.exec(as(A, 'a@thewavestudio.it') + ` select public.delete_project('${P}');`);
    expect((await d.query('select * from public.project_summary')).rows).toHaveLength(0);
    expect((await d.query('select * from public.project_domains')).rows).toHaveLength(0);
    await d.exec('reset role;');
    const p = await d.query<{ deleted_at: string | null; deleted_domains: string[] }>('select deleted_at, deleted_domains from public.projects');
    expect(p.rows[0].deleted_at).not.toBeNull();
    expect(p.rows[0].deleted_domains).toEqual(['rica.myshopify.com']);
    expect((await d.query('select * from public.issues')).rows).toHaveLength(1);
  }, 30_000);

  it('un esterno non può eliminare siti', async () => {
    const d = await db();
    await expect(d.exec(as(X, 'x@gmail.com') + ` select public.delete_project('${P}');`)).rejects.toThrow();
    await d.exec('reset role;');
    expect((await d.query('select deleted_at from public.projects')).rows[0]).toEqual({ deleted_at: null });
  }, 30_000);

  it('lo studio può togliere e aggiungere stage collegati', async () => {
    const d = await db();
    await d.exec(as(A, 'a@thewavestudio.it') + `
      delete from public.project_domains where domain = 'rica.myshopify.com';
      insert into public.project_domains (domain, project_id) values ('rica-2.myshopify.com', '${P}');`);
    await d.exec('reset role;');
    expect((await d.query<{ domain: string }>('select domain from public.project_domains')).rows).toEqual([{ domain: 'rica-2.myshopify.com' }]);
  }, 30_000);

  it('un esterno non può togliere stage', async () => {
    const d = await db();
    await d.exec(as(X, 'x@gmail.com') + ` delete from public.project_domains;`).catch(() => {});
    await d.exec('reset role;');
    expect((await d.query('select * from public.project_domains')).rows).toHaveLength(1);
  }, 30_000);
});
