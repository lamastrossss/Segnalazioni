import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderIssueRow } from '../../src/board/issue-row';
import { fakeApi, ME, flush } from '../helpers/fake-deps';
import { makeIssue } from '../helpers/issue';

const profiles = new Map([[ME.id, ME], ['u2', { id: 'u2', name: 'Simona Brancato', color: '#A23B72' }]]);
let list: HTMLUListElement;
beforeEach(() => { list = document.createElement('ul'); document.body.replaceChildren(list); });

function mount(over: any = {}, me = ME) {
  const api = fakeApi();
  const onOpen = vi.fn(); const onSaved = vi.fn();
  const li = renderIssueRow(makeIssue({ id: 'i1', number: 54, author_id: 'u1', body: 'Aumentare padding', ...over }),
    { api, me: () => me, profilesById: profiles, onOpen, onSaved, thumb: async () => null });
  list.append(li);
  return { api, onOpen, onSaved, li };
}
// il testo visibile dei pulsanti, senza l'icona della matita
const btn = (li: HTMLElement, t: string) => [...li.querySelectorAll('button')].find(b => b.textContent?.replace('✎', '').trim() === t);

describe('riga dell\'elenco', () => {
  it('le mie segnalazioni hanno Modifica, quelle dei colleghi no', () => {
    expect(btn(mount().li, 'Modifica')).toBeDefined();
    expect(btn(mount({ author_id: 'u2' }).li, 'Modifica')).toBeUndefined();
  });
  it('clic sulla riga apre il dettaglio; clic su Modifica no', () => {
    const { li, onOpen } = mount();
    li.querySelector<HTMLButtonElement>('button.issue')!.click();
    expect(onOpen).toHaveBeenCalledWith('i1');
    onOpen.mockClear();
    btn(li, 'Modifica')!.click();
    expect(onOpen).not.toHaveBeenCalled();
    expect(li.querySelector('textarea')!.value).toBe('Aumentare padding');
  });
  it('Salva modifica il testo e avvisa', async () => {
    const { li, api, onSaved } = mount();
    btn(li, 'Modifica')!.click();
    li.querySelector('textarea')!.value = 'Aumentare padding a 48px';
    btn(li, 'Salva')!.click(); await flush();
    expect(api.editIssue).toHaveBeenCalledWith('i1', 'Aumentare padding a 48px');
    expect(onSaved).toHaveBeenCalledWith('i1');
  });
  it('Invio salva, Esc annulla', async () => {
    const { li, api } = mount();
    btn(li, 'Modifica')!.click();
    li.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(li.querySelector('textarea')).toBeNull();
    btn(li, 'Modifica')!.click();
    li.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(api.editIssue).toHaveBeenCalled();
  });
  it('Maiusc+Invio va a capo invece di salvare', () => {
    const { li, api } = mount();
    btn(li, 'Modifica')!.click();
    li.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(api.editIssue).not.toHaveBeenCalled();
  });
  it('errore: resta in modifica con il messaggio', async () => {
    const { li, api } = mount();
    (api.editIssue as any).mockResolvedValueOnce({ ok: false, error: { kind: 'unknown', message: 'Scrivi cosa non va.' } });
    btn(li, 'Modifica')!.click();
    btn(li, 'Salva')!.click(); await flush();
    expect(li.querySelector('textarea')).not.toBeNull();
    expect(li.textContent).toContain('Scrivi cosa non va.');
  });
  it('mostra il pallino se modificata e il testo resta testo', () => {
    const { li } = mount({ edited_at: new Date().toISOString(), body: '<img src=x onerror=alert(1)>' });
    expect(li.querySelector('.edited')!.textContent).toMatch(/^Modificata alle/);
    expect(li.querySelector('img:not(.thumb)')).toBeNull();
  });
});
