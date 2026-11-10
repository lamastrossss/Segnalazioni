import { describe, it, expect, vi, afterEach } from 'vitest';
import { isScriptable, originOf, pageLoader, isActiveProbe, isolatedToggle, prepareBundled, createController } from '../../extension/lib/core.js';
import { createFakeChrome } from '../helpers/fake-chrome';

const TOOL = 'https://lamastrossss.github.io/Segnalazioni/tool.js';
const tab = { id: 1, url: 'https://rica.myshopify.com/products/x', windowId: 9 };

describe('pagine scriptabili', () => {
  it('esclude pagine interne di Chrome, Web Store e file (Review Focus 2)', () => {
    expect(isScriptable('chrome://extensions')).toBe(false);
    expect(isScriptable('https://chromewebstore.google.com/detail/x')).toBe(false);
    expect(isScriptable('https://chrome.google.com/webstore/detail/x')).toBe(false);
    expect(isScriptable('file:///Users/a.html')).toBe(false);
    expect(isScriptable(undefined)).toBe(false);
    expect(isScriptable('https://rica.myshopify.com/p')).toBe(true);
    expect(originOf('https://rica.myshopify.com/p?x=1')).toBe('https://rica.myshopify.com');
  });
});

describe('controller', () => {
  it('toggle inietta prima il ponte, controlla la copia interna, poi il loader nel mondo MAIN', async () => {
    const f = createFakeChrome();
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.toggle(tab)).toBe('opened');
    expect(f.steps()).toEqual([['bridge.js', 'ISOLATED'], ['isolatedToggle', 'ISOLATED'], ['pageLoader', 'MAIN']]);
    expect(f.calls[2].args).toEqual([TOOL, 'toggle']);
  });
  it('se il sito blocca il tool online avvia la copia inclusa nel mondo isolato, con la modalità', async () => {
    const f = createFakeChrome();
    f.setPageResult((inj: any) => (inj.func.name === 'isolatedToggle' ? 'none' : inj.func.name === 'pageLoader' ? 'blocked' : undefined));
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.toggle(tab)).toBe('opened');
    expect(f.steps()).toEqual([['bridge.js', 'ISOLATED'], ['isolatedToggle', 'ISOLATED'], ['pageLoader', 'MAIN'], ['prepareBundled', 'ISOLATED'], ['tool.js', 'ISOLATED']]);
    expect(f.calls[3].args).toEqual(['toggle']);
  });
  it('se la copia interna è già aperta, toggle la chiude senza toccare la pagina', async () => {
    const f = createFakeChrome();
    f.setPageResult((inj: any) => (inj.func.name === 'isolatedToggle' ? 'closed' : 'opened'));
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.toggle(tab)).toBe('closed');
    expect(f.injections()).toHaveLength(0);
  });
  it('su pagine non scriptabili non inietta', async () => {
    const f = createFakeChrome();
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.toggle({ id: 1, url: 'chrome://extensions' })).toBe('unsupported');
    expect(f.calls).toHaveLength(0);
  });
  it('un errore di iniezione non fa cadere il service worker', async () => {
    const f = createFakeChrome();
    f.chrome.scripting.executeScript = async () => { throw new Error('Cannot access contents'); };
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.toggle(tab)).toBe('error');
  });
  it('sempre attivo = permesso concesso per il sito; solo a pagina caricata', async () => {
    const f = createFakeChrome();
    const c = createController(f.chrome, { toolUrl: TOOL });
    await c.onTabUpdated(1, { status: 'complete' }, tab);
    expect(f.injections()).toHaveLength(0); // nessun permesso
    f.grant('https://rica.myshopify.com/*');
    expect(await c.isAlwaysOn('https://rica.myshopify.com')).toBe(true);
    await c.onTabUpdated(1, { status: 'loading' }, tab);
    expect(f.injections()).toHaveLength(0);
    await c.onTabUpdated(1, { status: 'complete' }, tab);
    expect(f.lastMode()).toBe('auto');
    expect(f.badges.at(-1)).toEqual({ tabId: 1, text: 'ON' });
    await c.onTabUpdated(2, { status: 'complete' }, { id: 2, url: 'https://altro.com/' });
    expect(f.injections()).toHaveLength(1);
  });
  it('se l\'iniezione fallisce non mostra ON', async () => {
    const f = createFakeChrome();
    f.grant('https://rica.myshopify.com/*');
    f.chrome.scripting.executeScript = async () => { throw new Error('x'); };
    await createController(f.chrome, { toolUrl: TOOL }).onTabUpdated(1, { status: 'complete' }, tab);
    expect(f.badges).toHaveLength(0);
  });
  it('spegnere sempre attivo revoca il permesso', async () => {
    const f = createFakeChrome();
    const c = createController(f.chrome, { toolUrl: TOOL });
    f.grant('https://rica.myshopify.com/*');
    await c.setAlwaysOn('https://rica.myshopify.com', false);
    expect(await c.isAlwaysOn('https://rica.myshopify.com')).toBe(false);
  });
  it('capture solo dal frame principale della scheda visibile (Review Focus 3)', async () => {
    const f = createFakeChrome();
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.capture({ tab: { ...tab, active: false }, frameId: 0 })).toBeNull();
    expect(await c.capture({ tab: { ...tab, active: true }, frameId: 3 })).toBeNull();
    expect(await c.capture({ tab: { ...tab, active: true }, frameId: 0 })).toBe('data:img');
  });
  it('capture senza permesso restituisce null', async () => {
    const f = createFakeChrome({ captureFails: true });
    expect(await createController(f.chrome, { toolUrl: TOOL }).capture({ tab: { ...tab, active: true }, frameId: 0 })).toBeNull();
  });
  it('isActive interroga la pagina', async () => {
    const f = createFakeChrome({ pageResult: true });
    expect(await createController(f.chrome, { toolUrl: TOOL }).isActive(tab)).toBe(true);
    expect(f.calls[0].func).toBe(isActiveProbe);
  });
  it('isActive vede anche la copia interna (mondo isolato) e poi la pagina', async () => {
    const f = createFakeChrome();
    f.setPageResult((inj: any) => inj.world === 'MAIN');
    expect(await createController(f.chrome, { toolUrl: TOOL }).isActive(tab)).toBe(true);
    expect(f.calls.map(x => x.world)).toEqual(['ISOLATED', 'MAIN']);
    f.setPageResult(() => false);
    expect(await createController(f.chrome, { toolUrl: TOOL }).isActive(tab)).toBe(false);
  });
});

describe('pageLoader (eseguito nella pagina)', () => {
  afterEach(() => { delete (window as any).__stageReview; delete (window as any).__stageReviewLoading; document.querySelectorAll('script').forEach(s => s.remove()); });
  it('apre aggiungendo lo script, segna il caricamento e risponde a script caricato', async () => {
    const r = pageLoader(TOOL, 'auto');
    expect((window as any).__stageReviewLoading).toBe(true);
    const s = document.querySelector('script')!;
    expect(s.src).toMatch(/tool\.js\?v=\d+&auto=1$/);
    s.dispatchEvent(new Event('load'));
    expect(await r).toBe('opened');
  });
  it('se il sito blocca lo script risponde "blocked", senza avvisi, e libera il caricamento', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const r = pageLoader(TOOL, 'toggle');
    document.querySelector('script')!.dispatchEvent(new Event('error'));
    expect(await r).toBe('blocked');
    expect((window as any).__stageReviewLoading).toBe(false);
    expect(document.querySelector('script')).toBeNull();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
  it('in toggle chiude un tool aperto, in auto lo lascia (Review Focus 1)', () => {
    const destroy = vi.fn();
    (window as any).__stageReview = { destroy };
    expect(pageLoader(TOOL, 'auto')).toBe('active');
    expect(destroy).not.toHaveBeenCalled();
    expect(pageLoader(TOOL, 'toggle')).toBe('closed');
    expect(destroy).toHaveBeenCalled();
  });
  it('durante il caricamento non aggiunge un secondo script', () => {
    (window as any).__stageReviewLoading = true;
    expect(pageLoader(TOOL, 'toggle')).toBe('loading');
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });
});

describe('copia interna (eseguita nel mondo isolato)', () => {
  afterEach(() => { for (const k of ['__stageReview', '__stageReviewLoading', '__stageReviewAuto']) delete (window as any)[k]; });
  it('isolatedToggle: niente tool → none; aperto → chiude in toggle, resta in auto', () => {
    expect(isolatedToggle('toggle')).toBe('none');
    const destroy = vi.fn();
    (window as any).__stageReview = { destroy };
    expect(isolatedToggle('auto')).toBe('active');
    expect(destroy).not.toHaveBeenCalled();
    expect(isolatedToggle('toggle')).toBe('closed');
    expect(destroy).toHaveBeenCalled();
  });
  it('prepareBundled passa la modalità al tool e segna il caricamento', () => {
    prepareBundled('auto');
    expect((window as any).__stageReviewAuto).toBe(true);
    expect((window as any).__stageReviewLoading).toBe(true);
    expect(isolatedToggle('toggle')).toBe('loading');
    prepareBundled('toggle');
    expect((window as any).__stageReviewAuto).toBe(false);
  });
});
