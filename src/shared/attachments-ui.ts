import { el } from './dom';
import { prepareAttachment, REJECTION_TEXT, validateAttachments, MAX_ATTACHMENTS, type PreparedImage } from './media';
import type { Result } from './errors';

const objectUrl = (b: Blob) => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(b) : '');

/**
 * Zona allegati: trascina, incolla (Cmd+V) o scegli file. Max 5 immagini.
 * `pasteTarget` riceve l'evento paste (di solito il pannello o la textarea).
 */
export function createAttachmentPicker(pasteTarget: HTMLElement, opts: { prepare?: (f: File) => Promise<PreparedImage>; lightbox?: (src: string) => void } = {}) {
  const prepare = opts.prepare ?? prepareAttachment;
  const images: PreparedImage[] = [];
  let pending = 0;
  const thumbs = el('div', { class: 'sr-thumbs' });
  const notes = el('p', { class: 'sr-muted', attrs: { role: 'status' } });
  const input = el('input', { attrs: { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: '', hidden: '' } });
  const pick = el('button', { class: 'sr-btn sr-ghost', text: 'Aggiungi immagini', attrs: { type: 'button' }, on: { click: () => input.click() } });
  const drop = el('div', { class: 'sr-drop' }, [
    'Trascina qui le immagini, incollale con Cmd+V oppure ', pick, input,
  ]);

  function thumb(img: PreparedImage, onRemove?: () => void) {
    const src = objectUrl(img.blob);
    const t = el('div', { class: 'sr-thumb' }, [el('img', { attrs: { src, alt: img.name } })]);
    if (opts.lightbox && src) t.querySelector('img')!.addEventListener('click', () => opts.lightbox!(src));
    if (onRemove) t.append(el('button', { class: 'sr-thumb-x', text: '×', attrs: { type: 'button', 'aria-label': 'Rimuovi' }, on: { click: onRemove } }));
    return t;
  }

  async function add(files: File[]) {
    const { accepted, rejected } = validateAttachments(files, images.length + pending);
    notes.textContent = [...new Set(rejected.map(r => REJECTION_TEXT[r.reason]))].join(' · ');
    pending += accepted.length;
    for (const f of accepted) {
      try {
        const img = await prepare(f);
        images.push(img);
        const t = thumb(img, () => { images.splice(images.indexOf(img), 1); t.remove(); });
        thumbs.append(t);
      } catch {
        notes.textContent = `Immagine non leggibile: ${f.name}`;
      } finally {
        pending--;
      }
    }
  }

  input.addEventListener('change', () => { void add([...(input.files ?? [])]); input.value = ''; });
  pasteTarget.addEventListener('paste', e => {
    const files = [...((e as ClipboardEvent).clipboardData?.files ?? [])];
    if (files.length) { e.preventDefault(); void add(files); }
  });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('sr-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('sr-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('sr-over');
    void add([...(e.dataTransfer?.files ?? [])]);
  });

  return {
    element: el('div', {}, [thumbs, drop, notes]),
    images: () => [...images],
    busy: () => pending > 0,
    clear() { images.splice(0); thumbs.replaceChildren(); notes.textContent = ''; },
    lock() { drop.hidden = true; for (const b of thumbs.querySelectorAll('.sr-thumb-x')) b.remove(); },
    /** Mostra gli allegati non caricati, ognuno con il suo "Riprova". */
    markFailed(failed: PreparedImage[], retry: (img: PreparedImage) => Promise<Result<unknown>>, onAllDone: () => void) {
      thumbs.replaceChildren();
      drop.hidden = true;
      let left = failed.length;
      notes.textContent = `${left} ${left === 1 ? 'immagine non caricata' : 'immagini non caricate'}.`;
      for (const img of failed) {
        const t = thumb(img);
        t.classList.add('sr-failed');
        const btn = el('button', { class: 'sr-btn sr-ghost sr-retry-att', text: 'Riprova', attrs: { type: 'button' } });
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const r = await retry(img);
          btn.disabled = false;
          if (r.ok) { t.remove(); btn.remove(); if (--left === 0) onAllDone(); }
          else notes.textContent = r.error.message;
        });
        thumbs.append(el('div', {}, [t, btn]));
      }
    },
  };
}
export const MAX_IMAGES = MAX_ATTACHMENTS;
