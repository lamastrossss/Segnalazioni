export type ApiError = { kind: 'offline' | 'unreachable' | 'auth' | 'forbidden' | 'unknown'; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export const ERROR_TEXT: Record<ApiError['kind'], string> = {
  offline: 'Connessione assente. Il testo resta qui: riprova quando sei di nuovo online.',
  unreachable: 'Supabase non risponde: il database potrebbe essere in pausa. Riattivalo dal pannello Supabase.',
  auth: 'Sessione scaduta: accedi di nuovo.',
  forbidden: 'Non hai i permessi per questa operazione.',
  unknown: 'Qualcosa è andato storto. Riprova.',
};
export const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard';

type ErrLike = { status?: number; code?: string; message?: string };

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const msg = (e as ErrLike | null)?.message ?? '';
  return /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg);
}

export async function classifyError(e: unknown, probe?: () => Promise<boolean>): Promise<ApiError> {
  const err = (e ?? {}) as ErrLike;
  let kind: ApiError['kind'] = 'unknown';
  if (isNetworkError(e)) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) kind = 'offline';
    else if (probe) kind = (await probe().catch(() => false)) ? 'offline' : 'unreachable';
    else kind = 'offline';
  } else if (err.status === 401 || err.code === 'PGRST301' || /JWT expired|invalid JWT/i.test(err.message ?? '')) {
    kind = 'auth';
  } else if (err.status === 403 || err.code === '42501' || err.code === 'SR001') {
    kind = 'forbidden';
  }
  const message = err.code === 'SR001' && err.message ? err.message : ERROR_TEXT[kind];
  return { kind, message };
}

export function ok<T>(value: T): Result<T> { return { ok: true, value }; }
export function fail<T>(kind: ApiError['kind'], message = ERROR_TEXT[kind]): Result<T> {
  return { ok: false, error: { kind, message } };
}
