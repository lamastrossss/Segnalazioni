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
  const tb = (text: string, title: string, on: () => void, extra = '') =>
    el('button', { class: `sr-tb ${extra}`, text, attrs: { type: 'button', title, 'aria-pressed': 'false' }, on: { click: on } });

  const comment = tb('Commenta', 'Modalità Commenta (tasto C)', h.onToggleComment, 'sr-primary');
  comment.append(el('span', { class: 'sr-kbd', text: 'C' }));
  const vpButtons = VIEWPORT_PRESETS.map(p => {
    const b = tb(p.label, `Apri in una finestra ${p.width}×${p.height}`, () => h.onViewport(p.id));
    b.dataset.vp = p.id;
    return b;
  });
  const width = el('span', { class: 'sr-width' });
  const all = tb('Tutte le viewport', 'Mostra anche i pin delle altre viewport', h.onToggleAllViewports);
  const resolved = tb('Risolte', 'Mostra anche le segnalazioni risolte', h.onToggleResolved);
  const list = tb('Elenco', 'Segnalazioni di questa pagina', h.onOpenList);
  const avatars = el('div', { class: 'sr-avatars', attrs: { 'aria-label': 'Chi sta revisionando' } });
  const msg = el('div', { class: 'sr sr-msg', attrs: { role: 'status' } });
  msg.hidden = true;
  let msgTimer: ReturnType<typeof setTimeout> | undefined;

  const bar = el('div', { class: 'sr sr-toolbar', attrs: { role: 'toolbar', 'aria-label': 'Stage Review' } }, [
    el('span', { class: 'sr-name', text: projectName, attrs: { title: projectName } }),
    comment, el('span', { class: 'sr-sep' }), ...vpButtons, width, el('span', { class: 'sr-sep' }),
    all, resolved, list, avatars,
    tb('Board', 'Apri la board', h.onOpenBoard),
    tb('×', 'Chiudi Stage Review', h.onClose),
  ]);
  shadow.append(bar, msg);

  return {
    element: bar,
    setCommenting(on: boolean) { comment.setAttribute('aria-pressed', String(on)); },
    setViewport(cls: ViewportClass, w: number) {
      for (const b of vpButtons) b.setAttribute('aria-pressed', String(b.dataset.vp === cls));
      width.textContent = `${VIEWPORT_LABEL[cls]} ${w}px`;
    },
    setToggles(t: { allViewports: boolean; resolved: boolean }) {
      all.setAttribute('aria-pressed', String(t.allViewports));
      resolved.setAttribute('aria-pressed', String(t.resolved));
    },
    setPresence(others: PresenceState[]) {
      avatars.replaceChildren(...others.map(o => el('span', {
        class: 'sr-avatar', text: initials(o.name),
        attrs: { title: `${o.name} · ${o.page_path} · ${VIEWPORT_LABEL[o.viewport_class]}`, style: `background:${o.color}` },
      })));
    },
    setCount(n: number) { list.textContent = `Elenco (${n})`; },
    showMessage(text: string | Node, kind: 'info' | 'error' = 'info', sticky = false) {
      msg.replaceChildren(text);
      msg.className = `sr sr-msg${kind === 'error' ? ' sr-error' : ''}`;
      msg.hidden = false;
      clearTimeout(msgTimer);
      if (!sticky) msgTimer = setTimeout(() => { msg.hidden = true; }, 5000);
    },
    destroy() { clearTimeout(msgTimer); bar.remove(); msg.remove(); },
  };
}
export type Toolbar = ReturnType<typeof createToolbar>;
