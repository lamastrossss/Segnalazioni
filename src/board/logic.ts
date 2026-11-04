import type { ArchiveStatus, Issue, IssueStatus, ViewportClass } from '../shared/types';
export { STATUS_LABEL } from '../shared/format';

export interface IssueFilters { pagePath?: string; viewportClass?: ViewportClass; status?: IssueStatus; authorId?: string }

const STALE_MS = 30 * 60 * 1000;

export function filterIssues(issues: Issue[], f: IssueFilters): Issue[] {
  return issues
    .filter(i => !i.deleted_at
      && (!f.pagePath || i.page_path === f.pagePath)
      && (!f.viewportClass || i.viewport_class === f.viewportClass)
      && (!f.status || i.status === f.status)
      && (!f.authorId || i.author_id === f.authorId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function archiveHealth(s: ArchiveStatus, now: Date): 'ok' | 'stale' | 'error' {
  if (s.last_error) return 'error';
  if (!s.last_ok_at) return 'stale';
  return now.getTime() - new Date(s.last_ok_at).getTime() > STALE_MS ? 'stale' : 'ok';
}
