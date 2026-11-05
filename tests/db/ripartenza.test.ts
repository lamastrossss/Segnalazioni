import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('ripartenza da zero', () => {
  it('cancella segnalazioni, risposte e allegati; tiene i siti e riparte da #1; poi gli utenti di prova si eliminano', async () => {
    const db = new PGlite();
    await db.exec(read('tests/db/supabase-shim.sql'));
    // database com'era prima della 004 (vincolo profili ancora presente)
    for (const m of ['001_schema.sql', '002_rls.sql', '003_storage_realtime.sql']) await db.exec(read(`supabase/migrations/${m}`));
    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
        ('00000000-0000-4000-8000-0000000000a1', 'test@thewavestudio.it', '{"name":"Test"}', now());
      insert into public.projects (id, name, created_by) values ('00000000-0000-4000-8000-0000000000f1', 'Rica', '00000000-0000-4000-8000-0000000000a1');
      insert into public.project_domains (domain, project_id) values ('rica.myshopify.com', '00000000-0000-4000-8000-0000000000f1');
      insert into public.issues (project_id, page_path, page_url, viewport_class, viewport_width, anchor, body, author_id)
        values ('00000000-0000-4000-8000-0000000000f1', '/', 'https://x/', 'mobile', 375, '{}', 'uno', '00000000-0000-4000-8000-0000000000a1'),
               ('00000000-0000-4000-8000-0000000000f1', '/', 'https://x/', 'mobile', 375, '{}', 'due', '00000000-0000-4000-8000-0000000000a1');
      insert into public.replies (issue_id, body, author_id) select id, 'r', author_id from public.issues;
      insert into public.attachments (issue_id, path) select id, 'p/x.jpg' from public.issues;
      insert into public.plus_ones (issue_id, user_id) select id, author_id from public.issues;
      update public.archive_status set last_ok_at = now();
    `);
    const res = await db.exec(read('supabase/manutenzione/ripartenza.sql'));
    expect(res.at(-1)!.rows[0]).toEqual({ segnalazioni: 0, risposte: 0, allegati: 0, siti: 1 });
    const p = await db.query<{ name: string; archive_doc_url: string | null }>('select name, archive_doc_url from public.projects');
    expect(p.rows).toEqual([{ name: 'Rica', archive_doc_url: null }]);
    expect((await db.query('select * from public.project_domains')).rows).toHaveLength(1);
    await db.exec(`insert into public.issues (project_id, page_path, page_url, viewport_class, viewport_width, anchor, body, author_id)
      values ('00000000-0000-4000-8000-0000000000f1', '/', 'https://x/', 'mobile', 375, '{}', 'nuova', '00000000-0000-4000-8000-0000000000a1')`);
    expect((await db.query<{ number: number }>('select number from public.issues')).rows[0].number).toBe(1);
    await db.exec(`delete from public.issues; delete from auth.users where email = 'test@thewavestudio.it';`);
    expect((await db.query('select * from auth.users')).rows).toHaveLength(0);
  }, 30_000);
});
