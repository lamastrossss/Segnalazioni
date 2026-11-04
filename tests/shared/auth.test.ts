import { describe, it, expect } from 'vitest';
import { isStudioEmail, createAuth } from '../../src/shared/auth';
import { createFakeSupabase } from '../helpers/fake-supabase';

describe('auth', () => {
  it('riconosce solo le email dello studio', () => {
    expect(isStudioEmail('Ale@TheWaveStudio.it')).toBe(true);
    expect(isStudioEmail(' ale@thewavestudio.it ')).toBe(true);
    expect(isStudioEmail('ale@gmail.com')).toBe(false);
    expect(isStudioEmail('ale@thewavestudio.it.evil.com')).toBe(false);
  });
  it('rifiuta la registrazione con email esterna senza chiamare Supabase', async () => {
    const fake = createFakeSupabase();
    let called = false;
    fake.on('auth:signUp', () => { called = true; return { data: {}, error: null }; });
    const r = await createAuth(fake.client).signUp('x@gmail.com', 'pw12345678', 'X');
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
  it('registrazione dello studio passa il nome e chiede di controllare l\'email', async () => {
    const fake = createFakeSupabase();
    let args: any;
    fake.on('auth:signUp', c => { args = c.payload; return { data: {}, error: null }; });
    const r = await createAuth(fake.client).signUp('ale@thewavestudio.it', 'pw12345678', 'Alessandra');
    expect(r).toEqual({ ok: true, value: 'check-email' });
    expect(args.options.data).toEqual({ name: 'Alessandra' });
  });
  it('password troppo corta rifiutata', async () => {
    const r = await createAuth(createFakeSupabase().client).signUp('ale@thewavestudio.it', 'corta', 'A');
    expect(r.ok).toBe(false);
  });
  it('login restituisce il profilo', async () => {
    const fake = createFakeSupabase();
    fake.on('profiles:select', () => ({ data: { id: 'u1', name: 'Alessandra', color: '#E4572E' }, error: null }));
    const r = await createAuth(fake.client).signIn('ale@thewavestudio.it', 'pw12345678');
    expect(r).toEqual({ ok: true, value: { id: 'u1', name: 'Alessandra', color: '#E4572E' } });
  });
  it('credenziali errate → messaggio italiano', async () => {
    const fake = createFakeSupabase();
    fake.on('auth:signIn', () => ({ data: null, error: { message: 'Invalid login credentials', status: 400 } }));
    const r = await createAuth(fake.client).signIn('ale@thewavestudio.it', 'sbagliata');
    expect(r.ok === false && r.error.message).toBe('Email o password non corretti.');
  });
});
