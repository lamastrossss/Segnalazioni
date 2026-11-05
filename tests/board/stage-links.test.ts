import { describe, it, expect } from 'vitest';
import { stageLinks } from '../../src/board/stage-links';

describe('link dello stage', () => {
  it('ogni dominio è un link che apre una nuova scheda, con la freccia', () => {
    const p = stageLinks(['rica.myshopify.com', 'abc.shopifypreview.com']);
    const links = [...p.querySelectorAll('a')];
    expect(links.map(a => a.href)).toEqual(['https://rica.myshopify.com/', 'https://abc.shopifypreview.com/']);
    expect(links.every(a => a.target === '_blank' && a.rel === 'noopener')).toBe(true);
    expect(links[0].textContent).toBe('rica.myshopify.com↗');
    expect(links[0].querySelector('.arrow')!.getAttribute('aria-hidden')).toBe('true');
    expect(links[0].getAttribute('aria-label')).toBe('Vai allo stage rica.myshopify.com (si apre in una nuova scheda)');
    expect(p.className).toContain('stage-links');
  });
  it('un dominio con markup resta testo', () => {
    const p = stageLinks(['<img src=x>.com']);
    expect(p.querySelector('img')).toBeNull();
  });
});
