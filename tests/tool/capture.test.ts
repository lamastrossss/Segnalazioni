import { describe, it, expect } from 'vitest';
import { frameScale, createCapturer } from '../../src/tool/capture';

describe('capture', () => {
  it('frameScale converte da pixel CSS a pixel del frame', () => {
    expect(frameScale(2880, 1440)).toBe(2);
    expect(frameScale(1440, 1440)).toBe(1);
    expect(frameScale(100, 0)).toBe(1);
  });
  it('senza permesso grab restituisce null', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getDisplayMedia: () => Promise.reject(new Error('NotAllowed')) }, configurable: true });
    const c = createCapturer(window);
    expect(await c.start()).toBe(false);
    expect(await c.grab({ hide: document.body, pin: { x: 1, y: 1 } })).toBeNull();
  });
});
