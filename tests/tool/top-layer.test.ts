import { describe, it, expect, vi, afterEach } from 'vitest';
import { keepOnTop } from '../../src/tool/top-layer';
import { flush } from '../helpers/fake-deps';

const proto = HTMLElement.prototype as any;
const releases: (() => void)[] = [];
afterEach(() => { releases.splice(0).forEach(r => r()); delete proto.showPopover; delete proto.hidePopover; document.body.replaceChildren(); document.querySelectorAll('#h').forEach(n => n.remove()); });

/** jsdom non ha popover né :modal: li simuliamo. */
function setup() {
  const shows: Element[] = [];
  proto.showPopover = vi.fn(function (this: Element) { shows.push(this); });
  proto.hidePopover = vi.fn();
  const host = document.createElement('div');
  host.id = 'h';
  document.documentElement.append(host);
  const release = keepOnTop(host, document);
  releases.push(release);
  return { host, shows, release };
}
function modal() {
  const d = document.createElement('dialog');
  let modalOpen = false;
  const matches = d.matches.bind(d);
  (d as any).matches = (sel: string) => (sel === ':modal' ? modalOpen : matches(sel));
  document.body.append(d);
  return {
    d,
    open() { modalOpen = true; d.setAttribute('open', ''); },
    close() { modalOpen = false; d.removeAttribute('open'); },
  };
}

describe('tool sempre in primo piano', () => {
  it('diventa un popover manuale ed è mostrato subito', () => {
    const { host, shows } = setup();
    expect(host.getAttribute('popover')).toBe('manual');
    expect(shows).toEqual([host]);
  });

  it('con una dialog modale aperta (es. mini carrello) entra nella dialog e torna su; alla chiusura torna al suo posto', async () => {
    const { host, shows } = setup();
    const cart = modal();
    cart.open(); await flush();
    expect(host.parentNode).toBe(cart.d);
    expect(shows.length).toBe(2);
    cart.close(); await flush();
    expect(host.parentNode).toBe(document.documentElement);
    expect(shows.length).toBe(3);
  });

  it('una dialog non modale non lo sposta, ma lo rimette in cima', async () => {
    const { host, shows } = setup();
    const d = document.createElement('dialog');
    document.body.append(d);
    d.setAttribute('open', ''); await flush();
    expect(host.parentNode).toBe(document.documentElement);
    expect(shows.length).toBe(2);
  });

  it('due modali una sopra l\'altra: segue l\'ultima aperta', async () => {
    const { host } = setup();
    const a = modal(), b = modal();
    a.open(); await flush();
    b.open(); await flush();
    expect(host.parentNode).toBe(b.d);
    b.close(); await flush();
    expect(host.parentNode).toBe(a.d);
  });

  it('i clic nel tool non arrivano ai gestori del sito (es. "clic fuori = chiudi carrello")', () => {
    const { host, release } = setup();
    const site = vi.fn();
    document.addEventListener('click', site);
    const btn = document.createElement('button');
    host.append(btn);
    btn.click();
    expect(site).not.toHaveBeenCalled();
    release();
    btn.click();
    expect(site).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', site);
  });

  it('se il sito ridisegna la modale e lo toglie dalla pagina, torna subito', async () => {
    const { host, shows } = setup();
    const search = modal();
    search.open(); await flush();
    expect(host.parentNode).toBe(search.d);
    search.d.replaceChildren(document.createElement('input')); await flush();
    expect(host.parentNode).toBe(search.d);
    expect(shows.length).toBe(3);
  });

  it('se il sito toglie la modale aperta dalla pagina, torna al suo posto', async () => {
    const { host } = setup();
    const search = modal();
    search.open(); await flush();
    search.d.remove(); await flush();
    expect(host.parentNode).toBe(document.documentElement);
  });

  it('se il sito chiude tutti i popover, si rimostra', async () => {
    const { host, shows } = setup();
    (host as any).matches = (sel: string) => (sel === ':popover-open' ? false : Element.prototype.matches.call(host, sel));
    host.dispatchEvent(new Event('toggle'));
    await flush();
    expect(shows.length).toBe(2);
  });

  it('toglie inert, aria-hidden e hidden messi dal sito "su tutto il resto"', async () => {
    const { host } = setup();
    host.setAttribute('inert', '');
    host.setAttribute('aria-hidden', 'true');
    host.hidden = true;
    await flush();
    expect(host.hasAttribute('inert')).toBe(false);
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    expect(host.hidden).toBe(false);
  });

  it('cliccando un pulsante del tool il campo del sito non perde il cursore; i campi di testo del tool sì', () => {
    const { host } = setup();
    const shadow = host.attachShadow({ mode: 'open' });
    const btn = document.createElement('button');
    const ta = document.createElement('textarea');
    shadow.append(btn, ta);
    const down = (t: Element) => { const e = new MouseEvent('mousedown', { bubbles: true, composed: true, cancelable: true }); t.dispatchEvent(e); return e.defaultPrevented; };
    expect(down(btn)).toBe(true);
    expect(down(ta)).toBe(false);
  });
});
