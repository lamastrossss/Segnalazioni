/**
 * Ricorda i link firmati delle immagini finché sono validi.
 * Riusare lo stesso link permette al browser di non riscaricare l'immagine
 * (ogni link nuovo, per il browser, è un'immagine nuova: traffico consumato su Supabase).
 */
export interface UrlCache {
  get(path: string): string | null;
  set(path: string, url: string, expiresAt: number): void;
}

const KEY = 'stage-review-links';
const MAX_ENTRIES = 1000;

export function createUrlCache(store: Storage | null, now = () => Date.now(), reuseMarginMs = 24 * 3600 * 1000): UrlCache {
  let map: Record<string, [string, number]> = {};
  try { map = JSON.parse(store?.getItem(KEY) ?? '{}') ?? {}; } catch { map = {}; }
  let timer: ReturnType<typeof setTimeout> | null = null;

  function save() {
    if (!store || timer) return;
    timer = setTimeout(() => {
      timer = null;
      const t = now();
      const live = Object.entries(map).filter(([, [, exp]]) => exp > t + reuseMarginMs)
        .sort((a, b) => b[1][1] - a[1][1]).slice(0, MAX_ENTRIES);
      map = Object.fromEntries(live);
      try { store.setItem(KEY, JSON.stringify(map)); } catch { /* spazio pieno o bloccato: resta solo in memoria */ }
    }, 500);
  }

  return {
    get(path) {
      const hit = map[path];
      return hit && hit[1] > now() + reuseMarginMs ? hit[0] : null;
    },
    set(path, url, expiresAt) { map[path] = [url, expiresAt]; save(); },
  };
}

/** localStorage se disponibile (sulla board), altrimenti niente: si ricorda solo in memoria. */
export function browserStore(win: Window | undefined, kind: 'local' | 'session'): Storage | null {
  try { return (kind === 'local' ? win?.localStorage : win?.sessionStorage) ?? null; } catch { return null; }
}
