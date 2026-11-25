import { describe, it, expect, vi } from 'vitest';
import { createApi, type NewIssue } from '../../src/shared/api';
import { thumbPathOf, type PreparedImage } from '../../src/shared/media';
import { createUrlCache } from '../../src/shared/url-cache';
import { createFakeSupabase } from '../helpers/fake-supabase';

const img = (name: string): PreparedImage => ({ blob: new Blob(['x']), width: 10, height: 10, bytes: 1, ext: 'jpg', name });
const small: PreparedImage = { blob: new Blob(['t']), width: 4, height: 4, bytes: 1, ext: 'jpg', name: 'thumb.jpg' };
const input: NewIssue = {
  project_id: 'p1', page_path: '/p', page_url: 'https://x/p', viewport_class: 'mobile', viewport_width: 375,
  browser: 'Chrome', anchor: { selector: 'h2', tag: 'H2', text: '', offset: { x: 0, y: 0 }, page: { x: 0, y: 0, docHeight: 0 } }, body: 'ciao',
};
const issueRow = { id: 'i1', number: 1, ...input, status: 'open', author_id: 'u1', screenshot_path: null,
  screenshot_bytes: 0, created_at: 't', updated_at: 't', deleted_at: null, deleted_by: null, replies: [] };

function setup(opts: { thumb?: (b: Blob) => Promise<PreparedImage>; fetchBlob?: (u: string) => Promise<Blob> } = {}) {
  const fake = createFakeSupabase();
  fake.on('issues:insert', () => ({ data: issueRow, error: null }));
  fake.on('issues:update', () => ({ data: [{ id: 'i1' }], error: null }));
  fake.on('attachments:insert', c => ({ data: { id: 'a1', ...(c.payload as object), created_at: 't', deleted_at: null }, error: null }));
  const thumb = vi.fn(opts.thumb ?? (async () => small));
  const fetchBlob = vi.fn(opts.fetchBlob ?? (async () => new Blob(['full'])));
  return { fake, thumb, fetchBlob, api: createApi(fake.client, { thumb, fetchBlob }) };
}

describe('miniature', () => {
  it('percorso: stessa cartella, prefisso thumb-, sempre .jpg', () => {
    expect(thumbPathOf('p1/i1/screenshot.jpg')).toBe('p1/i1/thumb-screenshot.jpg');
    expect(thumbPathOf('p1/i1/att-abc.gif')).toBe('p1/i1/thumb-att-abc.jpg');
  });

  it('caricando screenshot e allegati carica anche le miniature, con cache lunga nel browser', async () => {
    const { fake, api } = setup();
    await api.createIssue(input, img('shot'), [img('a.jpg')]);
    const paths = fake.uploads.map(u => u.path);
    expect(paths).toEqual(['p1/i1/screenshot.jpg', 'p1/i1/thumb-screenshot.jpg', expect.stringMatching(/^p1\/i1\/att-.+\.jpg$/), expect.stringMatching(/^p1\/i1\/thumb-att-.+\.jpg$/)]);
    expect(fake.uploads.every(u => u.cacheControl === '31536000')).toBe(true);
  });

  it('se la miniatura non si può creare, l\'immagine viene caricata lo stesso', async () => {
    const { fake, api } = setup({ thumb: async () => { throw new Error('no canvas'); } });
    const r = await api.createIssue(input, img('shot'), []);
    expect(r.ok).toBe(true);
    expect(fake.uploads.map(u => u.path)).toEqual(['p1/i1/screenshot.jpg']);
  });

  it('thumbUrl: usa la miniatura se c\'è, senza scaricare l\'originale', async () => {
    const { api, fetchBlob } = setup();
    await api.createIssue(input, img('shot'), []);
    const u = await api.thumbUrl('p1/i1/screenshot.jpg');
    expect(u.ok && u.value).toContain('thumb-screenshot.jpg');
    expect(fetchBlob).not.toHaveBeenCalled();
  });

  it('thumbUrl su un\'immagine vecchia: la crea una volta (anche con richieste contemporanee) e la salva per tutti', async () => {
    const { fake, api, fetchBlob, thumb } = setup();
    const [a, b] = await Promise.all([api.thumbUrl('p1/i9/screenshot.jpg'), api.thumbUrl('p1/i9/screenshot.jpg')]);
    expect(a.ok && a.value).toContain('thumb-screenshot.jpg');
    expect(b).toEqual(a);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    expect(thumb).toHaveBeenCalledTimes(1);
    expect(fake.uploads.map(u => u.path)).toEqual(['p1/i9/thumb-screenshot.jpg']);
  });

  it('thumbUrl: se la miniatura non si può creare, mostra l\'originale', async () => {
    const { api } = setup({ fetchBlob: async () => { throw new Error('rete'); } });
    const u = await api.thumbUrl('p1/i9/screenshot.jpg');
    expect(u.ok && u.value).toBe('https://signed/p1/i9/screenshot.jpg?t=604800');
  });

  it('i link restano gli stessi tra una richiesta e l\'altra (il browser non riscarica)', async () => {
    const { fake, api } = setup();
    const a = await api.signedUrl('p1/i1/x.jpg');
    const b = await api.signedUrl('p1/i1/x.jpg');
    expect(b).toEqual(a);
    expect(fake.signs.filter(p => p === 'p1/i1/x.jpg')).toHaveLength(1);
  });
});

describe('memoria dei link', () => {
  it('riusa un link finché manca più di un giorno alla scadenza, e lo ricorda tra le visite', () => {
    vi.useFakeTimers();
    let t = 0;
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as unknown as Storage;
    const day = 24 * 3600 * 1000;
    const c = createUrlCache(storage, () => t);
    c.set('a', 'url-a', 7 * day);
    expect(c.get('a')).toBe('url-a');
    vi.advanceTimersByTime(600);
    expect(createUrlCache(storage, () => t).get('a')).toBe('url-a'); // nuova visita
    t = 6.5 * day;
    expect(c.get('a')).toBeNull(); // quasi scaduto: se ne chiede uno nuovo
    vi.useRealTimers();
  });

  it('senza memoria del browser (bloccata) funziona lo stesso', () => {
    const bad = { getItem: () => { throw new Error('bloccato'); }, setItem: () => { throw new Error('bloccato'); } } as unknown as Storage;
    const c = createUrlCache(bad);
    c.set('a', 'u', Date.now() + 7 * 24 * 3600 * 1000);
    expect(c.get('a')).toBe('u');
  });
});
