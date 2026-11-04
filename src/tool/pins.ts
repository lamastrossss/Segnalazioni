import type { Issue, Profile } from '../shared/types';
import { VIEWPORT_LABEL } from '../shared/viewport';
import { el } from '../shared/dom';
import { anchorPoint, isHidden, resolveAnchor, type ResolvedAnchor } from './anchor';
import { initials } from './toolbar';

interface PinItem { issue: Issue; muted: boolean; resolved: ResolvedAnchor; node: HTMLButtonElement }

const MUTATION_THROTTLE_MS = 100;
const FOCUS_MS = 2000;

export function createPinLayer(
  shadow: ShadowRoot, win: Window, profilesById: Map<string, Profile>, onOpen: (issueId: string) => void,
) {
  const layer = el('div', { class: 'sr sr-pins', attrs: { 'aria-label': 'Segnalazioni sulla pagina' } });
  shadow.append(layer);
  let items: PinItem[] = [];
  let frame = 0;
  let mutationTimer: ReturnType<typeof setTimeout> | undefined;

  const raf = (fn: () => void) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : (win.setTimeout(fn, 16) as unknown as number));

  function position() {
    frame = 0;
    for (const it of items) {
      const p = anchorPoint(it.issue.anchor, it.resolved, win);
      it.node.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      const hidden = isHidden(it.resolved);
      if (hidden !== it.node.classList.contains('sr-hidden-el')) {
        it.node.classList.toggle('sr-hidden-el', hidden);
        it.node.title = titleFor(it);
      }
    }
  }
  const schedule = () => { if (!frame) frame = raf(position); };

  function resolveAll() {
    for (const it of items) {
      it.resolved = resolveAnchor(it.issue.anchor, win.document);
      it.node.classList.toggle('sr-moved', it.resolved.moved);
      it.node.title = titleFor(it);
    }
    position();
  }

  function titleFor(it: Pick<PinItem, 'issue' | 'muted' | 'resolved'>): string {
    const author = profilesById.get(it.issue.author_id)?.name ?? '';
    const parts = [`#${it.issue.number}`, author, it.issue.body.slice(0, 80)];
    if (it.muted) parts.push(`${VIEWPORT_LABEL[it.issue.viewport_class]} ${it.issue.viewport_width}`);
    if (it.resolved.moved) parts.push('Elemento spostato o rimosso');
    else if (isHidden(it.resolved)) parts.push('Elemento non visibile ora (es. menu chiuso)');
    return parts.filter(Boolean).join(' · ');
  }

  const observer = new ((win as Window & typeof globalThis).MutationObserver)(() => {
    if (mutationTimer) return;
    mutationTimer = setTimeout(() => { mutationTimer = undefined; resolveAll(); }, MUTATION_THROTTLE_MS);
  });
  if (win.document.body) observer.observe(win.document.body, { childList: true, subtree: true, characterData: true, attributes: true });
  win.addEventListener('scroll', schedule, true);
  win.addEventListener('resize', schedule);

  return {
    render(next: { issue: Issue; muted: boolean }[]) {
      layer.replaceChildren();
      items = next.map(({ issue, muted }) => {
        const author = profilesById.get(issue.author_id);
        const resolved = resolveAnchor(issue.anchor, win.document);
        const node = el('button', {
          class: 'sr-pin', text: initials(author?.name ?? '?'),
          attrs: { type: 'button', 'data-issue': issue.id },
          on: { click: () => onOpen(issue.id) },
        });
        node.style.background = author?.color ?? '#555555';
        node.classList.toggle('sr-moved', resolved.moved);
        node.classList.toggle('sr-muted-pin', muted);
        node.classList.toggle('sr-resolved', issue.status === 'resolved');
        const item = { issue, muted, resolved, node };
        node.title = titleFor(item);
        node.setAttribute('aria-label', node.title);
        layer.append(node);
        return item;
      });
      position();
    },
    focus(issueId: string): boolean {
      const it = items.find(i => i.issue.id === issueId);
      if (!it) return false;
      const p = anchorPoint(it.issue.anchor, it.resolved, win);
      win.scrollBy({ top: p.y - win.innerHeight / 2, behavior: 'smooth' });
      it.node.classList.remove('sr-focus');
      void it.node.offsetWidth;
      it.node.classList.add('sr-focus');
      setTimeout(() => it.node.classList.remove('sr-focus'), FOCUS_MS);
      return true;
    },
    destroy() {
      observer.disconnect();
      clearTimeout(mutationTimer);
      win.removeEventListener('scroll', schedule, true);
      win.removeEventListener('resize', schedule);
      layer.remove();
    },
  };
}
export type PinLayer = ReturnType<typeof createPinLayer>;
