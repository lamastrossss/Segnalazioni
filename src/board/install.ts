import { el } from '../shared/dom';

const style = document.createElement('style');
style.textContent = `
  .stack { display: grid; gap: 20px; }
  .card h2 { font-size: 17px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .steps { counter-reset: s; list-style: none; padding: 0; margin: 20px 0; display: grid; gap: 12px; }
  .steps li { counter-increment: s; display: flex; gap: 12px; align-items: baseline; }
  .steps li::before { content: counter(s); flex: none; width: 26px; height: 26px; border-radius: 50%; background: #111; color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 700; }
  .dl { display: inline-block; padding: 12px 20px; border-radius: 10px; background: #111; color: #fff; font-weight: 700; text-decoration: none; }
  kbd, code { font: 12px ui-monospace, monospace; padding: 2px 6px; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
  kbd { border-bottom-width: 2px; }
`;
document.head.append(style);

const kbd = (t: string) => el('kbd', { text: t });
const code = (t: string) => el('code', { text: t });

const extension = el('section', { class: 'card' }, [
  el('h2', { text: 'Estensione Chrome' }),
  el('p', { class: 'muted', text: 'Icona accanto alla barra degli indirizzi, screenshot senza richieste, riapertura automatica sugli stage che scegli.' }),
  el('p', {}, [el('a', { class: 'dl', text: 'Scarica l’estensione (.zip)', attrs: { href: './stage-review-estensione.zip', download: '' } })]),
  el('ol', { class: 'steps' }, [
    el('li', {}, [el('span', {}, ['Fai doppio clic sullo zip scaricato: si crea la cartella ', code('stage-review-estensione'), '. Spostala dove non la cancellerai (per esempio in Documenti).'])]),
    el('li', {}, [el('span', {}, ['In Chrome apri ', code('chrome://extensions'), ' (copialo nella barra degli indirizzi).'])]),
    el('li', {}, [el('span', {}, ['Attiva ', el('strong', { text: 'Modalità sviluppatore' }), ' in alto a destra.'])]),
    el('li', {}, [el('span', {}, ['Clicca ', el('strong', { text: 'Carica estensione non pacchettizzata' }), ' e scegli la cartella ', code('stage-review-estensione'), '.'])]),
  ]),
  el('p', { class: 'muted' }, [
    'Poi clicca l’icona del puzzle accanto alla barra degli indirizzi e fissa Stage Review con la puntina. ',
    'Su uno stage: clic sull’icona → ', el('strong', { text: 'Apri Stage Review' }), ', oppure ', kbd('Alt'), ' + ', kbd('Shift'), ' + ', kbd('R'), '. ',
    'Accendi ', el('strong', { text: 'Sempre attivo su questo sito' }), ' per riaprirlo da solo a ogni pagina.',
  ]),
  el('p', { class: 'muted', text: 'La prima volta Stage Review ti chiede di accedere con l’email dello studio. Sul sito: C attiva o disattiva la modalità Commenta, Esc la chiude.' }),
]);

document.getElementById('app')!.append(
  el('header', { class: 'top' }, [el('img', { class: 'logo-img', attrs: { src: './icon.png', alt: '', width: '28', height: '28' } }), el('h1', { text: 'Installa Stage Review' }),
    el('a', { class: 'btn ghost', text: 'Vai alla board', attrs: { href: './index.html' } })]),
  el('div', { class: 'stack' }, [extension]),
);
