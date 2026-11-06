import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createComposer, type NewIssueContext } from '../../src/tool/composer';
import { ERROR_TEXT } from '../../src/shared/errors';
import type { PreparedImage } from '../../src/shared/media';
import { fakeApi, ME, flush } from '../helpers/fake-deps';
import { makeIssue } from '../helpers/issue';

let host: HTMLElement, shadow: ShadowRoot;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); shadow = host.attachShadow({ mode: 'open' }); });
afterEach(() => host.remove());

const fakePrepare = async (f: File): Promise<PreparedImage> => ({ blob: f, width: 1, height: 1, bytes: f.size, ext: 'jpg', name: f.name });
const ctx = (over: Partial<NewIssueContext> = {}): NewIssueContext => ({
  anchor: { selector: 'h2', tag: 'H2', text: 'Titolo', offset: { x: 0, y: 0 }, page: { x: 0, y: 0, docHeight: 0 } },
  pagePath: '/p', pageUrl: 'https://x/p', viewportClass: 'mobile', viewportWidth: 375,
  screenshot: { blob: new Blob(['s']), width: 1, height: 1, bytes: 1, ext: 'jpg', name: 'shot' },
  duplicates: [], ...over,
});

function setup(me = ME) {
  const api = fakeApi();
  const onSaved = vi.fn();
  const reauth = vi.fn(async () => me);
  const composer = createComposer(shadow, {
    api, me: () => me, projectId: 'p1', reauth, onSaved, onChanged: vi.fn(), profilesById: new Map([[ME.id, ME]]), prepare: fakePrepare,
  });
  return { api, onSaved, reauth, composer };
}
const textarea = () => shadow.querySelector('textarea')!;
const type = (t: HTMLTextAreaElement, v: string) => { t.value = v; t.dispatchEvent(new Event('input')); };
const save = () => shadow.querySelector<HTMLButtonElement>('.sr-save')!;
const text = () => shadow.textContent ?? '';
const savedIssue = makeIssue({ id: 'i1', number: 3 });

describe('composer nuova segnalazione', () => {
  it('i doppioni mostrano il testo come testo (Review Focus 4)', () => {
    const { composer } = setup();
    composer.openNew(ctx({ duplicates: [{ issue: makeIssue({ id: 'd', body: '<img src=x onerror=alert(1)>' }), relation: 'same', sameViewport: true }] }));
    expect(shadow.querySelector('.sr-dup')).not.toBeNull();
    expect(shadow.querySelector('.sr-dup img')).toBeNull();
    expect(text()).toContain('Crea comunque nuova');
  });
  it('offline: la bozza resta e Riprova salva', async () => {
    const { api, composer, onSaved } = setup();
    api.createIssue
      .mockResolvedValueOnce({ ok: false, error: { kind: 'offline', message: ERROR_TEXT.offline } })
      .mockResolvedValueOnce({ ok: true, value: { issue: savedIssue, failed: [] } });
    composer.openNew(ctx());
    type(textarea(), 'Titolo troppo vicino');
    save().click(); await flush();
    expect(textarea().value).toBe('Titolo troppo vicino');
    expect(text()).toContain(ERROR_TEXT.offline);
    expect(save().textContent).toBe('Riprova');
    save().click(); await flush();
    expect(api.createIssue).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledWith(savedIssue);
    expect(composer.isOpen()).toBe(false);
  });
  it('sessione scaduta: login e nuovo tentativo con la stessa bozza (Review Focus 5)', async () => {
    const { api, composer, reauth } = setup();
    api.createIssue
      .mockResolvedValueOnce({ ok: false, error: { kind: 'auth', message: '' } })
      .mockResolvedValueOnce({ ok: true, value: { issue: savedIssue, failed: [] } });
    composer.openNew(ctx());
    type(textarea(), 'Titolo troppo vicino');
    save().click(); await flush(); await flush();
    expect(reauth).toHaveBeenCalled();
    expect(api.createIssue).toHaveBeenCalledTimes(2);
    expect(api.createIssue.mock.calls[1][0].body).toBe('Titolo troppo vicino');
  });
  it('6 immagini incollate → 5 accettate e messaggio', async () => {
    const { composer } = setup();
    composer.openNew(ctx());
    const files = Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }));
    const ev = new Event('paste', { bubbles: true, composed: true });
    Object.defineProperty(ev, 'clipboardData', { value: { files } });
    textarea().dispatchEvent(ev);
    await flush(); await flush();
    expect(shadow.querySelectorAll('.sr-thumb')).toHaveLength(5);
    expect(text()).toContain('Massimo 5 immagini');
  });
  it('senza screenshot avvisa ma permette di salvare', async () => {
    const { api, composer } = setup();
    api.createIssue.mockResolvedValueOnce({ ok: true, value: { issue: savedIssue, failed: [] } });
    composer.openNew(ctx({ screenshot: null }));
    expect(text()).toContain('Screenshot non disponibile: la segnalazione verrà salvata senza');
    type(textarea(), 'ok');
    save().click(); await flush();
    expect(api.createIssue.mock.calls[0][1]).toBeNull();
  });
  it('testo vuoto non si salva', async () => {
    const { api, composer } = setup();
    composer.openNew(ctx());
    save().click(); await flush();
    expect(api.createIssue).not.toHaveBeenCalled();
  });
  it('allegato fallito resta con Riprova senza ricreare la segnalazione', async () => {
    const { api, composer } = setup();
    const img: PreparedImage = { blob: new Blob(['a']), width: 1, height: 1, bytes: 1, ext: 'jpg', name: 'a.jpg' };
    api.createIssue.mockResolvedValueOnce({ ok: true, value: { issue: savedIssue, failed: [img] } });
    api.uploadAttachment.mockResolvedValueOnce({ ok: true, value: {} as never });
    composer.openNew(ctx());
    type(textarea(), 'con allegato');
    save().click(); await flush();
    expect(composer.isOpen()).toBe(true);
    shadow.querySelector<HTMLButtonElement>('.sr-retry-att')!.click(); await flush();
    expect(api.uploadAttachment).toHaveBeenCalledWith(savedIssue, img, null);
    expect(api.createIssue).toHaveBeenCalledTimes(1);
  });
});

describe('thread', () => {
  it('Elimina compare solo all\'autore', async () => {
    const other = { id: 'u2', name: 'Marco', color: '#2E86AB' };
    const { api, composer } = setup(other);
    api.getIssue.mockResolvedValueOnce({ ok: true, value: { ...makeIssue({ id: 'i1', author_id: 'u1' }), replies: [], attachments: [] } });
    await composer.openThread('i1');
    expect([...shadow.querySelectorAll('button')].some(b => b.textContent === 'Elimina')).toBe(false);
  });
  it('l\'autore vede Elimina e il testo resta testo', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValueOnce({ ok: true, value: { ...makeIssue({ id: 'i1', author_id: 'u1', body: '<b>x</b>' }),
      replies: [{ id: 'r1', issue_id: 'i1', author_id: 'u1', body: '<i>y</i>', created_at: 't', deleted_at: null, attachments: [] }], attachments: [] } });
    await composer.openThread('i1');
    expect([...shadow.querySelectorAll('button')].some(b => b.textContent === 'Elimina')).toBe(true);
    expect(shadow.querySelector('.sr-panel b, .sr-panel i')).toBeNull();
  });
  it('cambio di stato chiama setStatus', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValue({ ok: true, value: { ...makeIssue({ id: 'i1' }), replies: [], attachments: [] } });
    await composer.openThread('i1');
    const sel = shadow.querySelector<HTMLSelectElement>('select.sr-status')!;
    sel.value = 'resolved'; sel.dispatchEvent(new Event('change'));
    await flush();
    expect(api.setStatus).toHaveBeenCalledWith('i1', 'resolved');
  });
});

describe('thread live', () => {
  it('non ricarica il thread mentre si scrive una risposta', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValue({ ok: true, value: { ...makeIssue({ id: 'i1' }), replies: [], attachments: [] } });
    await composer.openThread('i1');
    shadow.querySelector('textarea')!.value = 'sto scrivendo';
    composer.refreshIfIdle('i1');
    await flush();
    expect(api.getIssue).toHaveBeenCalledTimes(1);
    expect(shadow.querySelector('textarea')!.value).toBe('sto scrivendo');
  });
});

describe('chiusura dei pannelli', () => {
  it('il dettaglio ha una × in alto con nome accessibile e niente pulsante "Chiudi"', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValueOnce({ ok: true, value: { ...makeIssue({ id: 'i1' }), replies: [], attachments: [] } });
    await composer.openThread('i1');
    const x = shadow.querySelector<HTMLButtonElement>('.sr-panel-head .sr-close')!;
    expect(x.textContent).toBe('×');
    expect(x.getAttribute('aria-label')).toBe('Chiudi');
    expect([...shadow.querySelectorAll('button')].some(b => b.textContent === 'Chiudi')).toBe(false);
    x.click();
    expect(composer.isOpen()).toBe(false);
  });
  it('anche la nuova segnalazione si chiude con la ×', () => {
    const { composer } = setup();
    composer.openNew(ctx());
    shadow.querySelector<HTMLButtonElement>('.sr-close')!.click();
    expect(composer.isOpen()).toBe(false);
  });
});

describe('senza +1', () => {
  it('né nel dettaglio né tra i doppioni', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValueOnce({ ok: true, value: { ...makeIssue({ id: 'i1' }), replies: [], attachments: [] } });
    await composer.openThread('i1');
    expect([...shadow.querySelectorAll('button')].some(b => b.textContent?.startsWith('+1'))).toBe(false);
    composer.openNew(ctx({ duplicates: [{ issue: makeIssue({ id: 'd' }), relation: 'same', sameViewport: true }] }));
    expect([...shadow.querySelectorAll('button')].some(b => b.textContent?.startsWith('+1'))).toBe(false);
    expect(shadow.textContent).toContain('Rispondi');
  });
});

describe('modifica della segnalazione', () => {
  const detail = (over: any = {}) => ({ ok: true as const, value: { ...makeIssue({ id: 'i1', author_id: 'u1', body: 'Testo iniziale', ...over }), replies: [], attachments: [] } });
  const button = (t: string) => [...shadow.querySelectorAll('button')].find(b => b.textContent === t);

  it('l\'autore modifica il testo; il dettaglio si ricarica', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail({ body: 'Testo corretto', edited_at: new Date().toISOString() }));
    await composer.openThread('i1');
    button('Modifica')!.click();
    const ta = shadow.querySelector<HTMLTextAreaElement>('.sr-edit textarea')!;
    expect(ta.value).toBe('Testo iniziale');
    ta.value = 'Testo corretto';
    shadow.querySelector<HTMLButtonElement>('.sr-edit .sr-btn:not(.sr-ghost)')!.click();
    await flush(); await flush();
    expect(api.editIssue).toHaveBeenCalledWith('i1', 'Testo corretto');
    expect(shadow.querySelector('.sr-body')!.textContent).toBe('Testo corretto');
    expect(shadow.querySelector('.sr-edited')!.textContent).toMatch(/^Modificata alle \d\d:\d\d$/);
  });

  it('Annulla torna al testo senza salvare; errore mostrato restando in modifica', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValue(detail());
    await composer.openThread('i1');
    button('Modifica')!.click();
    button('Annulla')!.click();
    expect(shadow.querySelector('.sr-edit')).toBeNull();
    expect(api.editIssue).not.toHaveBeenCalled();
    (api.editIssue as any).mockResolvedValueOnce({ ok: false, error: { kind: 'forbidden', message: "solo l'autore può modificare il testo" } });
    button('Modifica')!.click();
    shadow.querySelector<HTMLButtonElement>('.sr-edit .sr-btn:not(.sr-ghost)')!.click();
    await flush();
    expect(shadow.querySelector('.sr-edit')).not.toBeNull();
    expect(shadow.textContent).toContain("solo l'autore può modificare il testo");
  });

  it('un collega non vede Modifica; vede però che è stata modificata', async () => {
    const other = { id: 'u2', name: 'Marco', color: '#2E86AB' };
    const { api, composer } = setup(other);
    api.getIssue.mockResolvedValueOnce(detail({ edited_at: '2026-11-05T09:05:00Z' }));
    await composer.openThread('i1');
    expect(button('Modifica')).toBeUndefined();
    expect(shadow.querySelector('.sr-edited')!.textContent).toMatch(/^Modificata (il|alle)/);
  });

  it('senza modifiche non c\'è la dicitura', async () => {
    const { api, composer } = setup();
    api.getIssue.mockResolvedValueOnce(detail());
    await composer.openThread('i1');
    expect(shadow.querySelector('.sr-edited')).toBeNull();
  });
});

