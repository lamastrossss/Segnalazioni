import { CONFIG } from '../config';
import { buildBookmarklet } from '../bookmarklet';
import { el } from '../shared/dom';

const style = document.createElement('style');
style.textContent = `
  .steps { counter-reset: s; list-style: none; padding: 0; margin: 24px 0; display: grid; gap: 12px; }
  .steps li { counter-increment: s; display: flex; gap: 12px; align-items: baseline; }
  .steps li::before { content: counter(s); flex: none; width: 26px; height: 26px; border-radius: 50%; background: #111; color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 700; }
  .bm { display: inline-block; padding: 12px 20px; border-radius: 10px; background: #2E86AB; color: #fff; font-weight: 700; text-decoration: none; cursor: grab; }
  kbd { font: 12px ui-monospace, monospace; padding: 2px 6px; border: 1px solid #ccc; border-bottom-width: 2px; border-radius: 4px; background: #fff; }
`;
document.head.append(style);

const link = el('a', { class: 'bm', text: 'Revisiona', attrs: { href: buildBookmarklet(CONFIG.publicBaseUrl), title: 'Trascinami nella barra dei preferiti' } });
link.addEventListener('click', e => { e.preventDefault(); alert('Trascina il pulsante nella barra dei preferiti: non va cliccato qui.'); });

document.getElementById('app')!.append(
  el('header', { class: 'top' }, [el('span', { class: 'logo' }), el('h1', { text: 'Installa Stage Review' }),
    el('a', { class: 'btn ghost', text: 'Vai alla board', attrs: { href: './index.html' } })]),
  el('div', { class: 'card' }, [
    el('p', { text: 'Il pulsante Revisiona apre Stage Review sopra qualsiasi stage, senza aggiungere codice al sito. Funziona su Chrome desktop.' }),
    el('ol', { class: 'steps' }, [
      el('li', {}, ['Mostra la barra dei preferiti di Chrome: ', el('kbd', { text: 'Cmd' }), ' + ', el('kbd', { text: 'Shift' }), ' + ', el('kbd', { text: 'B' }), '.']),
      el('li', {}, ['Trascina questo pulsante nella barra: ', link]),
      el('li', {}, ['Apri uno stage e clicca ', el('strong', { text: 'Revisiona' }), '. La prima volta ti chiederà di accedere con l’email dello studio.']),
    ]),
    el('p', { class: 'muted', text: 'Scorciatoie sul sito: C attiva o disattiva la modalità Commenta, Esc la chiude.' }),
  ]),
);
