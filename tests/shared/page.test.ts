import { describe, it, expect } from 'vitest';
import { pagePathOf, parseFocusHash, withFocusHash } from '../../src/shared/page';

describe('page', () => {
  it('pagePathOf ignora query, hash e slash finale', () => {
    expect(pagePathOf('https://x.myshopify.com/products/a/?preview_theme_id=1#top')).toBe('/products/a');
    expect(pagePathOf('https://x.myshopify.com/')).toBe('/');
  });
  it('parseFocusHash legge solo #stage-review=', () => {
    expect(parseFocusHash('#stage-review=abc-123')).toBe('abc-123');
    expect(parseFocusHash('#altro')).toBeNull();
    expect(parseFocusHash('')).toBeNull();
  });
  it('withFocusHash sostituisce l\'hash esistente', () => {
    expect(withFocusHash('https://x.com/p?v=1#old', 'id1')).toBe('https://x.com/p?v=1#stage-review=id1');
  });
});
