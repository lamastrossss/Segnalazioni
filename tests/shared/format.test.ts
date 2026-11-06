import { describe, it, expect } from 'vitest';
import { formatEdited } from '../../src/shared/format';

describe('formatEdited', () => {
  const now = new Date(2026, 10, 6, 15, 0); // 6 novembre 2026, ora locale
  it('oggi: solo l\'ora', () => {
    expect(formatEdited(new Date(2026, 10, 6, 10, 42).toISOString(), now)).toBe('Modificata alle 10:42');
  });
  it('altri giorni: giorno e ora', () => {
    expect(formatEdited(new Date(2026, 10, 5, 9, 5).toISOString(), now)).toBe('Modificata il 05/11 alle 09:05');
  });
  it('anni diversi: anche l\'anno', () => {
    expect(formatEdited(new Date(2025, 11, 31, 23, 59).toISOString(), now)).toBe('Modificata il 31/12/2025 alle 23:59');
  });
});
