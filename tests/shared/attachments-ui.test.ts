import { describe, it, expect, vi } from 'vitest';
import { createAttachmentPicker, openFilePicker } from '../../src/shared/attachments-ui';

describe('Aggiungi immagini', () => {
  it('apre la scelta file con showPicker, senza clic simulato che il sito può annullare', () => {
    const target = document.createElement('div');
    const picker = createAttachmentPicker(target);
    document.body.append(picker.element);
    const input = picker.element.querySelector<HTMLInputElement>('input[type=file]')!;
    const showPicker = vi.fn();
    (input as any).showPicker = showPicker;
    const clicked = vi.fn();
    input.addEventListener('click', clicked);
    [...picker.element.querySelectorAll('button')].find(b => b.textContent === 'Aggiungi immagini')!.click();
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(clicked).not.toHaveBeenCalled();
    expect(input.hidden).toBe(false); // nascosto solo alla vista: showPicker non vale su input con display:none
    picker.element.remove();
  });

  it('se showPicker manca o rifiuta, ripiega sul clic', () => {
    const input = document.createElement('input');
    input.type = 'file';
    const clicked = vi.fn(e => e.preventDefault());
    input.addEventListener('click', clicked);
    openFilePicker(input);
    (input as any).showPicker = () => { throw new DOMException('no', 'NotAllowedError'); };
    openFilePicker(input);
    expect(clicked).toHaveBeenCalledTimes(2);
  });
});
