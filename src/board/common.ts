import { getClient } from '../shared/supabase';
import { createApi } from '../shared/api';
import { createAuth } from '../shared/auth';
import { createLive } from '../shared/live';
import { renderAuthForm } from '../shared/auth-ui';
import { el } from '../shared/dom';
import { TOOL_CSS } from '../tool/styles';
import type { Profile } from '../shared/types';

/** Avvio comune delle pagine della board: client, login, intestazione. */
export async function initBoard(title: string) {
  const app = document.getElementById('app')!;
  const style = document.createElement('style');
  style.textContent = TOOL_CSS.replace(':host { all: initial; }', '');
  document.head.append(style);

  const client = getClient();
  const api = createApi(client);
  const auth = createAuth(client);
  const live = createLive(client);

  const login = async (): Promise<Profile> => {
    const wrap = el('div', { class: 'auth-wrap' });
    app.replaceChildren(wrap);
    return renderAuthForm(wrap, auth);
  };
  let me = (await auth.current()) ?? (await login());

  const header = el('header', { class: 'top' }, [
    el('img', { class: 'logo-img', attrs: { src: './icon.png', alt: '', width: '32', height: '32' } }),
    el('h1', { text: title }),
    el('span', { class: 'muted', text: me.name }),
    el('button', { class: 'btn ghost', text: 'Esci', on: { click: async () => { await client.auth.signOut(); location.reload(); } } }),
  ]);
  const main = el('div');
  app.replaceChildren(header, main);

  return {
    client, api, auth, live, main,
    me: () => me,
    reauth: async () => { const wrap = el('div', { class: 'auth-wrap' }); main.prepend(wrap); me = await renderAuthForm(wrap, auth); wrap.remove(); return me; },
  };
}
