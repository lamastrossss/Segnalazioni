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
  it('cambia la password', async () => {
    const fake = createFakeSupabase();
    let args: any;
    fake.on('auth:updateUser', c => { args = c.payload; return { data: {}, error: null }; });
    expect(await createAuth(fake.client).changePassword('nuova-password-1', 'nuova-password-1')).toEqual({ ok: true, value: undefined });
    expect(args).toEqual({ password: 'nuova-password-1' });
  });
  it('cambio password: almeno 8 caratteri e le due password uguali', async () => {
    const auth = createAuth(createFakeSupabase().client);
    const short = await auth.changePassword('corta', 'corta');
    expect(short.ok === false && short.error.message).toBe('La password deve avere almeno 8 caratteri.');
    const diff = await auth.changePassword('password-uno', 'password-due');
    expect(diff.ok === false && diff.error.message).toBe('Le due password non coincidono.');
  });
  it('cambio password rifiutato da Supabase: messaggio italiano', async () => {
    const fake = createFakeSupabase();
    fake.on('auth:updateUser', () => ({ data: null, error: { message: 'New password should be different from the old password.', status: 422 } }));
    const r = await createAuth(fake.client).changePassword('stessa-pass', 'stessa-pass');
    expect(r.ok === false && r.error.message).toBe('La nuova password deve essere diversa da quella attuale.');
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
