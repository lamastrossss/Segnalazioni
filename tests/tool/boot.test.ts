import { describe, it, expect, afterEach } from 'vitest';
import { boot } from '../../src/tool/boot';
import { fakeApi, fakeAuth, fakeLive, PROJECT, flush } from '../helpers/fake-deps';

afterEach(() => { (window as any).__stageReview?.destroy(); document.documentElement.querySelectorAll('#stage-review-root').forEach(n => n.remove()); });

const deps = () => ({ api: fakeApi(), auth: fakeAuth(), live: fakeLive() });

describe('boot', () => {
  it('monta una sola interfaccia e il secondo clic la chiude', async () => {
    const i1 = await boot(window, deps());
    expect(i1).not.toBeNull();
    expect(document.querySelectorAll('#stage-review-root')).toHaveLength(1);
    const i2 = await boot(window, deps());
    expect(i2).toBeNull();
    expect(document.querySelector('#stage-review-root')).toBeNull();
  });
  it('mostra la barra con il nome del sito', async () => {
    await boot(window, deps());
    const shadow = document.querySelector('#stage-review-root')!.shadowRoot!;
    expect(shadow.querySelector('.sr-toolbar')).not.toBeNull();
    expect(shadow.textContent).toContain(PROJECT.name);
  });
  it('senza sessione mostra il login', async () => {
    const d = { ...deps(), auth: fakeAuth(null) };
    void boot(window, d);
    await flush();
    const shadow = document.querySelector('#stage-review-root')!.shadowRoot!;
    expect(shadow.querySelector('form.sr-auth')).not.toBeNull();
  });
  it('su un dominio sconosciuto propone di creare il sito', async () => {
    const d = deps();
    d.api.findProjectByDomain.mockResolvedValueOnce({ ok: true, value: null });
    void boot(window, d);
    await flush(); await flush();
    const shadow = document.querySelector('#stage-review-root')!.shadowRoot!;
    expect(shadow.textContent).toContain('Crea nuovo sito');
    expect(shadow.textContent).toContain('Collega a un sito esistente');
  });
  it('l\'avvio automatico non chiude un tool già aperto (Review Focus 1)', async () => {
    await boot(window, deps());
    expect(await boot(window, deps(), { auto: true })).toBeNull();
    expect(document.querySelectorAll('#stage-review-root')).toHaveLength(1);
  });
  it('azzera il flag di caricamento all\'avvio', async () => {
    (window as any).__stageReviewLoading = true;
    await boot(window, deps());
    expect((window as any).__stageReviewLoading).toBe(false);
  });
});
