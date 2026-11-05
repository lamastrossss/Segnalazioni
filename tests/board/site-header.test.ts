import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderSiteHeader } from '../../src/board/site-header';
import { fakeApi, flush } from '../helpers/fake-deps';

const project = { id: 'p1', name: 'i1pw9r-dv.myshopify.com', archive_doc_url: null, domains: ['i1pw9r-dv.myshopify.com'] };
let box: HTMLElement;
beforeEach(() => { box = document.createElement('div'); document.body.replaceChildren(box); });
const btn = (t: string) => [...box.querySelectorAll('button')].find(b => b.textContent === t)!;

describe('intestazione del sito', () => {
  it('mostra il nome sopra e il link dello stage sotto', () => {
    renderSiteHeader(box, { project, api: fakeApi(), onRenamed: vi.fn(), onDeleted: vi.fn() });
    expect(box.querySelector('h2')!.textContent).toBe('i1pw9r-dv.myshopify.com');
    const a = box.querySelector<HTMLAnchorElement>('.site-domains a')!;
    expect(a.href).toBe('https://i1pw9r-dv.myshopify.com/');
    expect(a.target).toBe('_blank');
  });
  it('rinomina: salva, aggiorna il titolo e avvisa', async () => {
    const api = fakeApi();
    (api as any).renameProject = vi.fn(async () => ({ ok: true, value: undefined }));
    const onRenamed = vi.fn();
    renderSiteHeader(box, { project, api, onRenamed, onDeleted: vi.fn() });
    btn('Rinomina').click();
    const input = box.querySelector('input')!;
    expect(input.value).toBe('i1pw9r-dv.myshopify.com');
    input.value = 'Rica Haircare';
    btn('Salva').click(); await flush();
    expect((api as any).renameProject).toHaveBeenCalledWith('p1', 'Rica Haircare');
    expect(box.querySelector('h2')!.textContent).toBe('Rica Haircare');
    expect(onRenamed).toHaveBeenCalledWith('Rica Haircare');
  });
  it('Invio salva, Esc annulla', async () => {
    const api = fakeApi();
    (api as any).renameProject = vi.fn(async () => ({ ok: true, value: undefined }));
    renderSiteHeader(box, { project, api, onRenamed: vi.fn(), onDeleted: vi.fn() });
    btn('Rinomina').click();
    let input = box.querySelector('input')!;
    input.value = 'Annullato';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(box.querySelector('h2')!.textContent).toBe('i1pw9r-dv.myshopify.com');
    btn('Rinomina').click();
    input = box.querySelector('input')!;
    input.value = 'Con invio';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(box.querySelector('h2')!.textContent).toBe('Con invio');
  });
  it('errore: resta in modifica e mostra il messaggio', async () => {
    const api = fakeApi();
    (api as any).renameProject = vi.fn(async () => ({ ok: false, error: { kind: 'unknown', message: 'Il nome non può essere vuoto.' } }));
    renderSiteHeader(box, { project, api, onRenamed: vi.fn(), onDeleted: vi.fn() });
    btn('Rinomina').click();
    box.querySelector('input')!.value = ' ';
    btn('Salva').click(); await flush();
    expect(box.querySelector('input')).not.toBeNull();
    expect(box.textContent).toContain('Il nome non può essere vuoto.');
  });
  it('il nome con markup resta testo', () => {
    renderSiteHeader(box, { project: { ...project, name: '<img src=x onerror=alert(1)>' }, api: fakeApi(), onRenamed: vi.fn(), onDeleted: vi.fn() });
    expect(box.querySelector('img')).toBeNull();
  });

  it('Modifica stage: cambia, aggiunge e toglie gli stage', async () => {
    const api = fakeApi();
    (api as any).setStages = vi.fn(async (_id: string, _cur: string[], inputs: string[]) => ({ ok: true, value: inputs.filter(Boolean).map(x => x.replace('https://', '').replace(/\/.*$/, '')) }));
    renderSiteHeader(box, { project, api, onRenamed: vi.fn(), onDeleted: vi.fn() });
    btn('Modifica stage').click();
    const inputs = () => [...box.querySelectorAll<HTMLInputElement>('.stage-editor input')];
    expect(inputs().map(i => i.value)).toEqual(['i1pw9r-dv.myshopify.com']);
    inputs()[0].value = 'https://nuovo.myshopify.com/products';
    btn('+ Aggiungi stage').click();
    inputs()[1].value = 'altro.shopifypreview.com';
    btn('Salva').click(); await flush();
    expect((api as any).setStages).toHaveBeenCalledWith('p1', ['i1pw9r-dv.myshopify.com'], ['https://nuovo.myshopify.com/products', 'altro.shopifypreview.com']);
    expect([...box.querySelectorAll<HTMLAnchorElement>('.site-domains a')].map(a => a.href))
      .toEqual(['https://nuovo.myshopify.com/', 'https://altro.shopifypreview.com/']);
  });
  it('Modifica stage: errore mostrato, si resta in modifica; × toglie una riga', async () => {
    const api = fakeApi();
    (api as any).setStages = vi.fn(async () => ({ ok: false, error: { kind: 'unknown', message: 'Indirizzo non valido: boh' } }));
    renderSiteHeader(box, { project: { ...project, domains: ['a.com', 'b.com'] }, api, onRenamed: vi.fn(), onDeleted: vi.fn() });
    btn('Modifica stage').click();
    box.querySelector<HTMLButtonElement>('.stage-editor [aria-label="Togli a.com"]')!.click();
    expect([...box.querySelectorAll<HTMLInputElement>('.stage-editor input')].map(i => i.value)).toEqual(['b.com']);
    btn('Salva').click(); await flush();
    expect(box.textContent).toContain('Indirizzo non valido: boh');
    expect(box.querySelector('.stage-editor')).not.toBeNull();
  });
  it('Elimina sito: serve riscrivere il nome, poi elimina e avvisa', async () => {
    const api = fakeApi();
    (api as any).deleteProject = vi.fn(async () => ({ ok: true, value: undefined }));
    const onDeleted = vi.fn();
    renderSiteHeader(box, { project: { ...project, name: 'Rica' }, api, onRenamed: vi.fn(), onDeleted });
    btn('Elimina sito').click();
    expect(box.textContent).toContain('restano recuperabili');
    const input = box.querySelector<HTMLInputElement>('.site-delete input')!;
    input.value = 'rica sbagliato';
    box.querySelector<HTMLButtonElement>('.site-delete .btn.danger')!.click(); await flush();
    expect((api as any).deleteProject).not.toHaveBeenCalled();
    expect(box.textContent).toContain('Scrivi esattamente il nome del sito');
    input.value = 'Rica';
    box.querySelector<HTMLButtonElement>('.site-delete .btn.danger')!.click(); await flush();
    expect((api as any).deleteProject).toHaveBeenCalledWith('p1');
    expect(onDeleted).toHaveBeenCalled();
  });
});
