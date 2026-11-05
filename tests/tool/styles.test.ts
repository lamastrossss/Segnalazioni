import { describe, it, expect } from 'vitest';
import { TOOL_CSS } from '../../src/tool/styles';

describe('stili', () => {
  it('l\'animazione di focus non usa transform (che sposterebbe il pin nell\'angolo)', () => {
    const kf = /@keyframes sr-pulse\s*\{([^}]*\}[^}]*)\}/.exec(TOOL_CSS)![1];
    expect(kf).not.toMatch(/transform/);
    expect(kf).toMatch(/scale:\s*1\.5/);
  });
});

describe('select', () => {
  it('nel tool e nei pannelli hanno freccia disegnata e spazio a destra', () => {
    const rule = /\n\.sr select\s*\{([^}]*)\}/.exec(TOOL_CSS)![1];
    expect(rule).toMatch(/appearance:\s*none/);
    expect(rule).toMatch(/padding-right:\s*38px/);
    expect(rule).toMatch(/background-image:\s*url\("data:image\/svg\+xml/);
  });
});
