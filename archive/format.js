/* Stage Review — archivio Google Docs: funzioni pure di formattazione.
 * Incollare in Apps Script come file "format.gs". Nessun import: funzioni globali. */

var SR_VIEWPORT = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' };
var SR_STATUS = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };

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

function formatTitle(issue) {
  return '#' + issue.number + ' · ' + issue.page_path + ' · ' + SR_VIEWPORT[issue.viewport_class] + ' ' + issue.viewport_width;
}

function formatMeta(issue, profilesById, tz) {
  var plus = (issue.plus_ones || []).length;
  var s = srName(profilesById, issue.author_id) + ' · ' + srFormatDate(issue.created_at, tz)
    + ' · Stato: ' + SR_STATUS[issue.status] + ' · +1: ' + plus + ' · Apri nel sito: ' + issue.page_url;
  if (issue.deleted_at) s += ' · Eliminata il ' + srFormatDate(issue.deleted_at, tz) + ' da ' + srName(profilesById, issue.deleted_by);
  return s;
}

function formatReplyHeader(reply, profilesById, tz) {
  return srName(profilesById, reply.author_id) + ' · ' + srFormatDate(reply.created_at, tz) + (reply.deleted_at ? ' · eliminata' : '');
}

/** Immagini della segnalazione (screenshot + allegati non di risposta), nell'ordine del Doc. */
function srIssueImageIds(issue) {
  var ids = issue.screenshot_path ? ['shot'] : [];
  (issue.attachments || []).filter(function (a) { return !a.reply_id && !a.deleted_at; }).sort(srByCreated)
    .forEach(function (a) { ids.push(a.id); });
  return ids;
}

function planBlockUpdate(issue, known) {
  var replies = (issue.replies || []).slice().sort(srByCreated);
  if (!known) {
    return { create: true, newImageIds: srIssueImageIds(issue), newReplyIds: replies.map(function (r) { return r.id; }), deletedReplyIds: [] };
  }
  var imgs = known.imgs || [], seenReplies = known.replies || [], marked = known.deleted || [];
  var candidates = srIssueImageIds(issue);
  (issue.attachments || []).filter(function (a) {
    return a.reply_id && !a.deleted_at && seenReplies.indexOf(a.reply_id) >= 0;
  }).sort(srByCreated).forEach(function (a) { candidates.push(a.id); });
  return {
    create: false,
    newImageIds: candidates.filter(function (id) { return imgs.indexOf(id) < 0; }),
    newReplyIds: replies.filter(function (r) { return seenReplies.indexOf(r.id) < 0; }).map(function (r) { return r.id; }),
    deletedReplyIds: replies.filter(function (r) {
      return r.deleted_at && seenReplies.indexOf(r.id) >= 0 && marked.indexOf(r.id) < 0;
    }).map(function (r) { return r.id; }),
  };
}

/** Stato da ricordare dopo aver scritto il blocco. */
function nextKnown(issue) {
  var imgs = issue.screenshot_path ? ['shot'] : [];
  (issue.attachments || []).filter(function (a) { return !a.deleted_at; }).sort(srByCreated)
    .forEach(function (a) { imgs.push(a.id); });
  var replies = (issue.replies || []).slice().sort(srByCreated);
  return {
    imgs: imgs,
    replies: replies.map(function (r) { return r.id; }),
    deleted: replies.filter(function (r) { return r.deleted_at; }).map(function (r) { return r.id; }),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { formatTitle: formatTitle, formatMeta: formatMeta, formatReplyHeader: formatReplyHeader, planBlockUpdate: planBlockUpdate, nextKnown: nextKnown };
}
