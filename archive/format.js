/* Stage Review — archivio su Fogli Google: funzioni pure (una riga per segnalazione).
 * Funzioni globali, nessun import: si incollano in Apps Script. */

var SR_VIEWPORT = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' };
var SR_STATUS = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };
var SR_COLUMNS = ['#', 'Stato', 'Pagina', 'Viewport', 'Segnalazione', 'Autore', 'Data', '+1', 'Risposte',
  'Screenshot', 'Anteprima', 'Allegati', 'Apri nel sito', 'ID'];
var SR_COL = {};
SR_COLUMNS.forEach(function (c, i) { SR_COL[c] = i + 1; });

function srFormatDate(iso, tz) {
  var d = new Date(iso);
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm');
  var parts = {};
  new Intl.DateTimeFormat('it-IT', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
  return parts.day + '/' + parts.month + '/' + parts.year + ' ' + parts.hour + ':' + parts.minute;
}

function srName(profilesById, id) {
  var p = profilesById && profilesById[id];
  return (p && p.name) || 'Utente';
}

function srByCreated(a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }

/** Il testo scritto dagli utenti non deve mai diventare una formula del foglio. */
function srSafeText(s) {
  s = s == null ? '' : String(s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function srQuote(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }

function srLink(url, label) {
  return url ? '=HYPERLINK(' + srQuote(url) + ',' + srQuote(label) + ')' : '';
}

function srFocusUrl(issue) {
  return String(issue.page_url).split('#')[0] + '#stage-review=' + issue.id;
}

function srAttachments(issue) {
  return (issue.attachments || []).filter(function (a) { return !a.deleted_at; }).sort(srByCreated);
}

/** Percorsi delle immagini da firmare: screenshot e allegati non eliminati. */
function srImagePaths(issue) {
  var paths = issue.screenshot_path ? [issue.screenshot_path] : [];
  srAttachments(issue).forEach(function (a) { paths.push(a.path); });
  return paths;
}

/** Etichette degli allegati: "Immagine 1", "Risposta di Marco 1". */
function srAttachmentLinks(issue, profilesById, urls) {
  var replies = {};
  (issue.replies || []).forEach(function (r) { replies[r.id] = r; });
  var counters = {};
  return srAttachments(issue).map(function (a) {
    var who = a.reply_id && replies[a.reply_id] ? 'Risposta di ' + srName(profilesById, replies[a.reply_id].author_id) : 'Immagine';
    counters[who] = (counters[who] || 0) + 1;
    return { label: who + ' ' + counters[who], url: urls[a.path] || null };
  });
}

function srRepliesText(issue, profilesById, tz) {
  return (issue.replies || []).filter(function (r) { return !r.deleted_at; }).sort(srByCreated).map(function (r) {
    return srName(profilesById, r.author_id) + ' · ' + srFormatDate(r.created_at, tz) + ': ' + r.body;
  }).join('\n');
}

/**
 * Riga del foglio per una segnalazione. urls: { <percorso storage>: link firmato }.
 * Restituisce i valori (formule in sintassi inglese con le virgole, come vuole Apps Script)
 * e i link degli allegati da mettere come testo con collegamenti nella colonna Allegati.
 */
function buildRow(issue, profilesById, tz, urls) {
  var shot = issue.screenshot_path ? urls[issue.screenshot_path] || null : null;
  var attachments = srAttachmentLinks(issue, profilesById, urls);
  var values = [
    issue.number,
    SR_STATUS[issue.status] || issue.status,
    srSafeText(issue.page_path),
    SR_VIEWPORT[issue.viewport_class] + ' ' + issue.viewport_width,
    srSafeText(issue.body),
    srSafeText(srName(profilesById, issue.author_id)),
    srFormatDate(issue.created_at, tz),
    (issue.plus_ones || []).length,
    srSafeText(srRepliesText(issue, profilesById, tz)),
    srLink(shot, 'Apri'),
    shot ? '=IMAGE(' + srQuote(shot) + ')' : '',
    attachments.map(function (a) { return a.label; }).join(', '),
    srLink(srFocusUrl(issue), 'Apri'),
    issue.id,
  ];
  return { values: values, attachments: attachments };
}

if (typeof module !== 'undefined') {
  module.exports = { SR_COLUMNS: SR_COLUMNS, SR_COL: SR_COL, buildRow: buildRow, srSafeText: srSafeText, srImagePaths: srImagePaths, srFormatDate: srFormatDate };
}
