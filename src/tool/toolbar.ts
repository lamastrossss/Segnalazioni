import type { ViewportClass } from '../shared/types';
import type { PresenceState } from '../shared/live';
import { VIEWPORT_LABEL, VIEWPORT_PRESETS } from '../shared/viewport';
import { el } from '../shared/dom';

export interface ToolbarHandlers {
  onToggleComment(): void; onViewport(id: ViewportClass): void; onToggleAllViewports(): void;
  onToggleResolved(): void; onOpenList(): void; onOpenBoard(): void; onClose(): void;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
}

export function createToolbar(shadow: ShadowRoot, projectName: string, h: ToolbarHandlers) {
  const label = (long: string, short: string) => [el('span', { class: 'sr-long', text: long }), el('span', { class: 'sr-short', text: short })];
  const tb = (content: (Node | string)[], title: string, on: () => void, extra = '') =>
    el('button', { class: `sr-tb ${extra}`, attrs: { type: 'button', title, 'aria-label': title, 'aria-pressed': 'false' }, on: { click: on } }, content);

  const comment = tb([...label('Commenta', '✎'), el('span', { class: 'sr-kbd', text: 'C' })], 'Modalità Commenta (tasto C)', h.onToggleComment, 'sr-primary');
  const vpButtons = VIEWPORT_PRESETS.map(p => {
    const b = tb(label(p.label, p.label[0]!), `Apri in una finestra ${p.label} ${p.width}×${p.height}`, () => h.onViewport(p.id));
    b.dataset.vp = p.id;
    return b;
  });
  const width = el('span', { class: 'sr-width' });
  const list = tb([], 'Segnalazioni di questa pagina', h.onOpenList);
  const avatars = el('div', { class: 'sr-avatars', attrs: { 'aria-label': 'Chi sta revisionando' } });

  const all = tb(['Tutte le viewport'], 'Tutte le viewport', h.onToggleAllViewports, 'sr-pop-item');
  const resolved = tb(['Mostra risolte'], 'Mostra risolte', h.onToggleResolved, 'sr-pop-item');
  const pop = el('div', { class: 'sr sr-pop', attrs: { role: 'group', 'aria-label': 'Filtri' } }, [all, resolved]);
  pop.hidden = true;
  const filters = tb([], 'Filtri', () => { pop.hidden = !pop.hidden; filters.setAttribute('aria-expanded', String(!pop.hidden)); });
  filters.setAttribute('aria-expanded', 'false');
  filters.removeAttribute('aria-pressed');

  const msg = el('div', { class: 'sr sr-msg', attrs: { role: 'status' } });
  msg.hidden = true;
  let msgTimer: ReturnType<typeof setTimeout> | undefined;

  const bar = el('div', { class: 'sr sr-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Stage Review' } }, [
    el('span', { class: 'sr-name', text: projectName, attrs: { title: projectName } }),
    comment, el('span', { class: 'sr-sep' }), ...vpButtons, width, el('span', { class: 'sr-sep' }),
    list, filters, avatars,
    tb(label('Board', '↗'), 'Apri la board', h.onOpenBoard),
    tb(['×'], 'Chiudi Stage Review', h.onClose),
  ]);
  shadow.append(bar, pop, msg);
  let count = 0;
  list.textContent = 'Elenco (0)';
  filters.textContent = 'Filtri';

  return {
    element: bar,
    setCommenting(on: boolean) { comment.setAttribute('aria-pressed', String(on)); },
    setViewport(cls: ViewportClass, w: number) {
      for (const b of vpButtons) b.setAttribute('aria-pressed', String(b.dataset.vp === cls));
      width.textContent = `${w}px`;
      width.title = `${VIEWPORT_LABEL[cls]} ${w}px`;
    },
    setToggles(t: { allViewports: boolean; resolved: boolean }) {
      all.setAttribute('aria-pressed', String(t.allViewports));
      resolved.setAttribute('aria-pressed', String(t.resolved));
      const active = Number(t.allViewports) + Number(t.resolved);
      filters.textContent = active ? `Filtri (${active})` : 'Filtri';
    },
    setPresence(others: PresenceState[]) {
      avatars.replaceChildren(...others.map(o => el('span', {
        class: 'sr-avatar', text: initials(o.name),
        attrs: { title: `${o.name} · ${o.page_path} · ${VIEWPORT_LABEL[o.viewport_class]}`, style: `background:${o.color}` },
      })));
    },
    setCount(n: number) { count = n; list.textContent = `Elenco (${count})`; },
    showMessage(text: string | Node, kind: 'info' | 'error' = 'info', sticky = false) {
      msg.replaceChildren(text);
      msg.className = `sr sr-msg${kind === 'error' ? ' sr-error' : ''}`;
      msg.hidden = false;
      clearTimeout(msgTimer);
      if (!sticky) msgTimer = setTimeout(() => { msg.hidden = true; }, 5000);
    },
    destroy() { clearTimeout(msgTimer); bar.remove(); pop.remove(); msg.remove(); },
  };
}
export type Toolbar = ReturnType<typeof createToolbar>;
