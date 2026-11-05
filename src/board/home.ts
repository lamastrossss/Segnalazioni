import { initBoard } from './common';
import { archiveHealth } from './logic';
import { usageLevel } from '../shared/usage';
import { formatDate, STATUS_LABEL } from '../shared/format';
import { el } from '../shared/dom';

const board = await initBoard('Stage Review');
const { api, main } = board;

const statusBar = el('div', { class: 'status-bar' });
const grid = el('div', { class: 'grid' });
main.append(statusBar, grid);

async function renderStatus() {
  const [usage, archive] = await Promise.all([api.totalUsageBytes(), api.archiveStatus()]);
  const parts: Node[] = [];
  if (usage.ok) {
    const lvl = usageLevel(usage.value);
    const pct = Math.min(100, Math.round(lvl.ratio * 100));
    const meter = el('span', { class: `meter${lvl.warn ? ' warn' : ''}`, attrs: { role: 'img', 'aria-label': `${pct}% usato` } }, [el('span', { attrs: { style: `width:${pct}%` } })]);
    parts.push(el('span', { class: lvl.warn ? 'warn-text' : '' }, [`Spazio usato: ${pct}% di 1 GB`, meter]));
    if (lvl.warn) parts.push(el('span', { class: 'warn-text', text: 'Spazio quasi pieno: fate pulizia.' }));
  }
  if (archive.ok) {
    const h = archiveHealth(archive.value, new Date());
    const when = archive.value.last_ok_at ? new Date(archive.value.last_ok_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null;
    const label = when ? `Ultimo archivio: ${when}` : 'Archivio su Fogli Google non ancora attivo';
    parts.push(el('span', { class: `archive ${h}`, text: h === 'error' ? `${label} · errore` : label,
      attrs: archive.value.last_error ? { title: archive.value.last_error } : {} }));
  }
  statusBar.replaceChildren(...parts);
}

async function renderProjects() {
  const r = await api.listProjects();
  if (!r.ok) { grid.replaceChildren(el('p', { class: 'error', text: r.error.message })); return; }
  if (!r.value.length) {
    grid.replaceChildren(el('div', { class: 'card empty' }, [
      el('p', { text: 'Nessun sito ancora.' }),
      el('p', { class: 'muted' }, ['Installa il pulsante ', el('a', { text: 'Revisiona', attrs: { href: './install.html' } }), ', apri uno stage e cliccalo: il sito si crea da lì.']),
    ]));
    return;
  }
  grid.replaceChildren(...r.value.map(p => el('article', { class: 'card' }, [
    el('h2', {}, [el('a', { text: p.name, attrs: { href: `./site.html?id=${encodeURIComponent(p.id)}` } })]),
    el('p', { class: 'muted domains', text: p.domains.join(' · ') }),
    el('div', { class: 'chips' }, [
      el('span', { class: 'chip open', text: `${p.open} ${STATUS_LABEL.open.toLowerCase()}` }),
      el('span', { class: 'chip in_progress', text: `${p.in_progress} ${STATUS_LABEL.in_progress.toLowerCase()}` }),
      el('span', { class: 'chip resolved', text: `${p.resolved} ${STATUS_LABEL.resolved.toLowerCase()}` }),
    ]),
    el('p', { class: 'muted', text: p.last_activity ? `Ultima attività: ${formatDate(p.last_activity)}` : 'Nessuna attività' }),
    el('div', { class: 'chips' }, [
      el('a', { class: 'btn', text: 'Apri', attrs: { href: `./site.html?id=${encodeURIComponent(p.id)}` } }),
      p.archive_doc_url ? el('a', { class: 'btn ghost', text: 'Archivio (Fogli Google)', attrs: { href: p.archive_doc_url, target: '_blank', rel: 'noopener' } }) : '',
    ]),
  ])));
}

await Promise.all([renderStatus(), renderProjects()]);
setInterval(() => void renderStatus(), 60_000);
