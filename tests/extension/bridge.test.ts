import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const code = readFileSync(join(__dirname, '..', '..', 'extension', 'bridge.js'), 'utf8');
const flush = () => new Promise(r => setTimeout(r, 10));
// In Chrome un postMessage della pagina a se stessa arriva con source === window; jsdom non lo imposta.
const post = (data: unknown, source: Window | null = window) => window.dispatchEvent(new MessageEvent('message', { data, source }));
const sendMessage = vi.fn(async (_m: unknown) => ({ dataUrl: 'data:img' as string | null }));
const load = () => new Function('chrome', code)({ runtime: { sendMessage } });
const openTool = () => { const r = document.createElement('div'); r.id = 'stage-review-root'; document.documentElement.append(r); };

beforeAll(() => { delete (globalThis as any).__srBridge; load(); });
beforeEach(() => sendMessage.mockClear());
afterEach(() => document.getElementById('stage-review-root')?.remove());

describe('ponte', () => {
  it('segna la pagina', () => {
    expect(document.documentElement.dataset.stageReviewExt).toBe('1');
  });
  it('senza il tool aperto non inoltra (Review Focus 3)', async () => {
    post({ source: 'stage-review', type: 'capture', id: 'a' });
    await flush();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it('con il tool aperto inoltra e risponde con lo stesso id', async () => {
    openTool();
    const replies: any[] = [];
    const listen = (e: MessageEvent) => { if (e.data?.source === 'stage-review-ext') replies.push(e.data); };
    window.addEventListener('message', listen);
    post({ source: 'stage-review', type: 'capture', id: 'abc' });
    await flush(); await flush();
    window.removeEventListener('message', listen);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'capture' });
    expect(replies).toEqual([{ source: 'stage-review-ext', type: 'capture-result', id: 'abc', dataUrl: 'data:img' }]);
  });
  it('ignora messaggi con altra sorgente, tipo o finestra', async () => {
    openTool();
    post({ source: 'altro', type: 'capture', id: 'a' });
    post({ source: 'stage-review', type: 'altro', id: 'a' });
    post({ source: 'stage-review', type: 'capture', id: 'a' }, null);
    await flush();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it('se l\'estensione fallisce risponde null', async () => {
    openTool();
    sendMessage.mockRejectedValueOnce(new Error('x'));
    const replies: any[] = [];
    const listen = (e: MessageEvent) => { if (e.data?.source === 'stage-review-ext') replies.push(e.data); };
    window.addEventListener('message', listen);
    post({ source: 'stage-review', type: 'capture', id: 'z' });
    await flush(); await flush();
    window.removeEventListener('message', listen);
    expect(replies[0].dataUrl).toBeNull();
  });
  it('caricato due volte registra un solo ascoltatore', async () => {
    load();
    openTool();
    post({ source: 'stage-review', type: 'capture', id: 'a' });
    await flush();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
