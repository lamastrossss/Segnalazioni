import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('setup-database.sql', () => {
  it('non contiene comandi di transazione (il SQL Editor esegue tutto in un unico blocco)', () => {
    expect(read('supabase/setup-database.sql')).not.toMatch(/^\s*(begin|rollback|commit)\s*;/im);
  });
  it('crea il database e poi rls-check risponde RLS OK', async () => {
    const db = new PGlite();
    await db.exec(read('tests/db/supabase-shim.sql'));
    await db.exec(read('supabase/setup-database.sql'));
    const res = await db.exec(read('supabase/tests/rls-check.sql'));
    expect(res.at(-1)!.rows[0]).toEqual({ esito: 'RLS OK' });
  }, 30_000);
});
