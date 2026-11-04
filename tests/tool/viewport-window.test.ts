import { describe, it, expect, vi } from 'vitest';
import { nextResizeDelta, openViewportWindow } from '../../src/tool/viewport-window';

describe('finestre viewport', () => {
  it('nextResizeDelta corregge solo differenze oltre 1px', () => {
    expect(nextResizeDelta(375, 360)).toBe(15);
    expect(nextResizeDelta(375, 376)).toBe(0);
    expect(nextResizeDelta(768, 790)).toBe(-22);
  });
  it('popup bloccato → null', () => {
    const win = { open: vi.fn(() => null), location: { href: 'https://x/p' } } as unknown as Window;
    expect(openViewportWindow(win, 'mobile', 'https://u/tool.js')).toBeNull();
  });
  it('apre la stessa pagina a 375×812 e inietta il tool quando è caricata', () => {
    vi.useFakeTimers();
    const doc = document.implementation.createHTMLDocument('popup');
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const popup = { document: doc, innerWidth: 375, closed: false, resizeBy: vi.fn(), location: { href: 'https://x/p?v=1' } };
    const open = vi.fn(() => popup);
    const win = { open, location: { href: 'https://x/p?v=1' } } as unknown as Window;
    expect(openViewportWindow(win, 'mobile', 'https://u/tool.js')).toBe(popup);
    expect(open).toHaveBeenCalledWith('https://x/p?v=1', 'sr-mobile', 'width=375,height=812');
    vi.advanceTimersByTime(600);
    expect(doc.querySelector('script')!.src).toMatch(/^https:\/\/u\/tool\.js\?v=\d+$/);
    popup.closed = true; vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });
});

describe('finestre viewport dopo una navigazione', () => {
  it('reinietta il tool quando la finestra carica una nuova pagina', async () => {
    vi.useFakeTimers();
    const mkDoc = () => { const d = document.implementation.createHTMLDocument('p'); Object.defineProperty(d, 'readyState', { value: 'complete' }); return d; };
    const popup: any = { document: mkDoc(), innerWidth: 375, closed: false, resizeBy: vi.fn(), addEventListener: () => {}, location: { href: 'https://x/a' } };
    const win = { open: vi.fn(() => popup), location: { href: 'https://x/a' } } as unknown as Window;
    openViewportWindow(win, 'mobile', 'https://u/tool.js');
    vi.advanceTimersByTime(600);
    expect(popup.document.querySelectorAll('script')).toHaveLength(1);
    vi.advanceTimersByTime(1200);
    expect(popup.document.querySelectorAll('script')).toHaveLength(1); // non duplica sulla stessa pagina
    // l'utente ha cliccato un link nella finestra: nuovo documento e variabili globali azzerate, come in Chrome
    popup.document = mkDoc(); popup.location.href = 'https://x/b'; delete popup.__stageReviewLoading;
    vi.advanceTimersByTime(600);
    expect(popup.document.querySelectorAll('script')).toHaveLength(1);
    popup.closed = true;
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });
});

describe('finestre viewport e caricamento in corso', () => {
  it('non inietta se il tool sta già caricando (es. estensione "sempre attivo")', () => {
    vi.useFakeTimers();
    const doc = document.implementation.createHTMLDocument('p');
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const popup: any = { document: doc, innerWidth: 375, closed: false, resizeBy: vi.fn(), location: { href: 'https://x/a' }, __stageReviewLoading: true };
    openViewportWindow({ open: () => popup, location: { href: 'https://x/a' } } as unknown as Window, 'mobile', 'https://u/tool.js');
    vi.advanceTimersByTime(600);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    popup.closed = true; vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });
  it('segna il caricamento quando inietta', () => {
    vi.useFakeTimers();
    const doc = document.implementation.createHTMLDocument('p');
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const popup: any = { document: doc, innerWidth: 375, closed: false, resizeBy: vi.fn(), location: { href: 'https://x/a' } };
    openViewportWindow({ open: () => popup, location: { href: 'https://x/a' } } as unknown as Window, 'mobile', 'https://u/tool.js');
    vi.advanceTimersByTime(600);
    expect(popup.__stageReviewLoading).toBe(true);
    popup.closed = true; vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });
});

describe('finestre viewport: errore di caricamento', () => {
  it('se tool.js non si carica, il flag torna libero', () => {
    vi.useFakeTimers();
    const doc = document.implementation.createHTMLDocument('p');
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const popup: any = { document: doc, innerWidth: 375, closed: false, resizeBy: vi.fn(), location: { href: 'https://x/a' } };
    openViewportWindow({ open: () => popup, location: { href: 'https://x/a' } } as unknown as Window, 'mobile', 'https://u/tool.js');
    vi.advanceTimersByTime(600);
    doc.querySelector('script')!.dispatchEvent(new Event('error'));
    expect(popup.__stageReviewLoading).toBe(false);
    popup.closed = true; vi.advanceTimersByTime(600);
    vi.useRealTimers();
  });
});
