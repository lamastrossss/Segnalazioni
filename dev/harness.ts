// Harness di sviluppo: il tool sopra uno stage finto, con dati in memoria (nessun Supabase).
import { boot } from '../src/tool/boot';
import type { Api } from '../src/shared/api';
import type { Issue, IssueDetail, Profile, Reply } from '../src/shared/types';

const me: Profile = { id: 'u1', name: 'Alessandra Mastroeni', color: '#E4572E' };
const marco: Profile = { id: 'u2', name: 'Marco Rossi', color: '#2E86AB' };
const issues = new Map<string, IssueDetail>();
let n = 0;
const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const now = () => new Date().toISOString();
const strip = ({ replies: _r, attachments: _a, ...i }: IssueDetail): Issue => i;

function seed(body: string, selector: string, tag: string, text: string, author = marco.id, vc: Issue['viewport_class'] = 'desktop') {
  const id = `seed${++n}`;
  issues.set(id, { id, project_id: 'p1', number: n, page_path: location.pathname.replace(/\/+$/, '') || '/', page_url: location.href,
    viewport_class: vc, viewport_width: vc === 'desktop' ? 1440 : 375, browser: 'Chrome', body, status: 'open', author_id: author,
    anchor: { selector, tag, text, offset: { x: 0.2, y: 0.5 }, page: { x: 200, y: 200, docHeight: 2000 } },
    screenshot_path: null, screenshot_bytes: 0, created_at: now(), updated_at: now(), deleted_at: null, deleted_by: null,
    replies_count: 0, replies: [], attachments: [] });
}
const path = location.pathname.replace(/\/+$/, '') || '/';
seed('Titolo troppo vicino all’immagine: aumentare il gap a 48px', 'body > div:nth-of-type(1) > div:nth-of-type(1) > h1:nth-of-type(1)', 'H1', 'Opuntia Oil Mask');
seed('Menu: manca lo stato hover', 'body > header:nth-of-type(1) > nav:nth-of-type(1)', 'NAV', 'ShopRitualiChi siamo', me.id, 'mobile');

const api = {
  findProjectByDomain: () => ok({ id: 'p1', name: 'Rica — stage', archive_doc_url: null, domains: [location.hostname] }),
  listProjects: () => ok([]), createProject: () => ok({ id: 'p1', name: 'Rica', archive_doc_url: null, domains: [] }), linkDomain: () => ok(undefined),
  listIssues: () => ok([...issues.values()].filter(i => !i.deleted_at).map(strip)),
  getIssue: (id: string) => ok(issues.get(id)!),
  createIssue: async (input: any) => {
    const id = `i${++n}`;
    const d: IssueDetail = { ...input, id, number: n, status: 'open', author_id: me.id, screenshot_path: null, screenshot_bytes: 0,
      created_at: now(), updated_at: now(), deleted_at: null, deleted_by: null, replies_count: 0, replies: [], attachments: [] };
    issues.set(id, d);
    return { ok: true as const, value: { issue: strip(d), failed: [] } };
  },
  addReply: async (issue: { id: string }, body: string) => {
    const r: Reply = { id: `r${++n}`, issue_id: issue.id, author_id: me.id, body, created_at: now(), deleted_at: null, attachments: [] };
    const d = issues.get(issue.id)!; d.replies.push(r); d.replies_count++;
    return { ok: true as const, value: { reply: r, failed: [] } };
  },
  uploadAttachment: () => ok({} as never),
  setStatus: async (id: string, s: Issue['status']) => { issues.get(id)!.status = s; return { ok: true as const, value: undefined }; },
  softDeleteIssue: async (id: string) => { issues.get(id)!.deleted_at = now(); return { ok: true as const, value: undefined }; },
  softDeleteReply: () => ok(undefined),
  signedUrl: (p: string) => ok(p), profiles: () => ok([me, marco]),
  archiveStatus: () => ok({ last_run_at: null, last_ok_at: null, last_error: null }), totalUsageBytes: () => ok(0),
} as unknown as Api;

const auth = { current: async () => me, signIn: async () => ({ ok: true as const, value: me }), changePassword: async () => ({ ok: true as const, value: undefined }), onChange: () => () => {} };
const live = {
  subscribe: () => () => {},
  join: (_p: string, _m: unknown, onSync: (o: any[]) => void) => { setTimeout(() => onSync([{ userId: 'u2', name: marco.name, color: marco.color, page_path: path, viewport_class: 'desktop' }]), 300); return { update() {}, leave() {} }; },
};
void boot(window, { api, auth, live });
