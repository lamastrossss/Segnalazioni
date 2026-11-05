import { vi } from 'vitest';
import type { Api } from '../../src/shared/api';
import type { Auth } from '../../src/shared/auth';
import type { Issue, IssueDetail, Profile, Project } from '../../src/shared/types';

export const ME: Profile = { id: 'u1', name: 'Alessandra', color: '#E4572E' };
export const PROJECT: Project = { id: 'p1', name: 'Rica', archive_doc_url: null, domains: ['localhost'] };

/** Api finta: ogni metodo è un vi.fn con risposta di successo predefinita. */
export function fakeApi(issues: Issue[] = []) {
  const okv = <T>(value: T) => Promise.resolve({ ok: true as const, value });
  const api = {
    findProjectByDomain: vi.fn(() => okv<Project | null>(PROJECT)),
    listProjects: vi.fn(() => okv([])),
    createProject: vi.fn((name: string, domain: string) => okv({ ...PROJECT, name, domains: [domain] })),
    linkDomain: vi.fn(() => okv(undefined)),
    listIssues: vi.fn(() => okv(issues)),
    getIssue: vi.fn((id: string) => {
      const i = issues.find(x => x.id === id)!;
      return okv<IssueDetail>({ ...i, replies: [], attachments: [] });
    }),
    createIssue: vi.fn(),
    addReply: vi.fn(),
    uploadAttachment: vi.fn(),
    setStatus: vi.fn(() => okv(undefined)),
    softDeleteIssue: vi.fn(() => okv(undefined)),
    softDeleteReply: vi.fn(() => okv(undefined)),
    togglePlusOne: vi.fn(() => okv(true)),
    signedUrl: vi.fn((p: string) => okv(`https://signed/${p}`)),
    profiles: vi.fn(() => okv([ME])),
    archiveStatus: vi.fn(() => okv({ last_run_at: null, last_ok_at: null, last_error: null })),
    totalUsageBytes: vi.fn(() => okv(0)),
  };
  return api as typeof api & Api;
}

export function fakeAuth(me: Profile | null = ME): Auth {
  return {
    current: vi.fn(async () => me),
    signIn: vi.fn(async () => ({ ok: true as const, value: ME })),
    changePassword: vi.fn(async () => ({ ok: true as const, value: undefined })),
    onChange: vi.fn(() => () => {}),
  };
}

export function fakeLive() {
  let cb: ((id: string) => void) | null = null;
  let presenceCb: ((others: any[]) => void) | null = null;
  const presence = { update: vi.fn(), leave: vi.fn() };
  return {
    subscribe: vi.fn((_projectId: string, onChange: (id: string) => void) => { cb = onChange; return () => { cb = null; }; }),
    join: vi.fn((_projectId: string, _me: unknown, onSync: (o: any[]) => void) => { presenceCb = onSync; return presence; }),
    emit(id: string) { cb?.(id); },
    sync(others: any[]) { presenceCb?.(others); },
    presence,
  };
}

export const flush = () => new Promise(r => setTimeout(r, 0));
