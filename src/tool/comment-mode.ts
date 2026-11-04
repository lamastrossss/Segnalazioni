const BLOCKED = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick'] as const;
const CURSOR_STYLE_ID = 'stage-review-cursor';

function isEditable(t: EventTarget | null | undefined): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || el.getAttribute?.('contenteditable') === 'true';
}

/**
 * Modalità Commenta: tasto C per attivarla, Esc per uscire.
 * Da attiva intercetta i clic sul sito (link e pulsanti non scattano) e li passa a onPick.
 */
export function createCommentMode(
  doc: Document,
  isOwnUi: (t: EventTarget | null) => boolean,
  onPick: (el: Element, clientX: number, clientY: number) => void,
  onModeChange: (on: boolean) => void = () => {},
  highlight?: (el: Element | null) => void,
) {
  let on = false;
  const win = doc.defaultView!;

  const block = (e: Event) => {
    if (!on || isOwnUi(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.type === 'click') {
      const me = e as MouseEvent;
      const target = (e.composedPath()[0] ?? e.target) as Element;
      if (target && target.nodeType === 1) onPick(target, me.clientX, me.clientY);
    }
  };
  const move = (e: MouseEvent) => {
    if (!on || !highlight) return;
    highlight(isOwnUi(e.target) ? null : ((e.composedPath()[0] ?? e.target) as Element));
  };
  const keydown = (e: KeyboardEvent) => {
    const real = e.composedPath()[0] ?? e.target;
    if (isEditable(real)) return;
    if (e.key === 'Escape' && on) { set(false); return; }
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); set(!on); }
  };

  function set(next: boolean) {
    if (next === on) return;
    on = next;
    let style = doc.getElementById(CURSOR_STYLE_ID);
    if (on && !style) {
      style = doc.createElement('style');
      style.id = CURSOR_STYLE_ID;
      style.textContent = 'html, html * { cursor: crosshair !important; }';
      doc.head?.append(style);
    } else if (!on) {
      style?.remove();
      highlight?.(null);
    }
    onModeChange(on);
  }

  for (const t of BLOCKED) win.addEventListener(t, block, true);
  win.addEventListener('mousemove', move, true);
  win.addEventListener('keydown', keydown, true);

  return {
    enable: () => set(true),
    disable: () => set(false),
    toggle: () => set(!on),
    isOn: () => on,
    destroy() {
      set(false);
      for (const t of BLOCKED) win.removeEventListener(t, block, true);
      win.removeEventListener('mousemove', move, true);
      win.removeEventListener('keydown', keydown, true);
    },
  };
}
export type CommentMode = ReturnType<typeof createCommentMode>;
