import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSession } from '../../src/tool/session';
import { mountRoot } from '../../src/tool/root';
import { joinPresence } from '../../src/shared/live';
import { fakeApi, fakeAuth, fakeLive, ME, PROJECT, flush } from '../helpers/fake-deps';
import { makeIssue as base } from '../helpers/issue';

const makeIssue: typeof base = o => base({ viewport_class: 'tablet', page_path: '/', ...o });
let cleanup: (() => void)[] = [];
afterEach(() => { cleanup.forEach(f => f()); cleanup = []; });

function start(issues = [makeIssue({ id: 'i1' })]) {
  document.body.innerHTML = '<h2>Titolo</h2>';
  history.replaceState({}, '', '/');
  const root = mountRoot(document);
  const api = fakeApi(issues);
  const live = fakeLive();
  const s = createSession({ win: window, root, api, auth: fakeAuth(), live, me: ME, project: PROJECT, onClose: vi.fn() });
  cleanup.push(() => { s.destroy(); root.destroy(); });
  return { s, root, api, live };
}

describe('live nel tool', () => {
  it('una segnalazione creata da un collega compare come pin', async () => {
    const newer = makeIssue({ id: 'i9', number: 9 });
    const { s, root, api, live } = start([makeIssue({ id: 'i1' })]);
    await s.ready;
    api.getIssue.mockResolvedValueOnce({ ok: true, value: { ...newer, replies: [], attachments: [] } });
    live.emit('i9');
    await flush();
    expect(api.getIssue).toHaveBeenCalledWith('i9');
    expect([...root.shadow.querySelectorAll<HTMLElement>('.sr-pin')].map(p => p.dataset.issue)).toEqual(['i1', 'i9']);
  });
  it('una segnalazione eliminata da un collega sparisce', async () => {
    const { s, root, api, live } = start();
    await s.ready;
    api.getIssue.mockResolvedValueOnce({ ok: true, value: { ...makeIssue({ id: 'i1', deleted_at: 'x' }), replies: [], attachments: [] } });
    live.emit('i1');
    await flush();
    expect(root.shadow.querySelectorAll('.sr-pin')).toHaveLength(0);
  });
  it('mostra gli avatar dei colleghi e aggiorna la presenza al cambio pagina', async () => {
    const { s, root, live } = start();
    await s.ready;
    expect(live.join).toHaveBeenCalledWith('p1', expect.objectContaining({ userId: 'u1', page_path: '/' }), expect.any(Function));
    live.sync([{ userId: 'u2', name: 'Marco Rossi', color: '#2E86AB', page_path: '/p', viewport_class: 'mobile' }]);
    const av = root.shadow.querySelector<HTMLElement>('.sr-avatar')!;
    expect(av.textContent).toBe('MR');
    expect(av.title).toBe('Marco Rossi · /p · Mobile');
    history.pushState({}, '', '/products/z');
    expect(live.presence.update).toHaveBeenCalledWith(expect.objectContaining({ page_path: '/products/z' }));
  });
  it('avvisa quando lo spazio supera l\'80%', async () => {
    const { s, root, api } = start();
    api.totalUsageBytes.mockResolvedValue({ ok: true, value: 900_000_000 });
    await s.ready; await flush();
    expect(root.shadow.textContent).toContain('Spazio quasi pieno (84%)');
  });
});

describe('joinPresence', () => {
  it('esclude se stessi dagli altri', () => {
    let syncCb: () => void = () => {};
    const channel = {
      on: (_t: string, _f: unknown, cb: () => void) => { syncCb = cb; return channel; },
      subscribe: () => channel,
      presenceState: () => ({ u1: [{ userId: 'u1', name: 'Io' }], u2: [{ userId: 'u2', name: 'Marco' }] }),
      track: vi.fn(), untrack: vi.fn(),
    };
    const client = { channel: () => channel, removeChannel: vi.fn() } as never;
    const onSync = vi.fn();
    joinPresence(client, 'p1', { userId: 'u1', name: 'Io', color: '#000', page_path: '/', viewport_class: 'mobile' }, onSync);
    syncCb();
    expect(onSync).toHaveBeenCalledWith([{ userId: 'u2', name: 'Marco' }]);
  });
});
