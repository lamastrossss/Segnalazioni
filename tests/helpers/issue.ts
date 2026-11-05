import type { Issue } from '../../src/shared/types';

export function makeIssue(over: Partial<Issue> & { id: string }): Issue {
  return {
    project_id: 'p1', number: 1, page_path: '/p', page_url: 'https://x.myshopify.com/p',
    viewport_class: 'mobile', viewport_width: 375, browser: 'Chrome',
    anchor: { selector: 'h2', tag: 'H2', text: '', offset: { x: 0, y: 0 }, page: { x: 0, y: 0, docHeight: 1000 } },
    body: 'testo', status: 'open', author_id: 'u1', screenshot_path: null, screenshot_bytes: 0,
    created_at: '2026-11-04T09:00:00Z', updated_at: '2026-11-04T09:00:00Z',
    deleted_at: null, deleted_by: null, replies_count: 0,
    ...over,
  };
}
