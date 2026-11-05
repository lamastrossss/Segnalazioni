import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('nomi.sql', () => {
  it('imposta il nome dalle email indicate e mostra l\'elenco', async () => {
    const db = new PGlite();
    await db.exec(read('tests/db/supabase-shim.sql'));
    await db.exec(read('supabase/setup-database.sql'));
    await db.exec(`insert into auth.users (id, email, email_confirmed_at) values
      ('00000000-0000-4000-8000-0000000000a1', 'Alessandra.Mastroeni@thewavestudio.it', now()),
      ('00000000-0000-4000-8000-0000000000b2', 'marco@thewavestudio.it', now())`);
    const res = await db.exec(read('supabase/manutenzione/nomi.sql'));
    expect(res.at(-1)!.rows).toEqual([
      { email: 'Alessandra.Mastroeni@thewavestudio.it', nome: 'Alessandra Mastroeni' },
      { email: 'marco@thewavestudio.it', nome: 'marco' },
    ]);
  }, 30_000);
});
