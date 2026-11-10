import { TOOL_CSS } from './styles';
import { keepOnTop } from './top-layer';

export function mountRoot(doc: Document): { host: HTMLElement; shadow: ShadowRoot; destroy(): void } {
  const host = doc.createElement('div');
  host.id = 'stage-review-root';
  host.setAttribute('style', 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = TOOL_CSS;
  shadow.append(style);
  doc.documentElement.append(host);
  const release = keepOnTop(host, doc); // sempre in primo piano, anche sopra le modali del sito
  return { host, shadow, destroy: () => { release(); host.remove(); } };
}
