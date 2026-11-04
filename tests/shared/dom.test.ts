import { describe, it, expect, vi } from 'vitest';
import { el } from '../../src/shared/dom';

describe('el', () => {
  it('rende il markup utente come testo', () => {
    const n = el('p', { text: '<img src=x onerror=alert(1)>' });
    expect(n.querySelector('img')).toBeNull();
    expect(n.textContent).toBe('<img src=x onerror=alert(1)>');
  });
  it('i figli stringa diventano nodi di testo', () => {
    const n = el('div', {}, ['<b>x</b>', el('span', { text: 'y' })]);
    expect(n.querySelector('b')).toBeNull();
    expect(n.querySelector('span')!.textContent).toBe('y');
  });
  it('imposta classe, attributi e listener', () => {
    const fn = vi.fn();
    const b = el('button', { class: 'a', attrs: { 'data-id': '1' }, on: { click: fn } });
    b.click();
    expect(b.className).toBe('a');
    expect(b.getAttribute('data-id')).toBe('1');
    expect(fn).toHaveBeenCalled();
  });
});
