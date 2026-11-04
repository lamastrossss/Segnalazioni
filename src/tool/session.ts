import type { Api } from '../shared/api';
import type { Auth } from '../shared/auth';
import type { LiveAdapter } from '../shared/live';
import type { Issue, Profile, Project, ViewportClass } from '../shared/types';
import { classifyViewport, VIEWPORT_LABEL } from '../shared/viewport';
import { pagePathOf, parseFocusHash } from '../shared/page';
import { el } from '../shared/dom';
import { CONFIG } from '../config';
import { createToolbar } from './toolbar';
import { createPinLayer } from './pins';
import { createCommentMode } from './comment-mode';
import { visiblePins } from './pin-logic';
import { watchLocation } from './location';
import { createCapturer } from './capture';
import { createComposer } from './composer';
import { createAnchor, resolveAnchor } from './anchor';
import { findDuplicates } from './pin-logic';
import { renderAuthForm } from '../shared/auth-ui';

export interface SessionCtx {
  win: Window; root: { host: HTMLElement; shadow: ShadowRoot };
  api: Api; auth: Auth; live: LiveAdapter; me: Profile; project: Project; onClose(): void;
}

import { STATUS_LABEL } from '../shared/format';

/** Collega barra, pin, composer e realtime per una pagina dello stage. */
export function createSession(ctx: SessionCtx) {
  const { win, root, project, api } = ctx;
  const shadow = root.shadow;
  const state = {
    viewport: classifyViewport(win.innerWidth) as ViewportClass,
    pagePath: pagePathOf(win.location.href),
    allViewports: false,
    resolved: false,
  };
  const issues = new Map<string, Issue>();
  const profilesById = new Map<string, Profile>([[ctx.me.id, ctx.me]]);
  const cleanups: (() => void)[] = [];
  let listPanel: HTMLElement | null = null;

  const isOwnUi = (t: EventTarget | null) => t === root.host || (t instanceof Node && root.host.contains(t));

  const toolbar = createToolbar(shadow, project.name, {
    onToggleComment: () => mode.toggle(),
    onViewport: () => {},
    onToggleAllViewports: () => { state.allViewports = !state.allViewports; render(); },
    onToggleResolved: () => { state.resolved = !state.resolved; render(); },
    onOpenList: () => toggleList(),
    onOpenBoard: () => { win.open(`${CONFIG.publicBaseUrl}site.html?id=${encodeURIComponent(project.id)}`, '_blank', 'noopener'); },
    onClose: () => ctx.onClose(),
  });
  cleanups.push(() => toolbar.destroy());

  const pins = createPinLayer(shadow, win, profilesById, id => openThread(id));
  cleanups.push(() => pins.destroy());

  const box = el('div', { class: 'sr-highlight' });
  box.hidden = true;
  shadow.append(box);
  const highlight = (target: Element | null) => {
    if (!target) { box.hidden = true; return; }
    const r = target.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.hidden = false;
  };

  let me = ctx.me;
  const capturer = createCapturer(win);
  cleanups.push(() => capturer.stop());

  const mode = createCommentMode(win.document, isOwnUi, (target, x, y) => void onPick(target, x, y), on => {
    toolbar.setCommenting(on);
    if (on) void capturer.start(); // gesto dell'utente: Chrome chiede il permesso una volta per finestra
  }, highlight);
  cleanups.push(() => mode.destroy());

  const composer = createComposer(shadow, {
    api, me: () => me, projectId: project.id, profilesById,
    reauth: async () => { me = await renderAuthForm(shadow, ctx.auth); profilesById.set(me.id, me); return me; },
    onSaved: issue => { issues.set(issue.id, issue); render(); toolbar.showMessage(`Segnalazione #${issue.number} salvata.`); },
    onChanged: id => void refreshIssue(id),
  });
  cleanups.push(() => composer.close());

  function openThread(issueId: string) { void composer.openThread(issueId); }

  async function refreshIssue(id: string) {
    const r = await api.getIssue(id);
    if (!r.ok) return;
    const { replies: _r, attachments: _a, ...issue } = r.value;
    issues.set(id, issue);
    render();
  }

  function cleanPageUrl(): string {
    const u = new URL(win.location.href);
    if (parseFocusHash(u.hash)) u.hash = '';
    return u.toString();
  }

  async function onPick(target: Element, x: number, y: number) {
    mode.disable();
    const shot = await capturer.grab({ hide: root.host, pin: { x, y }, color: me.color });
    const anchor = createAnchor(target, x, y, win);
    const candidates = [...issues.values()]
      .filter(i => i.page_path === state.pagePath && !i.deleted_at)
      .map(issue => ({ issue, resolved: resolveAnchor(issue.anchor, win.document) }));
    composer.openNew({
      anchor, pagePath: state.pagePath, pageUrl: cleanPageUrl(),
      viewportClass: state.viewport, viewportWidth: win.innerWidth, screenshot: shot,
      duplicates: findDuplicates(target, candidates, { pagePath: state.pagePath, viewportClass: state.viewport }),
    });
  }

  function pinCtx() {
    return { pagePath: state.pagePath, viewportClass: state.viewport, showAllViewports: state.allViewports, showResolved: state.resolved };
  }

  function render() {
    const items = visiblePins([...issues.values()], pinCtx());
    pins.render(items);
    toolbar.setCount(items.length);
    toolbar.setViewport(state.viewport, win.innerWidth);
    toolbar.setToggles({ allViewports: state.allViewports, resolved: state.resolved });
    if (listPanel) fillList(items.map(i => i.issue));
  }

  function fillList(list: Issue[]) {
    if (!listPanel) return;
    const rows = list.length
      ? list.map(issue => el('li', { attrs: { 'data-issue': issue.id }, on: { click: () => pins.focus(issue.id) } }, [
          el('strong', { text: `#${issue.number} ` }),
          el('span', { text: issue.body.slice(0, 80) }),
          el('div', { class: 'sr-muted' }, [
            `${profilesById.get(issue.author_id)?.name ?? ''} · `,
            el('span', { class: 'sr-chip', text: STATUS_LABEL[issue.status] }), ' ',
            el('span', { class: 'sr-chip', text: VIEWPORT_LABEL[issue.viewport_class] }),
          ]),
        ]))
      : [el('li', { class: 'sr-muted', text: 'Nessuna segnalazione visibile su questa pagina.' })];
    listPanel.querySelector('ul')!.replaceChildren(...rows);
  }

  function toggleList() {
    if (listPanel) { listPanel.remove(); listPanel = null; return; }
    listPanel = el('div', { class: 'sr sr-panel sr-list-panel' }, [
      el('div', { class: 'sr-row' }, [
        el('h2', { text: 'Segnalazioni della pagina' }),
        el('button', { class: 'sr-btn sr-ghost', text: 'Chiudi', on: { click: () => toggleList() } }),
      ]),
      el('ul', { class: 'sr-list' }),
    ]);
    shadow.append(listPanel);
    render();
  }

  /** Porta in vista una segnalazione, accendendo i filtri se serve. */
  function focusIssue(id: string) {
    if (pins.focus(id)) return true;
    const issue = issues.get(id);
    if (!issue || issue.deleted_at || issue.page_path !== state.pagePath) return false;
    if (issue.viewport_class !== state.viewport) state.allViewports = true;
    if (issue.status === 'resolved') state.resolved = true;
    render();
    return pins.focus(id);
  }

  const onResize = () => {
    const next = classifyViewport(win.innerWidth);
    const changed = next !== state.viewport;
    state.viewport = next;
    if (changed) render(); else toolbar.setViewport(state.viewport, win.innerWidth);
  };
  win.addEventListener('resize', onResize);
  cleanups.push(() => win.removeEventListener('resize', onResize));

  cleanups.push(watchLocation(win, url => { state.pagePath = pagePathOf(url); render(); }));

  const ready = (async () => {
    const [list, people] = await Promise.all([api.listIssues(project.id), api.profiles()]);
    if (people.ok) for (const p of people.value) profilesById.set(p.id, p);
    if (!list.ok) { toolbar.showMessage(list.error.message, 'error', true); return; }
    for (const i of list.value) issues.set(i.id, i);
    render();
    const focusId = parseFocusHash(win.location.hash);
    if (focusId && !focusIssue(focusId)) toolbar.showMessage('La segnalazione indicata non è su questa pagina o è stata eliminata.');
  })();
  render();

  return {
    toolbar, ready, issues, profilesById, state, render, focusIssue, mode, composer, refreshIssue,
    destroy() { for (const c of cleanups.splice(0).reverse()) c(); listPanel?.remove(); box.remove(); },
  };
}
export type Session = ReturnType<typeof createSession>;
