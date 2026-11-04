import { encodeCanvas, type PreparedImage } from '../shared/media';

export interface Capturer {
  start(): Promise<boolean>;
  grab(opts: { hide: HTMLElement; pin: { x: number; y: number }; color?: string }): Promise<PreparedImage | null>;
  stop(): void;
}

export const SCREENSHOT_MAX_SIDE = 1600;
export const SCREENSHOT_QUALITY = 0.8;
const PIN_RADIUS = 14;

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

  return {
    async start() {
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
        const k = frameScale(video.videoWidth, win.innerWidth);
        g.beginPath();
        g.arc(pin.x * k, pin.y * k, PIN_RADIUS * k, 0, Math.PI * 2);
        g.fillStyle = color; g.fill();
        g.lineWidth = 3 * k; g.strokeStyle = '#ffffff'; g.stroke();
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
