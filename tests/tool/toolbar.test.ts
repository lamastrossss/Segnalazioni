import { describe, it, expect, vi } from 'vitest';
import { createToolbar } from '../../src/tool/toolbar';

function setup() {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const h = { onToggleComment: vi.fn(), onViewport: vi.fn(), onToggleAllViewports: vi.fn(), onToggleResolved: vi.fn(), onOpenList: vi.fn(), onOpenBoard: vi.fn(), onClose: vi.fn() };
  const tb = createToolbar(shadow, 'Rica', h);
  return { shadow, h, tb };
}
const btn = (s: ShadowRoot, label: string) => [...s.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent?.trim().startsWith(label))!;

describe('barra', () => {
  it('i filtri stanno in un menu', () => {
    const { shadow, h, tb } = setup();
    const pop = shadow.querySelector<HTMLElement>('.sr-pop')!;
    expect(pop.hidden).toBe(true);
    btn(shadow, 'Filtri').click();
    expect(pop.hidden).toBe(false);
    btn(shadow, 'Tutte le viewport').click();
    expect(h.onToggleAllViewports).toHaveBeenCalled();
    tb.setToggles({ allViewports: true, resolved: false });
    expect(btn(shadow, 'Filtri').textContent).toContain('1');
  });
  it('ha etichette corte per le finestre strette', () => {
    const { shadow } = setup();
    const mobile = shadow.querySelector('[data-vp="mobile"]')!;
    expect(mobile.querySelector('.sr-short')!.textContent).toBe('M');
    expect(mobile.querySelector('.sr-long')!.textContent).toBe('Mobile');
  });
  it('chiudi e board hanno un nome accessibile', () => {
    const { shadow, h } = setup();
    btn(shadow, 'Chiudi Stage Review').click();
    btn(shadow, 'Apri la board').click();
    expect(h.onClose).toHaveBeenCalled();
    expect(h.onOpenBoard).toHaveBeenCalled();
  });
});
