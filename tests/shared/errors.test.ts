import { describe, it, expect } from 'vitest';
import { classifyError, ERROR_TEXT } from '../../src/shared/errors';

describe('classifyError', () => {
  it('rete assente con server irraggiungibile → unreachable', async () => {
    expect((await classifyError(new TypeError('Failed to fetch'), async () => false)).kind).toBe('unreachable');
  });
  it('rete assente con server raggiungibile → offline', async () => {
    expect((await classifyError({ message: 'TypeError: Failed to fetch' }, async () => true)).kind).toBe('offline');
  });
  it('browser offline → offline senza sondare', async () => {
    const orig = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect((await classifyError(new TypeError('Failed to fetch'), async () => { throw new Error('non chiamare'); })).kind).toBe('offline');
    if (orig) Object.defineProperty(navigator, 'onLine', orig);
    else delete (navigator as { onLine?: boolean }).onLine;
  });
  it('401 o JWT scaduto → auth', async () => {
    expect((await classifyError({ status: 401 })).kind).toBe('auth');
    expect((await classifyError({ code: 'PGRST301', message: 'JWT expired' })).kind).toBe('auth');
  });
  it('403, 42501 e regole del database → forbidden', async () => {
    expect((await classifyError({ status: 403 })).kind).toBe('forbidden');
    expect((await classifyError({ code: '42501' })).kind).toBe('forbidden');
    expect((await classifyError({ code: 'SR001', message: 'solo l\'autore può eliminare' })).kind).toBe('forbidden');
  });
  it('il messaggio di pausa rimanda al pannello Supabase', () => {
    expect(ERROR_TEXT.unreachable).toBe('Supabase non risponde: il database potrebbe essere in pausa. Riattivalo dal pannello Supabase.');
  });
});
