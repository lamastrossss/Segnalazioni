// Harness visivo dell'intestazione del sito e dei filtri della board (dati finti, nessun login).
import '../src/board/board.css';
import icon from '../board/public/icon.png';
import { el } from '../src/shared/dom';
import { renderSiteHeader } from '../src/board/site-header';
import { stageLinks } from '../src/board/stage-links';
import { renderIssueRow } from '../src/board/issue-row';
import type { Issue } from '../src/shared/types';
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
const api = { renameProject: async () => ({ ok: true as const, value: undefined }), deleteProject: async () => ({ ok: true as const, value: undefined }),
  setStages: async (_p: string, _c: string[], i: string[]) => ({ ok: true as const, value: i.filter(Boolean).map(x => x.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()) }) } as unknown as Api;
renderSiteHeader(app, { project: { id: 'p1', name: 'i1pw9r-dv.myshopify.com', archive_doc_url: null, domains: ['i1pw9r-dv.myshopify.com'] }, api, onRenamed: () => {}, onDeleted: () => { alert('eliminato'); } });
const sel = (label: string, opts: string[]) => el('select', {}, [el('option', { text: label }), ...opts.map(o => el('option', { text: o }))]);
app.append(el('div', { class: 'filters' }, [
  sel('Tutte le pagine', ['/']), sel('Tutte le viewport', ['Mobile', 'Tablet', 'Desktop']),
  sel('Tutti gli stati', ['Aperta', 'In lavorazione', 'Risolta']), sel('Tutti gli autori', ['Alessandra Mastroeni', 'Leonardo']),
]));

if (mode === 'login') { const w = el('div', { class: 'auth-wrap' }); app.replaceChildren(w); void renderAuthForm(w, fakeAuth); }
if (mode === 'password') { const w = el('div', { class: 'auth-wrap' }); app.children[0].after(w); renderChangePassword(w, fakeAuth, () => {}); }

app.append(el('div', { class: 'grid', attrs: { style: 'margin-top:24px' } }, [el('article', { class: 'card' }, [
  el('h2', {}, [el('a', { text: 'Rica', attrs: { href: '#' } })]),
  stageLinks(['i1pw9r-dv.myshopify.com']),
  el('div', { class: 'chips' }, [el('span', { class: 'chip open', text: '0 aperta' }), el('span', { class: 'chip in_progress', text: '0 in lavorazione' }), el('span', { class: 'chip resolved', text: '0 risolta' })]),
  el('p', { class: 'muted', text: 'Nessuna attività' }),
  el('div', { class: 'chips' }, [el('a', { class: 'btn', text: 'Apri', attrs: { href: '#' } })]),
])]));

const me = { id: 'u1', name: 'Alessandra Mastroeni', color: '#E4572E' };
const people = new Map([[me.id, me], ['u2', { id: 'u2', name: 'Simona Brancato', color: '#A23B72' }]]);
const base = { project_id: 'p1', page_url: 'https://x/', browser: '', anchor: {} as any, status: 'open' as const, screenshot_path: null, screenshot_bytes: 0,
  created_at: '', updated_at: '', deleted_at: null, deleted_by: null, replies_count: 0 };
const rows: Issue[] = [
  { ...base, id: 'r1', number: 54, page_path: '/pages/loyalty-program', viewport_class: 'mobile', viewport_width: 375, body: 'Aumentare padding superiore della sezione FAQ', author_id: 'u1' },
  { ...base, id: 'r2', number: 55, page_path: '/collections/chromoplus', viewport_class: 'desktop', viewport_width: 1484, body: "Possiamo diminuire l'altezza di questa immagine?", author_id: 'u2' },
];
const ul = el('ul', { class: 'issues', attrs: { style: 'margin-top:24px' } });
const editApi = { editIssue: async (id: string, body: string) => { const r = rows.find(x => x.id === id)!; r.body = body.trim(); r.edited_at = new Date().toISOString(); return { ok: true as const, value: undefined }; } } as unknown as Api;
const draw = () => ul.replaceChildren(...rows.map(r => renderIssueRow(r, { api: editApi, me: () => me, profilesById: people, onOpen: () => {}, onSaved: () => draw(), thumb: async () => null })));
draw();
app.append(ul);
