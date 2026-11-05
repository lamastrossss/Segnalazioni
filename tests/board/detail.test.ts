import { describe, it, expect, vi } from 'vitest';
import { renderDetail } from '../../src/board/detail';
import { fakeApi, ME, flush } from '../helpers/fake-deps';
import { makeIssue } from '../helpers/issue';

describe('dettaglio nella board', () => {
  it('il testo utente resta testo (Review Focus 4) e c\'è Apri nel sito', async () => {
    const api = fakeApi();
    api.getIssue.mockResolvedValueOnce({ ok: true, value: {
      ...makeIssue({ id: 'i1', body: '<script>x</script>', page_url: 'https://x.myshopify.com/p?v=1' }),
      replies: [{ id: 'r', issue_id: 'i1', author_id: 'u1', body: '<b>y</b>', created_at: 't', deleted_at: null, attachments: [] }],
      attachments: [] } });
    const container = document.createElement('div');
    document.body.append(container);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const d = renderDetail(container, { api, me: () => ME, projectId: 'p1', profilesById: new Map([[ME.id, ME]]), reauth: async () => ME, onChanged: vi.fn() });
    await d.open('i1');
    const shadow = container.querySelector('div')!.shadowRoot!;
    expect(shadow.querySelector('.sr-panel script, .sr-panel b')).toBeNull();
    expect(shadow.textContent).toContain('<script>x</script>');
    const btn = [...shadow.querySelectorAll('button')].find(b => b.textContent === 'Apri nel sito')!;
    btn.click();
    expect(open).toHaveBeenCalledWith('https://x.myshopify.com/p?v=1#stage-review=i1', '_blank', 'noopener');
    expect(shadow.textContent).toContain('Poi apri Stage Review dall’icona dell’estensione (o Alt+Shift+R) per vedere il pin.');
    await flush();
  });
});
