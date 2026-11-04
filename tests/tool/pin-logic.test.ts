import { describe, it, expect } from 'vitest';
import { visiblePins, findDuplicates } from '../../src/tool/pin-logic';
import { makeIssue } from '../helpers/issue';

const ctx = { pagePath: '/p', viewportClass: 'mobile' as const, showAllViewports: false, showResolved: false };

describe('visiblePins', () => {
  const mob = makeIssue({ id: 'mob' });
  const tab = makeIssue({ id: 'tab', viewport_class: 'tablet' });
  const delMob = makeIssue({ id: 'del', deleted_at: '2026-11-04T10:00:00Z' });
  const resMob = makeIssue({ id: 'res', status: 'resolved' });
  const otherPage = makeIssue({ id: 'other', page_path: '/q' });

  it('mostra solo pagina e viewport correnti, non eliminate né risolte', () => {
    expect(visiblePins([mob, tab, delMob, resMob, otherPage], ctx).map(p => p.issue.id)).toEqual(['mob']);
  });
  it('con tutte le viewport le altre sono attenuate', () => {
    const r = visiblePins([mob, tab], { ...ctx, showAllViewports: true });
    expect(r.map(p => [p.issue.id, p.muted])).toEqual([['mob', false], ['tab', true]]);
  });
  it('mostra le risolte solo su richiesta, mai le eliminate', () => {
    expect(visiblePins([resMob, delMob], { ...ctx, showResolved: true }).map(p => p.issue.id)).toEqual(['res']);
  });
});

describe('findDuplicates', () => {
  document.body.innerHTML = '<section><div><span>x</span></div></section><footer><p>y</p></footer>';
  const section = document.querySelector('section')!;
  const span = document.querySelector('span')!;
  const p = document.querySelector('p')!;
  const onSection = makeIssue({ id: 'onSection', created_at: '2026-11-04T09:00:00Z' });
  const onSpan = makeIssue({ id: 'onSpan', created_at: '2026-11-04T08:00:00Z' });
  const onSpanTablet = makeIssue({ id: 'onSpanTablet', viewport_class: 'tablet' });
  const resolvedOne = makeIssue({ id: 'resolved', status: 'resolved' });
  const deletedOne = makeIssue({ id: 'deleted', deleted_at: '2026-11-04T10:00:00Z' });
  const movedOne = makeIssue({ id: 'moved' });
  const unrelated = makeIssue({ id: 'unrelated' });
  const other = makeIssue({ id: 'otherPage', page_path: '/q' });
  const ok = (element: Element) => ({ element, moved: false as const });

  it('trova stesso elemento e antenati, prima la viewport corrente', () => {
    const d = findDuplicates(span, [
      { issue: onSection, resolved: ok(section) },
      { issue: onSpanTablet, resolved: ok(span) },
      { issue: onSpan, resolved: ok(span) },
      { issue: resolvedOne, resolved: ok(span) },
      { issue: deletedOne, resolved: ok(span) },
      { issue: movedOne, resolved: { element: null, moved: true } },
      { issue: unrelated, resolved: ok(p) },
      { issue: other, resolved: ok(span) },
    ], { pagePath: '/p', viewportClass: 'mobile' });
    expect(d.map(m => [m.issue.id, m.relation, m.sameViewport])).toEqual([
      ['onSpan', 'same', true], ['onSection', 'ancestor', true], ['onSpanTablet', 'same', false],
    ]);
  });
  it('riconosce i discendenti', () => {
    const d = findDuplicates(section, [{ issue: onSpan, resolved: ok(span) }], { pagePath: '/p', viewportClass: 'mobile' });
    expect(d.map(m => m.relation)).toEqual(['descendant']);
  });
});
