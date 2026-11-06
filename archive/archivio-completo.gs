// Stage Review — archivio su Fogli Google (format.js + sync.js in un unico file)
/* Stage Review — archivio su Fogli Google: funzioni pure (una riga per segnalazione).
 * Funzioni globali, nessun import: si incollano in Apps Script. */

var SR_VIEWPORT = { mobile: 'Mobile', tablet: 'Tablet', desktop: 'Desktop' };
var SR_STATUS = { open: 'Aperta', in_progress: 'In lavorazione', resolved: 'Risolta' };
var SR_STATUS_KEY = { 'Aperta': 'open', 'In lavorazione': 'in_progress', 'Risolta': 'resolved' };
var SR_COLUMNS = ['#', 'Stato', 'Pagina', 'Viewport', 'Segnalazione', 'Autore', 'Data', 'Risposte',
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
 * I link sono testo collegato ("Apri"), non formule HYPERLINK: le formule con più parametri
 * dipendono dalla lingua del foglio (in italiano il separatore è ";").
 * L'unica formula è IMAGE, con un solo parametro, che funziona in ogni lingua.
 * Restituisce i valori e, per le colonne con link, le parti da collegare.
 */
function buildRow(issue, profilesById, tz, urls) {
  var shot = issue.screenshot_path ? urls[issue.screenshot_path] || null : null;
  var attachments = srAttachmentLinks(issue, profilesById, urls);
  var site = srFocusUrl(issue);
  var values = [
    issue.number,
    SR_STATUS[issue.status] || issue.status,
    srSafeText(issue.page_path),
    SR_VIEWPORT[issue.viewport_class] + ' ' + issue.viewport_width,
    srSafeText(issue.body),
    srSafeText(srName(profilesById, issue.author_id)),
    srFormatDate(issue.created_at, tz) + (issue.edited_at ? ' · modificata ' + srFormatDate(issue.edited_at, tz) : ''),
    srSafeText(srRepliesText(issue, profilesById, tz)),
    shot ? 'Apri' : '',
    shot ? '=IMAGE(' + srQuote(shot) + ')' : '',
    attachments.map(function (a) { return a.label; }).join(', '),
    'Apri',
    issue.id,
  ];
  var links = [];
  if (shot) links.push({ col: SR_COL.Screenshot, parts: [{ label: 'Apri', url: shot }] });
  if (attachments.some(function (a) { return a.url; })) links.push({ col: SR_COL.Allegati, parts: attachments });
  links.push({ col: SR_COL['Apri nel sito'], parts: [{ label: 'Apri', url: site }] });
  return { values: values, links: links };
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
var SR_WIDTHS = [48, 110, 180, 110, 320, 140, 130, 320, 80, 150, 220, 90, 60];

/** Da eseguire una volta: crea il trigger ogni 10 minuti. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncArchive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncArchive').timeBased().everyMinutes(10).create();
}

/**
 * Da eseguire a mano per ripartire da zero (dopo aver svuotato il database con ripartenza.sql):
 * sposta nel Cestino di Drive i fogli e i vecchi Doc dell'archivio, toglie gli ascoltatori dello Stato
 * e azzera lo stato della sincronizzazione. Le impostazioni (URL, chiave, cartella) e il timer restano.
 */
function ripartiDaZero() {
  var props = PropertiesService.getScriptProperties();
  var keep = { SUPABASE_URL: 1, SERVICE_ROLE_KEY: 1, FOLDER_ID: 1 };
  props.getKeys().forEach(function (k) {
    if (keep[k]) return;
    if (k.indexOf('sheet:') === 0 || k.indexOf('doc:') === 0) {
      try { DriveApp.getFileById(props.getProperty(k)).setTrashed(true); } catch (e) { /* già cancellato */ }
    }
    props.deleteProperty(k);
  });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onStatoEdit') ScriptApp.deleteTrigger(t);
  });
}

/** Entry point del trigger. */
function syncArchive() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // un altro giro è in corso
  try { srRun_(); } finally { lock.releaseLock(); }
}

function srRun_() {
  var started = Date.now();
  srEnsured_ = {};
  var props = PropertiesService.getScriptProperties();
  var cfg = srConfig_(props);
  var error = null;
  try {
    var profiles = srIndex_(srRest_(cfg, 'get', '/rest/v1/profiles?select=id,name'));
    var projects = srIndex_(srRest_(cfg, 'get', '/rest/v1/projects?select=id,name,archive_doc_url,deleted_at'));
    srPrepareSheets_(cfg, props, projects);
    var settled = encodeURIComponent(new Date(Date.now() - SR_SETTLE_MS).toISOString());
    var more = true;
    while (more && Date.now() - started < SR_MAX_RUN_MS) {
      var wm = (props.getProperty('SHEET_WATERMARK_V2') || SR_START_WATERMARK).split('|');
      var t = encodeURIComponent(wm[0]);
      var rows = srRest_(cfg, 'get', '/rest/v1/issues?select=*,replies(*),attachments(*)'
        + '&or=(updated_at.gt.' + t + ',and(updated_at.eq.' + t + ',id.gt.' + wm[1] + '))'
        + '&updated_at=lt.' + settled
        + '&order=updated_at.asc,id.asc&limit=' + SR_BATCH);
      for (var i = 0; i < rows.length; i++) {
        if (Date.now() - started > SR_MAX_RUN_MS) { more = false; break; }
        var issue = rows[i];
        if (!profiles[issue.author_id]) profiles = srIndex_(srRest_(cfg, 'get', '/rest/v1/profiles?select=id,name'));
        if (!projects[issue.project_id]) projects = srIndex_(srRest_(cfg, 'get', '/rest/v1/projects?select=id,name,archive_doc_url,deleted_at'));
        srWriteIssue_(cfg, props, projects[issue.project_id], issue, profiles);
        SpreadsheetApp.flush(); // salvato prima di far avanzare il segnaposto
        props.setProperty('SHEET_WATERMARK_V2', issue.updated_at + '|' + issue.id);
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
    var existing = ss.getSheets()[0];
    // fogli creati prima della rimozione del +1: si toglie la colonna, i dati restano allineati
    if (existing.getRange(1, 8).getValues()[0][0] === '+1') existing.deleteColumn(8);
    srEnsureEditTrigger_(ss);
    return existing;
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
  srEnsureEditTrigger_(ss);
  return sheet;
}

/** Un ascoltatore per foglio: cambiare lo Stato nel foglio lo salva in Stage Review. */
var srEnsured_ = {};
function srEnsureEditTrigger_(ss) {
  var id = ss.getId();
  if (srEnsured_[id]) return;
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'onStatoEdit' && t.getTriggerSourceId() === id;
  });
  if (!exists) ScriptApp.newTrigger('onStatoEdit').forSpreadsheet(ss).onEdit().create();
  srEnsured_[id] = true;
}

/** Ascoltatore: chiamato da Google quando qualcuno modifica il foglio. */
function onStatoEdit(e) {
  var range = e && e.range;
  if (!range) return;
  var sheet = range.getSheet();
  if (sheet.getName() !== 'Segnalazioni') return;
  var c0 = range.getColumn(), c1 = c0 + range.getNumColumns() - 1;
  if (SR_COL.Stato < c0 || SR_COL.Stato > c1) return;
  var cfg = null;
  for (var row = Math.max(2, range.getRow()); row <= range.getRow() + range.getNumRows() - 1; row++) {
    var cell = sheet.getRange(row, SR_COL.Stato);
    var status = SR_STATUS_KEY[cell.getValue()];
    var id = sheet.getRange(row, SR_COL.ID).getValue();
    if (!status || !id) continue;
    try {
      cfg = cfg || srConfig_(PropertiesService.getScriptProperties());
      srRest_(cfg, 'patch', '/rest/v1/issues?id=eq.' + encodeURIComponent(id), { status: status });
      cell.setNote('');
    } catch (err) {
      cell.setNote('Stato non salvato in Stage Review: ' + String((err && err.message) || err).slice(0, 200));
    }
  }
}

function srStatusRule_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(['Aperta', 'In lavorazione', 'Risolta'], true).setAllowInvalid(false).build();
}

/** A ogni giro: ogni foglio già creato ha l'ascoltatore e il menu dello Stato su tutte le righe. */
function srPrepareSheets_(cfg, props, projects) {
  Object.keys(projects).forEach(function (pid) {
    var sheetId = props.getProperty('sheet:' + pid);
    if (!sheetId) return;
    if (projects[pid].deleted_at) {
      // sito eliminato nella board: foglio nel Cestino di Drive (recuperabile), niente più aggiornamenti
      try { DriveApp.getFileById(sheetId).setTrashed(true); } catch (e) { /* già cancellato */ }
      ScriptApp.getProjectTriggers().forEach(function (t) {
        if (t.getHandlerFunction() === 'onStatoEdit' && t.getTriggerSourceId() === sheetId) ScriptApp.deleteTrigger(t);
      });
      props.deleteProperty('sheet:' + pid);
      return;
    }
    var sheet = srSheetFor_(cfg, props, projects[pid]);
    var last = sheet.getLastRow();
    if (last >= 2) sheet.getRange(2, SR_COL.Stato, last - 1, 1).setDataValidation(srStatusRule_());
  });
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
  if (!project || project.deleted_at) return;
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
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1, 1, SR_COLUMNS.length).setValues([built.values]);
  sheet.getRange(row, SR_COL.Stato).setDataValidation(srStatusRule_());

  built.links.forEach(function (spec) {
    var text = spec.parts.map(function (p) { return p.label; }).join(', ');
    var rt = SpreadsheetApp.newRichTextValue().setText(text);
    var pos = 0;
    spec.parts.forEach(function (p) {
      if (p.url) rt.setLinkUrl(pos, pos + p.label.length, p.url); // fine esclusiva
      pos += p.label.length + 2;
    });
    sheet.getRange(row, spec.col).setRichTextValue(rt.build());
  });
  if (built.values[SR_COL.Anteprima - 1]) sheet.setRowHeight(row, SR_ROW_HEIGHT);
}
