import { initBoard } from './common';
import { filterIssues, STATUS_LABEL, type IssueFilters } from './logic';
import { renderDetail } from './detail';
import { renderSiteHeader } from './site-header';
import { el } from '../shared/dom';
import { VIEWPORT_LABEL } from '../shared/viewport';
import type { Issue, IssueStatus, Profile, ViewportClass } from '../shared/types';

const params = new URLSearchParams(location.search);
const projectId = params.get('id') ?? '';
const board = await initBoard('Stage Review');
const { api, main } = board;

const profilesById = new Map<string, Profile>();
const issues = new Map<string, Issue>();
const thumbs = new Map<string, string>();

const projects = await api.listProjects();
const project = projects.ok ? projects.value.find(p => p.id === projectId) : undefined;
if (!project) {
  main.append(el('p', { class: 'error', text: projects.ok ? 'Sito non trovato.' : projects.error.message }), el('a', { text: '← Tutti i siti', attrs: { href: './index.html' } }));
  throw new Error('progetto non trovato');
}
document.title = `${project.name} · Stage Review`;

const filters: IssueFilters = {
  pagePath: params.get('pagina') ?? undefined,
  viewportClass: (params.get('viewport') as ViewportClass) ?? undefined,
  status: (params.get('stato') as IssueStatus) ?? undefined,
  authorId: params.get('autore') ?? undefined,
};

const filterBar = el('div', { class: 'filters' });
const list = el('ul', { class: 'issues' });
main.append(el('p', {}, [el('a', { text: '← Tutti i siti', attrs: { href: './index.html' } })]));
renderSiteHeader(main, { project, api, onRenamed: name => { document.title = `${name} · Stage Review`; } });
main.append(filterBar, list);

const detail = renderDetail(document.body, {
  api, me: board.me, projectId, profilesById, reauth: board.reauth,
  onChanged: id => void refresh(id),
});

function select(label: string, key: string, current: string | undefined, options: [string, string][], set: (v: string | undefined) => void) {
  const s = el('select', { attrs: { 'aria-label': label } }, [el('option', { text: label, attrs: { value: '' } }),
    ...options.map(([v, t]) => { const o = el('option', { text: t, attrs: { value: v } }); o.selected = v === current; return o; })]);
  s.addEventListener('change', () => {
    set(s.value || undefined);
    const q = new URLSearchParams(location.search);
    if (s.value) q.set(key, s.value); else q.delete(key);
    history.replaceState({}, '', `?${q}`);
    renderList();
  });
  return s;
}

function renderFilters() {
  const all = [...issues.values()].filter(i => !i.deleted_at);
  const pages = [...new Set(all.map(i => i.page_path))].sort();
  const authors = [...new Set(all.map(i => i.author_id))];
  filterBar.replaceChildren(
    select('Tutte le pagine', 'pagina', filters.pagePath, pages.map(p => [p, p]), v => { filters.pagePath = v; }),
    select('Tutte le viewport', 'viewport', filters.viewportClass, (Object.keys(VIEWPORT_LABEL) as ViewportClass[]).map(v => [v, VIEWPORT_LABEL[v]]), v => { filters.viewportClass = v as ViewportClass; }),
    select('Tutti gli stati', 'stato', filters.status, (Object.keys(STATUS_LABEL) as IssueStatus[]).map(s => [s, STATUS_LABEL[s]]), v => { filters.status = v as IssueStatus; }),
    select('Tutti gli autori', 'autore', filters.authorId, authors.map(a => [a, profilesById.get(a)?.name ?? 'Utente']), v => { filters.authorId = v; }),
  );
}

function row(i: Issue) {
  const img = el('img', { class: 'thumb', attrs: { alt: '' } });
  if (i.screenshot_path) {
    const cached = thumbs.get(i.screenshot_path);
    if (cached) img.src = cached;
    else void api.signedUrl(i.screenshot_path).then(u => { if (u.ok) { thumbs.set(i.screenshot_path!, u.value); img.src = u.value; } });
  }
  return el('li', {}, [el('button', { class: 'issue', attrs: { type: 'button' }, on: { click: () => void detail.open(i.id) } }, [
    img,
    el('div', {}, [
      el('p', { class: 'title' }, [el('span', { class: 'num', text: `#${i.number}` }), i.body.slice(0, 120)]),
      el('div', { class: 'chips' }, [
        el('span', { class: `chip ${i.status}`, text: STATUS_LABEL[i.status] }),
        el('span', { class: 'chip', text: `${VIEWPORT_LABEL[i.viewport_class]} ${i.viewport_width}` }),
        el('span', { class: 'chip', text: i.page_path }),
      ]),
      el('p', { class: 'muted', text: `${profilesById.get(i.author_id)?.name ?? 'Utente'} · +1: ${i.plus_ones.length} · risposte: ${i.replies_count}` }),
    ]),
  ])]);
}

function renderList() {
  const shown = filterIssues([...issues.values()], filters);
  list.replaceChildren(...(shown.length ? shown.map(row) : [el('li', { class: 'empty', text: 'Nessuna segnalazione con questi filtri.' })]));
}

async function refresh(id: string) {
  const r = await api.getIssue(id);
  if (!r.ok) return;
  const { replies: _r, attachments: _a, ...issue } = r.value;
  issues.set(id, issue);
  renderFilters(); renderList();
}

const [people, list0] = await Promise.all([api.profiles(), api.listIssues(projectId)]);
if (people.ok) for (const p of people.value) profilesById.set(p.id, p);
if (!list0.ok) list.replaceChildren(el('li', { class: 'error', text: list0.error.message }));
else { for (const i of list0.value) issues.set(i.id, i); renderFilters(); renderList(); }

board.live.subscribe(projectId, id => { void refresh(id).then(() => detail.refreshIfIdle(id)); });
const focus = params.get('segnalazione');
if (focus) void detail.open(focus);
