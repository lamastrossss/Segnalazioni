import { TOOL_CSS } from './styles';

export function mountRoot(doc: Document): { host: HTMLElement; shadow: ShadowRoot; destroy(): void } {
  const host = doc.createElement('div');
  host.id = 'stage-review-root';
  host.setAttribute('style', 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = TOOL_CSS;
  shadow.append(style);
  doc.documentElement.append(host);
  return { host, shadow, destroy: () => host.remove() };
}
