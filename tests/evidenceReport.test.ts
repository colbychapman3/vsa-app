// Photo evidence reports (Phase 6b): content built from the engine state, never a cause, removed photos marked,
// buttons only for types that have photos. TEST data only; no camera, files or printing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidencePath, type Reject, type VsaEvent } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import * as E from '../src/app/entries.ts';
import { photoTypesPresent } from '../src/app/view.ts';
import { EVIDENCE_REPORTS, buildEvidenceReport, evidenceReportHtml, reportPhotos, type EvidenceReportKind } from '../src/app/evidenceReport.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-EVREP';
const VIN = '1M8GDM9AXKP042788';
const VIN2 = '1HGCM82633A004352';
const GEN = { isTest: true, generatedAt: '2026-09-30 10:00' };

async function setup(tc: { after: (fn: () => Promise<void>) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-evrep-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: OP, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(OP) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: OP, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(OP, evs);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  const add = async (o: Partial<E.EvidenceForm> = {}, noTime = false) => {
    const f: E.EvidenceForm = { type: 'poor-stowage', deck: 'D9', hatch: 'H3', reason: 'Pillar or blind spot', vins: [], notes: null, time: { day: 1, hm: '08:30' }, photo: evidencePath(OP, E.nextEventId(state)), ...o };
    const evs = E.addEvidenceEvents(ctx(), f);
    await ok(Array.isArray(evs) && noTime ? evs.map((e) => ({ ...e, occurred_at: null })) : evs); // the engine allows "time not provided"
  };
  return { ctx, ok, add, get state() { return state; } };
}
const text = (r: ReturnType<typeof buildEvidenceReport>) => [...r.meta, ...r.intro, ...r.groups.flatMap((g) => [g.title ?? '', ...g.entries.flatMap((e) => [e.heading, ...e.lines])]), ...r.removed].join('\n');

test('no photos of a type = no report offered', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(photoTypesPresent(s.state), []);
  await s.add({ type: 'poor-stowage' });
  assert.deepEqual(photoTypesPresent(s.state), ['poor-stowage']);
  assert.deepEqual(buildEvidenceReport('accident', s.state, glovis, GEN).groups, []); // nothing to report for the others
  // A type whose only photo was removed is no longer offered.
  await s.ok(E.removeEvidenceEvents(s.ctx(), s.state.evidence[0].id, 'Duplicate'));
  assert.deepEqual(photoTypesPresent(s.state), []);
});

test('one photo of each type builds all four reports, each with only its own type', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'pre-stow-damage', reason: 'Latch/lashing contact' });
  await s.add({ type: 'poor-stowage' });
  await s.add({ type: 'accident', vins: [VIN], reason: 'Driving too fast' });
  await s.add({ type: 'pre-stow' });
  assert.deepEqual(photoTypesPresent(s.state), ['pre-stow-damage', 'poor-stowage', 'accident', 'pre-stow']);
  const kinds = photoTypesPresent(s.state).map((t) => EVIDENCE_REPORTS[t].kind);
  assert.deepEqual(kinds, ['pre-stow-damage', 'poor-stowage', 'accident', 'stowage']);
  const titles = kinds.map((k) => buildEvidenceReport(k, s.state, glovis, GEN).title);
  assert.deepEqual(titles, ['Pre-stow damage report', 'Poor stowage report', 'Accident report', 'Stowage report']);
  for (const k of kinds) {
    const r = buildEvidenceReport(k, s.state, glovis, GEN);
    assert.equal(r.groups.flatMap((g) => g.entries).length, 1, k);
    assert.equal(reportPhotos(r).length, 1, k);
  }
  const dmg = text(buildEvidenceReport('pre-stow-damage', s.state, glovis, GEN));
  assert.match(dmg, /Pre-stow damage · D9 H3/);
  assert.match(dmg, /Latch\/lashing contact/);
  assert.doesNotMatch(dmg, /Poor stowage ·|Accident ·/);
});

test('accident report: VINs, time, deck, hatch, reason and the hourly count beside it; no cause is claimed', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 253, drivers: 70 }));
  await s.add({ type: 'accident', vins: [VIN, VIN2], reason: 'Slippery deck', notes: 'Rear bumper contact', time: { day: 1, hm: '08:30' } });
  await s.add({ type: 'accident', vins: [VIN2], reason: 'Driving too fast', time: { day: 1, hm: '12:10' } }); // the break: no logged hour
  await s.add({ type: 'accident', vins: [VIN], reason: 'Other', hatch: 'H4' }, true);
  const r = buildEvidenceReport('accident', s.state, glovis, GEN);
  const t = text(r);
  assert.match(t, /Time: 08:30/);
  assert.match(t, /Deck D9 · Hatch H3/);
  assert.match(t, /Reason \(as recorded\): Slippery deck/);
  assert.match(t, new RegExp(`VINs: ${VIN}, ${VIN2}`));
  assert.match(t, /Notes: Rear bumper contact/);
  assert.match(t, /Hourly count \(no cause claimed\): 253 autos in the hour starting 08:00/);
  assert.match(t, /Hourly count \(no cause claimed\): this time is not inside a logged hour/);
  assert.match(t, /Hourly count \(no cause claimed\): time not provided, so no hour can be shown/);
  assert.match(t, /does not state what caused anything/);
  assert.doesNotMatch(t, /caused by|because of|due to|fault|blame/i);
  // Sorted by time, the one without a time last under its own heading.
  assert.deepEqual(r.groups.map((g) => g.title), [null, 'Time not provided']);
  assert.deepEqual(r.groups[0].entries.map((e) => e.lines[0]), ['Time: 08:30', 'Time: 12:10']);
  assert.equal(r.groups[1].entries[0].lines[0], 'Time: time not provided');
  // The report does not add or change any count.
  assert.equal(s.state.field, 253);
});

test('poor-stowage and damage reports show VINs if entered and never ask for one; hourly count is accident-only', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'poor-stowage', vins: [VIN] });
  await s.add({ type: 'poor-stowage', time: { day: 1, hm: '07:45' } });
  const r = buildEvidenceReport('poor-stowage', s.state, glovis, GEN);
  const t = text(r);
  assert.match(t, /VIN: none entered/);
  assert.match(t, new RegExp(`VIN: ${VIN}`));
  assert.doesNotMatch(t, /Hourly count/);
  assert.deepEqual(r.groups[0].entries.map((e) => e.lines[0]), ['Time: 07:45', 'Time: 08:30']); // by time, not entry order
});

test('removed photos are listed as removed with the reason, never as current', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'accident', vins: [VIN] });
  await s.add({ type: 'accident', vins: [VIN2], time: { day: 1, hm: '09:10' } });
  await s.ok(E.removeEvidenceEvents(s.ctx(), s.state.evidence[0].id, 'Taken by mistake'));
  const r = buildEvidenceReport('accident', s.state, glovis, GEN);
  assert.equal(r.groups.flatMap((g) => g.entries).length, 1);
  assert.equal(reportPhotos(r).length, 1);
  assert.deepEqual(r.removed.length, 1);
  assert.match(r.removed[0], /^Removed: Accident · D9 H3 · 08:30 · 1M8GDM9AXKP042788 · reason for removal: Taken by mistake$/);
  assert.match(r.intro[0], /1 photo recorded, 1 removed/);
  assert.doesNotMatch(text({ ...r, removed: [] }), new RegExp(VIN)); // the removed photo's VIN is not in the current entries
  assert.ok(!reportPhotos(r).includes(s.state.evidence[0].photo));
  const html = evidenceReportHtml(r, (p) => `data:image/jpeg;base64,${p.length}`);
  assert.equal((html.match(/<img /g) ?? []).length, 1);
  assert.match(html, /<h2>Removed photos<\/h2>/);
});

test('edited entries are marked; earlier versions are not shown as current', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'accident', vins: [VIN], reason: 'Slippery deck' });
  await s.ok(E.editEvidenceEvents(s.ctx(), s.state.evidence[0].id, { type: 'accident', deck: 'D9', hatch: 'H3', reason: 'Driving too fast', vins: [VIN], time: { day: 1, hm: '08:30' } }, 'Typo'));
  const r = buildEvidenceReport('accident', s.state, glovis, GEN);
  const e = r.groups[0].entries[0];
  assert.equal(e.edited, true);
  assert.ok(e.lines.includes('Edited: earlier versions are kept in the log.'));
  assert.doesNotMatch(text(r), /Slippery deck/);
});

test('stowage report: plain pre-stow only, grouped by deck then hatch in the vessel order', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'pre-stow', deck: 'D9', hatch: 'H1' });
  await s.add({ type: 'pre-stow', deck: 'D5', hatch: 'H2' });
  await s.add({ type: 'pre-stow', deck: 'D9', hatch: 'H3' });
  await s.add({ type: 'pre-stow', deck: 'D9', hatch: 'H3', time: { day: 1, hm: '07:30' } });
  await s.add({ type: 'poor-stowage', deck: 'D9', hatch: 'H2' });
  const r = buildEvidenceReport('stowage', s.state, glovis, GEN);
  assert.deepEqual(r.groups.map((g) => g.title), ['Deck D9 · Hatch H3', 'Deck D9 · Hatch H1', 'Deck D5 · Hatch H2']);
  assert.deepEqual(r.groups[0].entries.map((e) => e.lines[0]), ['Time: 07:30', 'Time: 08:30']);
  assert.doesNotMatch(text(r), /Poor stowage/);
});

test('header: vessel, date, berth, TEST mark, phone generated time, INTERIM until complete', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'poor-stowage' });
  const r = buildEvidenceReport('poor-stowage', s.state, glovis, GEN);
  assert.match(r.meta[0], /Condor/i);
  assert.ok(r.meta.includes('TEST DATA'));
  assert.ok(r.meta.includes('Generated 2026-09-30 10:00 (phone time)'));
  assert.equal(r.interim, true);
  assert.equal(r.meta.at(-1), 'INTERIM: the vessel is not complete');
  assert.match(evidenceReportHtml(r, () => null), /<p class="meta interim">INTERIM: the vessel is not complete<\/p>/);
  assert.equal(buildEvidenceReport('poor-stowage', s.state, glovis, { isTest: false, generatedAt: 'x' }).meta[1], 'LIVE');
});

test('HTML escapes all text; a missing photo file is said so instead of a picture', async (tc) => {
  const s = await setup(tc);
  await s.add({ type: 'accident', vins: [VIN], reason: '<b>"Other"</b> & more', notes: '<script>alert(1)</script>' });
  const r = buildEvidenceReport('accident', s.state, glovis, GEN);
  const html = evidenceReportHtml(r, () => null);
  assert.doesNotMatch(html, /<script>|<b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;&quot;Other&quot;&lt;\/b&gt; &amp; more/);
  assert.match(html, /Photo file not available on this phone\./);
  assert.doesNotMatch(html, /<img /);
  assert.match(evidenceReportHtml(r, () => 'data:image/jpeg;base64,AAAA'), /<img src="data:image\/jpeg;base64,AAAA">/);
});

test('all four kinds exist as buttons only via the view model', () => {
  const kinds: EvidenceReportKind[] = Object.values(EVIDENCE_REPORTS).map((x) => x.kind);
  assert.deepEqual(kinds.sort(), ['accident', 'poor-stowage', 'pre-stow-damage', 'stowage']);
});
