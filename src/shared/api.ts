import type { SupabaseClient } from '@supabase/supabase-js';
import type { Anchor, ArchiveStatus, Attachment, Issue, IssueDetail, IssueStatus, Profile, Project, Reply, ViewportClass } from './types';
import { IMAGE_CACHE_SECONDS, makeThumb, mimeOf, thumbPathOf, type PreparedImage } from './media';
import { createUrlCache } from './url-cache';
import { classifyError, fail, ok, type Result } from './errors';
import { probeSupabase } from './supabase';
import { normalizeStage } from './stage-url';

export interface NewIssue {
  project_id: string; page_path: string; page_url: string; viewport_class: ViewportClass;
  viewport_width: number; browser: string; anchor: Anchor; body: string;
}
export interface ProjectSummary extends Project {
  open: number; in_progress: number; resolved: number; last_activity: string | null; bytes: number;
}

const BUCKET = 'media';
/** Link alle immagini validi una settimana: riusati finché manca più di un giorno alla scadenza. */
const SIGNED_URL_SECONDS = 7 * 24 * 3600;
const ISSUE_COLS = '*, replies(id, deleted_at)';

type Row = Record<string, any>;

function toIssue(row: Row): Issue {
  const { replies, attachments: _a, plus_ones: _p, ...rest } = row;
  return {
    ...(rest as Issue),
    replies_count: (replies ?? []).filter((r: Row) => !r.deleted_at).length,
  };
}

function byCreated<T extends { created_at: string }>(a: T, b: T) { return a.created_at.localeCompare(b.created_at); }

async function asError<T>(e: unknown): Promise<Result<T>> {
  return { ok: false, error: await classifyError(e, probeSupabase) };
}

function mediaPath(issue: Pick<Issue, 'id' | 'project_id'>, file: string) {
  return `${issue.project_id}/${issue.id}/${file}`;
}

export interface ApiOptions {
  /** Dove ricordare i link alle immagini tra una visita e l'altra (localStorage sulla board). */
  linkStore?: Storage | null;
  /** Crea la miniatura di un'immagine (sostituibile nei test). */
  thumb?: (blob: Blob) => Promise<PreparedImage>;
  fetchBlob?: (url: string) => Promise<Blob>;
}

export function createApi(client: SupabaseClient, opts: ApiOptions = {}) {
  const storage = () => client.storage.from(BUCKET);
  const links = createUrlCache(opts.linkStore ?? null);
  const thumbOf = opts.thumb ?? makeThumb;
  const fetchBlob = opts.fetchBlob ?? (async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.blob();
  });
  const pendingThumbs = new Map<string, Promise<Result<string>>>();

  async function sign(path: string): Promise<Result<string>> {
    const cached = links.get(path);
    if (cached) return ok(cached);
    try {
      const { data, error } = await storage().createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error || !data) return asError(error);
      links.set(path, data.signedUrl, Date.now() + SIGNED_URL_SECONDS * 1000);
      return ok(data.signedUrl);
    } catch (e) { return asError(e); }
  }

  /** Carica un'immagine (sempre nuova, nome unico) e, se riesce, la sua miniatura. */
  async function putImage(path: string, blob: Blob, contentType: string): Promise<{ error: unknown }> {
    const up = await storage().upload(path, blob, { contentType, upsert: false, cacheControl: IMAGE_CACHE_SECONDS });
    if (up.error) return { error: up.error };
    try {
      const t = await thumbOf(blob);
      await storage().upload(thumbPathOf(path), t.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: IMAGE_CACHE_SECONDS });
    } catch { /* niente miniatura: verrà creata la prima volta che serve */ }
    return { error: null };
  }

  /**
   * Link alla miniatura. Le immagini caricate prima delle miniature non ce l'hanno:
   * la prima persona che la vede la crea (scaricando l'originale una volta sola) e la salva per tutti.
   */
  function thumbUrl(path: string): Promise<Result<string>> {
    const tp = thumbPathOf(path);
    const cached = links.get(tp);
    if (cached) return Promise.resolve(ok(cached));
    let p = pendingThumbs.get(tp);
    if (!p) {
      p = (async () => {
        const existing = await sign(tp);
        if (existing.ok) return existing;
        const full = await sign(path);
        if (!full.ok) return full;
        try {
          const t = await thumbOf(await fetchBlob(full.value));
          await storage().upload(tp, t.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: IMAGE_CACHE_SECONDS });
          const made = await sign(tp);
          return made.ok ? made : full;
        } catch {
          return full; // miniatura non creabile: si mostra l'originale
        }
      })().finally(() => pendingThumbs.delete(tp));
      pendingThumbs.set(tp, p);
    }
    return p;
  }

  /** Esegue una query e converte {data, error} in Result. */
  async function run<T>(q: PromiseLike<{ data: unknown; error: unknown; status?: number }>, map: (d: any) => T): Promise<Result<T>> {
    try {
      const { data, error, status } = await q;
      if (error) return asError({ ...(error as object), status });
      return ok(map(data));
    } catch (e) {
      return asError(e);
    }
  }

  async function uploadAttachment(issue: Pick<Issue, 'id' | 'project_id'>, img: PreparedImage, replyId: string | null): Promise<Result<Attachment>> {
    const path = mediaPath(issue, `att-${crypto.randomUUID()}.${img.ext}`);
    try {
      const up = await putImage(path, img.blob, mimeOf(img.ext));
      if (up.error) return asError(up.error);
    } catch (e) { return asError(e); }
    return run(client.from('attachments').insert({
      issue_id: issue.id, reply_id: replyId, path, width: img.width, height: img.height, bytes: img.bytes,
    }).select().single(), d => d as Attachment);
  }

  async function uploadAll(issue: Pick<Issue, 'id' | 'project_id'>, images: PreparedImage[], replyId: string | null) {
    const failed: PreparedImage[] = [];
    for (const img of images) {
      const r = await uploadAttachment(issue, img, replyId);
      if (!r.ok) failed.push(img);
    }
    return failed;
  }

  async function updateOne(table: string, id: string, patch: Row): Promise<Result<void>> {
    const r = await run(client.from(table).update(patch).eq('id', id).select('id'), d => (d as Row[] | null) ?? []);
    if (!r.ok) return r;
    return r.value.length ? ok(undefined) : fail('forbidden');
  }

  return {
    async findProjectByDomain(domain: string): Promise<Result<Project | null>> {
      return run(
        client.from('project_domains')
          .select('projects(id, name, archive_doc_url, project_domains(domain))')
          .eq('domain', domain.toLowerCase()).maybeSingle(),
        d => {
          const p = (d as Row | null)?.projects;
          if (!p) return null;
          return { id: p.id, name: p.name, archive_doc_url: p.archive_doc_url, domains: (p.project_domains ?? []).map((x: Row) => x.domain) };
        });
    },

    async listProjects(): Promise<Result<ProjectSummary[]>> {
      return run(client.from('project_summary').select('*').order('name'), d =>
        ((d as Row[] | null) ?? []).map(r => ({
          ...r, open: Number(r.open), in_progress: Number(r.in_progress), resolved: Number(r.resolved), bytes: Number(r.bytes),
        }) as ProjectSummary));
    },

    async createProject(name: string, domain: string): Promise<Result<Project>> {
      const p = await run(client.from('projects').insert({ name: name.trim() }).select('id, name, archive_doc_url').single(), d => d as Row);
      if (!p.ok) return p;
      const d = await run(client.from('project_domains').insert({ domain: domain.toLowerCase(), project_id: p.value.id }), () => undefined);
      if (!d.ok) return d;
      return ok({ id: p.value.id, name: p.value.name, archive_doc_url: p.value.archive_doc_url ?? null, domains: [domain.toLowerCase()] });
    },

    async renameProject(projectId: string, name: string): Promise<Result<void>> {
      const clean = name.trim();
      if (!clean) return fail('unknown', 'Il nome non può essere vuoto.');
      return updateOne('projects', projectId, { name: clean });
    },

    /** Elimina il sito in modo recuperabile: sparisce da board e tool, lo stage si libera. */
    async deleteProject(projectId: string): Promise<Result<void>> {
      return run(client.rpc('delete_project', { p_id: projectId }), () => undefined);
    },

    /** Sostituisce gli stage collegati al sito. inputs: URL completi o domini. Restituisce i domini salvati. */
    async setStages(projectId: string, current: string[], inputs: string[]): Promise<Result<string[]>> {
      const next: string[] = [];
      for (const raw of inputs) {
        if (!raw.trim()) continue;
        const d = normalizeStage(raw);
        if (!d) return fail('unknown', `Indirizzo non valido: ${raw.trim()}`);
        if (!next.includes(d)) next.push(d);
      }
      if (!next.length) return fail('unknown', 'Serve almeno uno stage.');
      const toAdd = next.filter(d => !current.includes(d));
      const toRemove = current.filter(d => !next.includes(d));
      try {
        if (toAdd.length) {
          const { error, status } = await client.from('project_domains').insert(toAdd.map(domain => ({ domain, project_id: projectId })));
          if (error) {
            if ((error as { code?: string }).code === '23505') return fail('unknown', 'Uno di questi stage è già collegato a un altro sito.');
            return asError({ ...(error as object), status });
          }
        }
        if (toRemove.length) {
          const { error, status } = await client.from('project_domains').delete().eq('project_id', projectId).in('domain', toRemove);
          if (error) return asError({ ...(error as object), status });
        }
      } catch (e) {
        return asError(e);
      }
      return ok(next);
    },

    async linkDomain(projectId: string, domain: string): Promise<Result<void>> {
      return run(client.from('project_domains').insert({ domain: domain.toLowerCase(), project_id: projectId }), () => undefined);
    },

    async listIssues(projectId: string): Promise<Result<Issue[]>> {
      return run(
        client.from('issues').select(ISSUE_COLS).eq('project_id', projectId).is('deleted_at', null).order('created_at'),
        d => ((d as Row[] | null) ?? []).map(toIssue));
    },

    async getIssue(id: string): Promise<Result<IssueDetail>> {
      return run(
        client.from('issues').select('*, replies(*, attachments(*)), attachments(*)').eq('id', id).single(),
        d => {
          const row = d as Row;
          const replies: Reply[] = ((row.replies ?? []) as Row[])
            .map(r => ({ ...r, attachments: ((r.attachments ?? []) as Attachment[]).filter(a => !a.deleted_at).sort(byCreated) }) as Reply)
            .sort(byCreated);
          const attachments = ((row.attachments ?? []) as Attachment[]).filter(a => !a.reply_id && !a.deleted_at).sort(byCreated);
          return { ...toIssue(row), replies, attachments };
        });
    },

    async createIssue(input: NewIssue, screenshot: PreparedImage | null, images: PreparedImage[]): Promise<Result<{ issue: Issue; failed: PreparedImage[] }>> {
      const ins = await run(client.from('issues').insert(input).select(ISSUE_COLS).single(), d => toIssue(d as Row));
      if (!ins.ok) return ins;
      let issue = ins.value;
      if (screenshot) {
        const path = mediaPath(issue, 'screenshot.jpg');
        try {
          const up = await putImage(path, screenshot.blob, 'image/jpeg');
          if (!up.error) {
            const u = await updateOne('issues', issue.id, { screenshot_path: path, screenshot_bytes: screenshot.bytes });
            if (u.ok) issue = { ...issue, screenshot_path: path, screenshot_bytes: screenshot.bytes };
          }
        } catch { /* la segnalazione resta senza screenshot */ }
      }
      const failed = await uploadAll(issue, images, null);
      return ok({ issue, failed });
    },

    async addReply(issue: Pick<Issue, 'id' | 'project_id'>, body: string, images: PreparedImage[]): Promise<Result<{ reply: Reply; failed: PreparedImage[] }>> {
      const ins = await run(client.from('replies').insert({ issue_id: issue.id, body }).select().single(), d => ({ ...(d as Row), attachments: [] }) as unknown as Reply);
      if (!ins.ok) return ins;
      const failed = await uploadAll(issue, images, ins.value.id);
      return ok({ reply: ins.value, failed });
    },

    uploadAttachment,

    setStatus(issueId: string, status: IssueStatus) { return updateOne('issues', issueId, { status }); },
    /** Modifica il testo (solo l'autore: lo controlla il database, che segna anche la data di modifica). */
    async editIssue(issueId: string, body: string): Promise<Result<void>> {
      const clean = body.trim();
      if (!clean) return fail('unknown', 'Scrivi cosa non va.');
      return updateOne('issues', issueId, { body: clean });
    },
    softDeleteIssue(issueId: string) { return updateOne('issues', issueId, { deleted_at: new Date().toISOString() }); },
    softDeleteReply(replyId: string) { return updateOne('replies', replyId, { deleted_at: new Date().toISOString() }); },

    /** Link all'immagine originale (per ingrandirla). */
    signedUrl: sign,
    /** Link alla miniatura leggera (per board, pannelli e anteprime). */
    thumbUrl,

    async profiles(): Promise<Result<Profile[]>> {
      return run(client.from('profiles').select('id, name, color'), d => (d as Profile[] | null) ?? []);
    },

    async archiveStatus(): Promise<Result<ArchiveStatus>> {
      return run(client.from('archive_status').select('last_run_at, last_ok_at, last_error').eq('id', 1).single(), d => d as ArchiveStatus);
    },

    async totalUsageBytes(): Promise<Result<number>> {
      return run(client.rpc('total_usage_bytes'), d => Number(d ?? 0));
    },
  };
}
export type Api = ReturnType<typeof createApi>;
