import { describe, it, expect } from 'vitest';
import { normalizeStage } from '../../src/shared/stage-url';

describe('normalizeStage', () => {
  it('accetta URL completi o solo il dominio', () => {
    expect(normalizeStage('https://I1PW9R-dv.myshopify.com/products/x?preview_theme_id=1#a')).toBe('i1pw9r-dv.myshopify.com');
    expect(normalizeStage('i1pw9r-dv.myshopify.com')).toBe('i1pw9r-dv.myshopify.com');
    expect(normalizeStage(' staging.example.com/ ')).toBe('staging.example.com');
    expect(normalizeStage('http://localhost:3000/x')).toBe('localhost');
  });
  it('rifiuta testo che non è un indirizzo', () => {
    expect(normalizeStage('')).toBeNull();
    expect(normalizeStage('non è un indirizzo')).toBeNull();
    expect(normalizeStage('javascript:alert(1)')).toBeNull();
  });
});
