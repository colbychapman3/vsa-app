// Plan notes: add / edit / remove through the real store, replayed by project(); history kept;
// vessel isolation; backup carries notes; reports list current notes only. TEST data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project, type Reject, type VsaEvent } from '../src/engine/index.ts';
import { openStore, type State } from '../src/storage/store.ts';
import { exportLog, importLog } from '../src/storage/backup.ts';
import * as E from '../src/app/entries.ts';
import { buildReport, notesSection } from '../src/app/report.ts';
import { planView } from '../src/app/view.ts';
import { openNodeDb } from './nodeDb.ts';
import { glovis } from './scenarios.ts';

const OP = 'TEST-NOTES';
const OP2 = 'TEST-NOTES-B';

async function setup(tc: { after: (fn: () => Promise<void>) => void }, op = OP) {
  const dir = mkdtempSync(join(tmpdir(), 'vsa-notes-'));
  const store = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store.createVessel({ operationId: op, baseline: glovis, isTest: true })).ok);
  let state = (await store.load(op) as { state: State }).state;
  const ctx = (): E.Ctx => ({ operationId: op, opDate: '2026-09-21', offset: '-04:00', recordedAt: '2026-09-21T20:00:00-04:00', state });
  const ok = async (evs: VsaEvent[] | Reject) => {
    assert.ok(Array.isArray(evs), JSON.stringify(evs));
    const r = await store.append(op, evs);
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) state = r.state;
  };
  return { store, ctx, ok, get state() { return state; } };
}

test('add a note: text kept, title optional, time labeled (processing time unless typed)', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: '  Two units have no keys.  ', title: ' Keys ' }));
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'Crew wants lashing gear at H2.', time: { day: 1, hm: '09:15' } }));
  const [a, b] = s.state.notes;
  assert.deepEqual([a.title, a.text, a.source, a.photo, a.edited, a.removed], ['Keys', 'Two units have no keys.', 'typed', null, false, false]);
  assert.match(a.createdAt, /^Logged at 20:00 UTC-04:00 \(processing time, not event time\)$/);
  assert.equal(b.createdAt, '09:15');
  assert.equal(b.title, null);
});

test('empty text is refused with a message; nothing saved', async (tc) => {
  const s = await setup(tc);
  assert.deepEqual(E.addNoteEvents(s.ctx(), { text: '   ' }), { ok: false, error: 'A note needs text.' });
  // The engine refuses it too, if an event gets past the form.
  const ev = (E.addNoteEvents(s.ctx(), { text: 'x' }) as VsaEvent[])[0];
  const bad = { ...ev, payload: { ...ev.payload, value: '  ' } };
  const r = await s.store.append(OP, [bad]);
  assert.ok(!r.ok && r.error === `Event ${ev.event_id}: a note needs text.`, JSON.stringify(r));
  assert.equal(s.state.notes.length, 0);
});

test('edit supersedes and keeps history; reason required; unchanged refused', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'Dock is 400 m long', title: 'Berth' }));
  const id = s.state.notes[0].id;
  assert.deepEqual(E.editNoteEvents(s.ctx(), id, { title: 'Berth', text: 'Dock is 400 m long' }, 'Typo'), { ok: false, error: 'Nothing to save: the note is unchanged.' });
  assert.deepEqual(E.editNoteEvents(s.ctx(), id, { title: 'Berth', text: 'Dock is 450 m long' }, null), { ok: false, error: 'Pick a reason for changing this note. The old text is kept.' });
  await s.ok(E.editNoteEvents(s.ctx(), id, { title: 'Berth', text: 'Dock is 450 m long' }, 'New information'));
  assert.equal(s.state.notes.length, 1); // replaced, not added
  const n = s.state.notes[0];
  assert.deepEqual([n.id, n.text, n.edited], [id, 'Dock is 450 m long', true]);
  assert.deepEqual(n.history.map((h) => [h.text, h.reason]), [['Dock is 400 m long', null], ['Dock is 450 m long', 'New information']]);
  // The original event is still in the log.
  assert.ok(s.state.log.events.some((e) => e.event_id === id && e.payload.value === 'Dock is 400 m long'));
  assert.equal(s.state.log.events.at(-1)!.supersedes_event_id, id);
});

test('a second edit supersedes the current head, and the whole chain stays', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'v1' }));
  const id = s.state.notes[0].id;
  await s.ok(E.editNoteEvents(s.ctx(), id, { text: 'v2' }, 'Typo'));
  await s.ok(E.editNoteEvents(s.ctx(), id, { text: 'v3' }, 'Typo'));
  assert.deepEqual(s.state.notes[0].history.map((h) => h.text), ['v1', 'v2', 'v3']);
  assert.equal(s.state.notes[0].text, 'v3');
});

test('remove leaves a history row and the log entry; reason required; a removed note cannot be edited', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'Duplicate of the load list note' }));
  const id = s.state.notes[0].id;
  assert.deepEqual(E.removeNoteEvents(s.ctx(), id, ' '), { ok: false, error: 'Pick a reason for removing this note. It stays in the log, marked removed.' });
  const before = s.state.log.events.length;
  await s.ok(E.removeNoteEvents(s.ctx(), id, 'Added by mistake'));
  assert.equal(s.state.log.events.length, before + 1); // appended, nothing deleted
  const n = s.state.notes[0];
  assert.deepEqual([n.removed, n.removedReason, n.text, n.history.length], [true, 'Added by mistake', 'Duplicate of the load list note', 1]);
  assert.match(n.removedAt!, /^Logged at 20:00/);
  assert.deepEqual(E.editNoteEvents(s.ctx(), id, { text: 'again' }, 'Typo'), { ok: false, error: 'That note was removed. Add a new note instead.' });
  assert.deepEqual(E.removeNoteEvents(s.ctx(), id, 'Typo'), { ok: false, error: 'That note was removed. Add a new note instead.' });
  assert.deepEqual(E.editNoteEvents(s.ctx(), 'nope', { text: 'x' }, 'Typo'), { ok: false, error: 'That note is not on this vessel.' });
});

test('the engine refuses a correction of a removed note and a note that replaces something else', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'a' }));
  const id = s.state.notes[0].id;
  await s.ok(E.removeNoteEvents(s.ctx(), id, 'Typo'));
  const head = s.state.notes[0].headId;
  const edit = (E.editNoteEvents({ ...s.ctx(), state: { ...s.state, notes: [{ ...s.state.notes[0], removed: false }] } as State }, id, { text: 'b' }, 'Typo') as VsaEvent[])[0];
  assert.equal(edit.supersedes_event_id, head);
  const r = await s.store.append(OP, [edit]);
  assert.ok(!r.ok && r.error === `Event ${edit.event_id}: that note was removed. Add a new note instead.`, JSON.stringify(r));
  // note.added may not replace anything.
  const add = (E.addNoteEvents(s.ctx(), { text: 'c' }) as VsaEvent[])[0];
  const r2 = await s.store.append(OP, [{ ...add, supersedes_event_id: id }]);
  assert.equal(r2.ok, false);
  // A plain correction cannot stand in for a note edit.
  const r3 = await s.store.append(OP, [{ ...add, event_type: 'correction', supersedes_event_id: head, payload: { ...add.payload, reason: 'x' } }]);
  assert.equal(r3.ok, false);
});

test('a note never changes counts, ledgers or the forecast', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.hourEvents(s.ctx(), { day: 1, start: '08:00', count: 253, drivers: 70 }));
  const snap = () => { const x = s.state; return JSON.stringify([x.field, x.fieldBalance, x.vesselRemaining, x.progress, x.variance, x.production, x.eta, x.periods]); };
  const before = snap();
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'Field ahead by 9999, ETA 02:00' }));
  assert.equal(snap(), before);
});

test('vessel isolation: a note appears only on its own vessel', async (tc) => {
  const a = await setup(tc, OP);
  await a.ok(E.addNoteEvents(a.ctx(), { text: 'Only on A' }));
  const dir = mkdtempSync(join(tmpdir(), 'vsa-notes2-'));
  const store2 = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store2.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.ok((await store2.createVessel({ operationId: OP2, baseline: glovis, isTest: true })).ok);
  const b = await store2.load(OP2) as { state: State };
  assert.equal(b.state.notes.length, 0);
  // A note event from vessel A is refused on vessel B.
  const evA = a.state.log.events.filter((e) => e.payload.metric === 'plan_note');
  const r = await store2.append(OP2, evA);
  assert.equal(r.ok, false);
});

test('backup export and import carry notes, edits and removals', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'keep me', title: 'T' }));
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'edit me' }));
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'remove me' }));
  const [, n2, n3] = s.state.notes;
  await s.ok(E.editNoteEvents(s.ctx(), n2.id, { text: 'edited' }, 'Typo'));
  await s.ok(E.removeNoteEvents(s.ctx(), n3.id, 'Added by mistake'));
  const out = await exportLog(s.store, OP, '2026-09-30T10:00:00-04:00');
  assert.ok(out.ok);
  const dir = mkdtempSync(join(tmpdir(), 'vsa-notes3-'));
  const store2 = await openStore(openNodeDb(join(dir, 'vsa.db')));
  tc.after(async () => { await store2.close(); rmSync(dir, { recursive: true, force: true }); });
  const r = await importLog(store2, out.text);
  assert.ok(r.ok && r.kind === 'created', JSON.stringify(r));
  const back = await store2.load(OP) as { state: State };
  assert.deepEqual(back.state.notes, s.state.notes);
  assert.deepEqual(back.state.notes.map((n) => [n.text, n.edited, n.removed]), [['keep me', false, false], ['edited', true, false], ['remove me', false, true]]);
});

test('reports list current notes only, edited ones marked; both report kinds include them', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'plain note', title: 'Keys' }));
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'first wording' }));
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'gone note' }));
  const [, n2, n3] = s.state.notes;
  await s.ok(E.editNoteEvents(s.ctx(), n2.id, { text: 'second wording' }, 'Typo'));
  await s.ok(E.removeNoteEvents(s.ctx(), n3.id, 'Typo'));
  const sec = notesSection(s.state);
  const text = (sec.lines ?? []).join('\n');
  assert.match(text, /Keys: plain note/);
  assert.match(text, /second wording .*edited, earlier versions kept in the log/);
  assert.doesNotMatch(text, /first wording|gone note/);
  for (const kind of ['break', 'completion'] as const) {
    const rep = buildReport(kind, s.state, glovis, { isTest: true, generatedAt: '2026-09-30 10:00' });
    assert.ok(rep.sections.some((x) => x.title === 'Notes' && (x.lines ?? []).join('').includes('plain note')), kind);
  }
  assert.deepEqual(notesSection((await setup(tc, 'TEST-NOTES-EMPTY')).state).lines, ['None recorded.']);
});

test('project() alone rebuilds the same notes from the stored events', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'one' }));
  await s.ok(E.editNoteEvents(s.ctx(), s.state.notes[0].id, { text: 'two' }, 'Typo'));
  const p = project(glovis, s.state.log.events, OP);
  assert.ok(p.ok);
  assert.deepEqual(p.ok && p.notes, s.state.notes);
});

test('plan view lists current notes with their meta, removed ones separately with the reason', async (tc) => {
  const s = await setup(tc);
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'keep', title: 'T', time: { day: 1, hm: '08:30' } }));
  await s.ok(E.addNoteEvents(s.ctx(), { text: 'drop' }));
  await s.ok(E.editNoteEvents(s.ctx(), s.state.notes[0].id, { title: 'T', text: 'kept' }, 'Typo'));
  await s.ok(E.removeNoteEvents(s.ctx(), s.state.notes[1].id, 'Added by mistake'));
  const v = planView(s.state, glovis);
  assert.deepEqual(v.notes.current.map((n) => [n.title, n.text, n.meta]), [['T', 'kept', '08:30 · edited']]);
  assert.match(v.notes.removed[0].meta, /^Removed Logged at 20:00 .* · Added by mistake$/);
});
