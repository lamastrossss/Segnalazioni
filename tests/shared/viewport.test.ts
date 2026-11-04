import { describe, it, expect } from 'vitest';
import { classifyViewport, VIEWPORT_PRESETS, VIEWPORT_LABEL } from '../../src/shared/viewport';

describe('classifyViewport', () => {
  it('classifica ai bordi 768 e 1280', () => {
    expect(classifyViewport(767)).toBe('mobile');
    expect(classifyViewport(768)).toBe('tablet');
    expect(classifyViewport(1279)).toBe('tablet');
    expect(classifyViewport(1280)).toBe('desktop');
  });
  it('ha i preset 375x812, 768x1024, 1440x900', () => {
    expect(VIEWPORT_PRESETS.map(p => [p.width, p.height])).toEqual([[375, 812], [768, 1024], [1440, 900]]);
    expect(VIEWPORT_LABEL).toEqual({ mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' });
  });
});
