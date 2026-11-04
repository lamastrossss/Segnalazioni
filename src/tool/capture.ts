import { encodeCanvas, type PreparedImage } from '../shared/media';

export interface Capturer {
  start(): Promise<boolean>;
  grab(opts: { hide: HTMLElement; pin: { x: number; y: number }; color?: string }): Promise<PreparedImage | null>;
  stop(): void;
}

export const SCREENSHOT_MAX_SIDE = 1600;
export const SCREENSHOT_QUALITY = 0.8;
const PIN_RADIUS = 14;

export const BRIDGE_TIMEOUT_MS = 3000;

/** L'estensione Chrome segna la pagina quando il suo ponte per gli screenshot è attivo. */
export function hasExtensionBridge(doc: Document): boolean {
  return doc.documentElement.dataset.stageReviewExt === '1';
}

/** Chiede uno screenshot all'estensione. Restituisce un data URL JPEG oppure null. */
export function requestBridgeCapture(win: Window, timeoutMs = BRIDGE_TIMEOUT_MS): Promise<string | null> {
  const id = crypto.randomUUID();
  return new Promise(resolve => {
    const done = (v: string | null) => { clearTimeout(timer); win.removeEventListener('message', onMsg); resolve(v); };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; id?: string; dataUrl?: string | null } | null;
      if (d?.source === 'stage-review-ext' && d.type === 'capture-result' && d.id === id) done(d.dataUrl ?? null);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    win.addEventListener('message', onMsg);
    win.postMessage({ source: 'stage-review', type: 'capture', id }, win.location.origin === 'null' ? '*' : win.location.origin);
  });
}

export function frameScale(frameWidth: number, innerWidth: number): number {
  return innerWidth > 0 && frameWidth > 0 ? frameWidth / innerWidth : 1;
}

/** Screenshot della scheda corrente con getDisplayMedia: permesso chiesto una volta, stream tenuto aperto. */
export function createCapturer(win: Window): Capturer {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;

  const nextFrame = () => new Promise<void>(r => (win.requestAnimationFrame ? win.requestAnimationFrame(() => r()) : setTimeout(r, 16)));

  async function freshVideoFrame(v: HTMLVideoElement) {
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (!rvfc) { await new Promise(r => setTimeout(r, 120)); return; }
    await Promise.race([
      new Promise<void>(r => rvfc.call(v, () => r())),
      new Promise<void>(r => setTimeout(r, 250)),
    ]);
  }

  function drawPin(g: OffscreenCanvasRenderingContext2D, pin: { x: number; y: number }, color: string, k: number) {
    g.beginPath();
    g.arc(pin.x * k, pin.y * k, PIN_RADIUS * k, 0, Math.PI * 2);
    g.fillStyle = color; g.fill();
    g.lineWidth = 3 * k; g.strokeStyle = '#ffffff'; g.stroke();
  }

  async function grabViaBridge(hide: HTMLElement, pin: { x: number; y: number }, color: string): Promise<PreparedImage | null> {
    const prev = hide.style.visibility;
    hide.style.visibility = 'hidden';
    let dataUrl: string | null = null;
    try {
      await nextFrame(); await nextFrame();
      dataUrl = await requestBridgeCapture(win);
    } finally {
      hide.style.visibility = prev;
    }
    if (!dataUrl) return null;
    try {
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const g = canvas.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      drawPin(g, pin, color, frameScale(bmp.width, win.innerWidth));
      bmp.close();
      return await encodeCanvas(canvas, { maxSide: SCREENSHOT_MAX_SIDE, quality: SCREENSHOT_QUALITY });
    } catch {
      return null;
    }
  }

  return {
    async start() {
      if (hasExtensionBridge(win.document)) return true; // l'estensione fotografa senza chiedere
      if (stream) return true;
      try {
        const md = win.navigator.mediaDevices;
        stream = await md.getDisplayMedia({
          video: { displaySurface: 'browser' }, audio: false,
          preferCurrentTab: true, selfBrowserSurface: 'include',
        } as DisplayMediaStreamOptions);
        video = win.document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        stream.getVideoTracks()[0]?.addEventListener('ended', () => { stream = null; video = null; });
        return true;
      } catch {
        stream = null; video = null; // al prossimo avvio della modalità Commenta Chrome lo richiede
        return false;
      }
    },

    async grab({ hide, pin, color = '#E4572E' }) {
      if (hasExtensionBridge(win.document)) return grabViaBridge(hide, pin, color);
      if (!stream || !video || !video.videoWidth) return null;
      const prev = hide.style.visibility;
      hide.style.visibility = 'hidden';
      try {
        await nextFrame(); await nextFrame();
        await freshVideoFrame(video);
        const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
        const g = canvas.getContext('2d')!;
        g.drawImage(video, 0, 0);
        hide.style.visibility = prev;
        drawPin(g, pin, color, frameScale(video.videoWidth, win.innerWidth));
        return await encodeCanvas(canvas, { maxSide: SCREENSHOT_MAX_SIDE, quality: SCREENSHOT_QUALITY });
      } catch {
        return null;
      } finally {
        hide.style.visibility = prev;
      }
    },

    stop() {
      stream?.getTracks().forEach(t => t.stop());
      stream = null; video = null;
    },
  };
}
