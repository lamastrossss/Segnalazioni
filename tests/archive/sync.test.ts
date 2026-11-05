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
  setName(n: string) { this.name = n; return this; }
  getLastRow() { return this.rows.length; }
  setFrozenRows(n: number) { this.frozen = n; }
  hideColumns(c: number) { this.hidden.push(c); }
  setColumnWidth() { return this; }
  setRowHeight(r: number, h: number) { this.heights.set(r, h); return this; }
  deleteRow(r: number) { this.rows.splice(r - 1, 1); return this; }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    const sheet = this;
    return {
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
function makeEnv(db: { issues: Row[]; projects: Row[]; profiles: Row[] }, opts: { failIssues?: boolean; failSign?: boolean; locked?: boolean } = {}) {
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
      setProperty: (k: string, v: string) => { if (k === 'SHEET_WATERMARK') events.push('wm'); props.set(k, v); },
      getProperties: () => Object.fromEntries(props),
    }) },
    UrlFetchApp: { fetch },
    SpreadsheetApp: {
      create: (name: string) => { const s = new Spreadsheet(`sheet${++n}`, name); sheets.set(s.id, s); return s; },
      openById: (id: string) => { const s = sheets.get(id); if (!s) throw new Error('no sheet'); return s; },
      flush: () => { events.push('flush'); },
      newRichTextValue: () => {
        const rt: any = { text: '', links: [] };
        const b = { setText: (t: string) => { rt.text = t; return b; }, setLinkUrl: (s: number, e: number, url: string) => { rt.links.push({ start: s, end: e, url }); return b; }, build: () => rt };
        return b;
      },
    },
    DriveApp: { getFileById: () => ({ moveTo: () => {} }), getFolderById: () => ({}) },
    ScriptApp: {},
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.locked, releaseLock: () => {} }) },
    Intl, Date, JSON, Math, Object, String, encodeURIComponent, Error, Array,
  };
  vm.createContext(ctx);
  const root = join(__dirname, '..', '..', 'archive');
  vm.runInContext(readFileSync(join(root, 'format.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'sync.js'), 'utf8'), ctx);
  return { run: () => (ctx.syncArchive as () => void)(), sheets, props, log, db, events };
}

const profiles = [{ id: 'u1', name: 'Alessandra' }, { id: 'u2', name: 'Marco' }];
const issue = (over: Row = {}): Row => ({
  id: 'i1', project_id: 'p1', number: 1, page_path: '/p', page_url: 'https://x/p', viewport_class: 'mobile', viewport_width: 375,
  body: 'Titolo troppo vicino', status: 'open', author_id: 'u1', screenshot_path: 'p1/i1/screenshot.jpg',
  created_at: '2026-11-04T09:00:00.000001+00:00', updated_at: '2026-11-04T09:00:00.000001+00:00',
  deleted_at: null, deleted_by: null, plus_ones: [], attachments: [], replies: [], ...over,
});
const sheetOf = (env: ReturnType<typeof makeEnv>) => [...env.sheets.values()][0].getSheets()[0];
const ids = (s: Sheet) => s.rows.slice(1).map(r => r[13]);

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
    expect(s.hidden).toContain(14);
    expect(ids(s)).toEqual(['i1', 'i2']);
    expect(s.rows[1][10]).toBe('=IMAGE("https://sb.test/storage/v1/object/sign/media/p1/i1/screenshot.jpg?token=t")');
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
    const rt = sheetOf(env).rich.get('2,12')!;
    expect(rt.text).toBe('Immagine 1');
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
    expect(s.rows[1][8]).toBe('Marco · 04/11/2026 10:30: Fatto');
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
    expect(s.rows[1][9]).toBe('');
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
    expect(env.props.get('SHEET_WATERMARK')).toBeUndefined();
  });
});
