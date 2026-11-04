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

describe('capture dopo un rifiuto', () => {
  it('riprova a chiedere il permesso alla volta successiva', async () => {
    let calls = 0;
    Object.defineProperty(navigator, 'mediaDevices', { value: { getDisplayMedia: () => { calls++; return Promise.reject(new Error('NotAllowed')); } }, configurable: true });
    const c = createCapturer(window);
    await c.start(); await c.start();
    expect(calls).toBe(2);
  });
});

import { hasExtensionBridge, requestBridgeCapture } from '../../src/tool/capture';
import { vi, afterEach } from 'vitest';

describe('screenshot tramite estensione', () => {
  afterEach(() => { delete document.documentElement.dataset.stageReviewExt; vi.useRealTimers(); });

  it('con il ponte non chiede la condivisione della scheda', async () => {
    document.documentElement.dataset.stageReviewExt = '1';
    const gdm = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getDisplayMedia: gdm }, configurable: true });
    expect(hasExtensionBridge(document)).toBe(true);
    expect(await createCapturer(window).start()).toBe(true);
    expect(gdm).not.toHaveBeenCalled();
  });

  it('riceve la risposta con lo stesso id', async () => {
    const answer = (e: MessageEvent) => {
      if (e.data?.source !== 'stage-review' || e.data?.type !== 'capture') return;
      window.postMessage({ source: 'stage-review-ext', type: 'capture-result', id: 'altro', dataUrl: 'data:sbagliato' }, '*');
      window.postMessage({ source: 'falso', type: 'capture-result', id: e.data.id, dataUrl: 'data:falso' }, '*');
      window.postMessage({ source: 'stage-review-ext', type: 'capture-result', id: e.data.id, dataUrl: 'data:x' }, '*');
    };
    window.addEventListener('message', answer);
    expect(await requestBridgeCapture(window)).toBe('data:x');
    window.removeEventListener('message', answer);
  });

  it('senza risposta restituisce null dopo il timeout (Review Focus 4)', async () => {
    vi.useFakeTimers();
    const p = requestBridgeCapture(window, 3000);
    vi.advanceTimersByTime(3001);
    expect(await p).toBeNull();
  });

  it('grab con il ponte che non risponde restituisce null e rimette visibile la UI', async () => {
    document.documentElement.dataset.stageReviewExt = '1';
    vi.useFakeTimers();
    const hide = document.createElement('div');
    const p = createCapturer(window).grab({ hide, pin: { x: 1, y: 1 } });
    await vi.advanceTimersByTimeAsync(3500);
    expect(await p).toBeNull();
    expect(hide.style.visibility).toBe('');
  });
});
