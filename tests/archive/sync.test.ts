import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// ---- Google Apps Script simulato (solo ciò che usa sync.js) ----
class P {
  text: string; heading = 'NORMAL'; images: { w: number; h: number }[] = []; hr = false; link: string | null = null; bold = false;
  constructor(t: string) { this.text = t; }
  // Come in Apps Script: Paragraph.setText non restituisce niente (non si può concatenare)
  setText(t: string): void { this.text = t; }
  getText() { return this.text; }
  setHeading(h: string) { this.heading = h; return this; }
  appendInlineImage(blob: { bad?: boolean }) {
    if (blob.bad) throw new Error('Invalid image data');
    const img = { w: 1000, h: 500, getWidth() { return this.w; }, getHeight() { return this.h; }, setWidth(v: number) { this.w = v; }, setHeight(v: number) { this.h = v; } };
    this.images.push(img); return img;
  }
  appendHorizontalRule() { this.hr = true; }
  editAsText() { return { setBold: () => { this.bold = true; }, setLinkUrl: (_s: number, _e: number, u: string) => { this.link = u; } }; }
  asParagraph() { return this; }
}
let saveHook: (id: string) => void = () => {};
class Doc {
  children: P[] = [new P('')];
  named = new Map<string, P[][]>();
  constructor(public id: string, public name: string) {}
  getId() { return this.id; }
  getName() { return this.name; }
  setName(n: string) { this.name = n; return this; }
  getUrl() { return `https://docs.google.com/document/d/${this.id}/edit`; }
  saveAndClose() { saveHook(this.id); }
  getBody() {
    const c = this.children;
    return {
      getChild: (i: number) => c[i],
      getChildIndex: (e: P) => c.indexOf(e),
      appendParagraph: (t: string) => { const p = new P(t); c.push(p); return p; },
      insertParagraph: (i: number, t: string) => { const p = new P(t); c.splice(i, 0, p); return p; },
    };
  }
  getNamedRanges(name: string) {
    return (this.named.get(name) ?? []).map(els => ({
      getRange: () => ({ getRangeElements: () => els.map(e => ({ getElement: () => e })) }),
      remove: () => { this.named.set(name, (this.named.get(name) ?? []).filter(x => x !== els)); },
    }));
  }
  newRange() { const els: P[] = []; const b = { addElement: (e: P) => { els.push(e); return b; }, build: () => els }; return b; }
  addNamedRange(name: string, els: P[]) { this.named.set(name, [...(this.named.get(name) ?? []), els]); }
  texts() { return this.children.map(p => p.text); }
}

interface Row { [k: string]: any }
function makeEnv(db: { issues: Row[]; projects: Row[]; profiles: Row[] }, opts: { failIssues?: boolean; badImage?: string; locked?: boolean } = {}) {
  const events: string[] = [];
  const props = new Map<string, string>([['SUPABASE_URL', 'https://sb.test'], ['SERVICE_ROLE_KEY', 'service'], ['FOLDER_ID', 'folder']]);
  const docs = new Map<string, Doc>();
  const log: { method: string; path: string; body?: any }[] = [];
  let n = 0;
  const json = (v: unknown, code = 200) => ({ getResponseCode: () => code, getContentText: () => (v === null ? '' : JSON.stringify(v)), getBlob: () => ({}) });
  const fetch = (url: string, o: { method?: string; payload?: string } = {}) => {
    const u = new URL(url);
    const method = o.method ?? 'get';
    const body = o.payload ? JSON.parse(o.payload) : undefined;
    log.push({ method, path: u.pathname, body });
    if (u.pathname.startsWith('/storage/')) {
      return { getResponseCode: () => (opts.badImage && u.pathname.includes(opts.badImage) ? 404 : 200), getContentText: () => '', getBlob: () => ({}) };
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
      const rows = db.issues
        .filter(i => i.updated_at > t || (i.updated_at === t && i.id > id))
        .filter(i => !lt || new Date(i.updated_at) < new Date(lt.replace('lt.', '')))
        .sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id))
        .slice(0, Number(u.searchParams.get('limit')));
      return json(rows);
    }
    throw new Error('rotta non simulata ' + url);
  };
  const ctx: Record<string, unknown> = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k: string) => props.get(k) ?? null,
      setProperty: (k: string, v: string) => { if (k === 'WATERMARK') events.push('wm'); props.set(k, v); },
      getProperties: () => Object.fromEntries(props),
    }) },
    UrlFetchApp: { fetch },
    DocumentApp: {
      create: (name: string) => { const d = new Doc(`doc${++n}`, name); docs.set(d.id, d); return d; },
      openById: (id: string) => { const d = docs.get(id); if (!d) throw new Error('no doc'); return d; },
      ParagraphHeading: { TITLE: 'TITLE', HEADING2: 'HEADING2', NORMAL: 'NORMAL' },
    },
    DriveApp: { getFileById: () => ({ moveTo: () => {} }), getFolderById: () => ({}) },
    ScriptApp: {},
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.locked, releaseLock: () => { events.push('unlock'); } }) },
    Intl, Date, JSON, Math, Object, String, encodeURIComponent, Error, Array,
  };
  saveHook = id => events.push('save:' + id);
  vm.createContext(ctx);
  const root = join(__dirname, '..', '..', 'archive');
  vm.runInContext(readFileSync(join(root, 'format.js'), 'utf8'), ctx);
  vm.runInContext(readFileSync(join(root, 'sync.js'), 'utf8'), ctx);
  return { run: () => (ctx.syncArchive as () => void)(), docs, props, log, db, events };
}

const profiles = [{ id: 'u1', name: 'Alessandra' }, { id: 'u2', name: 'Marco' }];
const issue = (over: Row = {}): Row => ({
  id: 'i1', project_id: 'p1', number: 1, page_path: '/p', page_url: 'https://x/p', viewport_class: 'mobile', viewport_width: 375,
  body: 'Titolo troppo vicino', status: 'open', author_id: 'u1', screenshot_path: 'p1/i1/screenshot.jpg',
  created_at: '2026-11-04T09:00:00.000001+00:00', updated_at: '2026-11-04T09:00:00.000001+00:00',
  deleted_at: null, deleted_by: null, plus_ones: [], attachments: [], replies: [], ...over,
});
const reply = (id: string, over: Row = {}) => ({ id, issue_id: 'i1', author_id: 'u2', body: `risposta ${id}`, created_at: `2026-11-04T09:3${id.slice(-1)}:00+00:00`, deleted_at: null, attachments: [], ...over });

describe('sincronizzazione archivio', () => {
  it('crea il Doc del sito con il blocco completo e salva lo stato', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue({ replies: [reply('r1')] })] });
    env.run();
    const doc = [...env.docs.values()][0];
    expect(doc.name).toBe('Stage Review — Rica');
    expect(env.db.projects[0].archive_doc_url).toBe(doc.getUrl());
    const t = doc.texts();
    expect(t).toContain('#1 · /p · Mobile 375');
    expect(t.find(x => x.startsWith('Alessandra ·'))).toContain('Stato: Aperta');
    expect(t).toContain('Titolo troppo vicino');
    expect(t).toContain('↳ Marco · 04/11/2026 10:31');
    expect(doc.children.some(p => p.images.length === 1 && p.images[0].w === 480 && p.images[0].h === 240)).toBe(true);
    expect((env.db as any).status.last_error).toBeNull();
    expect((env.db as any).status.last_ok_at).toBeTruthy();
    expect(env.props.get('WATERMARK')).toBe('2026-11-04T09:00:00.000001+00:00|i1');
  });

  it('un secondo giro senza novità non crea doppioni', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] });
    env.run();
    const before = [...env.docs.values()][0].children.length;
    env.run();
    expect([...env.docs.values()][0].children.length).toBe(before);
    expect(env.docs.size).toBe(1);
  });

  it('aggiorna stato e aggiunge risposte nel blocco giusto, anche con altro testo intorno', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2, body: 'Seconda', screenshot_path: null })] });
    env.run();
    const doc = [...env.docs.values()][0];
    doc.getBody().appendParagraph('Nota scritta a mano');
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00', replies: [reply('r1')] });
    env.run();
    const t = doc.texts();
    expect(t.filter(x => x === '#1 · /p · Mobile 375')).toHaveLength(1);
    expect(t.find(x => x.startsWith('Alessandra ·') && x.includes('Stato: Risolta'))).toBeTruthy();
    const replyAt = t.indexOf('↳ Marco · 04/11/2026 10:31');
    expect(replyAt).toBeGreaterThan(t.indexOf('Titolo troppo vicino'));
    expect(replyAt).toBeLessThan(t.indexOf('#2 · /p · Mobile 375'));
    expect(t.at(-1)).toBe('Nota scritta a mano');
  });

  it('marca le segnalazioni e le risposte eliminate senza toglierle', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue({ replies: [reply('r1')] })] });
    env.run();
    Object.assign(env.db.issues[0], { deleted_at: '2026-11-04T10:00:00+00:00', deleted_by: 'u1', updated_at: '2026-11-04T12:00:00+00:00', replies: [reply('r1', { deleted_at: 'x' })] });
    env.run();
    const t = [...env.docs.values()][0].texts();
    expect(t.find(x => x.includes('Eliminata il 04/11/2026 11:00 da Alessandra'))).toBeTruthy();
    expect(t).toContain('↳ Marco · 04/11/2026 10:31 · eliminata');
    expect(t).toContain('Titolo troppo vicino');
  });

  it('un Doc per sito', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }, { id: 'p2', name: 'Altro' }], profiles,
      issues: [issue(), issue({ id: 'i9', project_id: 'p2', updated_at: '2026-11-04T09:10:00+00:00' })] });
    env.run();
    expect([...env.docs.values()].map(d => d.name).sort()).toEqual(['Stage Review — Altro', 'Stage Review — Rica']);
  });

  it('immagine non scaricabile → segnaposto, la segnalazione viene scritta', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { badImage: 'screenshot' });
    env.run();
    const t = [...env.docs.values()][0].texts();
    expect(t).toContain('[immagine non disponibile]');
    expect(t).toContain('Titolo troppo vicino');
  });

  it('errore di Supabase: stato con errore, segnaposto fermo, eccezione per l\'email di Google', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { failIssues: true });
    expect(() => env.run()).toThrow(/boom/);
    expect((env.db as any).status.last_error).toMatch(/500/);
    expect((env.db as any).status.last_ok_at).toBeUndefined();
    expect(env.props.get('WATERMARK')).toBeUndefined();
  });

  it('salva il Doc prima di far avanzare il segnaposto', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue(), issue({ id: 'i2', number: 2 })] });
    env.run();
    const wm = env.events.map((e, i) => [e, i] as const).filter(([e]) => e === 'wm');
    expect(wm).toHaveLength(2);
    for (const [, i] of wm) expect(env.events[i - 1]).toMatch(/^save:/);
  });

  it('se un altro giro è in corso non fa niente (niente doppioni)', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue()] }, { locked: true });
    env.run();
    expect(env.docs.size).toBe(0);
    expect(env.log.some(l => l.path === '/rest/v1/issues')).toBe(false);
  });

  it('ignora le modifiche degli ultimi 30 secondi (transazioni non ancora visibili) e le prende al giro dopo', () => {
    const fresh = new Date().toISOString();
    const env = makeEnv({ projects: [{ id: 'p1', name: 'Rica' }], profiles, issues: [issue({ updated_at: fresh, created_at: fresh })] });
    env.run();
    expect(env.docs.size).toBe(0);
    env.db.issues[0].updated_at = '2026-11-04T09:00:00+00:00';
    env.run();
    expect(env.docs.size).toBe(1);
  });

  it('se il sito viene rinominato, al giro dopo aggiorna nome e titolo del Doc', () => {
    const env = makeEnv({ projects: [{ id: 'p1', name: 'i1pw9r-dv.myshopify.com' }], profiles, issues: [issue()] });
    env.run();
    const doc = [...env.docs.values()][0];
    env.db.projects[0].name = 'Rica Haircare';
    Object.assign(env.db.issues[0], { status: 'resolved', updated_at: '2026-11-04T11:00:00+00:00' });
    env.run();
    expect(env.docs.size).toBe(1);
    expect(doc.name).toBe('Stage Review — Rica Haircare');
    expect(doc.texts()[0]).toBe('Stage Review — Rica Haircare');
  });
});
