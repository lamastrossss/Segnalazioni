const FOCUS_PREFIX = '#stage-review=';

export function pagePathOf(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

export function parseFocusHash(hash: string): string | null {
  if (!hash.startsWith(FOCUS_PREFIX)) return null;
  const id = decodeURIComponent(hash.slice(FOCUS_PREFIX.length));
  return id || null;
}

export function withFocusHash(pageUrl: string, issueId: string): string {
  const u = new URL(pageUrl);
  u.hash = FOCUS_PREFIX.slice(1) + encodeURIComponent(issueId);
  return u.toString();
}
