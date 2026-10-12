import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDb } from './nodeDb.ts';
import { openStore } from '../src/storage/store.ts';
import { getPref, setPref } from '../src/storage/prefs.ts';
import { emptyDeck } from '../src/app/setup.ts';
import { blankDraft, clearDraft, draftLabel, DRAFT_KEY, isDirty, loadDraft, parseDraft, saveDraft, serializeDraft, type DraftStore } from '../src/app/setupDraft.ts';

const memory = (): DraftStore & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };
const typed = () => { const d = blankDraft(); d.v.vessel = 'Hector Highway'; d.mode = 'form'; return d; };

test('an untouched form is not dirty, and switching TEST/LIVE or moving through steps alone does not make it dirty', () => {
  assert.equal(isDirty(blankDraft()), false);
  assert.equal(isDirty({ ...blankDraft(true), mode: 'form', step: 2 }), false);
  const spaces = blankDraft(); spaces.v.vessel = '   '; spaces.paste = '\n'; spaces.load = { Kia: ' ' };
  assert.equal(isDirty(spaces), false);
});

test('any field, allocation, deck, H/H, load list, pasted text or game plan read makes the form dirty', () => {
  const cases: ((d: ReturnType<typeof blankDraft>) => void)[] = [
    (d) => { d.v.vessel = 'X'; }, (d) => { d.v.start = '07:30'; }, (d) => { d.v.drivers = '70'; }, (d) => { d.v.berth = '2'; },
    (d) => { d.allocs[0].brand = 'Kia'; }, (d) => { d.allocs[0].destination = 'Zone 1'; },
    (d) => { d.decks = [emptyDeck()]; }, (d) => { d.hh = [{ deck: null, qty: 3, cargo: '', yard: '' }]; },
    (d) => { d.load = { Kia: '829' }; }, (d) => { d.loadHh = '4'; }, (d) => { d.paste = '{}'; },
    (d) => { d.read = { filled: [], problems: [], notes: [], extras: [], decks: 0, autos: null, hhTotal: null }; },
  ];
  for (const [i, c] of cases.entries()) { const d = blankDraft(); c(d); assert.equal(isDirty(d), true, `case ${i}`); }
});

test('save, load and clear round-trip; the draft keeps TEST vs LIVE as it was saved', async () => {
  const st = memory();
  assert.equal(await loadDraft(st), null);
  const d = typed(); d.isTest = true; d.step = 3; d.decks = [emptyDeck()]; d.allocs = [{ brand: 'Kia', autos: '829', destination: 'Zone 1' }]; d.keep = ['note'];
  d.read = { filled: ['vessel'], problems: ['p'], notes: ['n'], extras: [], decks: 1, autos: 1969, hhTotal: null };
  assert.deepEqual(await saveDraft(st, d, new Date('2026-10-11T14:05:00Z')), { ok: true });
  const back = await loadDraft(st);
  assert.deepEqual(back?.draft, d);
  assert.equal(back?.draft.isTest, true);
  assert.equal(back?.savedAt, '2026-10-11T14:05:00.000Z');
  await clearDraft(st);
  assert.equal(await loadDraft(st), null);
});

test('one draft at a time: a second save replaces the first', async () => {
  const st = memory();
  await saveDraft(st, typed(), new Date());
  const b = typed(); b.v.vessel = 'Other'; b.isTest = true;
  await saveDraft(st, b, new Date());
  assert.equal((await loadDraft(st))?.draft.v.vessel, 'Other');
  assert.equal(st.m.size, 1);
});

test('the draft holds text only: no photo paths, and the stored text has no photo field', async () => {
  const st = memory();
  await saveDraft(st, typed(), new Date());
  const raw = st.m.get(DRAFT_KEY)!;
  assert.equal(/file:|photo|scans|kept/i.test(raw), false);
});

test('damaged, empty or other-version drafts are not offered and never throw', async () => {
  for (const bad of [null, '', 'not json', '[]', '{"v":2,"savedAt":"x","draft":{"mode":"form"}}', '{"v":1,"savedAt":"x"}', '{"v":1,"savedAt":"x","draft":"s"}']) assert.equal(parseDraft(bad), null, String(bad));
  const broken: DraftStore = { get: async () => { throw new Error('db'); }, set: async () => { throw new Error('db'); } };
  assert.equal(await loadDraft(broken), null);
  const r = await saveDraft(broken, typed(), new Date());
  assert.equal(r.ok, false);
  await clearDraft(broken); // does not throw
});

test('a draft with wrong-typed pieces is cleaned, not trusted', () => {
  const raw = JSON.stringify({ v: 1, savedAt: '2026-10-11T00:00:00Z', draft: { mode: 'weird', step: 99, v: { vessel: 5, start: null }, allocs: 'x', decks: [{ label: 3, hatches: 'no' }], hh: [{ qty: 'a' }], load: { Kia: 1, Hyundai: '5' }, confirmed: [1, 'a'] } });
  const d = parseDraft(raw)!.draft;
  assert.equal(d.mode, 'start'); assert.equal(d.step, 5); assert.equal(d.v.vessel, ''); assert.equal(d.v.start, '08:00');
  assert.equal(d.allocs.length, 1); assert.deepEqual(d.decks[0].hatches, []); assert.equal(d.hh[0].qty, null);
  assert.deepEqual(d.load, { Hyundai: '5' }); assert.deepEqual(d.confirmed, [1]);
});

test('the label says what the draft is, LIVE or TEST, and when it was saved', () => {
  const at = new Date(2026, 9, 11, 14, 5).toISOString();
  assert.equal(draftLabel({ savedAt: at, draft: typed() }), 'Hector Highway · LIVE · saved 10/11 14:05');
  assert.equal(draftLabel({ savedAt: at, draft: { ...blankDraft(true), mode: 'form' } }), 'Vessel not named yet · TEST · saved 10/11 14:05');
  assert.equal(draftLabel({ savedAt: 'bad', draft: typed() }), 'Hector Highway · LIVE');
});

test('through the real prefs layer: survives a reopened store and never touches the events or vessels', async () => {
  const db = openNodeDb(':memory:');
  await openStore(db);
  const st: DraftStore = { get: (k) => getPref(db, k), set: (k, v) => setPref(db, k, v) };
  await saveDraft(st, typed(), new Date());
  await openStore(db); // "relaunch"
  assert.equal((await loadDraft(st))?.draft.v.vessel, 'Hector Highway');
  assert.equal((await db.all('SELECT 1 FROM events')).length, 0);
  assert.equal((await db.all('SELECT 1 FROM vessels')).length, 0);
  await clearDraft(st);
  assert.equal(await loadDraft(st), null);
});

test('serialize is plain text of the draft', () => { assert.equal(JSON.parse(serializeDraft(typed(), 't')).draft.v.vessel, 'Hector Highway'); });
