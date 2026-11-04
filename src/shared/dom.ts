export interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<string, (e: Event) => void>>;
}

/** Crea un elemento senza mai usare innerHTML: il testo utente resta testo. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: ElProps = {}, children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const [k, fn] of Object.entries(props.on ?? {})) if (fn) node.addEventListener(k, fn);
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}
