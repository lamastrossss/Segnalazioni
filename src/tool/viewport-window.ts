import type { ViewportClass } from '../shared/types';
import { VIEWPORT_PRESETS } from '../shared/viewport';

const FIT_ATTEMPTS = 5;
const FIT_INTERVAL_MS = 150;

export function nextResizeDelta(targetInnerWidth: number, currentInnerWidth: number): number {
  const d = targetInnerWidth - currentInnerWidth;
  return Math.abs(d) <= 1 ? 0 : d;
}

/** Apre la pagina corrente in una finestra della viewport scelta e vi avvia il tool. */
export function openViewportWindow(win: Window, presetId: ViewportClass, toolSrc: string): Window | null {
  const p = VIEWPORT_PRESETS.find(x => x.id === presetId)!;
  const popup = win.open(win.location.href, `sr-${p.id}`, `width=${p.width},height=${p.height}`);
  if (!popup) return null;

  const fit = (attempt: number) => {
    if (attempt >= FIT_ATTEMPTS) return;
    const d = nextResizeDelta(p.width, popup.innerWidth);
    if (!d) return;
    popup.resizeBy(d, 0);
    setTimeout(() => fit(attempt + 1), FIT_INTERVAL_MS);
  };
  popup.addEventListener('load', () => {
    try {
      const doc = popup.document;
      if (!(popup as Window & { __stageReview?: unknown }).__stageReview) {
        const s = doc.createElement('script');
        s.src = `${toolSrc}?v=${Date.now()}`;
        doc.documentElement.append(s);
      }
    } catch { /* pagina di un altro dominio: l'utente clicca Revisiona a mano */ }
    fit(0);
  });
  return popup;
}
