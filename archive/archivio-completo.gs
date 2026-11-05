// Stage Review — archivio su Fogli Google (format.js + sync.js in un unico file)
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

/* Stage Review — archivio su Fogli Google: sincronizzazione Supabase → un foglio per sito.
 * Proprietà dello script richieste: SUPABASE_URL, SERVICE_ROLE_KEY, FOLDER_ID. */

var SR_TZ = 'Europe/Rome';
var SR_MAX_RUN_MS = 4 * 60 * 1000;   // Apps Script interrompe a 6 minuti
var SR_SETTLE_MS = 30 * 1000;        // ignora modifiche più recenti: transazioni forse non ancora visibili
var SR_BATCH = 50;
var SR_LINK_SECONDS = 315360000;     // link alle immagini validi 10 anni
var SR_ROW_HEIGHT = 90;              // spazio per l'anteprima dello screenshot
var SR_START_WATERMARK = '1970-01-01T00:00:00+00:00|00000000-0000-0000-0000-000000000000';
var SR_WIDTHS = [48, 110, 180, 110, 320, 140, 130, 48, 320, 80, 150, 220, 90, 60];

/** Da eseguire una volta: crea il trigger ogni 10 minuti. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncArchive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncArchive').timeBased().everyMinutes(10).create();
}

/** Entry point del trigger. */
function syncArchive() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // un altro giro è in corso
  try { srRun_(); } finally { lock.releaseLock(); }
}

function srRun_() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var cfg = srConfig_(props);
  var error = null;
  try {
    var profiles = srIndex_(srRest_(cfg, 'get', '/rest/v1/profiles?select=id,name'));
    var projects = srIndex_(srRest_(cfg, 'get', '/rest/v1/projects?select=id,name,archive_doc_url'));
    var settled = encodeURIComponent(new Date(Date.now() - SR_SETTLE_MS).toISOString());
    var more = true;
    while (more && Date.now() - started < SR_MAX_RUN_MS) {
      var wm = (props.getProperty('SHEET_WATERMARK') || SR_START_WATERMARK).split('|');
      var t = encodeURIComponent(wm[0]);
      var rows = srRest_(cfg, 'get', '/rest/v1/issues?select=*,replies(*),attachments(*),plus_ones(user_id)'
        + '&or=(updated_at.gt.' + t + ',and(updated_at.eq.' + t + ',id.gt.' + wm[1] + '))'
        + '&updated_at=lt.' + settled
        + '&order=updated_at.asc,id.asc&limit=' + SR_BATCH);
      for (var i = 0; i < rows.length; i++) {
        if (Date.now() - started > SR_MAX_RUN_MS) { more = false; break; }
        var issue = rows[i];
        if (!profiles[issue.author_id]) profiles = srIndex_(srRest_(cfg, 'get', '/rest/v1/profiles?select=id,name'));
        if (!projects[issue.project_id]) projects = srIndex_(srRest_(cfg, 'get', '/rest/v1/projects?select=id,name,archive_doc_url'));
        srWriteIssue_(cfg, props, projects[issue.project_id], issue, profiles);
        SpreadsheetApp.flush(); // salvato prima di far avanzare il segnaposto
        props.setProperty('SHEET_WATERMARK', issue.updated_at + '|' + issue.id);
      }
      if (rows.length < SR_BATCH) more = false;
    }
  } catch (e) {
    error = String((e && e.message) || e);
  }

  var now = new Date().toISOString();
  var status = { id: 1, last_run_at: now, last_error: error };
  if (!error) status.last_ok_at = now;
  try {
    srRest_(cfg, 'post', '/rest/v1/archive_status?on_conflict=id', status, { Prefer: 'resolution=merge-duplicates' });
  } catch (e) { error = error || String(e); }
  if (error) throw new Error('Stage Review archivio: ' + error); // Google avvisa via email
}

// ---- Supabase ----

function srConfig_(props) {
  var p = props.getProperties();
  ['SUPABASE_URL', 'SERVICE_ROLE_KEY', 'FOLDER_ID'].forEach(function (k) {
    if (!p[k]) throw new Error('Manca la proprietà dello script ' + k);
  });
  return { url: p.SUPABASE_URL.replace(/\/+$/, ''), key: p.SERVICE_ROLE_KEY, folder: p.FOLDER_ID };
}

function srHeaders_(cfg, extra) {
  var h = { apikey: cfg.key };
  if (cfg.key.indexOf('sb_secret_') !== 0) h.Authorization = 'Bearer ' + cfg.key; // chiave legacy (JWT)
  Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

function srRest_(cfg, method, path, body, extraHeaders) {
  var res = UrlFetchApp.fetch(cfg.url + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: srHeaders_(cfg, extraHeaders),
    payload: body ? JSON.stringify(body) : undefined,
  });
  var code = res.getResponseCode();
  if (code >= 300) throw new Error(method.toUpperCase() + ' ' + path.split('?')[0] + ' → ' + code + ': ' + res.getContentText().slice(0, 300));
  var text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

/** Link firmati (10 anni) per le immagini, in una sola chiamata. Se fallisce: nessun link. */
function srSignedUrls_(cfg, paths) {
  var out = {};
  if (!paths.length) return out;
  try {
    var res = srRest_(cfg, 'post', '/storage/v1/object/sign/media', { expiresIn: SR_LINK_SECONDS, paths: paths });
    (res || []).forEach(function (r) {
      if (r && r.signedURL && !r.error) out[r.path] = cfg.url + '/storage/v1' + r.signedURL;
    });
  } catch (e) { /* la riga viene scritta lo stesso, senza immagini */ }
  return out;
}

function srIndex_(rows) {
  var o = {};
  (rows || []).forEach(function (r) { o[r.id] = r; });
  return o;
}

// ---- Fogli Google ----

function srSheetFor_(cfg, props, project) {
  var key = 'sheet:' + project.id;
  var wanted = 'Stage Review — ' + project.name;
  var id = props.getProperty(key);
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (ss) {
    if (ss.getName() !== wanted) ss.rename(wanted); // sito rinominato nella board
    return ss.getSheets()[0];
  }
  ss = SpreadsheetApp.create(wanted);
  props.setProperty(key, ss.getId()); // subito: un errore dopo non crea fogli doppi
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(cfg.folder));
  var sheet = ss.getSheets()[0];
  sheet.setName('Segnalazioni');
  sheet.getRange(1, 1, 1, SR_COLUMNS.length).setValues([SR_COLUMNS]);
  sheet.getRange(1, 1, 1, SR_COLUMNS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  SR_WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.hideColumns(SR_COL.ID);
  srRest_(cfg, 'patch', '/rest/v1/projects?id=eq.' + project.id, { archive_doc_url: ss.getUrl() });
  return sheet;
}

/** Numero di riga della segnalazione (colonna ID), oppure -1. */
function srFindRow_(sheet, issueId) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, SR_COL.ID, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === issueId) return i + 2;
  return -1;
}

function srWriteIssue_(cfg, props, project, issue, profiles) {
  if (!project) return;
  var key = 'sheet:' + project.id;
  if (issue.deleted_at) {
    // eliminata: se è nel foglio la togliamo, altrimenti non serve nemmeno creare il foglio
    if (!props.getProperty(key)) return;
    var s = srSheetFor_(cfg, props, project);
    var r = srFindRow_(s, issue.id);
    if (r > 0) s.deleteRow(r);
    return;
  }
  var sheet = srSheetFor_(cfg, props, project);
  var urls = srSignedUrls_(cfg, srImagePaths(issue));
  var built = buildRow(issue, profiles, SR_TZ, urls);
  var row = srFindRow_(sheet, issue.id);
  if (row < 0) row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, SR_COLUMNS.length).setValues([built.values]);

  var linked = built.attachments.filter(function (a) { return a.url; });
  if (linked.length) {
    var text = built.attachments.map(function (a) { return a.label; }).join(', ');
    var rt = SpreadsheetApp.newRichTextValue().setText(text);
    var pos = 0;
    built.attachments.forEach(function (a) {
      if (a.url) rt.setLinkUrl(pos, pos + a.label.length, a.url);
      pos += a.label.length + 2;
    });
    sheet.getRange(row, SR_COL.Allegati).setRichTextValue(rt.build());
  }
  if (built.values[SR_COL.Anteprima - 1]) sheet.setRowHeight(row, SR_ROW_HEIGHT);
}
