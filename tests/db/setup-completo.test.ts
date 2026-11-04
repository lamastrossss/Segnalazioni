import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('setup-completo.sql', () => {
  it('applicato in un colpo solo risponde RLS OK', async () => {
    const root = join(__dirname, '..', '..');
    const db = new PGlite();
    await db.exec(readFileSync(join(root, 'tests/db/supabase-shim.sql'), 'utf8'));
    const res = await db.exec(readFileSync(join(root, 'supabase/setup-completo.sql'), 'utf8'));
    expect(res.at(-1)!.rows[0]).toEqual({ esito: 'RLS OK' });
  }, 30_000);
});
