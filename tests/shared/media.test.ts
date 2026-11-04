import { describe, it, expect } from 'vitest';
import { targetSize, validateAttachments, prepareAttachment, REJECTION_TEXT } from '../../src/shared/media';

const f = (n: string, t: string, s: number) => new File([new Uint8Array(s)], n, { type: t });

describe('media', () => {
  it('targetSize riduce solo oltre il lato massimo', () => {
    expect(targetSize(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(targetSize(1000, 3000, 2000)).toEqual({ width: 667, height: 2000 });
    expect(targetSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('validateAttachments rifiuta tipi sconosciuti e GIF oltre 2 MB', () => {
    const r = validateAttachments([f('a.png', 'image/png', 10), f('b.pdf', 'application/pdf', 10), f('c.gif', 'image/gif', 3_000_000)], 0);
    expect(r.accepted.map(x => x.name)).toEqual(['a.png']);
    expect(r.rejected).toEqual([{ name: 'b.pdf', reason: 'tipo' }, { name: 'c.gif', reason: 'troppo-grande' }]);
  });
  it('validateAttachments rispetta il massimo di 5 contando quelle già presenti', () => {
    expect(validateAttachments([f('a.png', 'image/png', 1), f('b.png', 'image/png', 1)], 4).rejected)
      .toEqual([{ name: 'b.png', reason: 'troppi' }]);
  });
  it('accetta JPG e WebP e una GIF di esattamente 2 MB', () => {
    const r = validateAttachments([f('a.jpg', 'image/jpeg', 1), f('b.webp', 'image/webp', 1), f('g.gif', 'image/gif', 2 * 1024 * 1024)], 0);
    expect(r.rejected).toEqual([]);
  });
  it('le GIF non vengono ricompresse', async () => {
    const gif = f('g.gif', 'image/gif', 1000);
    const p = await prepareAttachment(gif);
    expect(p.blob).toBe(gif);
    expect(p.ext).toBe('gif');
    expect(p.bytes).toBe(1000);
  });
  it('ha i messaggi italiani di rifiuto', () => {
    expect(REJECTION_TEXT).toEqual({
      tipo: 'Formato non supportato (solo PNG, JPG, WebP, GIF)',
      'troppo-grande': 'GIF oltre 2 MB',
      troppi: 'Massimo 5 immagini',
    });
  });
});
