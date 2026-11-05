import type { Project } from '../shared/types';
import type { Api } from '../shared/api';
import { el } from '../shared/dom';
import { stageLinks } from './stage-links';

/** Nome del sito (rinominabile) con sotto i link degli stage collegati. */
export function renderSiteHeader(container: HTMLElement, deps: { project: Project; api: Api; onRenamed: (name: string) => void }) {
  let name = deps.project.name;
  const domains = stageLinks(deps.project.domains);
  domains.classList.add('site-domains');
  const titleRow = el('div', { class: 'site-title' });
  const wrap = el('div', { class: 'site-header' }, [titleRow, domains]);
  container.append(wrap);

  function view() {
    titleRow.replaceChildren(
      el('h2', { text: name }),
      el('button', { class: 'btn ghost small', text: 'Rinomina', attrs: { type: 'button' }, on: { click: edit } }),
    );
  }

  function edit() {
    const input = el('input', { attrs: { type: 'text', 'aria-label': 'Nome del sito', maxlength: '80' } });
    input.value = name;
    const error = el('p', { class: 'error small', attrs: { role: 'alert' } });
    const save = el('button', { class: 'btn small', text: 'Salva', attrs: { type: 'button' } });
    const cancel = el('button', { class: 'btn ghost small', text: 'Annulla', attrs: { type: 'button' }, on: { click: view } });
    const submit = async () => {
      save.disabled = true;
      const r = await deps.api.renameProject(deps.project.id, input.value);
      save.disabled = false;
      if (!r.ok) { error.textContent = r.error.message; input.focus(); return; }
      name = input.value.trim();
      deps.onRenamed(name);
      view();
    };
    save.addEventListener('click', () => void submit());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); void submit(); }
      if (e.key === 'Escape') { e.preventDefault(); view(); }
    });
    titleRow.replaceChildren(el('div', { class: 'site-rename' }, [input, save, cancel]), error);
    input.focus();
    input.select();
  }

  view();
}
