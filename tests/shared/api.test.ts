import { describe, it, expect } from 'vitest';
import { createApi, type NewIssue } from '../../src/shared/api';
import type { PreparedImage } from '../../src/shared/media';
import { createFakeSupabase } from '../helpers/fake-supabase';

const img = (name: string): PreparedImage => ({ blob: new Blob(['x']), width: 10, height: 10, bytes: 1, ext: 'webp', name });
const input: NewIssue = {
  project_id: 'p1', page_path: '/p', page_url: 'https://x/p', viewport_class: 'mobile', viewport_width: 375,
  browser: 'Chrome', anchor: { selector: 'h2', tag: 'H2', text: '', offset: { x: 0, y: 0 }, page: { x: 0, y: 0, docHeight: 0 } }, body: 'ciao',
};
const issueRow = { id: 'i1', number: 1, ...input, status: 'open', author_id: 'u1', screenshot_path: null,
  screenshot_bytes: 0, created_at: 't', updated_at: 't', deleted_at: null, deleted_by: null, plus_ones: [], replies: [] };

function setup() {
  const fake = createFakeSupabase();
  fake.on('issues:insert', () => ({ data: issueRow, error: null }));
  fake.on('issues:update', () => ({ data: [{ id: 'i1' }], error: null }));
  fake.on('attachments:insert', c => ({ data: { id: 'a-' + (c.payload as any).path, ...(c.payload as object), created_at: 't', deleted_at: null }, error: null }));
  return { fake, api: createApi(fake.client) };
}

describe('createIssue', () => {
  it('carica screenshot e allegati e riporta quelli falliti', async () => {
    const { fake, api } = setup();
    const imgB = img('b.webp');
    let n = 0;
    fake.failUploadWhen(p => p.includes('/att-') && ++n === 2);
    const r = await api.createIssue(input, img('shot'), [img('a.webp'), imgB]);
    expect(r.ok && r.value.failed).toEqual([imgB]);
    expect(fake.uploads.map(u => u.path)).toEqual(['p1/i1/screenshot.webp', expect.stringMatching(/^p1\/i1\/att-.+\.webp$/)]);
    const upd = fake.calls.find(c => c.table === 'issues' && c.op === 'update')!;
    expect(upd.payload).toEqual({ screenshot_path: 'p1/i1/screenshot.webp', screenshot_bytes: 1 });
  });
  it('insert fallito → nessun upload e errore', async () => {
    const { fake, api } = setup();
    fake.on('issues:insert', () => ({ data: null, error: { code: '42501', message: 'rls' }, status: 403 }));
    const r = await api.createIssue(input, img('shot'), [img('a.webp')]);
    expect(r.ok).toBe(false);
    expect(fake.uploads).toHaveLength(0);
  });
  it('screenshot fallito → segnalazione salvata senza screenshot', async () => {
    const { fake, api } = setup();
    fake.failUploadWhen(p => p.endsWith('screenshot.webp'));
    const r = await api.createIssue(input, img('shot'), []);
    expect(r.ok && r.value.issue.screenshot_path).toBeNull();
  });
  it('le GIF mantengono estensione e tipo', async () => {
    const { fake, api } = setup();
    await api.createIssue(input, null, [{ ...img('g.gif'), ext: 'gif' }]);
    expect(fake.uploads[0].path).toMatch(/\.gif$/);
    expect(fake.uploads[0].contentType).toBe('image/gif');
  });
});

describe('altre operazioni', () => {
  it('listIssues esclude le eliminate e calcola +1 e risposte', async () => {
    const { fake, api } = setup();
    fake.on('issues:select', () => ({ data: [{ ...issueRow, plus_ones: [{ user_id: 'u2' }], replies: [{ id: 'r1', deleted_at: null }, { id: 'r2', deleted_at: 'x' }] }], error: null }));
    const r = await api.listIssues('p1');
    expect(r.ok && r.value[0].plus_ones).toEqual(['u2']);
    expect(r.ok && r.value[0].replies_count).toBe(1);
    expect(fake.calls[0].filters).toContainEqual(['is', 'deleted_at', null]);
  });
  it('setStatus senza righe aggiornate → forbidden', async () => {
    const { fake, api } = setup();
    fake.on('issues:update', () => ({ data: [], error: null }));
    const r = await api.setStatus('i1', 'resolved');
    expect(r.ok === false && r.error.kind).toBe('forbidden');
  });
  it('togglePlusOne aggiunge e toglie', async () => {
    const { fake, api } = setup();
    fake.on('plus_ones:select', () => ({ data: null, error: null }));
    fake.on('plus_ones:insert', () => ({ data: null, error: null }));
    expect(await api.togglePlusOne('i1', 'u1')).toEqual({ ok: true, value: true });
    fake.on('plus_ones:select', () => ({ data: { user_id: 'u1' }, error: null }));
    fake.on('plus_ones:delete', () => ({ data: null, error: null }));
    expect(await api.togglePlusOne('i1', 'u1')).toEqual({ ok: true, value: false });
  });
  it('findProjectByDomain normalizza il dominio', async () => {
    const { fake, api } = setup();
    fake.on('project_domains:select', () => ({ data: { projects: { id: 'p1', name: 'Rica', archive_doc_url: null, project_domains: [{ domain: 'rica.myshopify.com' }] } }, error: null }));
    const r = await api.findProjectByDomain('Rica.MyShopify.com');
    expect(r).toEqual({ ok: true, value: { id: 'p1', name: 'Rica', archive_doc_url: null, domains: ['rica.myshopify.com'] } });
    expect(fake.calls[0].filters).toContainEqual(['eq', 'domain', 'rica.myshopify.com']);
  });
  it('totalUsageBytes converte il risultato in numero', async () => {
    const { fake, api } = setup();
    fake.on('rpc:total_usage_bytes', () => ({ data: '1234', error: null }));
    expect(await api.totalUsageBytes()).toEqual({ ok: true, value: 1234 });
  });
});
