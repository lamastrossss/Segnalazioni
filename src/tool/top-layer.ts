/**
 * Tiene il tool sopra le modali del sito.
 *
 * Le modali native (<dialog> aperto con showModal(), i popover) stanno nel "top layer"
 * del browser: nessuno z-index le supera, e una dialog modale rende inerte (non cliccabile)
 * tutto il resto della pagina. Quindi:
 * - il tool diventa un popover "manual" e si rimette in cima ogni volta che si apre qualcosa;
 * - mentre è aperta una dialog modale, il tool si sposta dentro quella dialog,
 *   così non è inerte e resta cliccabile; quando si chiude torna al suo posto.
 * Si difende anche dai siti che, aprendo una modale o la ricerca:
 * - ridisegnano il contenuto della modale (e così lo tolgono dalla pagina): torna al suo posto;
 * - chiudono tutti i popover aperti: si rimostra;
 * - rendono inerte o nascosto il resto della pagina: l'attributo sul tool viene tolto.
 */
/** Attributi che i siti mettono "su tutto il resto" quando aprono una modale. */
const BLOCKING = ['inert', 'aria-hidden', 'hidden'];
const STOPPED = ['click', 'dblclick', 'auxclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup', 'focusin', 'focusout'] as const;

export function keepOnTop(host: HTMLElement, doc: Document): () => void {
  // I clic nel tool non arrivano ai gestori del sito ("clic fuori dal carrello = chiudi", trappole del focus…).
  // Il tool ascolta in fase di cattura sulla finestra, quindi non ne risente.
  const stop = (e: Event) => e.stopPropagation();
  for (const t of STOPPED) host.addEventListener(t, stop);
  const unstop = () => { for (const t of STOPPED) host.removeEventListener(t, stop); };

  const canPopover = typeof (host as HTMLElement & { showPopover?: unknown }).showPopover === 'function';
  if (!canPopover) return unstop;

  host.setAttribute('popover', 'manual');
  const home = doc.documentElement;
  const modals: HTMLDialogElement[] = []; // in ordine di apertura: l'ultima è quella in cima

  const isModal = (d: HTMLDialogElement) => { try { return d.open && d.isConnected && d.matches(':modal'); } catch { return false; } };

  const isOpen = () => { try { return host.matches(':popover-open'); } catch { return true; } };

  let shown = false;
  function raise() {
    try { if (shown) host.hidePopover(); } catch { /* era già chiuso */ }
    try { host.showPopover(); shown = true; } catch { shown = false; }
  }

  function sync() {
    for (let i = modals.length - 1; i >= 0; i--) if (!isModal(modals[i])) modals.splice(i, 1);
    for (const d of doc.querySelectorAll('dialog')) if (!modals.includes(d) && isModal(d)) modals.push(d);
    const target: Element = modals[modals.length - 1] ?? home;
    if (host.parentNode !== target) { target.append(host); shown = false; } // spostarlo lo toglie dal top layer
    raise();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  };

  const mo = new MutationObserver(records => {
    if (!host.isConnected) { schedule(); return; } // tolto dalla pagina (es. modale ridisegnata)
    if (records.some(r => r.type === 'attributes'
      ? r.target !== host
      : [...r.removedNodes].some(n => modals.includes(n as HTMLDialogElement)))) schedule();
  });
  mo.observe(home, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });

  const unblock = () => { for (const a of BLOCKING) if (host.hasAttribute(a)) host.removeAttribute(a); };
  const guard = new MutationObserver(unblock);
  guard.observe(host, { attributes: true, attributeFilter: BLOCKING });
  unblock();

  // I popover del sito non cambiano attributi: si sentono dall'evento toggle (non risale, quindi in cattura)
  const onToggle = (e: Event) => {
    if (e.target !== host) schedule();
    else if (!isOpen()) schedule(); // il sito ha chiuso anche il tool
  };
  doc.addEventListener('toggle', onToggle, true);

  sync();

  return () => {
    mo.disconnect();
    guard.disconnect();
    doc.removeEventListener('toggle', onToggle, true);
    unstop();
    try { host.hidePopover(); } catch { /* già chiuso */ }
  };
}
