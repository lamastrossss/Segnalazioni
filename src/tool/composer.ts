import type { Anchor, Attachment, Issue, IssueDetail, IssueStatus, Profile, ViewportClass } from '../shared/types';
import type { Api } from '../shared/api';
import type { PreparedImage } from '../shared/media';
import type { Result } from '../shared/errors';
import type { DuplicateMatch } from './pin-logic';
import { el } from '../shared/dom';
import { VIEWPORT_LABEL } from '../shared/viewport';
import { formatDate, formatEdited, STATUS_LABEL } from '../shared/format';
import { createAttachmentPicker } from '../shared/attachments-ui';

export interface NewIssueContext {
  anchor: Anchor; pagePath: string; pageUrl: string; viewportClass: ViewportClass; viewportWidth: number;
  screenshot: PreparedImage | null; duplicates: DuplicateMatch[];
}
export interface ComposerDeps {
  api: Api; me: () => Profile | null; projectId: string;
  reauth: () => Promise<Profile>;
  onSaved: (issue: Issue) => void;
  onChanged: (issueId: string) => void;
  profilesById: Map<string, Profile>;
  prepare?: (f: File) => Promise<PreparedImage>;
  /** Elementi in più nel thread (la board aggiunge "Apri nel sito"). */
  threadExtras?: (issue: IssueDetail) => Node[];
}

const DUP_TEXT = 80;

export function createComposer(shadow: ShadowRoot, deps: ComposerDeps) {
  const { api } = deps;
  let panel: HTMLElement | null = null;
  let threadId: string | null = null;

  const close = () => { panel?.remove(); panel = null; threadId = null; };
  const author = (id: string) => deps.profilesById.get(id)?.name ?? 'Utente';

  function lightbox(src: string) {
    const box = el('div', { class: 'sr sr-lightbox', attrs: { role: 'dialog', 'aria-label': 'Immagine' }, on: { click: () => box.remove() } },
      [el('img', { attrs: { src, alt: '' } })]);
    shadow.append(box);
  }

  function mount(p: HTMLElement) {
    close();
    panel = p;
    shadow.append(p);
  }

  /** Esegue una scrittura; se la sessione è scaduta fa rifare il login e riprova una volta. */
  async function withReauth<T>(fn: () => Promise<Result<T>>, onError: (msg: string) => void): Promise<Result<T>> {
    let r = await fn();
    if (!r.ok && r.error.kind === 'auth') {
      onError('Sessione scaduta: accedi di nuovo, la bozza resta qui.');
      await deps.reauth();
      r = await fn();
    }
    if (!r.ok) onError(r.error.message);
    return r;
  }

  function header(title: string, extra: (Node | string)[] = []) {
    return el('div', { class: 'sr-panel-head' }, [
      el('h2', { text: title }),
      el('div', { class: 'sr-panel-tools' }, [...extra,
        el('button', { class: 'sr-close', text: '×', attrs: { type: 'button', 'aria-label': 'Chiudi', title: 'Chiudi' }, on: { click: close } })]),
    ]);
  }

  function openNew(ctx: NewIssueContext) {
    const err = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });
    const textarea = el('textarea', { attrs: { placeholder: 'Cosa non va? (es. "Titolo troppo vicino all’immagine")', 'aria-label': 'Testo della segnalazione' } });
    const picker = createAttachmentPicker(textarea, { prepare: deps.prepare, lightbox });
    const saveBtn = el('button', { class: 'sr-btn sr-save', text: 'Salva', attrs: { type: 'button' } });
    let created: Issue | null = null;

    const form = el('div', {}, [
      ctx.screenshot
        ? el('p', { class: 'sr-muted', text: 'Screenshot catturato.' })
        : el('p', { class: 'sr-error-text', text: 'Screenshot non disponibile: la segnalazione verrà salvata senza.' }),
      textarea, picker.element, err,
      el('div', { class: 'sr-row' }, [saveBtn, el('button', { class: 'sr-btn sr-ghost', text: 'Annulla', attrs: { type: 'button' }, on: { click: close } })]),
    ]);

    const p = el('div', { class: 'sr sr-panel sr-composer' }, [
      header('Nuova segnalazione', [el('span', { class: 'sr-chip', text: `${VIEWPORT_LABEL[ctx.viewportClass]} ${ctx.viewportWidth}` })]),
    ]);

    if (ctx.duplicates.length) {
      form.hidden = true;
      const dup = el('div', { class: 'sr-dup' }, [el('strong', { text: 'Già segnalato qui' })]);
      for (const d of ctx.duplicates) {
        dup.append(el('div', { class: 'sr-dup-item' }, [
          el('div', {}, [el('strong', { text: `#${d.issue.number} ` }), d.issue.body.slice(0, DUP_TEXT)]),
          el('div', { class: 'sr-muted', text: `${author(d.issue.author_id)} · ${VIEWPORT_LABEL[d.issue.viewport_class]}` }),
          el('div', { class: 'sr-row' }, [
            el('button', { class: 'sr-btn sr-ghost', text: 'Rispondi', attrs: { type: 'button' }, on: { click: () => void openThread(d.issue.id) } })]),
        ]));
      }
      dup.append(el('button', { class: 'sr-btn', text: 'Crea comunque nuova', attrs: { type: 'button' },
        on: { click: () => { dup.remove(); form.hidden = false; textarea.focus(); } } }));
      p.append(dup);
    }
    p.append(form);

    saveBtn.addEventListener('click', async () => {
      const body = textarea.value.trim();
      if (!body) { err.textContent = 'Scrivi cosa non va.'; return; }
      if (picker.busy()) { err.textContent = 'Attendi: sto preparando le immagini.'; return; }
      saveBtn.disabled = true;
      err.textContent = '';
      const r = await withReauth(() => api.createIssue({
        project_id: deps.projectId, page_path: ctx.pagePath, page_url: ctx.pageUrl,
        viewport_class: ctx.viewportClass, viewport_width: ctx.viewportWidth,
        browser: navigator.userAgent, anchor: ctx.anchor, body,
      }, ctx.screenshot, picker.images()), msg => { err.textContent = msg; });
      saveBtn.disabled = false;
      if (!r.ok) { saveBtn.textContent = 'Riprova'; return; }
      created = r.value.issue;
      deps.onSaved(created);
      if (!r.value.failed.length) { close(); return; }
      textarea.disabled = true;
      saveBtn.hidden = true;
      err.textContent = `Segnalazione #${created.number} salvata.`;
      const issue = created;
      picker.markFailed(r.value.failed, img => api.uploadAttachment(issue, img, null).then(x => { if (x.ok) deps.onChanged(issue.id); return x; }), close);
    });

    mount(p);
    textarea.focus();
  }

  function images(container: HTMLElement, atts: Attachment[]) {
    if (!atts.length) return;
    const row = el('div', { class: 'sr-thumbs' });
    container.append(row);
    for (const a of atts) {
      const img = el('img', { attrs: { alt: 'Allegato' } });
      row.append(el('div', { class: 'sr-thumb' }, [img]));
      void api.signedUrl(a.path).then(u => { if (u.ok) { img.src = u.value; img.addEventListener('click', () => lightbox(u.value)); } });
    }
  }

  async function openThread(issueId: string): Promise<void> {
    const r = await api.getIssue(issueId);
    if (!r.ok) {
      mount(el('div', { class: 'sr sr-panel' }, [header('Segnalazione'), el('p', { class: 'sr-error-text', text: r.error.message })]));
      return;
    }
    renderThread(r.value);
  }

  function renderThread(issue: IssueDetail) {
    const me = deps.me();
    const err = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });

    const status = el('select', { class: 'sr-status', attrs: { 'aria-label': 'Stato' } },
      (Object.keys(STATUS_LABEL) as IssueStatus[]).map(s => {
        const o = el('option', { text: STATUS_LABEL[s], attrs: { value: s } });
        if (s === issue.status) o.selected = true;
        return o;
      }));
    status.addEventListener('change', async () => {
      const r = await withReauth(() => api.setStatus(issue.id, status.value as IssueStatus), m => { err.textContent = m; });
      if (r.ok) deps.onChanged(issue.id); else status.value = issue.status;
    });

    const mine = !!me && me.id === issue.author_id;
    const actions: Node[] = [];
    if (mine && !issue.deleted_at) {
      actions.push(el('button', { class: 'sr-btn sr-ghost', text: 'Modifica', attrs: { type: 'button' }, on: { click: () => editText() } }));
      actions.push(el('button', { class: 'sr-btn sr-danger', text: 'Elimina', attrs: { type: 'button' }, on: { click: async () => {
        if (!confirm('Eliminare la segnalazione? Verrà tolta anche dall’archivio su Fogli Google.')) return;
        const r = await withReauth(() => api.softDeleteIssue(issue.id), m => { err.textContent = m; });
        if (r.ok) { deps.onChanged(issue.id); close(); }
      } } }));
    }

    const actionsRow = actions.length ? el('div', { class: 'sr-row' }, actions) : null;
    const bodyText = el('p', { class: 'sr-body', text: issue.body });
    const body = el('div', {}, [
      el('p', { class: 'sr-muted', text: `${author(issue.author_id)} · ${formatDate(issue.created_at)} · ${VIEWPORT_LABEL[issue.viewport_class]} ${issue.viewport_width}` }),
      issue.edited_at
        ? el('p', { class: 'sr-edited', text: formatEdited(issue.edited_at), attrs: { title: `Testo modificato il ${formatDate(issue.edited_at)}` } })
        : '',
      bodyText,
    ]);

    function editText() {
      if (body.querySelector('.sr-edit')) return;
      const ta = el('textarea', { attrs: { 'aria-label': 'Testo della segnalazione' } });
      ta.value = issue.body;
      const editErr = el('p', { class: 'sr-error-text', attrs: { role: 'alert' } });
      const editPicker = createAttachmentPicker(ta, { prepare: deps.prepare, lightbox });
      const save = el('button', { class: 'sr-btn', text: 'Salva modifiche', attrs: { type: 'button' } });
      const cancel = el('button', { class: 'sr-btn sr-ghost', text: 'Annulla', attrs: { type: 'button' }, on: { click: () => stopEditing() } });
      const box = el('div', { class: 'sr-edit' }, [ta, editPicker.element, editErr, el('div', { class: 'sr-row' }, [save, cancel])]);
      const reload = () => { deps.onChanged(issue.id); void openThread(issue.id); };
      save.addEventListener('click', async () => {
        if (editPicker.busy()) { editErr.textContent = 'Attendi: sto preparando le immagini.'; return; }
        const textChanged = ta.value.trim() !== issue.body;
        const imgs = editPicker.images();
        if (!textChanged && !imgs.length) { stopEditing(); return; }
        save.disabled = true;
        editErr.textContent = '';
        if (textChanged) {
          const r = await withReauth(() => api.editIssue(issue.id, ta.value), m => { editErr.textContent = m; });
          if (!r.ok) { save.disabled = false; return; }
        }
        const failed: PreparedImage[] = [];
        for (const img of imgs) {
          const r = await withReauth(() => api.uploadAttachment(issue, img, null), () => {});
          if (!r.ok) failed.push(img);
        }
        save.disabled = false;
        if (!failed.length) { reload(); return; }
        // Il testo è salvato: restano da ricaricare solo le immagini non andate a buon fine
        deps.onChanged(issue.id);
        ta.disabled = true;
        save.hidden = true;
        cancel.textContent = 'Chiudi';
        cancel.onclick = reload;
        editPicker.markFailed(failed, img => api.uploadAttachment(issue, img, null), reload);
      });
      function stopEditing() { box.replaceWith(bodyText); if (actionsRow) actionsRow.hidden = false; }
      bodyText.replaceWith(box);
      if (actionsRow) actionsRow.hidden = true; // in modifica restano solo Salva modifiche e Annulla
      ta.focus();
    }
    if (issue.screenshot_path) {
      const shot = el('img', { class: 'sr-shot', attrs: { alt: 'Screenshot della segnalazione' } });
      body.append(shot);
      void api.signedUrl(issue.screenshot_path).then(u => { if (u.ok) { shot.src = u.value; shot.addEventListener('click', () => lightbox(u.value)); } });
    }
    images(body, issue.attachments);

    const replies = el('div', {}, [el('h3', { text: `Risposte (${issue.replies.filter(x => !x.deleted_at).length})` })]);
    for (const rep of issue.replies) {
      if (rep.deleted_at) continue;
      const row = el('div', { class: 'sr-reply' }, [
        el('div', { class: 'sr-muted', text: `${author(rep.author_id)} · ${formatDate(rep.created_at)}` }),
        el('p', { class: 'sr-body', text: rep.body }),
      ]);
      images(row, rep.attachments);
      if (me && rep.author_id === me.id) {
        row.append(el('button', { class: 'sr-btn sr-ghost', text: 'Elimina risposta', attrs: { type: 'button' }, on: { click: async () => {
          if (!confirm('Eliminare la risposta?')) return;
          const r = await withReauth(() => api.softDeleteReply(rep.id), m => { err.textContent = m; });
          if (r.ok) { deps.onChanged(issue.id); void openThread(issue.id); }
        } } }));
      }
      replies.append(row);
    }

    const replyText = el('textarea', { attrs: { placeholder: 'Rispondi…', 'aria-label': 'Risposta' } });
    const picker = createAttachmentPicker(replyText, { prepare: deps.prepare, lightbox });
    const send = el('button', { class: 'sr-btn sr-send', text: 'Rispondi', attrs: { type: 'button' } });
    send.addEventListener('click', async () => {
      const text = replyText.value.trim();
      if (!text) { err.textContent = 'Scrivi una risposta.'; return; }
      if (picker.busy()) { err.textContent = 'Attendi: sto preparando le immagini.'; return; }
      send.disabled = true;
      const r = await withReauth(() => api.addReply(issue, text, picker.images()), m => { err.textContent = m; });
      send.disabled = false;
      if (!r.ok) { send.textContent = 'Riprova'; return; }
      deps.onChanged(issue.id);
      if (r.value.failed.length) {
        err.textContent = 'Risposta salvata.';
        replyText.value = '';
        picker.markFailed(r.value.failed, img => api.uploadAttachment(issue, img, r.value.reply.id), () => void openThread(issue.id));
      } else void openThread(issue.id);
    });

    const p = el('div', { class: 'sr sr-panel sr-thread', attrs: { 'data-issue': issue.id } }, [
      header(`#${issue.number}`, [status]),
      issue.deleted_at ? el('p', { class: 'sr-error-text', text: 'Segnalazione eliminata.' }) : '',
      body, actionsRow ?? '', ...(deps.threadExtras?.(issue) ?? []), replies,
      replyText, picker.element, err, send,
    ]);
    mount(p);
    threadId = issue.id;
  }

  return {
    openNew,
    openThread,
    close,
    isOpen: () => !!panel,
    /** Id della segnalazione aperta nel thread, se c'è (per gli aggiornamenti live). */
    currentThread: () => threadId,
    /** Ricarica il thread aperto dopo una modifica live, ma non se si sta scrivendo una risposta. */
    refreshIfIdle(issueId: string) {
      if (threadId !== issueId || !panel) return;
      const typing = [...panel.querySelectorAll('textarea')].some(t => t.value.trim() !== '' || shadow.activeElement === t);
      if (!typing) void openThread(issueId);
    },
  };
}
export type Composer = ReturnType<typeof createComposer>;
