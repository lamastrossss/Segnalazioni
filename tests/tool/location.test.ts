import { describe, it, expect } from 'vitest';
import { watchLocation } from '../../src/tool/location';
import { pagePathOf } from '../../src/shared/page';

describe('watchLocation', () => {
  it('segnala solo i cambi di pagina, non di query (Review Focus 2)', () => {
    history.replaceState({}, '', '/');
    const seen: string[] = [];
    const stop = watchLocation(window, u => seen.push(pagePathOf(u)));
    history.pushState({}, '', '/products/b?variant=2');
    history.pushState({}, '', '/products/b?variant=3');
    history.replaceState({}, '', '/collections/all');
    expect(seen).toEqual(['/products/b', '/collections/all']);
    stop();
    history.pushState({}, '', '/dopo');
    expect(seen).toHaveLength(2);
  });
  it('reagisce anche al tasto indietro', () => {
    history.replaceState({}, '', '/a');
    const seen: string[] = [];
    const stop = watchLocation(window, u => seen.push(pagePathOf(u)));
    history.replaceState({}, '', '/b');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(seen).toEqual(['/b']);
    stop();
  });
});
