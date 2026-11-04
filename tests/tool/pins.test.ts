import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinLayer } from '../../src/tool/pins';
import { makeIssue } from '../helpers/issue';

function mockRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => ({}),
  } as DOMRect);
}
const nextFrame = () => new Promise(r => setTimeout(r, 30));

let host: HTMLElement, shadow: ShadowRoot, layer: ReturnType<typeof createPinLayer>;
const onOpen = vi.fn();
const profiles = new Map([['u1', { id: 'u1', name: 'Alessandra Mastroeni', color: '#E4572E' }]]);

beforeEach(() => {
  document.body.innerHTML = '<header id="top"><nav>Menu</nav></header><main><h2>Titolo</h2></main>';
  host = document.createElement('div');
  document.documentElement.append(host);
  shadow = host.attachShadow({ mode: 'open' });
  onOpen.mockReset();
  layer = createPinLayer(shadow, window, profiles, onOpen);
});
afterEach(() => { layer.destroy(); host.remove(); });

const onHeader = makeIssue({ id: 'h', anchor: { selector: '#top', tag: 'HEADER', text: 'Menu', offset: { x: 0.4, y: 0.3 }, page: { x: 400, y: 24, docHeight: 2000 } } });

describe('livello pin', () => {
  it('il pin segue un elemento sticky durante lo scroll (Review Focus 3)', async () => {
    const header = document.getElementById('top')!;
    mockRect(header, { top: 0, left: 0, width: 1000, height: 80 });
    layer.render([{ issue: onHeader, muted: false }]);
    (window as any).scrollY = 500;
    window.dispatchEvent(new Event('scroll'));
    await nextFrame();
    const pin = shadow.querySelector<HTMLElement>('.sr-pin')!;
    expect(pin.style.transform).toBe('translate(400px, 24px)');
  });
  it('mostra iniziali e colore dell\'autore e apre il thread al clic', () => {
    layer.render([{ issue: onHeader, muted: false }]);
    const pin = shadow.querySelector<HTMLButtonElement>('.sr-pin')!;
    expect(pin.textContent).toBe('AM');
    expect(pin.style.background).toContain('228, 87, 46');
    pin.click();
    expect(onOpen).toHaveBeenCalledWith('h');
  });
  it('un elemento sparito dà un pin tratteggiato con avviso', () => {
    const gone = makeIssue({ id: 'g', anchor: { selector: '#nope', tag: 'DIV', text: 'zzz', offset: { x: 0, y: 0 }, page: { x: 10, y: 10, docHeight: 0 } } });
    layer.render([{ issue: gone, muted: false }]);
    const pin = shadow.querySelector<HTMLElement>('.sr-pin')!;
    expect(pin.classList.contains('sr-moved')).toBe(true);
    expect(pin.title).toContain('Elemento spostato o rimosso');
  });
  it('i pin di altre viewport sono attenuati con etichetta', () => {
    layer.render([{ issue: { ...onHeader, viewport_class: 'tablet', viewport_width: 768 }, muted: true }]);
    const pin = shadow.querySelector<HTMLElement>('.sr-pin')!;
    expect(pin.classList.contains('sr-muted-pin')).toBe(true);
    expect(pin.title).toContain('Tablet 768');
  });
  it('il testo del title resta testo (Review Focus 4)', () => {
    layer.render([{ issue: { ...onHeader, body: '<img src=x onerror=alert(1)>' }, muted: false }]);
    expect(shadow.querySelector('img')).toBeNull();
  });
  it('focus evidenzia il pin; id inesistente → false', () => {
    layer.render([{ issue: onHeader, muted: false }]);
    window.scrollBy = vi.fn() as any;
    expect(layer.focus('h')).toBe(true);
    expect(shadow.querySelector('.sr-pin')!.classList.contains('sr-focus')).toBe(true);
    expect(layer.focus('nessuno')).toBe(false);
  });
});
