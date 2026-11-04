import type { Issue, ViewportClass } from '../shared/types';
import type { ResolvedAnchor } from './anchor';

export interface PinCtx { pagePath: string; viewportClass: ViewportClass; showAllViewports: boolean; showResolved: boolean }

export function visiblePins(issues: Issue[], ctx: PinCtx): { issue: Issue; muted: boolean }[] {
  const out: { issue: Issue; muted: boolean }[] = [];
  for (const issue of issues) {
    if (issue.deleted_at || issue.page_path !== ctx.pagePath) continue;
    if (issue.status === 'resolved' && !ctx.showResolved) continue;
    const other = issue.viewport_class !== ctx.viewportClass;
    if (other && !ctx.showAllViewports) continue;
    out.push({ issue, muted: other });
  }
  return out;
}

export interface DuplicateMatch { issue: Issue; relation: 'same' | 'ancestor' | 'descendant'; sameViewport: boolean }

const RELATION_ORDER = { same: 0, ancestor: 1, descendant: 2 } as const;

export function findDuplicates(
  clicked: Element,
  candidates: { issue: Issue; resolved: ResolvedAnchor }[],
  ctx: { pagePath: string; viewportClass: ViewportClass },
): DuplicateMatch[] {
  const out: DuplicateMatch[] = [];
  for (const { issue, resolved } of candidates) {
    if (issue.deleted_at || issue.status === 'resolved' || issue.page_path !== ctx.pagePath) continue;
    const el = resolved.element;
    if (!el) continue;
    let relation: DuplicateMatch['relation'] | null = null;
    if (el === clicked) relation = 'same';
    else if (el.contains(clicked)) relation = 'ancestor';
    else if (clicked.contains(el)) relation = 'descendant';
    if (relation) out.push({ issue, relation, sameViewport: issue.viewport_class === ctx.viewportClass });
  }
  return out.sort((a, b) =>
    Number(b.sameViewport) - Number(a.sameViewport)
    || RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation]
    || b.issue.created_at.localeCompare(a.issue.created_at));
}
