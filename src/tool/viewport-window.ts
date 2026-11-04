import type { ViewportClass } from '../shared/types';
import { VIEWPORT_PRESETS } from '../shared/viewport';

const FIT_ATTEMPTS = 5;
const FIT_INTERVAL_MS = 150;

export function nextResizeDelta(targetInnerWidth: number, currentInnerWidth: number): number {
  const d = targetInnerWidth - currentInnerWidth;
  return Math.abs(d) <= 1 ? 0 : d;
}

const POLL_MS = 500;
const pollers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Apre la pagina corrente in una finestra della viewport scelta e vi avvia il tool.
 * La finestra è sorvegliata: dopo ogni navigazione (link cliccato, nuovo clic su Mobile…)
 * il tool viene reiniettato, perché nelle finestre popup non c'è la barra dei preferiti.
 */
export function openViewportWindow(win: Window, presetId: ViewportClass, toolSrc: string): Window | null {
  const p = VIEWPORT_PRESETS.find(x => x.id === presetId)!;
  const name = `sr-${p.id}`;
  const popup = win.open(win.location.href, name, `width=${p.width},height=${p.height}`);
  if (!popup) return null;

  const fit = (attempt: number) => {
    if (attempt >= FIT_ATTEMPTS || popup.closed) return;
    const d = nextResizeDelta(p.width, popup.innerWidth);
    if (!d) return;
    popup.resizeBy(d, 0);
    setTimeout(() => fit(attempt + 1), FIT_INTERVAL_MS);
  };
  const injected = new WeakSet<Document>();
  const check = () => {
    if (popup.closed) { clearInterval(pollers.get(name)); pollers.delete(name); return; }
    try {
      const doc = popup.document;
      if (injected.has(doc) || doc.readyState !== 'complete' || popup.location.href === 'about:blank') return;
      injected.add(doc);
      const pw = popup as Window & { __stageReview?: unknown; __stageReviewLoading?: boolean };
      if (pw.__stageReview || pw.__stageReviewLoading) return;
      pw.__stageReviewLoading = true;
      const s = doc.createElement('script');
      s.src = `${toolSrc}?v=${Date.now()}`;
      doc.documentElement.append(s);
      fit(0);
    } catch { /* pagina di un altro dominio: niente tool in questa finestra */ }
  };
  clearInterval(pollers.get(name));
  pollers.set(name, setInterval(check, POLL_MS));
  return popup;
}
