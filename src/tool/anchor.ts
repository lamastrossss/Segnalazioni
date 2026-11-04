import type { Anchor } from '../shared/types';

export type ResolvedAnchor = { element: Element; moved: false } | { element: null; moved: true };

const TEXT_LEN = 60;
const SIMILAR_LEN = 30;
const RANDOM_ID = /\d{4,}|[a-f0-9]{8,}/i;

export function normalizeText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, TEXT_LEN);
}

function isStableId(id: string): boolean {
  if (!id) return false;
  if (id.startsWith('shopify-section-')) return true;
  return !RANDOM_ID.test(id);
}

function idSelector(id: string): string {
  return /^[A-Za-z_][\w-]*$/.test(id) ? `#${id}` : `[id="${id.replace(/["\\]/g, '\\$&')}"]`;
}

function nthOfType(el: Element): string {
  let k = 1;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === el.tagName) k++;
  return `${el.tagName.toLowerCase()}:nth-of-type(${k})`;
}

export function buildSelector(el: Element, maxDepth = 8): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && parts.length < maxDepth) {
    if (node.id && isStableId(node.id)) { parts.unshift(idSelector(node.id)); return parts.join(' > '); }
    if (node.tagName === 'BODY' || node.tagName === 'HTML') { parts.unshift('body'); return parts.join(' > '); }
    parts.unshift(nthOfType(node));
    node = node.parentElement;
  }
  return parts.join(' > ');
}

export function createAnchor(el: Element, clientX: number, clientY: number, win: Window): Anchor {
  const r = el.getBoundingClientRect();
  const ratio = (v: number, start: number, size: number) => (size > 0 ? Math.min(1, Math.max(0, (v - start) / size)) : 0);
  return {
    selector: buildSelector(el),
    tag: el.tagName,
    text: normalizeText(el),
    offset: { x: ratio(clientX, r.left, r.width), y: ratio(clientY, r.top, r.height) },
    page: { x: clientX + win.scrollX, y: clientY + win.scrollY, docHeight: win.document.documentElement.scrollHeight },
  };
}

function similar(a: string, b: string): boolean {
  const x = a.slice(0, SIMILAR_LEN), y = b.slice(0, SIMILAR_LEN);
  return x.startsWith(y) || y.startsWith(x);
}

export function resolveAnchor(anchor: Anchor, doc: Document): ResolvedAnchor {
  let direct: Element | null = null;
  try { direct = doc.querySelector(anchor.selector); } catch { direct = null; }
  if (direct && direct.tagName === anchor.tag && similar(normalizeText(direct), anchor.text)) {
    return { element: direct, moved: false };
  }
  if (anchor.text) {
    for (const cand of Array.from(doc.getElementsByTagName(anchor.tag))) {
      if (normalizeText(cand) === anchor.text) return { element: cand, moved: false };
    }
  }
  return { element: null, moved: true };
}

/** Punto del pin in coordinate della viewport (client). */
export function anchorPoint(anchor: Anchor, resolved: ResolvedAnchor, win: Window): { x: number; y: number } {
  if (resolved.element) {
    const r = resolved.element.getBoundingClientRect();
    return { x: r.left + anchor.offset.x * r.width, y: r.top + anchor.offset.y * r.height };
  }
  const h = win.document.documentElement.scrollHeight;
  const k = anchor.page.docHeight > 0 && h > 0 ? h / anchor.page.docHeight : 1;
  return { x: anchor.page.x - win.scrollX, y: anchor.page.y * k - win.scrollY };
}
