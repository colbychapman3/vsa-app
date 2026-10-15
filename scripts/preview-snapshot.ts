// Writes docs/mockups/preview-current.html: the Snapshot, Decks and a break check drawn from the app's own view models
// (the Glovis replay), in Light and Night, so a design edit can be looked over before a store build. It mirrors the layout;
// the phone build is still the real check. Run: node --experimental-strip-types scripts/preview-snapshot.ts
import { writeFileSync } from 'node:fs';
import { project } from '../src/engine/index.ts';
import { light, night } from '../src/app/palette.ts';
import { snapshot, needsLook, badges, decksView } from '../src/app/view.ts';
import { nowLine, dueHour } from '../src/app/now.ts';
import { shipView, HATCH_SLOTS } from '../src/app/ship.ts';
import { levers, scenario } from '../src/app/whatif.ts';
import { glovis, SCENARIOS, toEvents } from '../tests/scenarios.ts';

const events = toEvents(SCENARIOS.find((s) => s.name === 'mixed deck progress, working')!);
const p = project(glovis, events, events[0].operation_id);
if (!p.ok) throw new Error('replay failed');
const last = p.periods.at(-1)!;
const nowMin = Number(last.start.slice(0, 2)) * 60 + 60 + 70; // an hour past the last logged one: a count is due
const brk = { ...p, ops: { ...p.ops, phase: 'break', onBreak: true } } as typeof p;

type Pal = typeof light;
const esc = (x: unknown) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function done(pct: number | null, c: Pal) {
  return `<div class="big" style="font-size:56px">${pct == null ? '—' : `${Math.round(pct)}%`}</div><div class="doneBar"><i style="width:${pct == null ? 0 : Math.min(100, Math.max(0, pct))}%;background:${c.blue}"></i></div>`;
}
function spark(series: number[], cur: number, c: Pal) {
  if (series.length < 2) return '';
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1, y = (n: number) => 8 + ((hi - n) / span) * 30;
  const pts = series.map((n, i) => `${(4 + (i * 142) / (series.length - 1)).toFixed(1)},${y(n).toFixed(1)}`);
  const ry = Math.min(42, Math.max(4, y(cur))), [lx, ly] = pts.at(-1)!.split(',');
  return `<svg viewBox="0 0 150 46" width="100%" height="46"><line x1="4" x2="146" y1="${ry}" y2="${ry}" stroke="${c.muted}" stroke-dasharray="3 3" opacity=".6"/><polyline fill="none" stroke="${c.pace}" stroke-width="2.5" points="${pts.join(' ')}"/><circle cx="${lx}" cy="${ly}" r="4.5" fill="${c.pace}"/></svg>`;
}
function scaleSvg(diff: number, big: number, c: Pal) {
  const a = Math.max(-1, Math.min(1, (diff / Math.max(big, 1)) * 40)) * 0.2, L = 110, cx = 160, cy = 34;
  const lx = cx - L * Math.cos(a), ly = cy + L * Math.sin(a), rx = cx + L * Math.cos(a), ry = cy - L * Math.sin(a);
  const pan = (x: number, y: number, f: string) => `<line x1="${x}" y1="${y}" x2="${x - 40}" y2="${y + 56}" stroke="${c.muted}" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x + 40}" y2="${y + 56}" stroke="${c.muted}" stroke-width="2"/><path d="M ${x - 46} ${y + 56} Q ${x} ${y + 92} ${x + 46} ${y + 56} Z" fill="${f}"/>`;
  return `<svg width="100%" height="150" viewBox="0 0 320 150"><line x1="160" y1="34" x2="160" y2="132" stroke="${c.muted}" stroke-width="8" stroke-linecap="round"/><line x1="120" y1="136" x2="200" y2="136" stroke="${c.muted}" stroke-width="8" stroke-linecap="round"/><line x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}" stroke="${c.ink}" stroke-width="8" stroke-linecap="round"/>${pan(lx, ly, c.head)}${pan(rx, ry, c.done)}<circle cx="160" cy="34" r="8" fill="${c.action}" stroke="${c.ink}" stroke-width="2"/></svg>`;
}

function hull(s: typeof p, c: Pal) {
  const v = shipView(s);
  const lit = HATCH_SLOTS.map((_, i) => v.rows.some((r) => r.segs.length > 1 && (r.segs[i]?.fill ?? 0) > 0));
  const seg = (g: { fill: number | null } | null) => g == null ? '<i></i>' : `<i class="seg${g.fill == null ? ' unk' : ''}" style="background:${g.fill === 0 ? c.deckClear : c.deckTrack}">${g.fill ? `<b style="width:${Math.max(6, Math.round(g.fill * 100))}%;background:${c.deckFill}"></b>` : ''}</i>`;
  return `<div class="hull" style="background:${c.hull};color:${c.deckInk}"><div class="hh"><span>${v.decksLeft} of ${v.decks} decks still have cars</span><span style="color:${c.deckMuted}">Decks ›</span></div>
  <div class="row mono" style="color:${c.deckMuted}"><span class="l"></span><span class="s">${HATCH_SLOTS.map((h) => `<u>${h}</u>`).join('')}</span><span class="r"></span></div>
  <div class="row" style="align-items:flex-end"><span class="l"><i style="display:block;width:30px;height:26px;border-radius:4px;background:${c.deckMuted}"></i></span><span class="s">${lit.map((on) => `<i style="height:18px;border-radius:5px 5px 0 0;background:${on ? c.deckFill : c.deckClear}"></i>`).join('')}</span><span class="r"></span></div>
  <div style="height:10px;border-radius:0 0 24px 24px;background:${c.deckMuted};margin-bottom:8px"></div>
  ${v.rows.map((r) => `<div class="row" style="${r.low ? `border:1.5px solid ${c.deckWarn};border-radius:10px;margin:0 -4px;padding:0 4px` : ''}"><span class="l mono" style="color:${r.tone === 'clear' ? c.deckMuted : c.deckInk}">${esc(r.label)}</span><span class="s">${r.segs.length === 1 ? seg(r.segs[0]) : r.segs.map(seg).join('')}</span><span class="r" style="color:${r.tone === 'clear' ? c.deckMuted : c.deckInk}">${esc(r.right)}</span></div>`).join('')}</div>`;
}

function snapshotScreen(s: typeof p, now: number, c: Pal, mode: string) {
  const v = snapshot(s, glovis, now), h = v.hero, due = dueHour(s, glovis, now), b = badges(s);
  const fieldPct = Math.min(100, Math.max(0, v.fieldRecord.hero.pct));
  return `<div class="phone ${mode}" style="--bg:${c.bg};--card:${c.card};--ink:${c.ink};--muted:${c.muted};--line:${c.line};--soft:${c.soft};--head:${c.head};--hi:${c.headInk};--hm:${c.headMuted};--act:${c.action};--ona:${c.onAction};--blue:${c.blue};--or:${c.orange};--ono:${c.onOrange};--pace:${c.pace};--g:${c.gInk};--oi:${c.oInk};--obg:${c.oBg};--rbg:${c.rBg};--ri:${c.rInk}">
  <div class="top"><div class="r1"><span class="menu">☰</span><b>${esc(glovis.vessel_name ?? 'Vessel')}</b></div><div class="r2"><span class="live">LIVE</span> Berth · ${esc(glovis.date)}<span class="hb" style="margin-left:auto">Ask</span><span class="hb">Map</span></div></div>
  <div class="body">
  ${v.scale ? `<div class="card" style="text-align:center"><div class="lbl" style="text-align:left">${esc(v.scale.title)}</div>${scaleSvg(v.scale.diff, Math.max(v.scale.ship, v.scale.field), c)}<div class="between"><b>Ship ${v.scale.ship.toLocaleString('en-US')}</b><b style="color:${c.muted}">Field ${v.scale.field.toLocaleString('en-US')}</b></div><span class="pill">${esc(v.scale.text)}</span></div>` : ''}
  ${v.banners.map((x) => `<div class="banner"><b>${esc(x.title)}</b><div>${esc(x.sub)}</div></div>`).join('')}
  <div class="card"><div class="lbl">${esc(h.label)}</div><div class="big" style="font-size:96px">${esc(h.value)}</div><div class="sub">${esc(h.ofShort)}</div>
    ${h.estimate ? `<div><span class="chip fc">FORECAST</span> <b>${esc(h.estimate.text)}</b></div>` : ''}
    <div class="hr">${h.heroRows.map((r) => `<div class="kv"><span>${esc(r.k)}</span><b>${esc(r.v)}</b></div>`).join('')}${h.gapNote ? `<b style="font-size:17px">${esc(h.gapNote)}</b>` : ''}</div></div>
  <div class="grid"><div class="tile off"><span class="chip off">OFFICIAL</span><b style="font-size:17px">Field count</b><div class="big" style="font-size:44px;color:var(--hi)">${esc(v.fieldRecord.hero.value)}</div><span class="m">${esc(v.fieldRecord.tile.through)}</span><div class="meter"><i style="width:${fieldPct}%"></i></div><span class="m s13">${esc(v.fieldRecord.tile.line)}</span></div>
    <div class="tile card"><span class="chip fc">FORECAST</span><span class="lbl2">Finish</span>${v.eta.day ? `<b>${esc(v.eta.day)}</b>` : ''}<div class="big" style="font-size:44px">${esc(v.eta.value)}</div>${v.strip?.finish ? `<b style="color:${v.strip.finish.ok ? 'var(--g)' : 'var(--oi)'}">${esc(v.strip.finish.text)}</b>` : ''}</div></div>
  <div class="grid"><div class="tile card"><span class="lbl2">Ship done</span>${done(v.done.pct, c)}<div class="m">${esc(v.done.text)}</div></div>
    <div class="tile card"><b style="font-size:17px;color:var(--pace)">Pace</b><div class="big" style="font-size:44px;color:var(--pace)">${esc(v.ha.pace)}<small> /hr</small></div>${spark(v.paceSeries, Number(v.ha.pace), c)}<div class="hr"><b style="color:var(--blue);font-size:17px">H.A. ${esc(v.ha.value)} /hr</b><div class="m s13">${esc(v.ha.haLine)}</div></div></div></div>
  ${hull(s, c)}
  ${v.brands.count > 1 ? `<div class="lbl2" style="margin:4px 4px -8px">Remaining by brand</div><div class="card flush">${v.brands.rows.map((r) => `<div class="brand"><div class="kv"><b>${esc(r.name)}</b><span><b class="big" style="font-size:28px">${esc(r.remaining)}</b> of ${esc(r.start)}</span></div><div class="bar"><i style="width:${r.pct ?? 0}%"></i></div></div>`).join('')}</div>` : ''}
  </div>
  <div class="tabs"><span>Snapshot</span><span>Decks${b.decks ? ` <em>${b.decks}</em>` : ''}</span><span class="logw"><span class="log">＋ Log</span>${due ? `<span class="due">${esc(due)} due</span>` : ''}</span><span>Hourly</span><span>Plan${b.plan ? ` <em>${b.plan}</em>` : ''}</span></div></div>`;
}

function decksScreen(s: typeof p, now: number, c: Pal, mode: string) {
  const dv = decksView(s), warn = nowLine(s, glovis, now), look = needsLook(s);
  const lv = levers(s, glovis), r0 = scenario(s, glovis, {}); // nothing moved: exactly the Snapshot forecast
  const chips = (now: number) => [0, 0.25, 0.5, 0.75, 1].map((v) => `<span class="step" style="width:auto;flex:1;padding:0 2px;height:44px;font-size:15px;${v === now ? `background:${c.ink};color:${c.bg}` : ''}">${Math.round(v * 100)}%</span>`).join(' ');
  const stepper = (label: string, value: string) => `<div class="hr"><div class="lbl2">${label}</div><div class="kv"><span class="step">−</span><b style="font-size:32px">${value}</b><span class="step">+</span></div></div>`;
  const wi = s.vesselRemaining && r0.ok ? `<div class="card"><div class="kv"><b>What if</b><span class="chip fc">FORECAST</span></div><div class="lbl2">Finish</div><div class="big" style="font-size:44px">${hm(r0.endAbs)}</div><b style="color:var(--g)">Same as now</b>
    ${lv.pace ? stepper('Pace', `${Math.round(lv.pace.now)}<small> /hr</small>`) : ''}
    ${lv.drivers ? stepper('Drivers', String(lv.drivers.now)) : '<div class="hr"><div class="lbl2">Drivers</div><div class="m s13">Needs an hour with drivers logged.</div></div>'}
    <div class="hr"><div class="lbl2">Southside share</div><div style="display:flex;gap:6px">${chips(lv.south.now)}</div></div>
    <div class="hr"><div class="lbl2">Heavy cargo (H/H)</div>${lv.heavy ? `<div style="display:flex;gap:6px">${chips(lv.heavy.now)}</div>` : '<div class="m s13">Not enough hours with and without it.</div>'}</div></div>` : '';
  return `<div class="phone ${mode}" style="--bg:${c.bg};--card:${c.card};--ink:${c.ink};--muted:${c.muted};--line:${c.line};--soft:${c.soft};--head:${c.head};--hi:${c.headInk};--hm:${c.headMuted};--act:${c.action};--ona:${c.onAction};--blue:${c.blue};--or:${c.orange};--ono:${c.onOrange};--pace:${c.pace};--g:${c.gInk};--oi:${c.oInk};--obg:${c.oBg};--rbg:${c.rBg};--ri:${c.rInk}">
  <div class="top"><div class="r1"><span class="menu">☰</span><b>Decks</b></div></div><div class="body">
  ${warn?.tone === 'warn' ? `<div class="banner" style="border:1.5px solid var(--or)"><b>${esc(warn.text)}</b>${warn.advice ? `<div>${esc(warn.advice)}</div>` : ''}${warn.action?.deck ? `<span class="pill">${esc(warn.action.label)}</span>` : ''}</div>` : ''}
  ${hull(s, c)}
  ${wi}
  <div class="lbl2" style="margin:4px 4px -8px">Deck heights</div>
  ${dv.low.length ? dv.low.map((d) => `<div class="banner" style="background:var(--rbg);color:var(--ri)"><b>${esc(d.title)}</b><div>${esc(d.sub)}</div></div>`).join('') : '<div class="card m">No low decks with cargo remaining.</div>'}
  ${look.filter((r) => r.go === 'plan').map((r) => `<div class="banner" style="background:var(--obg);color:var(--oi)"><b>${esc(r.text)}</b></div>`).join('')}
  <div class="card flush">${dv.rows.map((r) => `<div class="brand"><div class="kv"><b>${esc(r.label)} <small>${esc(r.heightShort)}</small></b><span>${esc(r.pill)} · <b>${esc(r.remaining)}</b> of ${esc(r.start)}</span></div></div>`).join('')}</div>
  </div><div class="tabs"><span>Snapshot</span><span>Decks</span><span class="logw"><span class="log">＋ Log</span></span><span>Hourly</span><span>Plan</span></div></div>`;
}

const css = `body{margin:0;background:#dfe3e8;font-family:-apple-system,'Segoe UI',system-ui,sans-serif;color:#0E1A2B}
h1{font-size:18px;margin:18px 24px 0}p.n{margin:4px 24px 12px;color:#3A4B60;font-size:14px}
.wrap{display:flex;gap:22px;flex-wrap:wrap;padding:12px 24px 40px}
.col{display:grid;gap:8px}.col h2{font-size:14px;margin:0;color:#3A4B60}
.phone{width:393px;background:var(--bg);color:var(--ink);border-radius:36px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:15px}
.top{background:var(--head);color:var(--hi);padding:44px 20px 14px;display:grid;gap:8px}.r1{display:flex;gap:12px;align-items:center;font-size:26px;font-weight:900}.r2{display:flex;gap:8px;align-items:center;font-size:15px;font-weight:600}
.menu,.hb{border:1.5px solid var(--hm);border-radius:12px;padding:8px 12px}.live{background:#15803D;color:#fff;border-radius:8px;padding:2px 8px;font-size:13px}
.body{padding:16px;display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}.card,.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;gap:8px;box-shadow:0 3px 8px rgba(0,0,0,.08)}.flush{padding:0}
.tile.off{background:var(--head);color:var(--hi);border-color:var(--head)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.big{font-weight:900;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}.big small{font-size:17px;font-weight:600}
.lbl{font-size:17px;font-weight:700;color:var(--muted)}.lbl2{font-size:15px;font-weight:700;color:var(--muted)}.sub{font-size:17px;font-weight:600;color:var(--muted)}.m{font-size:15px;font-weight:600;color:var(--muted)}.off .m{color:var(--hm)}.s13{font-size:13px}
.chip{font-size:13px;font-weight:800;letter-spacing:.06em;padding:2px 8px;border-radius:8px;justify-self:start}.fc{background:var(--or);color:var(--ono)}.chip.off{background:var(--hi);color:var(--head)}
.doneBar{height:14px;border-radius:7px;background:var(--soft);overflow:hidden;margin:4px 0}.doneBar i{display:block;height:100%}
.meter{height:14px;border-radius:7px;background:#24375A;overflow:hidden}.meter i{display:block;height:100%;background:#3D7BFF}
.hr{border-top:1px solid var(--soft);padding-top:8px;display:grid;gap:6px}.kv{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.banner{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:4px}
.pill{border:1.5px solid var(--line);border-radius:999px;padding:6px 14px;font-weight:700;justify-self:center}
.hull{border-radius:10px 10px 12px 24px;padding:14px 14px 20px;display:grid;gap:2px}.hh{display:flex;justify-content:space-between;font-weight:600;margin-bottom:4px}
.row{display:grid;grid-template-columns:46px 1fr 70px;gap:8px;align-items:center;min-height:44px}.row .s{display:grid;grid-template-columns:repeat(4,1fr);gap:3px}.row .r{text-align:right;font-weight:600;font-size:13px;white-space:nowrap}.mono{font-family:'DM Mono',ui-monospace,monospace;font-size:13px}
.row u{text-decoration:none;text-align:center}.seg{position:relative;height:30px;border-radius:8px;overflow:hidden;display:block}.seg b{position:absolute;left:0;top:0;bottom:0}.seg.unk{border:1.5px dashed #A9BAD1;background:transparent!important}
.brand{padding:12px 16px;display:grid;gap:8px}.brand+.brand{border-top:1px solid var(--soft)}.bar{height:7px;border-radius:6px;background:var(--soft);overflow:hidden}.bar i{display:block;height:100%;background:var(--ink)}
.tabs{background:var(--head);color:var(--hm);display:flex;align-items:center;justify-content:space-around;padding:10px 8px 28px;font-size:13px;font-weight:600}.tabs em{font-style:normal;background:#B91C1C;color:#fff;border-radius:999px;padding:0 6px}
.logw{position:relative}.log{display:block;background:var(--act);color:var(--ona);border:2px solid var(--ink);border-radius:999px;padding:13px 22px;font-size:17px;font-weight:800}.due{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--head);color:var(--hi);border:1.5px solid var(--hi);border-radius:999px;padding:0 8px;font-size:13px;white-space:nowrap}
.between{display:flex;justify-content:space-between;padding:0 12px;font-size:17px}.step{border:2px solid var(--ink);border-radius:999px;width:56px;height:56px;display:grid;place-items:center;font-size:28px;font-weight:700}`;

const screens: [string, string, string][] = [
  ['snapshot-light', 'Snapshot · Light · a count is due', snapshotScreen(p, nowMin, light, '')],
  ['snapshot-night', 'Snapshot · Night', snapshotScreen(p, nowMin, night as Pal, 'night')],
  ['snapshot-break', 'Snapshot · at a break (scale)', snapshotScreen(brk, nowMin, light, '')],
  ['decks-light', 'Decks · Light', decksScreen(p, nowMin, light, '')],
];
const page = (title: string, body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style>${body}`;
const note = `<p class="n">Drawn from the app's own view models (Glovis replay). A layout mirror: fonts differ from the phone. The phone build is the real check.</p>`;
writeFileSync(new URL('../docs/mockups/preview-current.html', import.meta.url), page('VSA current design preview',
  `<h1>VSA, current design</h1>${note}<div class="wrap">${screens.map(([, t, h]) => `<div class="col"><h2>${t}</h2>${h}</div>`).join('')}</div>`));
// One page per screen, so each can be shot to a phone-sized PNG (see the commit that added this).
for (const [name, t, h] of screens) writeFileSync(new URL(`../docs/mockups/preview/${name}.html`, import.meta.url), page(t, `<div style="padding:0">${h}</div>`));
console.log('wrote docs/mockups/preview-current.html and docs/mockups/preview/*.html');
