import { describe, it, expect } from 'vitest';
import { buildBookmarklet } from '../src/bookmarklet';

describe('buildBookmarklet', () => {
  const b = buildBookmarklet('https://u.github.io/stage-review/');
  it('è un link javascript che carica tool.js senza cache', () => {
    expect(b).toMatch(/^javascript:/);
    expect(b).toContain("https://u.github.io/stage-review/tool.js?v='");
  });
  it('se il tool è già attivo lo chiude', () => {
    expect(b).toContain('__stageReview.destroy()');
  });
  it('avvisa se il sito blocca lo script', () => {
    expect(b).toContain('questo sito blocca il tool');
  });
  it('il codice è eseguibile', () => {
    expect(() => new Function(b.slice('javascript:'.length))).not.toThrow();
  });
  it('non carica due volte mentre il tool è in caricamento', () => {
    const doc = document.implementation.createHTMLDocument('x');
    const w: any = { __stageReviewLoading: true };
    new Function('window', 'document', b.slice('javascript:'.length))(w, doc);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    const w2: any = {};
    new Function('window', 'document', b.slice('javascript:'.length))(w2, doc);
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(w2.__stageReviewLoading).toBe(true);
  });
});
