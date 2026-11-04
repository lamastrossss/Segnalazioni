// Menu dell'icona: apri/chiudi, "Sempre attivo su questo sito", board, avviso di nuova versione.
import { createController, isScriptable, originOf } from './core.js';

export function isNewer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function h(doc, tag, props = {}, children = []) {
  const n = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}

export async function initPopup(doc, chrome, { toolBase, version, fetchVersion = u => fetch(u).then(r => r.json()), close = () => window.close() }) {
  const app = doc.getElementById('app');
  const board = h(doc, 'a', { href: toolBase, target: '_blank', rel: 'noopener', class: 'link', text: 'Apri la board' });
  const header = h(doc, 'header', {}, [h(doc, 'span', { class: 'logo' }), h(doc, 'strong', { text: 'Stage Review' })]);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !isScriptable(tab.url)) {
    app.replaceChildren(header, h(doc, 'p', { class: 'muted', text: 'Stage Review non può aprirsi su questa pagina.' }), board);
    return;
  }

  const controller = createController(chrome, { toolUrl: toolBase + 'tool.js' });
  const origin = originOf(tab.url);
  const [active, list, granted] = await Promise.all([
    controller.isActive(tab),
    controller.getAlwaysOn(),
    chrome.permissions.contains({ origins: [origin + '/*'] }).catch(() => false),
  ]);

  const error = h(doc, 'p', { class: 'error', role: 'alert' });
  const toggle = h(doc, 'button', { id: 'sr-toggle', class: 'btn', type: 'button', text: active ? 'Chiudi Stage Review' : 'Apri Stage Review' });
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    const r = await controller.toggle(tab);
    toggle.disabled = false;
    if (r === 'error' || r === 'unsupported') error.textContent = 'Non riesco ad aprire Stage Review su questa pagina.';
    else close();
  });

  const always = h(doc, 'input', { id: 'sr-always', type: 'checkbox' });
  always.checked = list.includes(origin) && granted;
  always.addEventListener('change', async () => {
    error.textContent = '';
    if (always.checked) {
      // La richiesta va fatta subito, dentro il gesto dell'utente
      const ok = await chrome.permissions.request({ origins: [origin + '/*'] }).catch(() => false);
      if (!ok) { always.checked = false; error.textContent = 'Permesso non concesso: il tool non si riaprirà da solo.'; return; }
      await controller.setAlwaysOn(origin, true);
      await controller.inject(tab.id, 'auto');
      await chrome.action.setBadgeText({ tabId: tab.id, text: 'ON' });
    } else {
      await controller.setAlwaysOn(origin, false);
      await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    }
  });

  const update = h(doc, 'p', { class: 'update', hidden: '' });
  app.replaceChildren(
    header,
    h(doc, 'p', { class: 'host', text: new URL(tab.url).hostname }),
    toggle,
    h(doc, 'label', { class: 'switch' }, [always, h(doc, 'span', { text: 'Sempre attivo su questo sito' })]),
    h(doc, 'p', { class: 'muted small', text: 'Si riapre da solo a ogni pagina. Scorciatoia: Alt+Shift+R.' }),
    error, update, board,
  );

  try {
    const latest = await fetchVersion(toolBase + 'extension-version.json');
    if (latest && isNewer(latest.version, version)) {
      update.replaceChildren('È disponibile una nuova versione dell’estensione. ',
        h(doc, 'a', { href: toolBase + 'install.html', target: '_blank', rel: 'noopener', text: 'Scaricala' }));
      update.hidden = false;
    }
  } catch { /* offline: nessun avviso */ }
}
