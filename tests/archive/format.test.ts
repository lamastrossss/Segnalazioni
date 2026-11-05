import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const { SR_COLUMNS, buildRow, srSafeText, srImagePaths } = createRequire(import.meta.url)('../../archive/format.js');

const profiles = { u1: { id: 'u1', name: 'Alessandra' }, u2: { id: 'u2', name: 'Marco' } };
const iss = {
  id: 'i1', number: 42, page_path: '/products/opuntia', page_url: 'https://x.myshopify.com/products/opuntia?v=1#old',
  viewport_class: 'mobile', viewport_width: 375, body: 'Titolo troppo vicino', author_id: 'u1', status: 'in_progress',
  created_at: '2026-11-04T09:12:00Z', plus_ones: [{ user_id: 'u2' }], deleted_at: null,
  screenshot_path: 'p/i1/screenshot.jpg', attachments: [], replies: [],
};
const urls = { 'p/i1/screenshot.jpg': 'https://sb/shot?token=a', 'p/i1/a1.jpg': 'https://sb/a1', 'p/i1/r1.jpg': 'https://sb/r1' };

describe('riga del foglio', () => {
  it('colonne nell\'ordine previsto', () => {
    expect(SR_COLUMNS).toEqual(['#', 'Stato', 'Pagina', 'Viewport', 'Segnalazione', 'Autore', 'Data', '+1', 'Risposte',
      'Screenshot', 'Anteprima', 'Allegati', 'Apri nel sito', 'ID']);
  });
  it('valori, anteprima e link (formule con le virgole)', () => {
    const { values } = buildRow(iss, profiles, 'Europe/Rome', urls);
    expect(values).toEqual([
      42, 'In lavorazione', '/products/opuntia', 'Mobile 375', 'Titolo troppo vicino', 'Alessandra', '04/11/2026 10:12', 1, '',
      '=HYPERLINK("https://sb/shot?token=a","Apri")', '=IMAGE("https://sb/shot?token=a")', '',
      '=HYPERLINK("https://x.myshopify.com/products/opuntia?v=1#stage-review=i1","Apri")', 'i1',
    ]);
  });
  it('risposte (non eliminate) e allegati etichettati', () => {
    const issue = {
      ...iss,
      replies: [
        { id: 'r1', author_id: 'u2', body: 'Fatto', created_at: '2026-11-04T09:30:00Z', deleted_at: null },
        { id: 'r2', author_id: 'u2', body: 'cancellata', created_at: '2026-11-04T09:40:00Z', deleted_at: 'x' },
      ],
      attachments: [
        { id: 'a1', path: 'p/i1/a1.jpg', reply_id: null, created_at: '1', deleted_at: null },
        { id: 'r1a', path: 'p/i1/r1.jpg', reply_id: 'r1', created_at: '2', deleted_at: null },
        { id: 'del', path: 'p/i1/del.jpg', reply_id: null, created_at: '3', deleted_at: 'x' },
      ],
    };
    const { values, attachments } = buildRow(issue, profiles, 'Europe/Rome', urls);
    expect(values[8]).toBe('Marco · 04/11/2026 10:30: Fatto');
    expect(values[11]).toBe('Immagine 1, Risposta di Marco 1');
    expect(attachments).toEqual([{ label: 'Immagine 1', url: 'https://sb/a1' }, { label: 'Risposta di Marco 1', url: 'https://sb/r1' }]);
    expect(srImagePaths(issue)).toEqual(['p/i1/screenshot.jpg', 'p/i1/a1.jpg', 'p/i1/r1.jpg']);
  });
  it('senza screenshot: celle vuote', () => {
    const { values } = buildRow({ ...iss, screenshot_path: null }, profiles, 'Europe/Rome', {});
    expect(values[9]).toBe('');
    expect(values[10]).toBe('');
  });
  it('il testo degli utenti non diventa mai una formula', () => {
    expect(srSafeText('=IMPORTXML("http://x")')).toBe('\'=IMPORTXML("http://x")');
    expect(srSafeText('+39 333')).toBe("'+39 333");
    expect(srSafeText('-margine')).toBe("'-margine");
    expect(srSafeText('@marco')).toBe("'@marco");
    expect(srSafeText('normale')).toBe('normale');
    const { values } = buildRow({ ...iss, body: '=HYPERLINK("http://evil","x")' }, profiles, 'Europe/Rome', urls);
    expect(values[4]).toBe('\'=HYPERLINK("http://evil","x")');
  });
  it('le virgolette negli URL vengono raddoppiate nelle formule', () => {
    const { values } = buildRow({ ...iss, page_url: 'https://x.com/p?q="a"' }, profiles, 'Europe/Rome', urls);
    expect(values[12]).toBe('=HYPERLINK("https://x.com/p?q=""a""#stage-review=i1","Apri")');
  });
});
