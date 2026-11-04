import { describe, it, expect } from 'vitest';
import { filterIssues, archiveHealth, STATUS_LABEL } from '../../src/board/logic';
import { usageLevel } from '../../src/shared/usage';
import { makeIssue } from '../helpers/issue';

describe('logica board', () => {
  const now = new Date('2026-11-04T10:00:00Z');
  it('archiveHealth: ok, stale oltre 30 minuti, error se c\'è un errore', () => {
    expect(archiveHealth({ last_run_at: null, last_ok_at: '2026-11-04T09:45:00Z', last_error: null }, now)).toBe('ok');
    expect(archiveHealth({ last_run_at: null, last_ok_at: '2026-11-04T09:29:00Z', last_error: null }, now)).toBe('stale');
    expect(archiveHealth({ last_run_at: null, last_ok_at: null, last_error: null }, now)).toBe('stale');
    expect(archiveHealth({ last_run_at: null, last_ok_at: '2026-11-04T09:59:00Z', last_error: 'boom' }, now)).toBe('error');
  });
  it('usageLevel avvisa dall\'80% di 1 GB', () => {
    expect(usageLevel(858_993_459).warn).toBe(false);
    expect(usageLevel(858_993_460).warn).toBe(true);
  });
  it('filterIssues esclude le eliminate, filtra e ordina dalla più recente', () => {
    const a = makeIssue({ id: 'a', created_at: '2026-11-04T09:00:00Z' });
    const b = makeIssue({ id: 'b', created_at: '2026-11-04T10:00:00Z' });
    const deleted = makeIssue({ id: 'd', deleted_at: 'x' });
    const res = makeIssue({ id: 'r', status: 'resolved' });
    const tab = makeIssue({ id: 't', viewport_class: 'tablet', author_id: 'u2', page_path: '/q' });
    expect(filterIssues([a, deleted, b, res], { status: 'open' }).map(i => i.id)).toEqual(['b', 'a']);
    expect(filterIssues([a, tab], { viewportClass: 'tablet' }).map(i => i.id)).toEqual(['t']);
    expect(filterIssues([a, tab], { authorId: 'u2' }).map(i => i.id)).toEqual(['t']);
    expect(filterIssues([a, tab], { pagePath: '/q' }).map(i => i.id)).toEqual(['t']);
    expect(filterIssues([a, tab], {})).toHaveLength(2);
  });
  it('etichette di stato', () => {
    expect(STATUS_LABEL).toEqual({ open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' });
  });
});
