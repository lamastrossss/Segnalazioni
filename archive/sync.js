/* Stage Review — archivio Google Docs: sincronizzazione Supabase → un Google Doc per sito.
 * Incollare in Apps Script come file "sync.gs" (insieme a "format.gs").
 * Proprietà dello script richieste: SUPABASE_URL, SERVICE_ROLE_KEY, FOLDER_ID. */

var SR_TZ = 'Europe/Rome';
var SR_MAX_RUN_MS = 5 * 60 * 1000;
var SR_BATCH = 50;
var SR_IMAGE_WIDTH = 480;
var SR_START_WATERMARK = '1970-01-01T00:00:00+00:00|00000000-0000-0000-0000-000000000000';

/** Da eseguire una volta: crea il trigger ogni 10 minuti. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncArchive') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncArchive').timeBased().everyMinutes(10).create();
}

/** Entry point del trigger. */
function syncArchive() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var cfg = srConfig_(props);
  var error = null;
  var docs = {};
  try {
    var profiles = srIndex_(srRest_(cfg, 'get', '/rest/v1/profiles?select=id,name'));
    var projects = srIndex_(srRest_(cfg, 'get', '/rest/v1/projects?select=id,name,archive_doc_url'));
    var more = true;
    while (more && Date.now() - started < SR_MAX_RUN_MS) {
      var wm = (props.getProperty('WATERMARK') || SR_START_WATERMARK).split('|');
      var t = encodeURIComponent(wm[0]);
      var rows = srRest_(cfg, 'get', '/rest/v1/issues?select=*,replies(*,attachments(*)),attachments(*),plus_ones(user_id)'
        + '&or=(updated_at.gt.' + t + ',and(updated_at.eq.' + t + ',id.gt.' + wm[1] + '))'
        + '&order=updated_at.asc,id.asc&limit=' + SR_BATCH);
      for (var i = 0; i < rows.length; i++) {
        if (Date.now() - started > SR_MAX_RUN_MS) { more = false; break; }
        var issue = rows[i];
        if (!profiles[issue.author_id] || (issue.deleted_by && !profiles[issue.deleted_by])) {
          profiles = srIndex_(srRest_(cfg, 'get', '/rest/v1/profiles?select=id,name'));
        }
        if (!projects[issue.project_id]) projects = srIndex_(srRest_(cfg, 'get', '/rest/v1/projects?select=id,name,archive_doc_url'));
        srWriteIssue_(cfg, props, docs, projects[issue.project_id], issue, profiles);
        props.setProperty('WATERMARK', issue.updated_at + '|' + issue.id);
      }
      if (rows.length < SR_BATCH) more = false;
    }
  } catch (e) {
    error = String((e && e.message) || e);
  }
  Object.keys(docs).forEach(function (k) { try { docs[k].saveAndClose(); } catch (e) { error = error || String(e); } });

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

function srFetchImage_(cfg, path) {
  try {
    var res = UrlFetchApp.fetch(cfg.url + '/storage/v1/object/media/' + path.split('/').map(encodeURIComponent).join('/'),
      { headers: srHeaders_(cfg), muteHttpExceptions: true });
    return res.getResponseCode() < 300 ? res.getBlob() : null;
  } catch (e) { return null; }
}

function srIndex_(rows) {
  var o = {};
  (rows || []).forEach(function (r) { o[r.id] = r; });
  return o;
}

// ---- Google Docs ----

function srDocFor_(cfg, props, docs, project) {
  if (docs[project.id]) return docs[project.id];
  var id = props.getProperty('doc:' + project.id);
  var doc = null;
  if (id) { try { doc = DocumentApp.openById(id); } catch (e) { doc = null; } }
  if (!doc) {
    doc = DocumentApp.create('Stage Review — ' + project.name);
    DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(cfg.folder));
    var body = doc.getBody();
    body.getChild(0).asParagraph().setText('Stage Review — ' + project.name).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('Archivio automatico delle segnalazioni, aggiornato ogni 10 minuti. Non modificare i blocchi delle segnalazioni: il testo scritto fuori dai blocchi resta intatto.');
    props.setProperty('doc:' + project.id, doc.getId());
    srRest_(cfg, 'patch', '/rest/v1/projects?id=eq.' + project.id, { archive_doc_url: doc.getUrl() });
  }
  docs[project.id] = doc;
  return doc;
}

function srNamed_(doc, name) {
  var r = doc.getNamedRanges(name);
  return r.length ? r[0] : null;
}

function srNamedEl_(doc, name) {
  var nr = srNamed_(doc, name);
  if (!nr) return null;
  var els = nr.getRange().getRangeElements();
  return els.length ? els[0].getElement() : null;
}

function srSetNamed_(doc, name, elements) {
  doc.getNamedRanges(name).forEach(function (n) { n.remove(); });
  var b = doc.newRange();
  elements.forEach(function (e) { b.addElement(e); });
  doc.addNamedRange(name, b.build());
}

/** Scrive paragrafi in fondo (index null) o a partire da un indice del body. */
function srWriter_(body, index) {
  var i = index;
  var written = [];
  function para(text) {
    var p = i === null ? body.appendParagraph(text) : body.insertParagraph(i++, text);
    p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    written.push(p);
    return p;
  }
  return {
    written: written,
    para: para,
    image: function (cfg, path) {
      var blob = path ? srFetchImage_(cfg, path) : null;
      if (!blob) return para('[immagine non disponibile]');
      var p = para('');
      try {
        var img = p.appendInlineImage(blob);
        var w = img.getWidth(), h = img.getHeight();
        if (w > 0) { img.setWidth(SR_IMAGE_WIDTH); img.setHeight(Math.round(h * SR_IMAGE_WIDTH / w)); }
      } catch (e) { p.setText('[immagine non disponibile]'); }
      return p;
    },
  };
}

function srImagePath_(issue, id) {
  if (id === 'shot') return issue.screenshot_path;
  var a = (issue.attachments || []).filter(function (x) { return x.id === id; })[0];
  return a ? a.path : null;
}

function srSetMeta_(p, issue, profiles) {
  var text = formatMeta(issue, profiles, SR_TZ);
  p.setText(text);
  var start = text.indexOf(issue.page_url, text.indexOf('Apri nel sito: '));
  if (start >= 0) p.editAsText().setLinkUrl(start, start + issue.page_url.length - 1, issue.page_url);
}

function srWriteReply_(cfg, w, doc, issue, reply, profiles) {
  var header = w.para('↳ ' + formatReplyHeader(reply, profiles, SR_TZ));
  header.editAsText().setBold(true);
  srSetNamed_(doc, 'sr-' + issue.id + '-r-' + reply.id, [header]);
  w.para(reply.body);
  (reply.attachments || []).filter(function (a) { return !a.deleted_at; }).sort(srByCreated)
    .forEach(function (a) { w.image(cfg, a.path); });
}

function srWriteIssue_(cfg, props, docs, project, issue, profiles) {
  if (!project) return;
  var doc = srDocFor_(cfg, props, docs, project);
  var body = doc.getBody();
  var key = 'blk:' + issue.id;
  var known = JSON.parse(props.getProperty(key) || 'null');
  if (known && !srNamed_(doc, 'sr-' + issue.id + '-end')) known = null; // blocco cancellato a mano: si riscrive
  var plan = planBlockUpdate(issue, known);
  var replies = (issue.replies || []).slice().sort(srByCreated);
  var byId = {};
  replies.forEach(function (r) { byId[r.id] = r; });

  if (plan.create) {
    var w = srWriter_(body, null);
    w.para(formatTitle(issue)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    var meta = w.para('');
    srSetMeta_(meta, issue, profiles);
    srSetNamed_(doc, 'sr-' + issue.id + '-meta', [meta]);
    w.para(issue.body);
    plan.newImageIds.forEach(function (id) { w.image(cfg, srImagePath_(issue, id)); });
    plan.newReplyIds.forEach(function (rid) { srWriteReply_(cfg, w, doc, issue, byId[rid], profiles); });
    var end = w.para('');
    end.appendHorizontalRule();
    srSetNamed_(doc, 'sr-' + issue.id + '-end', [end]);
    srSetNamed_(doc, 'sr-' + issue.id, w.written);
  } else {
    var metaEl = srNamedEl_(doc, 'sr-' + issue.id + '-meta');
    if (metaEl) srSetMeta_(metaEl.asParagraph(), issue, profiles);
    plan.deletedReplyIds.forEach(function (rid) {
      var h = srNamedEl_(doc, 'sr-' + issue.id + '-r-' + rid);
      if (h && byId[rid]) h.asParagraph().setText('↳ ' + formatReplyHeader(byId[rid], profiles, SR_TZ));
    });
    if (plan.newImageIds.length || plan.newReplyIds.length) {
      var endEl = srNamedEl_(doc, 'sr-' + issue.id + '-end');
      var first = srNamedEl_(doc, 'sr-' + issue.id);
      var w2 = srWriter_(body, body.getChildIndex(endEl));
      plan.newImageIds.forEach(function (id) { w2.image(cfg, srImagePath_(issue, id)); });
      plan.newReplyIds.forEach(function (rid) { srWriteReply_(cfg, w2, doc, issue, byId[rid], profiles); });
      var from = body.getChildIndex(first), to = body.getChildIndex(endEl), all = [];
      for (var k = from; k <= to; k++) all.push(body.getChild(k));
      srSetNamed_(doc, 'sr-' + issue.id, all);
    }
  }
  props.setProperty(key, JSON.stringify(nextKnown(issue)));
}
