import type { Project } from '../shared/types';
import type { Api } from '../shared/api';
import { el } from '../shared/dom';

/** Dominio sconosciuto: crea un nuovo sito o collega il dominio a uno esistente. */
export function pickProject(shadow: ShadowRoot, api: Api, domain: string): Promise<Project | null> {
  return new Promise(resolve => {
    const name = el('input', { attrs: { type: 'text', value: domain } });
    name.value = domain;
    const err = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });
    const list = el('ul', { class: 'sr-list' });
    const done = (p: Project | null) => { panel.remove(); resolve(p); };

    const create = el('button', { class: 'sr-btn', text: 'Crea nuovo sito', on: { click: async () => {
      create.disabled = true;
      const r = await api.createProject(name.value.trim() || domain, domain);
      create.disabled = false;
      if (r.ok) done(r.value); else err.textContent = r.error.message;
    } } });

    const panel = el('div', { class: 'sr sr-panel' }, [
      el('h2', { text: 'Questo sito non è ancora in Stage Review' }),
      el('p', { class: 'sr-muted', text: domain }),
      el('label', { class: 'sr-field' }, [el('span', { text: 'Nome del sito' }), name]),
      el('div', { class: 'sr-row' }, [create, el('button', { class: 'sr-btn sr-ghost', text: 'Annulla', on: { click: () => done(null) } })]),
      err,
      el('h3', { text: 'Collega a un sito esistente' }),
      el('p', { class: 'sr-muted', text: 'Per esempio un’altra anteprima dello stesso tema.' }),
      list,
    ]);
    shadow.append(panel);

    void api.listProjects().then(r => {
      if (!r.ok) { list.append(el('li', { class: 'sr-muted', text: r.error.message })); return; }
      if (!r.value.length) list.append(el('li', { class: 'sr-muted', text: 'Nessun sito ancora.' }));
      for (const p of r.value) {
        list.append(el('li', { on: { click: async () => {
          const l = await api.linkDomain(p.id, domain);
          if (l.ok) done({ id: p.id, name: p.name, archive_doc_url: p.archive_doc_url, domains: [...p.domains, domain] });
          else err.textContent = l.error.message;
        } } }, [el('strong', { text: p.name }), ' ', el('span', { class: 'sr-muted', text: p.domains.join(', ') })]));
      }
    });
  });
}
