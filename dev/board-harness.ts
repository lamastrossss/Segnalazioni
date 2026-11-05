// Harness visivo dell'intestazione del sito e dei filtri della board (dati finti, nessun login).
import '../src/board/board.css';
import icon from '../board/public/icon.png';
import { el } from '../src/shared/dom';
import { renderSiteHeader } from '../src/board/site-header';
import { renderAuthForm, renderChangePassword } from '../src/shared/auth-ui';
import { TOOL_CSS } from '../src/tool/styles';
import type { Auth } from '../src/shared/auth';
import type { Api } from '../src/shared/api';

const st = document.createElement('style'); st.textContent = TOOL_CSS.replace(':host { all: initial; }', ''); document.head.append(st);
const app = document.getElementById('app')!;
const fakeAuth = { current: async () => null, signIn: async () => ({ ok: false as const, error: { kind: 'auth' as const, message: 'Email o password non corretti.' } }),
  changePassword: async (a: string, b: string) => (a === b ? { ok: true as const, value: undefined } : { ok: false as const, error: { kind: 'unknown' as const, message: 'Le due password non coincidono.' } }), onChange: () => () => {} } as unknown as Auth;
const mode = new URLSearchParams(location.search).get('mode');
app.append(el('header', { class: 'top' }, [
  el('img', { class: 'logo-img', attrs: { src: icon, alt: '', width: '32', height: '32' } }),
  el('h1', { text: 'Stage Review' }),
  el('span', { class: 'muted', text: 'Alessandra Mastroeni' }),
  el('button', { class: 'btn ghost', text: 'Cambia password' }),
  el('button', { class: 'btn ghost', text: 'Esci' }),
]));
app.append(el('p', {}, [el('a', { text: '← Tutti i siti', attrs: { href: '#' } })]));
const api = { renameProject: async () => ({ ok: true as const, value: undefined }) } as unknown as Api;
renderSiteHeader(app, { project: { id: 'p1', name: 'i1pw9r-dv.myshopify.com', archive_doc_url: null, domains: ['i1pw9r-dv.myshopify.com'] }, api, onRenamed: () => {} });
const sel = (label: string, opts: string[]) => el('select', {}, [el('option', { text: label }), ...opts.map(o => el('option', { text: o }))]);
app.append(el('div', { class: 'filters' }, [
  sel('Tutte le pagine', ['/']), sel('Tutte le viewport', ['Mobile', 'Tablet', 'Desktop']),
  sel('Tutti gli stati', ['Aperta', 'In lavorazione', 'Risolta']), sel('Tutti gli autori', ['Alessandra Mastroeni', 'Leonardo']),
]));

if (mode === 'login') { const w = el('div', { class: 'auth-wrap' }); app.replaceChildren(w); void renderAuthForm(w, fakeAuth); }
if (mode === 'password') { const w = el('div', { class: 'auth-wrap' }); app.children[0].after(w); renderChangePassword(w, fakeAuth, () => {}); }
