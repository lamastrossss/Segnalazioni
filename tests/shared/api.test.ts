import { describe, it, expect } from 'vitest';
import { createApi, type NewIssue } from '../../src/shared/api';
import type { PreparedImage } from '../../src/shared/media';
import { createFakeSupabase } from '../helpers/fake-supabase';

const img = (name: string): PreparedImage => ({ blob: new Blob(['x']), width: 10, height: 10, bytes: 1, ext: 'jpg', name });
const input: NewIssue = {
  project_id: 'p1', page_path: '/p', page_url: 'https://x/p', viewport_class: 'mobile', viewport_width: 375,
  browser: 'Chrome', anchor: { selector: 'h2', tag: 'H2', text: '', offset: { x: 0, y: 0 }, page: { x: 0, y: 0, docHeight: 0 } }, body: 'ciao',
};
const issueRow = { id: 'i1', number: 1, ...input, status: 'open', author_id: 'u1', screenshot_path: null,
  screenshot_bytes: 0, created_at: 't', updated_at: 't', deleted_at: null, deleted_by: null, replies: [] };

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
    const imgB = img('b.jpg');
    let n = 0;
    fake.failUploadWhen(p => p.includes('/att-') && ++n === 2);
    const r = await api.createIssue(input, img('shot'), [img('a.jpg'), imgB]);
    expect(r.ok && r.value.failed).toEqual([imgB]);
    expect(fake.uploads.map(u => u.path)).toEqual(['p1/i1/screenshot.jpg', expect.stringMatching(/^p1\/i1\/att-.+\.jpg$/)]);
    const upd = fake.calls.find(c => c.table === 'issues' && c.op === 'update')!;
    expect(upd.payload).toEqual({ screenshot_path: 'p1/i1/screenshot.jpg', screenshot_bytes: 1 });
  });
  it('insert fallito → nessun upload e errore', async () => {
    const { fake, api } = setup();
    fake.on('issues:insert', () => ({ data: null, error: { code: '42501', message: 'rls' }, status: 403 }));
    const r = await api.createIssue(input, img('shot'), [img('a.jpg')]);
    expect(r.ok).toBe(false);
    expect(fake.uploads).toHaveLength(0);
  });
  it('screenshot fallito → segnalazione salvata senza screenshot', async () => {
    const { fake, api } = setup();
    fake.failUploadWhen(p => p.endsWith('screenshot.jpg'));
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
  it('listIssues esclude le eliminate e conta le risposte', async () => {
    const { fake, api } = setup();
    fake.on('issues:select', () => ({ data: [{ ...issueRow, replies: [{ id: 'r1', deleted_at: null }, { id: 'r2', deleted_at: 'x' }] }], error: null }));
    const r = await api.listIssues('p1');
    expect(r.ok && r.value[0].replies_count).toBe(1);
    expect(fake.calls[0].filters).toContainEqual(['is', 'deleted_at', null]);
  });
  it('setStatus senza righe aggiornate → forbidden', async () => {
    const { fake, api } = setup();
    fake.on('issues:update', () => ({ data: [], error: null }));
    const r = await api.setStatus('i1', 'resolved');
    expect(r.ok === false && r.error.kind).toBe('forbidden');
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
  it('renameProject salva il nome ripulito e rifiuta quello vuoto', async () => {
    const { fake, api } = setup();
    fake.on('projects:update', () => ({ data: [{ id: 'p1' }], error: null }));
    expect(await api.renameProject('p1', '  Rica — Stage  ')).toEqual({ ok: true, value: undefined });
    expect(fake.calls.at(-1)!.payload).toEqual({ name: 'Rica — Stage' });
    const r = await api.renameProject('p1', '   ');
    expect(r.ok === false && r.error.message).toBe('Il nome non può essere vuoto.');
  });
  it('deleteProject chiama la funzione del database', async () => {
    const { fake, api } = setup();
    let args: any;
    fake.on('rpc:delete_project', c => { args = c; return { data: null, error: null }; });
    expect(await api.deleteProject('p1')).toEqual({ ok: true, value: undefined });
    expect(args).toBeDefined();
  });
  it('setStages toglie quelli rimossi e aggiunge i nuovi (normalizzati)', async () => {
    const { fake, api } = setup();
    fake.on('project_domains:delete', () => ({ data: null, error: null }));
    fake.on('project_domains:insert', () => ({ data: null, error: null }));
    const r = await api.setStages('p1', ['a.myshopify.com', 'b.myshopify.com'], ['https://B.myshopify.com/products?x=1', 'c.shopifypreview.com']);
    expect(r).toEqual({ ok: true, value: ['b.myshopify.com', 'c.shopifypreview.com'] });
    const del = fake.calls.find(c => c.table === 'project_domains' && c.op === 'delete')!;
    expect(del.filters).toEqual([['eq', 'project_id', 'p1'], ['in', 'domain', ['a.myshopify.com']]]);
    const ins = fake.calls.find(c => c.table === 'project_domains' && c.op === 'insert')!;
    expect(ins.payload).toEqual([{ domain: 'c.shopifypreview.com', project_id: 'p1' }]);
  });
  it('setStages: almeno uno stage, indirizzi validi, stage già usato da un altro sito', async () => {
    const { fake, api } = setup();
    const empty = await api.setStages('p1', ['a.com'], ['  ']);
    expect(empty.ok === false && empty.error.message).toBe('Serve almeno uno stage.');
    const bad = await api.setStages('p1', ['a.com'], ['non è un indirizzo']);
    expect(bad.ok === false && bad.error.message).toBe('Indirizzo non valido: non è un indirizzo');
    fake.on('project_domains:insert', () => ({ data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 }));
    const dup = await api.setStages('p1', ['a.com'], ['a.com', 'b.com']);
    expect(dup.ok === false && dup.error.message).toBe('Uno di questi stage è già collegato a un altro sito.');
    expect(fake.calls.some(c => c.table === 'project_domains' && c.op === 'delete')).toBe(false); // niente rimosso se l'aggiunta fallisce
  });
});
