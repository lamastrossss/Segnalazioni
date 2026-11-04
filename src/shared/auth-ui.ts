import type { Profile } from './types';
import type { Auth } from './auth';
import { el } from './dom';

/** Form di accesso/registrazione. Si risolve con il profilo dopo un accesso riuscito. */
export function renderAuthForm(container: HTMLElement | ShadowRoot, auth: Auth): Promise<Profile> {
  return new Promise(resolve => {
    let mode: 'in' | 'up' = 'in';
    const email = el('input', { attrs: { type: 'email', autocomplete: 'email', required: '' } });
    const password = el('input', { attrs: { type: 'password', autocomplete: 'current-password', required: '' } });
    const name = el('input', { attrs: { type: 'text', autocomplete: 'name' } });
    const nameField = el('label', { class: 'sr-field' }, [el('span', { text: 'Nome' }), name]);
    const message = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });
    const submit = el('button', { class: 'sr-btn', attrs: { type: 'submit' }, text: 'Accedi' });
    const tabIn = el('button', { attrs: { type: 'button', role: 'tab' }, text: 'Accedi' });
    const tabUp = el('button', { attrs: { type: 'button', role: 'tab' }, text: 'Registrati' });

    const setMode = (m: 'in' | 'up') => {
      mode = m;
      tabIn.setAttribute('aria-selected', String(m === 'in'));
      tabUp.setAttribute('aria-selected', String(m === 'up'));
      nameField.hidden = m === 'in';
      password.setAttribute('autocomplete', m === 'in' ? 'current-password' : 'new-password');
      submit.textContent = m === 'in' ? 'Accedi' : 'Crea account';
      message.textContent = '';
    };
    tabIn.addEventListener('click', () => setMode('in'));
    tabUp.addEventListener('click', () => setMode('up'));

    const form = el('form', { class: 'sr sr-panel sr-auth', attrs: { novalidate: '' } }, [
      el('h2', { text: 'Stage Review' }),
      el('div', { class: 'sr-tabs', attrs: { role: 'tablist' } }, [tabIn, tabUp]),
      nameField,
      el('label', { class: 'sr-field' }, [el('span', { text: 'Email dello studio' }), email]),
      el('label', { class: 'sr-field' }, [el('span', { text: 'Password (almeno 8 caratteri)' }), password]),
      message,
      submit,
    ]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      submit.disabled = true;
      message.textContent = '';
      if (mode === 'in') {
        const r = await auth.signIn(email.value, password.value);
        submit.disabled = false;
        if (r.ok) { form.remove(); resolve(r.value); } else message.textContent = r.error.message;
      } else {
        const r = await auth.signUp(email.value, password.value, name.value);
        submit.disabled = false;
        if (r.ok) {
          setMode('in');
          message.textContent = 'Ti abbiamo mandato un’email di conferma: aprila, poi torna qui e accedi.';
        } else message.textContent = r.error.message;
      }
    });
    setMode('in');
    container.append(form);
    email.focus();
  });
}
