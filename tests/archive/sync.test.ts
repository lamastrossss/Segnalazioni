import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// ---- Fogli Google simulato (solo ciò che usa sync.js, con i ritorni reali di Apps Script) ----
type Cell = string | number;
class Sheet {
  rows: Cell[][] = [];
  rich = new Map<string, { text: string; links: { start: number; end: number; url: string }[] }>();
  name = 'Foglio1'; frozen = 0; hidden: number[] = []; heights = new Map<number, number>();
  maxRows = 1000; validation = new Map<string, any>(); notes = new Map<string, string>();
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_after: number, n: number) { this.maxRows += n; return this; }
  setName(n: string) { this.name = n; return this; }
  getLastRow() { return this.rows.length; }
  setFrozenRows(n: number) { this.frozen = n; }
  hideColumns(c: number) { this.hidden.push(c); }
  setColumnWidth() { return this; }
  setRowHeight(r: number, h: number) { this.heights.set(r, h); return this; }
  deleteRow(r: number) { this.rows.splice(r - 1, 1); return this; }
  deleteColumn(c: number) { this.rows.forEach(row => row.splice(c - 1, 1)); this.hidden = this.hidden.map(h => (h > c ? h - 1 : h)); return this; }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    const sheet = this;
    if (r + nr - 1 > this.maxRows) throw new Error('Le coordinate dell\'intervallo non rientrano nelle dimensioni del foglio.');
    return {
      getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc, getSheet: () => sheet,
      getValue: () => sheet.rows[r - 1]?.[c - 1] ?? '',
      setDataValidation: (rule: any) => { for (let i = 0; i < nr; i++) sheet.validation.set(`${r + i},${c}`, rule); return undefined; },
      setNote: (t: string) => { if (t) sheet.notes.set(`${r},${c}`, t); else sheet.notes.delete(`${r},${c}`); return undefined; },
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      setValues: (v: Cell[][]) => {
        if (v.length !== nr || v.some(row => row.length !== nc)) throw new Error('dimensioni non corrispondenti');
        v.forEach((row, i) => { const target = (sheet.rows[r - 1 + i] ??= []); row.forEach((x, j) => { target[c - 1 + j] = x; }); });
        for (let k = 0; k < sheet.rows.length; k++) sheet.rows[k] ??= [];
        return undefined; // come Apps Script: niente catene
      },
      setRichTextValue: (rt: any) => { sheet.rich.set(`${r},${c}`, rt); return undefined; },
      setFontWeight: () => undefined,
    };
  }
}
class Spreadsheet {
  sheets = [new Sheet()];
  constructor(public id: string, public name: string) {}
  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getName() { return this.name; }
  rename(n: string) { this.name = n; }
  getSheets() { return this.sheets; }
}

interface Row { [k: string]: any }
function makeEnv(db: { issues: Row[]; projects: Row[]; profiles: Row[] }, opts: { failIssues?: boolean; failSign?: boolean; locked?: boolean; failPatch?: boolean } = {}) {
  const triggers: { fn: string; source: string }[] = [];
  const trashed: string[] = [];
  const props = new Map<string, string>([['SUPABASE_URL', 'https://sb.test'], ['SERVICE_ROLE_KEY', 'service'], ['FOLDER_ID', 'folder']]);
  const sheets = new Map<string, Spreadsheet>();
  const events: string[] = [];
  const log: { method: string; path: string; body?: any }[] = [];
  let n = 0;
  const json = (v: unknown, code = 200) => ({ getResponseCode: () => code, getContentText: () => (v === null ? '' : JSON.stringify(v)) });
  const fetch = (url: string, o: { method?: string; payload?: string } = {}) => {
    const u = new URL(url);
    const method = o.method ?? 'get';
    const body = o.payload ? JSON.parse(o.payload) : undefined;
    log.push({ method, path: u.pathname, body });
    if (u.pathname === '/storage/v1/object/sign/media') {
      if (opts.failSign) return json({ message: 'no' }, 500);
      return json(body.paths.map((p: string) => ({ path: p, signedURL: `/object/sign/media/${p}?token=t`, error: null })));
    }
    if (u.pathname === '/rest/v1/profiles') return json(db.profiles);
    if (u.pathname === '/rest/v1/projects' && method === 'get') return json(db.projects);
    if (u.pathname === '/rest/v1/projects' && method === 'patch') {
      const id = u.searchParams.get('id')!.replace('eq.', '');
      Object.assign(db.projects.find(p => p.id === id)!, body); return json(null);
    }
    if (u.pathname === '/rest/v1/archive_status') { (db as any).status = { ...((db as any).status ?? {}), ...body }; return json(null); }
    if (u.pathname === '/rest/v1/issues' && method === 'patch') {
      if (opts.failPatch) return json({ message: 'rete' }, 503);
      const id = u.searchParams.get('id')!.replace('eq.', '');
      Object.assign(db.issues.find(i => i.id === id) ?? {}, body); return json(null);
    }
    if (u.pathname === '/rest/v1/issues') {
      if (opts.failIssues) return json({ message: 'boom' }, 500);
      const lt = u.searchParams.get('updated_at');
      const m = /updated_at\.gt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.gt\.([^)]+)\)/.exec(u.searchParams.get('or')!)!;
      const [t, id] = [m[1], m[3]];
      return json(db.issues
        .filter(i => i.updated_at > t || (i.updated_at === t && i.id > id))
        .filter(i => !lt || new Date(i.updated_at) < new Date(lt.replace('lt.', '')))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
        .slice(0, Number(u.searchParams.get('limit'))));
    }
    throw new Error('rotta non simulata ' + url);
  };
  const ctx: Record<string, unknown> = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => { if (k === 'SHEET_WATERMARK_V2') events.push('wm'); props.set(k, v); },
      getProperties: () => Object.fromEntries(props),
      getKeys: () => [...props.keys()],
      deleteProperty: (k: string) => { props.delete(k); },
    }) },
    UrlFetchApp: { fetch },
    SpreadsheetApp: {
      create: (name: string) => { const s = new Spreadsheet(`sheet${++n}`, name); sheets.set(s.id, s); return s; },
      openById: (id: string) => { const s = sheets.get(id); if (!s) throw new Error('no sheet'); return s; },
      flush: () => { events.push('flush'); },
      newDataValidation: () => {
        const rule: any = {};
        const b = { requireValueInList: (l: string[], show: boolean) => { rule.list = l; rule.show = show; return b; }, setAllowInvalid: (x: boolean) => { rule.allowInvalid = x; return b; }, build: () => rule };
        return b;
      },
      newRichTextValue: () => {
        const rt: any = { text: '', links: [] };
        const b = { setText: (t: string) => { rt.text = t; return b; }, setLinkUrl: (s: number, e: number, url: string) => { rt.links.push({ start: s, end: e, url }); return b; }, build: () => rt };
        return b;
      },
    },
    DriveApp: { getFileById: (id: string) => ({ moveTo: () => {}, setTrashed: (t: boolean) => { if (t) trashed.push(id); } }), getFolderById: () => ({}) },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(t => ({ getHandlerFunction: () => t.fn, getTriggerSourceId: () => t.source, _t: t })),
      deleteTrigger: (x: any) => { triggers.splice(triggers.indexOf(x._t), 1); },
      newTrigger: (fn: string) => ({ forSpreadsheet: (ss: Spreadsheet) => ({ onEdit: () => ({ create: () => { triggers.push({ fn, source: ss.getId() }); } }) }) }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.locked, releaseLock: () => {} }) },
    Intl, Date, JSON, Math, Object, String, encodeURIComponent, Error, Array,
  };
  vm.createContext(ctx);
  const root = join(__dirname, '..', '..', 'archive');
  vm.runInContext(readFileSync(join(root, 'format.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'sync.js'), 'utf8'), ctx);
  const edit = (ss: Spreadsheet, row: number, col: number, nr = 1, nc = 1) =>
    (ctx.onStatoEdit as (e: unknown) => void)({ range: ss.getSheets()[0].getRange(row, col, nr, nc) });
  return { run: () => (ctx.syncArchive as () => void)(), reset: () => (ctx.ripartiDaZero as () => void)(), sheets, props, log, db, events, triggers, edit, trashed };
}

const profiles = [{ id: 'u1', name: 'Alessandra' }, { id: 'u2', name: 'Marco' }];
const issue = (over: Row = {}): Row => ({
  id: 'i1', project_id: 'p1', number: 1, page_path: '/p', page_url: 'https://x/p', viewport_class: 'mobile', viewport_width: 375,
  body: 'Titolo troppo vicino', status: 'open', author_id: 'u1', screenshot_path: 'p1/i1/screenshot.jpg',
  created_at: '2026-11-04T09:00:00.000001+00:00', updated_at: '2026-11-04T09:00:00.000001+00:00',
  deleted_at: null, deleted_by: null, attachments: [], replies: [], ...over,
});
const sheetOf = (env: ReturnType<typeof makeEnv>) => [...env.sheets.values()][0].getSheets()[0];
const ids = (s: Sheet) => s.rows.slice(1).map(r => r[12]);

describe('archivio su Fogli Google', () => {
  it('crea il foglio del sito con intestazione e una riga per segnalazione', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2, body: 'Seconda', screenshot_path: null })] });
    env.run();
    const ss = [...env.sheets.values()][0];
    expect(ss.getName()).toBe('Stage Review — Rica');
    expect(env.db.projects[0].archive_doc_url).toBe(ss.getUrl());
    const s = ss.getSheets()[0];
    expect(s.name).toBe('Segnalazioni');
    expect(s.rows[0][0]).toBe('#');
    expect(s.frozen).toBe(1);
    expect(s.hidden).toContain(13);
    expect(ids(s)).toEqual(['i1', 'i2']);
    expect(s.rows[1][9]).toBe('=IMAGE("https://sb.test/storage/v1/object/sign/media/p1/i1/screenshot.jpg?token=t")');
    expect(s.heights.get(2)).toBe(90);
    expect((env.db as any).status.last_error).toBeNull();
  });

  it('link firmati validi 10 anni, tutti in una chiamata per segnalazione', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles,
      issues: [issue({ attachments: [{ id: 'a1', path: 'p1/i1/a1.jpg', reply_id: null, created_at: '1', deleted_at: null }] })] });
    env.run();
    const signs = env.log.filter(l => l.path === '/storage/v1/object/sign/media');
    expect(signs).toHaveLength(1);
    expect(signs[0].body).toEqual({ expiresIn: 315360000, paths: ['p1/i1/screenshot.jpg', 'p1/i1/a1.jpg'] });
    const rt = sheetOf(env).rich.get('2,11')!;
    expect(rt.text).toBe('Immagine 1');
    expect(sheetOf(env).rich.get('2,9')).toEqual({ text: 'Apri', links: [{ start: 0, end: 4, url: 'https://sb.test/storage/v1/object/sign/media/p1/i1/screenshot.jpg?token=t' }] });
    expect(sheetOf(env).rich.get('2,12')!.links[0].url).toBe('https://x/p#stage-review=i1');
    // RichTextValueBuilder.setLinkUrl: fine esclusiva ('Immagine 1' = 10 caratteri)
    expect(rt.links).toEqual([{ start: 0, end: 10, url: 'https://sb.test/storage/v1/object/sign/media/p1/i1/a1.jpg?token=t' }]);
  });

  it('aggiorna la riga al suo posto senza doppioni', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00',
      replies: [{ id: 'r1', author_id: 'u2', body: 'Fatto', created_at: '2026-11-04T09:30:00Z', deleted_at: null }] });
    env.run();
    const s = sheetOf(env);
    expect(ids(s)).toEqual(['i1', 'i2']);
    expect(s.rows[1][1]).toBe('Risolta');
    expect(s.rows[1][7]).toBe('Marco · 04/11/2026 10:30: Fatto');
  });

  it('una segnalazione eliminata sparisce dal foglio', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    Object.assign(env.db.issues[0], { deleted_at: '2026-11-04T10:00:00+00:00', deleted_by: 'u1', updated_at: '2026-11-04T12:00:00+00:00' });
    env.run();
    expect(ids(sheetOf(env))).toEqual(['i2']);
  });

  it('una segnalazione già eliminata al primo giro non viene scritta', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue({ deleted_at: 'x' })] });
    env.run();
    expect(env.sheets.size).toBe(0);
  });

  it('un file per sito, rinominato quando cambia il nome del sito', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }, { id: 'p2', name: 'Altro' }], profiles,
      issues: [issue(), issue({ id: 'i9', project_id: 'p2', updated_at: '2026-11-04T09:10:00+00:00' })] });
    env.run();
    expect([...env.sheets.values()].map(s => s.getName()).sort()).toEqual(['Stage Review — Altro', 'Stage Review — Rica']);
    env.db.projects[0].name = 'Rica Haircare';
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00' });
    env.run();
    expect(env.sheets.size).toBe(2);
    expect([...env.sheets.values()].map(s => s.getName())).toContain('Stage Review — Rica Haircare');
  });

  it('salva il foglio prima di far avanzare il segnaposto', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    const wm = env.events.map((e, i) => [e, i] as const).filter(([e]) => e === 'wm');
    expect(wm).toHaveLength(2);
    for (const [, i] of wm) expect(env.events[i - 1]).toBe('flush');
  });

  it('se la firma dei link fallisce la riga viene scritta lo stesso, senza immagini', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { failSign: true });
    env.run();
    const s = sheetOf(env);
    expect(ids(s)).toEqual(['i1']);
    expect(s.rows[1][8]).toBe('');
    expect(s.rich.has('2,9')).toBe(false);
  });

  it('il testo degli utenti non diventa una formula', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue({ body: '=IMPORTXML("http://x","//a")' })] });
    env.run();
    expect(sheetOf(env).rows[1][4]).toBe('\'=IMPORTXML("http://x","//a")');
  });

  it('se un altro giro è in corso non fa niente', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { locked: true });
    env.run();
    expect(env.sheets.size).toBe(0);
  });

  it('ignora le modifiche degli ultimi 30 secondi e le prende al giro dopo', () => {
    const fresh = new Date().toISOString();
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue({ updated_at: fresh, created_at: fresh })] });
    env.run();
    expect(env.sheets.size).toBe(0);
    env.db.issues[0].updated_at = '2026-11-04T09:00:00+00:00';
    env.run();
    expect(env.sheets.size).toBe(1);
  });

  it('errore di Supabase: stato con errore, segnaposto fermo, eccezione per l\'email di Google', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { failIssues: true });
    expect(() => env.run()).toThrow(/boom/);
    expect((env.db as any).status.last_error).toMatch(/500/);
    expect(env.props.get('SHEET_WATERMARK_V2')).toBeUndefined();
  });

  it('i fogli scritti dalla versione con le formule vengono riscritti per intero', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] });
    env.props.set('SHEET_WATERMARK', '2026-11-04T09:00:00.000001+00:00|i1'); // vecchio segnaposto: ignorato
    env.run();
    expect(ids(sheetOf(env))).toEqual(['i1']);
    expect(sheetOf(env).rows[1][8]).toBe('Apri');
  });

  it('nei fogli già creati la colonna +1 viene tolta e i dati restano allineati', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] });
    env.run();
    const s = sheetOf(env);
    // simula un foglio creato dalla versione precedente, con la colonna +1 in ottava posizione
    s.rows.forEach((r, i) => r.splice(7, 0, i === 0 ? '+1' : 2));
    s.hidden = [14];
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00' });
    env.run();
    expect(s.rows[0]).not.toContain('+1');
    expect(s.rows[0][7]).toBe('Risposte');
    expect(ids(s)).toEqual(['i1']);
    expect(s.rows[1][1]).toBe('Risolta');
    expect(s.hidden).toEqual([13]);
  });

  it('colonna Stato con menu a tendina e un solo ascoltatore delle modifiche per foglio', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    const ss = [...env.sheets.values()][0];
    const s = ss.getSheets()[0];
    expect(s.validation.get('2,2')).toEqual({ list: ['Aperta', 'In lavorazione', 'Risolta'], show: true, allowInvalid: false });
    expect(s.validation.get('3,2')).toBeDefined();
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00' });
    env.run();
    expect(env.triggers).toEqual([{ fn: 'onStatoEdit', source: ss.getId() }]);
  });

  it('cambiare lo stato nel foglio lo salva in Stage Review', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    const ss = [...env.sheets.values()][0];
    const s = ss.getSheets()[0];
    s.rows[2][1] = 'Risolta';
    env.edit(ss, 3, 2);
    const patches = env.log.filter(l => l.method === 'patch' && l.path === '/rest/v1/issues');
    expect(patches).toEqual([{ method: 'patch', path: '/rest/v1/issues', body: { status: 'resolved' } }]);
    expect(env.db.issues[1].status).toBe('resolved');
  });

  it('incollare lo stato su più righe le salva tutte; le altre colonne e i valori non validi si ignorano', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    const ss = [...env.sheets.values()][0];
    const s = ss.getSheets()[0];
    s.rows[1][1] = 'In lavorazione'; s.rows[2][1] = 'Risolta';
    env.edit(ss, 2, 1, 2, 3); // incolla su colonne 1-3, che includono Stato
    expect(env.db.issues.map(i => i.status)).toEqual(['in_progress', 'resolved']);
    const before = env.log.length;
    s.rows[1][4] = 'testo cambiato'; env.edit(ss, 2, 5);   // colonna Segnalazione
    s.rows[1][1] = 'Boh'; env.edit(ss, 2, 2);              // valore non valido
    env.edit(ss, 1, 2);                                    // intestazione
    expect(env.log.length).toBe(before);
  });

  it('se il salvataggio fallisce lo segnala con una nota sulla cella', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { failPatch: true });
    env.run();
    const ss = [...env.sheets.values()][0];
    ss.getSheets()[0].rows[1][1] = 'Risolta';
    env.edit(ss, 2, 2);
    expect(ss.getSheets()[0].notes.get('2,2')).toMatch(/^Stato non salvato in Stage Review/);
  });

  it('oltre le righe disponibili il foglio si allunga da solo', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] });
    env.run();
    const s = sheetOf(env);
    s.maxRows = 2; // foglio pieno
    env.db.issues.push(issue({ id: 'i3', number: 3, updated_at: '2026-11-04T12:00:00+00:00' }));
    env.run();
    expect(ids(s)).toEqual(['i1', 'i3']);
  });

  it('i fogli già esistenti ricevono menu e ascoltatore anche senza novità', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] });
    env.run();
    const ss = [...env.sheets.values()][0];
    env.triggers.length = 0;                       // foglio creato dalla versione precedente
    ss.getSheets()[0].validation.clear();
    env.run();                                     // nessuna segnalazione nuova o modificata
    expect(env.triggers).toEqual([{ fn: 'onStatoEdit', source: ss.getId() }]);
    expect(ss.getSheets()[0].validation.get('2,2')).toBeDefined();
  });

  it('ripartiDaZero: fogli e vecchi Doc nel Cestino, stato azzerato, impostazioni e timer intatti', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] });
    env.run();
    const ss = [...env.sheets.values()][0];
    env.props.set('doc:p1', 'vecchioDoc'); env.props.set('blk:i1', '{}'); env.props.set('WATERMARK', 'x'); env.props.set('SHEET_WATERMARK', 'x');
    env.triggers.push({ fn: 'syncArchive', source: 'script' });
    env.reset();
    expect(env.trashed.sort()).toEqual([ss.getId(), 'vecchioDoc'].sort());
    expect([...env.props.keys()].sort()).toEqual(['FOLDER_ID', 'SERVICE_ROLE_KEY', 'SUPABASE_URL']);
    expect(env.triggers).toEqual([{ fn: 'syncArchive', source: 'script' }]);
    env.db.issues.length = 0;
    env.db.issues.push(issue({ id: 'n1', number: 1, body: 'prima vera' }));
    env.run();
    expect(env.sheets.size).toBe(2);
    const fresh = [...env.sheets.values()][1].getSheets()[0];
    expect(fresh.rows.slice(1).map(r => r[12])).toEqual(['n1']);
  });

  it('un sito eliminato: il suo foglio va nel Cestino e le sue segnalazioni non vengono più scritte', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }, { id: 'p2', name: 'Altro' }], profiles,
      issues: [issue(), issue({ id: 'i9', project_id: 'p2', updated_at: '2026-11-04T09:10:00+00:00' })] });
    env.run();
    const rica = [...env.sheets.values()].find(x => x.getName() === 'Stage Review — Rica')!;
    env.db.projects[0].deleted_at = '2026-11-05T10:00:00+00:00';
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00' });
    env.run();
    expect(env.trashed).toEqual([rica.getId()]);
    expect(env.props.has('sheet:p1')).toBe(false);
    expect(env.triggers.map(t => t.source)).not.toContain(rica.getId());
    expect(rica.getSheets()[0].rows[1][1]).toBe('Aperta'); // non riscritto
  });
});
