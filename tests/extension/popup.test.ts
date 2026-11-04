import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initPopup, isNewer } from '../../extension/lib/popup.js';
import { createFakeChrome } from '../helpers/fake-chrome';

const opts = { toolBase: 'https://lamastrossss.github.io/Segnalazioni/', version: '1.0.0', fetchVersion: async () => ({ version: '1.0.0' }), close: vi.fn() };
const flush = () => new Promise(r => setTimeout(r, 0));
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const url = 'https://rica.myshopify.com/products/x';

beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; opts.close.mockClear(); });

describe('menu dell\'icona', () => {
  it('su una pagina non scriptabile mostra solo l\'avviso (Review Focus 2)', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url: 'chrome://newtab' } });
    await initPopup(document, f.chrome, opts);
    expect(document.body.textContent).toContain('Stage Review non può aprirsi su questa pagina.');
    expect(q('#sr-toggle')).toBeNull();
    expect(q<HTMLAnchorElement>('a')!.href).toBe(opts.toolBase);
  });
  it('mostra il sito e "Chiudi" se il tool è aperto', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: true });
    await initPopup(document, f.chrome, opts);
    expect(document.body.textContent).toContain('rica.myshopify.com');
    expect(q('#sr-toggle')!.textContent).toBe('Chiudi Stage Review');
  });
  it('il pulsante apre il tool e chiude il menu', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: (inj: any) => (inj.args ? 'opened' : false) });
    await initPopup(document, f.chrome, opts);
    expect(q('#sr-toggle')!.textContent).toBe('Apri Stage Review');
    q('#sr-toggle')!.click(); await flush();
    expect(f.lastMode()).toBe('toggle');
    expect(opts.close).toHaveBeenCalled();
  });
  it('permesso negato: l\'interruttore torna spento e non salva niente (Review Focus 5)', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: false });
    f.chrome.permissions.request = vi.fn(async () => false);
    await initPopup(document, f.chrome, opts);
    const box = q<HTMLInputElement>('#sr-always')!;
    box.checked = true; box.dispatchEvent(new Event('change')); await flush();
    expect(f.chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://rica.myshopify.com/*'] });
    expect(box.checked).toBe(false);
    expect(f.granted.size).toBe(0);
  });
  it('permesso concesso: salva il sito, apre il tool e mostra ON', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: (inj: any) => (inj.args ? 'opened' : false) });
    await initPopup(document, f.chrome, opts);
    const box = q<HTMLInputElement>('#sr-always')!;
    box.checked = true; box.dispatchEvent(new Event('change')); await flush(); await flush();
    expect(f.granted.has('https://rica.myshopify.com/*')).toBe(true);
    expect(f.lastMode()).toBe('auto');
    expect(f.badges.at(-1)).toEqual({ tabId: 1, text: 'ON' });
  });
  it('spegnendo l\'interruttore toglie il sito', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: false });
    f.grant('https://rica.myshopify.com/*'); // permesso concesso = sempre attivo (anche se il menu si era chiuso prima di salvare)
    await initPopup(document, f.chrome, opts);
    const box = q<HTMLInputElement>('#sr-always')!;
    expect(box.checked).toBe(true);
    box.checked = false; box.dispatchEvent(new Event('change')); await flush(); await flush();
    expect(f.granted.size).toBe(0);
    expect(f.badges.at(-1)).toEqual({ tabId: 1, text: '' });
  });
  it('avvisa se c\'è una versione più nuova', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: false });
    await initPopup(document, f.chrome, { ...opts, fetchVersion: async () => ({ version: '1.1.0' }) });
    await flush();
    expect(document.body.textContent).toContain('È disponibile una nuova versione dell’estensione');
  });
  it('errore di rete sulla versione ignorato', async () => {
    const f = createFakeChrome({ activeTab: { id: 1, url }, pageResult: false });
    await initPopup(document, f.chrome, { ...opts, fetchVersion: async () => { throw new Error('offline'); } });
    await flush();
    expect(document.body.textContent).not.toContain('nuova versione');
  });
  it('confronto versioni numerico', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
  });
});
