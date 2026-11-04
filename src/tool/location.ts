import { pagePathOf } from '../shared/page';

/** Avvisa quando cambia la pagina (pathname), anche nei temi che navigano senza ricaricare. */
export function watchLocation(win: Window, onChange: (url: string) => void): () => void {
  let last = pagePathOf(win.location.href);
  const check = () => {
    const path = pagePathOf(win.location.href);
    if (path !== last) { last = path; onChange(win.location.href); }
  };
  const h = win.history;
  const origPush = h.pushState, origReplace = h.replaceState;
  h.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
    const r = origPush.apply(this, args); check(); return r;
  };
  h.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
    const r = origReplace.apply(this, args); check(); return r;
  };
  win.addEventListener('popstate', check);
  win.addEventListener('hashchange', check);
  const timer = win.setInterval(check, 500);
  return () => {
    h.pushState = origPush; h.replaceState = origReplace;
    win.removeEventListener('popstate', check);
    win.removeEventListener('hashchange', check);
    win.clearInterval(timer);
  };
}
