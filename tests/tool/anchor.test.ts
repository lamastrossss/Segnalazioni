import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSelector, createAnchor, resolveAnchor, anchorPoint } from '../../src/tool/anchor';

function mockRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => ({}),
  } as DOMRect);
}

beforeEach(() => {
  document.body.innerHTML = `
    <div id="shopify-section-template--123__main">
      <div><p>intro</p></div>
      <div><h2>  Opuntia   Oil Mask </h2><p>Maschera nutriente per capelli secchi</p></div>
    </div>
    <section><div id="a8f3c9d2e1"><span>Prezzo</span></div></section>`;
});

const h2 = () => document.querySelector('h2')!;

describe('buildSelector', () => {
  it('parte dall\'id di sezione Shopify', () => {
    expect(buildSelector(h2())).toBe('#shopify-section-template--123__main > div:nth-of-type(2) > h2:nth-of-type(1)');
  });
  it('ignora gli id casuali', () => {
    const span = document.querySelector('span')!;
    const sel = buildSelector(span);
    expect(sel).not.toContain('#a8f3c9d2e1');
    expect(document.querySelector(sel)).toBe(span);
  });
  it('rispetta la profondità massima', () => {
    expect(buildSelector(h2(), 1)).toBe('h2:nth-of-type(1)');
  });
});

describe('createAnchor', () => {
  it('calcola offset, testo normalizzato e coordinate di pagina', () => {
    mockRect(h2(), { left: 100, top: 200, width: 200, height: 100 });
    const a = createAnchor(h2(), 150, 230, window);
    expect(a.offset).toEqual({ x: 0.25, y: 0.3 });
    expect(a.tag).toBe('H2');
    expect(a.text).toBe('Opuntia Oil Mask');
    expect(a.page.x).toBe(150);
    expect(a.page.y).toBe(230);
  });
  it('tronca il testo a 60 caratteri', () => {
    const p = document.querySelectorAll('p')[1];
    p.textContent = 'x'.repeat(100);
    expect(createAnchor(p, 0, 0, window).text).toHaveLength(60);
  });
});

describe('resolveAnchor', () => {
  it('ritrova l\'elemento con il selettore', () => {
    const a = createAnchor(h2(), 0, 0, window);
    expect(resolveAnchor(a, document)).toEqual({ element: h2(), moved: false });
  });
  it('ritrova per testo se la struttura cambia', () => {
    const a = createAnchor(h2(), 0, 0, window);
    const wrapper = document.createElement('div');
    document.body.prepend(wrapper);
    wrapper.append(h2());
    expect(resolveAnchor(a, document)).toEqual({ element: h2(), moved: false });
  });
  it('rifiuta un tag diverso sullo stesso selettore', () => {
    const a = { ...createAnchor(h2(), 0, 0, window), tag: 'P' };
    expect(resolveAnchor(a, document).moved).toBe(true);
  });
  it('segna come spostato se selettore e testo non tornano', () => {
    const a = createAnchor(h2(), 0, 0, window);
    h2().remove();
    expect(resolveAnchor(a, document)).toEqual({ element: null, moved: true });
  });
  it('tollera un testo leggermente cambiato in coda', () => {
    const a = createAnchor(h2(), 0, 0, window);
    h2().textContent = 'Opuntia Oil Mask — Novità';
    expect(resolveAnchor(a, document)).toEqual({ element: h2(), moved: false });
  });
});

describe('anchorPoint', () => {
  it('usa il rettangolo attuale dell\'elemento', () => {
    mockRect(h2(), { left: 100, top: 200, width: 200, height: 100 });
    const a = createAnchor(h2(), 150, 230, window);
    mockRect(h2(), { left: 10, top: 20, width: 400, height: 50 });
    expect(anchorPoint(a, { element: h2(), moved: false }, window)).toEqual({ x: 110, y: 35 });
  });
  it('per un pin spostato scala la y sull\'altezza del documento', () => {
    const a = { selector: 'x', tag: 'H2', text: '', offset: { x: 0, y: 0 }, page: { x: 50, y: 1000, docHeight: 2000 } };
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 4000, configurable: true });
    expect(anchorPoint(a, { element: null, moved: true }, window)).toEqual({ x: 50, y: 2000 });
  });
});
