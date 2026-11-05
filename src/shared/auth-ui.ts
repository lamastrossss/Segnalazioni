import type { Profile } from './types';
import type { Auth } from './auth';
import { el } from './dom';

/** Form di accesso (gli account li crea l'amministratore). Si risolve con il profilo dopo l'accesso. */
export function renderAuthForm(container: HTMLElement | ShadowRoot, auth: Auth): Promise<Profile> {
  return new Promise(resolve => {
    const email = el('input', { attrs: { type: 'email', autocomplete: 'email', required: '' } });
    const password = el('input', { attrs: { type: 'password', autocomplete: 'current-password', required: '' } });
    const message = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });
    const submit = el('button', { class: 'sr-btn', attrs: { type: 'submit' }, text: 'Accedi' });

    const form = el('form', { class: 'sr sr-panel sr-auth', attrs: { novalidate: '' } }, [
      el('h2', { text: 'Accedi a Stage Review' }),
      el('label', { class: 'sr-field' }, [el('span', { text: 'Email dello studio' }), email]),
      el('label', { class: 'sr-field' }, [el('span', { text: 'Password' }), password]),
      message,
      submit,
      el('p', { class: 'sr-muted', text: 'Non hai un account? Chiedilo ad Alessandra.' }),
    ]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      submit.disabled = true;
      message.textContent = '';
      const r = await auth.signIn(email.value, password.value);
      submit.disabled = false;
      if (r.ok) { form.remove(); resolve(r.value); } else message.textContent = r.error.message;
    });
    container.append(form);
    email.focus();
  });
}

/** Pannello "Cambia password" per l'utente collegato. onDone viene chiamato dopo il salvataggio o con Annulla. */
export function renderChangePassword(container: HTMLElement, auth: Auth, onDone: () => void) {
  const pw = el('input', { attrs: { type: 'password', autocomplete: 'new-password' } });
  const confirm = el('input', { attrs: { type: 'password', autocomplete: 'new-password' } });
  const message = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });
  const save = el('button', { class: 'sr-btn', attrs: { type: 'submit' }, text: 'Salva password' });
  const cancel = el('button', { class: 'sr-btn sr-ghost', attrs: { type: 'button' }, text: 'Annulla', on: { click: () => { form.remove(); onDone(); } } });

  const form = el('form', { class: 'sr sr-panel sr-auth sr-change-password', attrs: { novalidate: '' } }, [
    el('h2', { text: 'Cambia password' }),
    el('label', { class: 'sr-field' }, [el('span', { text: 'Nuova password (almeno 8 caratteri)' }), pw]),
    el('label', { class: 'sr-field' }, [el('span', { text: 'Ripeti la nuova password' }), confirm]),
    message,
    el('div', { class: 'sr-row' }, [save, cancel]),
  ]);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    save.disabled = true;
    message.textContent = '';
    const r = await auth.changePassword(pw.value, confirm.value);
    save.disabled = false;
    if (!r.ok) { message.textContent = r.error.message; return; }
    form.replaceChildren(el('h2', { text: 'Cambia password' }), el('p', { text: 'Password aggiornata.' }),
      el('button', { class: 'sr-btn sr-ghost', attrs: { type: 'button' }, text: 'Chiudi', on: { click: () => form.remove() } }));
    onDone();
  });
  container.append(form);
  pw.focus();
}
