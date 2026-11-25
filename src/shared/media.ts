export interface PreparedImage { blob: Blob; width: number; height: number; bytes: number; ext: 'jpg' | 'gif'; name: string }
export type RejectionReason = 'tipo' | 'troppo-grande' | 'troppi';
export type AttachmentRejection = { name: string; reason: RejectionReason };

export const MAX_ATTACHMENTS = 5;
export const MAX_GIF_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_MAX_SIDE = 2000;
export const ATTACHMENT_TARGET_BYTES = 500_000;
/** Miniature: abbastanza nitide per il pannello del tool, leggere (30–50 KB) per board e archivio. */
export const THUMB_MAX_SIDE = 640;
export const THUMB_QUALITY = 0.7;
/** Le immagini non cambiano mai (nomi unici): il browser può tenerle per un anno. */
export const IMAGE_CACHE_SECONDS = '31536000';
const RECOMPRESSED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const REJECTION_TEXT: Record<RejectionReason, string> = {
  tipo: 'Formato non supportato (solo PNG, JPG, WebP, GIF)',
  'troppo-grande': 'GIF oltre 2 MB',
  troppi: 'Massimo 5 immagini',
};

export function targetSize(w: number, h: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { width: w, height: h };
  const k = maxSide / longest;
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

export function validateAttachments(files: File[], already: number): { accepted: File[]; rejected: AttachmentRejection[] } {
  const accepted: File[] = [];
  const rejected: AttachmentRejection[] = [];
  for (const file of files) {
    if (file.type === 'image/gif') {
      if (file.size > MAX_GIF_BYTES) { rejected.push({ name: file.name, reason: 'troppo-grande' }); continue; }
    } else if (!RECOMPRESSED.has(file.type)) {
      rejected.push({ name: file.name, reason: 'tipo' }); continue;
    }
    if (already + accepted.length >= MAX_ATTACHMENTS) { rejected.push({ name: file.name, reason: 'troppi' }); continue; }
    accepted.push(file);
  }
  return { accepted, rejected };
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'immagine';
}

export async function prepareAttachment(file: File): Promise<PreparedImage> {
  if (file.type === 'image/gif') {
    let width = 0, height = 0;
    try {
      const bmp = await createImageBitmap(file);
      width = bmp.width; height = bmp.height; bmp.close();
    } catch { /* dimensioni non leggibili: restano 0 */ }
    return { blob: file, width, height, bytes: file.size, ext: 'gif', name: file.name };
  }
  const bmp = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff'; // JPEG non ha trasparenza: sfondo bianco per i PNG trasparenti
  g.fillRect(0, 0, bmp.width, bmp.height);
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const img = await encodeCanvas(canvas, { maxSide: ATTACHMENT_MAX_SIDE, quality: 0.8, targetBytes: ATTACHMENT_TARGET_BYTES });
  return { ...img, name: baseName(file.name) + '.jpg' };
}

/** MIME di un'immagine preparata. JPEG perché Google Docs (archivio) non accetta WebP. */
export function mimeOf(ext: PreparedImage['ext']): string {
  return ext === 'gif' ? 'image/gif' : 'image/jpeg';
}

async function toJpeg(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('codifica non riuscita'))), 'image/jpeg', quality));
}

export async function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: { maxSide: number; quality: number; targetBytes?: number },
): Promise<PreparedImage> {
  const { width, height } = targetSize(canvas.width, canvas.height, opts.maxSide);
  let source: HTMLCanvasElement | OffscreenCanvas = canvas;
  if (width !== canvas.width || height !== canvas.height) {
    const scaled = new OffscreenCanvas(width, height);
    const ctx = scaled.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, width, height);
    source = scaled;
  }
  let blob = await toJpeg(source, opts.quality);
  if (opts.targetBytes) {
    for (const q of [0.7, 0.6, 0.5]) {
      if (blob.size <= opts.targetBytes || q >= opts.quality) break;
      blob = await toJpeg(source, q);
    }
  }
  return { blob, width, height, bytes: blob.size, ext: 'jpg', name: 'immagine.jpg' };
}

/** Percorso della miniatura di un'immagine: stessa cartella, prefisso thumb-, sempre JPEG. */
export function thumbPathOf(path: string): string {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1), file = path.slice(slash + 1);
  return `${dir}thumb-${file.replace(/\.[^.]+$/, '')}.jpg`;
}

/** Miniatura JPEG di un'immagine (per le GIF, il primo fotogramma). */
export async function makeThumb(blob: Blob): Promise<PreparedImage> {
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, bmp.width, bmp.height);
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return encodeCanvas(canvas, { maxSide: THUMB_MAX_SIDE, quality: THUMB_QUALITY });
}
