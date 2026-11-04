import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const { formatTitle, formatMeta, formatReplyHeader, planBlockUpdate, nextKnown } = createRequire(import.meta.url)('../../archive/format.js');

const profiles = { u1: { id: 'u1', name: 'Alessandra' }, u2: { id: 'u2', name: 'Marco' } };
const iss = {
  id: 'i1', number: 42, page_path: '/p', page_url: 'https://x.myshopify.com/p', viewport_class: 'mobile', viewport_width: 375,
  author_id: 'u1', status: 'open', created_at: '2026-11-04T09:12:00Z', plus_ones: [], deleted_at: null, deleted_by: null,
  screenshot_path: 'p/i1/screenshot.jpg', attachments: [], replies: [],
};
const att = (id: string, reply_id: string | null = null, deleted_at: string | null = null) => ({ id, reply_id, deleted_at, created_at: id, path: `p/i1/${id}.jpg` });
const rep = (id: string, deleted_at: string | null = null) => ({ id, author_id: 'u2', body: 'r', created_at: '2026-11-04T09:30:00Z', deleted_at, attachments: [] });

describe('formato archivio', () => {
  it('titolo', () => {
    expect(formatTitle({ ...iss, page_path: '/products/opuntia-oil-mask' })).toBe('#42 · /products/opuntia-oil-mask · Mobile 375');
  });
  it('riga meta con fuso di Roma', () => {
    expect(formatMeta({ ...iss, status: 'in_progress', plus_ones: [{ user_id: 'u2' }, { user_id: 'u3' }] }, profiles, 'Europe/Rome'))
      .toBe('Alessandra · 04/11/2026 10:12 · Stato: In lavorazione · +1: 2 · Apri nel sito: https://x.myshopify.com/p');
  });
  it('riga meta di una segnalazione eliminata', () => {
    expect(formatMeta({ ...iss, deleted_at: '2026-11-04T10:00:00Z', deleted_by: 'u2' }, profiles, 'Europe/Rome'))
      .toContain(' · Eliminata il 04/11/2026 11:00 da Marco');
  });
  it('intestazione risposta', () => {
    expect(formatReplyHeader(rep('r1'), profiles, 'Europe/Rome')).toBe('Marco · 04/11/2026 10:30');
    expect(formatReplyHeader(rep('r1', 'x'), profiles, 'Europe/Rome')).toBe('Marco · 04/11/2026 10:30 · eliminata');
  });
  it('il testo con markup non viene interpretato (Review Focus 4)', () => {
    expect(formatTitle({ ...iss, page_path: '/<b>x</b>' })).toContain('<b>x</b>');
  });
  it('blocco nuovo: screenshot, allegati e risposte', () => {
    const issue = { ...iss, attachments: [att('a1'), att('a2'), att('ar', 'r1'), att('del', null, 'x')], replies: [rep('r1')] };
    expect(planBlockUpdate(issue, null)).toEqual({ create: true, newImageIds: ['shot', 'a1', 'a2'], newReplyIds: ['r1'], deletedReplyIds: [] });
  });
  it('blocco esistente: solo le novità', () => {
    const issue = { ...iss, attachments: [att('a1'), att('a2')], replies: [rep('r1', 'x'), rep('r2')] };
    const known = { imgs: ['shot', 'a1', 'a2'], replies: ['r1'] };
    expect(planBlockUpdate(issue, known)).toEqual({ create: false, newImageIds: [], newReplyIds: ['r2'], deletedReplyIds: ['r1'] });
  });
  it('una risposta già marcata eliminata non si rimarca', () => {
    const issue = { ...iss, attachments: [], replies: [rep('r1', 'x')] };
    expect(planBlockUpdate({ ...issue, screenshot_path: null }, { imgs: [], replies: ['r1'], deleted: ['r1'] }).deletedReplyIds).toEqual([]);
  });
  it('allegato arrivato dopo su una risposta già scritta viene aggiunto', () => {
    const issue = { ...iss, screenshot_path: null, attachments: [att('late', 'r1')], replies: [rep('r1')] };
    expect(planBlockUpdate(issue, { imgs: [], replies: ['r1'] }).newImageIds).toEqual(['late']);
  });
  it('nextKnown ricorda immagini, risposte ed eliminate', () => {
    const issue = { ...iss, attachments: [att('a1'), att('ar', 'r2')], replies: [rep('r1', 'x'), rep('r2')] };
    expect(nextKnown(issue)).toEqual({ imgs: ['shot', 'a1', 'ar'], replies: ['r1', 'r2'], deleted: ['r1'] });
  });
});
