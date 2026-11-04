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
  it('apre la stessa pagina a 375×812 e inietta il tool al caricamento', () => {
    const doc = document.implementation.createHTMLDocument('popup');
    const listeners: Record<string, () => void> = {};
    const popup = { document: doc, innerWidth: 375, resizeBy: vi.fn(), addEventListener: (t: string, f: () => void) => { listeners[t] = f; } };
    const open = vi.fn(() => popup);
    const win = { open, location: { href: 'https://x/p?v=1' } } as unknown as Window;
    expect(openViewportWindow(win, 'mobile', 'https://u/tool.js')).toBe(popup);
    expect(open).toHaveBeenCalledWith('https://x/p?v=1', 'sr-mobile', 'width=375,height=812');
    listeners.load();
    const s = doc.querySelector('script')!;
    expect(s.src).toMatch(/^https:\/\/u\/tool\.js\?v=\d+$/);
  });
});
