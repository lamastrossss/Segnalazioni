import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSession } from '../../src/tool/session';
import { mountRoot } from '../../src/tool/root';
import { fakeApi, fakeAuth, fakeLive, ME, PROJECT, flush } from '../helpers/fake-deps';
import { makeIssue as base } from '../helpers/issue';

// jsdom ha innerWidth 1024 → viewport tablet
const makeIssue: typeof base = o => base({ viewport_class: 'tablet', ...o });

let cleanup: (() => void)[] = [];
afterEach(() => { cleanup.forEach(f => f()); cleanup = []; history.replaceState({}, '', '/'); });

function start(issues = [makeIssue({ id: 'i1', page_path: '/', number: 7, body: 'Titolo troppo vicino' })]) {
  document.body.innerHTML = '<h2>Titolo</h2>';
  const root = mountRoot(document);
  const api = fakeApi(issues);
  const s = createSession({ win: window, root, api, auth: fakeAuth(), live: fakeLive(), me: ME, project: PROJECT, onClose: vi.fn() });
  cleanup.push(() => { s.destroy(); root.destroy(); });
  return { s, root, api };
}

describe('sessione', () => {
  it('disegna i pin della pagina e aggiorna il conteggio', async () => {
    const { s, root } = start();
    await s.ready;
    expect(root.shadow.querySelectorAll('.sr-pin')).toHaveLength(1);
    expect(root.shadow.querySelector('.sr-toolbar')!.textContent).toContain('Elenco (1)');
  });
  it('clic su una riga dell\'elenco evidenzia il pin', async () => {
    const { s, root } = start();
    await s.ready;
    window.scrollBy = vi.fn() as any;
    const listBtn = [...root.shadow.querySelectorAll('button')].find(b => b.textContent?.startsWith('Elenco'))!;
    listBtn.click();
    root.shadow.querySelector<HTMLElement>('.sr-list-panel li[data-issue="i1"]')!.click();
    expect(root.shadow.querySelector('.sr-pin')!.classList.contains('sr-focus')).toBe(true);
  });
  it('cambiando pagina senza ricaricare i pin si aggiornano (Review Focus 2)', async () => {
    const { s, root } = start([makeIssue({ id: 'a', page_path: '/' }), makeIssue({ id: 'b', page_path: '/products/x' })]);
    await s.ready;
    expect([...root.shadow.querySelectorAll('.sr-pin')].map(p => (p as HTMLElement).dataset.issue)).toEqual(['a']);
    history.pushState({}, '', '/products/x?variant=1');
    await flush();
    expect([...root.shadow.querySelectorAll('.sr-pin')].map(p => (p as HTMLElement).dataset.issue)).toEqual(['b']);
  });
  it('l\'hash #stage-review= porta alla segnalazione anche se di un\'altra viewport', async () => {
    history.replaceState({}, '', '/#stage-review=t1');
    window.scrollBy = vi.fn() as any;
    const { s, root } = start([makeIssue({ id: 't1', page_path: '/', viewport_class: 'mobile' })]);
    await s.ready;
    expect(s.state.allViewports).toBe(true);
    expect(root.shadow.querySelector('.sr-pin')!.classList.contains('sr-focus')).toBe(true);
  });
});
