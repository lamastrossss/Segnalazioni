import type { Project } from '../shared/types';
import type { Api } from '../shared/api';
import { el } from '../shared/dom';
import { stageLinks } from './stage-links';

export interface SiteHeaderDeps {
  project: Project;
  api: Api;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
}

/** Intestazione del sito: nome (Rinomina), stage collegati (Modifica stage) ed Elimina sito. */
export function renderSiteHeader(container: HTMLElement, deps: SiteHeaderDeps) {
  let name = deps.project.name;
  let domains = [...deps.project.domains];
  const titleRow = el('div', { class: 'site-title' });
  const domainsRow = el('div');
  const deleteBox = el('div');
  const wrap = el('div', { class: 'site-header' }, [titleRow, domainsRow, deleteBox]);
  container.append(wrap);

  const small = (text: string, on: () => void, extra = '') =>
    el('button', { class: `btn ghost small ${extra}`, text, attrs: { type: 'button' }, on: { click: on } });

  function view() {
    titleRow.replaceChildren(
      el('h2', { text: name }),
      el('div', { class: 'site-actions' }, [
        small('Rinomina', rename),
        small('Modifica stage', editStages),
        small('Elimina sito', askDelete, 'danger-text'),
      ]),
    );
    showDomains();
  }

  function showDomains() {
    const links = stageLinks(domains);
    links.classList.add('site-domains');
    domainsRow.replaceChildren(links);
  }

  function rename() {
    const input = el('input', { attrs: { type: 'text', 'aria-label': 'Nome del sito', maxlength: '80' } });
    input.value = name;
    const error = el('p', { class: 'error small', attrs: { role: 'alert' } });
    const save = el('button', { class: 'btn small', text: 'Salva', attrs: { type: 'button' } });
    const cancel = small('Annulla', view);
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

  function editStages() {
    const list = el('div', { class: 'stage-rows' });
    const addRow = (value = '') => {
      const input = el('input', { attrs: { type: 'text', placeholder: 'https://nome-stage.myshopify.com', 'aria-label': 'Indirizzo dello stage' } });
      input.value = value;
      const row = el('div', { class: 'stage-row' }, [input]);
      const remove = el('button', {
        class: 'btn ghost small icon', text: '×',
        attrs: { type: 'button', 'aria-label': `Togli ${value || 'questo stage'}`, title: 'Togli' },
        on: { click: () => row.remove() },
      });
      row.append(remove);
      list.append(row);
      return input;
    };
    domains.forEach(d => addRow(d));
    const error = el('p', { class: 'error small', attrs: { role: 'alert' } });
    const save = el('button', { class: 'btn small', text: 'Salva', attrs: { type: 'button' } });
    save.addEventListener('click', async () => {
      const inputs = [...list.querySelectorAll('input')].map(i => i.value);
      save.disabled = true;
      const r = await deps.api.setStages(deps.project.id, domains, inputs);
      save.disabled = false;
      if (!r.ok) { error.textContent = r.error.message; return; }
      domains = r.value;
      showDomains();
    });
    domainsRow.replaceChildren(el('div', { class: 'stage-editor' }, [
      el('p', { class: 'muted small', text: 'Incolla l’indirizzo dello stage (anche il link completo). Puoi collegarne più di uno, per esempio più anteprime dello stesso tema.' }),
      list,
      small('+ Aggiungi stage', () => { addRow().focus(); }),
      error,
      el('div', { class: 'site-rename' }, [save, small('Annulla', showDomains)]),
    ]));
    list.querySelector('input')?.focus();
  }

  function askDelete() {
    const input = el('input', { attrs: { type: 'text', 'aria-label': 'Nome del sito da eliminare' } });
    const error = el('p', { class: 'error small', attrs: { role: 'alert' } });
    const confirm = el('button', { class: 'btn small danger', text: 'Elimina sito', attrs: { type: 'button' } });
    confirm.addEventListener('click', async () => {
      if (input.value.trim() !== name) { error.textContent = 'Scrivi esattamente il nome del sito per confermare.'; input.focus(); return; }
      confirm.disabled = true;
      const r = await deps.api.deleteProject(deps.project.id);
      confirm.disabled = false;
      if (!r.ok) { error.textContent = r.error.message; return; }
      deps.onDeleted();
    });
    deleteBox.replaceChildren(el('div', { class: 'site-delete card' }, [
      el('p', {}, [el('strong', { text: `Eliminare “${name}”?` })]),
      el('p', { class: 'muted small', text: 'Il sito e le sue segnalazioni spariscono da board, tool e foglio Google (il foglio va nel Cestino di Drive). I dati restano recuperabili nel database, e lo stage si libera per un altro sito.' }),
      el('label', { class: 'small' }, [`Per confermare scrivi il nome del sito: ${name}`, input]),
      error,
      el('div', { class: 'site-rename' }, [confirm, small('Annulla', () => deleteBox.replaceChildren())]),
    ]));
    input.focus();
  }

  view();
}
