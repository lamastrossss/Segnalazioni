/** Dominio dello stage da un URL completo o dal solo indirizzo. null se non è un indirizzo web. */
export function normalizeStage(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase();
    if (!host || (!host.includes('.') && host !== 'localhost')) return null;
    return host;
  } catch {
    return null;
  }
}
