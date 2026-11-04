import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCommentMode } from '../../src/tool/comment-mode';

let host: HTMLElement, ownButton: HTMLButtonElement, ownTextarea: HTMLTextAreaElement;
let mode: ReturnType<typeof createCommentMode>;
const onPick = vi.fn();
const onModeChange = vi.fn();

beforeEach(() => {
  document.body.innerHTML = '<a href="#x">link</a><input id="site-input" />';
  host = document.createElement('div');
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  ownButton = document.createElement('button');
  ownTextarea = document.createElement('textarea');
  shadow.append(ownButton, ownTextarea);
  onPick.mockReset(); onModeChange.mockReset();
  mode = createCommentMode(document, t => t === host || host.contains(t as Node), onPick, onModeChange);
});
afterEach(() => { mode.destroy(); host.remove(); });

const key = (k: string, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));

describe('modalità Commenta', () => {
  it('i clic sulla UI del tool non creano segnalazioni (Review Focus 1)', () => {
    mode.enable();
    ownButton.click();
    expect(onPick).not.toHaveBeenCalled();
  });
  it('intercetta il clic sul sito e lo consegna', () => {
    mode.enable();
    const link = document.querySelector('a')!;
    const nav = vi.fn();
    link.addEventListener('click', nav);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 5, clientY: 6 }));
    expect(onPick).toHaveBeenCalledWith(link, 5, 6);
    expect(nav).not.toHaveBeenCalled();
  });
  it('spenta, il sito funziona normalmente', () => {
    const link = document.querySelector('a')!;
    const nav = vi.fn();
    link.addEventListener('click', nav);
    link.click();
    expect(nav).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
  it('C attiva e disattiva, Esc spegne', () => {
    key('c'); expect(mode.isOn()).toBe(true);
    key('C'); expect(mode.isOn()).toBe(false);
    key('c'); key('Escape'); expect(mode.isOn()).toBe(false);
    expect(onModeChange.mock.calls.map(c => c[0])).toEqual([true, false, true, false]);
  });
  it('C dentro un campo di testo del sito o del tool non attiva', () => {
    key('c', document.getElementById('site-input')!);
    key('c', ownTextarea);
    expect(mode.isOn()).toBe(false);
  });
  it('C con un modificatore (Cmd+C) non attiva', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
    expect(mode.isOn()).toBe(false);
  });
});
