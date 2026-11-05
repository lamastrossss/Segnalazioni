import { el } from '../shared/dom';

/** Link agli stage del sito: si aprono in una nuova scheda, freccia ↗, sottolineati al passaggio del mouse. */
export function stageLinks(domains: string[]): HTMLParagraphElement {
  return el('p', { class: 'stage-links muted' }, domains.flatMap((d, i) => [
    i ? ' · ' : '',
    el('a', {
      class: 'stage-link',
      attrs: { href: `https://${d}/`, target: '_blank', rel: 'noopener', 'aria-label': `Vai allo stage ${d} (si apre in una nuova scheda)` },
    }, [d, el('span', { class: 'arrow', text: '↗', attrs: { 'aria-hidden': 'true' } })]),
  ]));
}
