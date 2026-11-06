import type { Issue, Profile } from '../shared/types';
import type { Api } from '../shared/api';
import { el } from '../shared/dom';
import { VIEWPORT_LABEL } from '../shared/viewport';
import { formatDate, formatEdited, STATUS_LABEL } from '../shared/format';

export interface IssueRowDeps {
  api: Api;
  me: () => Profile | null;
  profilesById: Map<string, Profile>;
  onOpen: (issueId: string) => void;
  onSaved: (issueId: string) => void;
  thumb: (path: string) => Promise<string | null>;
}

const TITLE_LEN = 120;

/** Riga dell'elenco della board. Sulle proprie segnalazioni c'è "Modifica" per correggere il testo senza aprire il dettaglio. */
export function renderIssueRow(i: Issue, deps: IssueRowDeps): HTMLLIElement {
  const mine = deps.me()?.id === i.author_id && !i.deleted_at;
  const img = el('img', { class: 'thumb', attrs: { alt: '' } });
  if (i.screenshot_path) void deps.thumb(i.screenshot_path).then(u => { if (u) img.src = u; });

  const chips = el('div', { class: 'chips' }, [
    el('span', { class: `chip ${i.status}`, text: STATUS_LABEL[i.status] }),
    el('span', { class: 'chip', text: `${VIEWPORT_LABEL[i.viewport_class]} ${i.viewport_width}` }),
    el('span', { class: 'chip', text: i.page_path }),
  ]);
  const meta = el('p', { class: 'muted' }, [
    `${deps.profilesById.get(i.author_id)?.name ?? 'Utente'} · risposte: ${i.replies_count}`,
    i.edited_at ? el('span', { class: 'edited', text: formatEdited(i.edited_at), attrs: { title: `Testo modificato il ${formatDate(i.edited_at)}` } }) : '',
  ]);
  const title = () => el('p', { class: 'title' }, [el('span', { class: 'num', text: `#${i.number}` }), i.body.slice(0, TITLE_LEN)]);

  const li = el('li', { class: mine ? 'issue-row mine' : 'issue-row' });

  function view() {
    li.replaceChildren(el('button', { class: 'issue', attrs: { type: 'button' }, on: { click: () => deps.onOpen(i.id) } }, [
      img, el('div', {}, [title(), chips, meta]),
    ]));
    if (mine) {
      li.append(el('button', {
        class: 'btn ghost small issue-edit', attrs: { type: 'button', title: 'Modifica il testo della segnalazione' },
        on: { click: edit },
      }, [el('span', { class: 'pencil', text: '✎', attrs: { 'aria-hidden': 'true' } }), ' Modifica']));
    }
  }

  function edit() {
    const ta = el('textarea', { attrs: { 'aria-label': `Testo della segnalazione #${i.number}`, rows: '2' } });
    ta.value = i.body;
    const error = el('p', { class: 'error small', attrs: { role: 'alert' } });
    const save = el('button', { class: 'btn small', text: 'Salva', attrs: { type: 'button' } });
    const submit = async () => {
      save.disabled = true;
      const r = await deps.api.editIssue(i.id, ta.value);
      save.disabled = false;
      if (!r.ok) { error.textContent = r.error.message; ta.focus(); return; }
      deps.onSaved(i.id); // la riga si ridisegna con il testo nuovo e il pallino
    };
    save.addEventListener('click', () => void submit());
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
      if (e.key === 'Escape') { e.preventDefault(); view(); }
    });
    li.replaceChildren(el('div', { class: 'issue editing' }, [
      img,
      el('div', {}, [
        el('p', { class: 'title' }, [el('span', { class: 'num', text: `#${i.number}` })]),
        ta, error,
        el('div', { class: 'row-actions' }, [save, el('button', { class: 'btn ghost small', text: 'Annulla', attrs: { type: 'button' }, on: { click: view } })]),
        chips, meta,
      ]),
    ]));
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  view();
  return li;
}
