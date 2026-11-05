import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderAuthForm, renderChangePassword } from '../../src/shared/auth-ui';
import { fakeAuth, ME, flush } from '../helpers/fake-deps';

let box: HTMLElement;
beforeEach(() => { box = document.createElement('div'); document.body.replaceChildren(box); });

describe('accesso', () => {
  it('solo accesso: niente registrazione', () => {
    void renderAuthForm(box, fakeAuth());
    expect(box.textContent).not.toContain('Registrati');
    expect(box.querySelector('input[autocomplete="name"]')).toBeNull();
    expect(box.textContent).toContain('Non hai un account? Chiedilo ad Alessandra.');
  });
  it('accede e si chiude', async () => {
    const auth = fakeAuth();
    const p = renderAuthForm(box, auth);
    box.querySelector<HTMLInputElement>('input[type=email]')!.value = 'ale@thewavestudio.it';
    box.querySelector<HTMLInputElement>('input[type=password]')!.value = 'provvisoria1';
    box.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(await p).toEqual(ME);
    expect(box.querySelector('form')).toBeNull();
  });
});

describe('cambia password', () => {
  it('salva e conferma', async () => {
    const auth = fakeAuth();
    const done = vi.fn();
    renderChangePassword(box, auth, done);
    const [a, b] = box.querySelectorAll<HTMLInputElement>('input[type=password]');
    a.value = 'nuova-password-1'; b.value = 'nuova-password-1';
    box.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(auth.changePassword).toHaveBeenCalledWith('nuova-password-1', 'nuova-password-1');
    expect(box.textContent).toContain('Password aggiornata.');
    expect(done).toHaveBeenCalled();
  });
  it('errore: lo mostra e resta aperto', async () => {
    const auth = fakeAuth();
    (auth.changePassword as any).mockResolvedValueOnce({ ok: false, error: { kind: 'unknown', message: 'Le due password non coincidono.' } });
    renderChangePassword(box, auth, vi.fn());
    box.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(box.textContent).toContain('Le due password non coincidono.');
    expect(box.querySelector('form')).not.toBeNull();
  });
  it('Annulla chiude senza salvare', () => {
    const auth = fakeAuth();
    const done = vi.fn();
    renderChangePassword(box, auth, done);
    [...box.querySelectorAll('button')].find(b => b.textContent === 'Annulla')!.click();
    expect(done).toHaveBeenCalled();
    expect(auth.changePassword).not.toHaveBeenCalled();
  });
});
