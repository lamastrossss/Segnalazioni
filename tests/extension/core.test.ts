import { describe, it, expect, vi, afterEach } from 'vitest';
import { isScriptable, originOf, pageLoader, isActiveProbe, createController } from '../../extension/lib/core.js';
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
  it('toggle inietta prima il ponte, poi il loader nel mondo MAIN', async () => {
    const f = createFakeChrome();
    const c = createController(f.chrome, { toolUrl: TOOL });
    expect(await c.toggle(tab)).toBe('opened');
    expect(f.calls.map(x => [x.files?.[0] ?? x.func.name, x.world ?? 'ISOLATED', x.args?.[1]]))
      .toEqual([['bridge.js', 'ISOLATED', undefined], ['pageLoader', 'MAIN', 'toggle']]);
    expect(f.calls[1].args[0]).toBe(TOOL);
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
});

describe('pageLoader (eseguito nella pagina)', () => {
  afterEach(() => { delete (window as any).__stageReview; delete (window as any).__stageReviewLoading; document.querySelectorAll('script').forEach(s => s.remove()); });
  it('apre aggiungendo lo script e segnando il caricamento', () => {
    expect(pageLoader(TOOL, 'auto')).toBe('opened');
    expect((window as any).__stageReviewLoading).toBe(true);
    expect(document.querySelector('script')!.src).toMatch(/tool\.js\?v=\d+&auto=1$/);
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
