// UI conformance harness (.claude/skills/ui-conformance). One CLI, Edge through playwright-core, outputs in tools/render/out/ (gitignored).
//   node tools/render/render.mjs boards [id...]     board HTML → out/boards/<id>.png (once; needs the network for Google Fonts)
//   node tools/render/render.mjs export             web build of the app → out/web (rerun after app changes)
//   node tools/render/render.mjs capture [id...]    app at each board's state → out/shots/<id>.png
//   node tools/render/render.mjs diff [id...]       [board | app | diff] → out/diff/<id>.png, one JSON line per board
//   node tools/render/render.mjs zoom <id> x y w h  board and app crops side by side → out/zoom/<id>.png
//   node tools/render/render.mjs noise [id...]      capture twice, print app-vs-app mismatch (must be 0)
import pw from 'playwright-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES } from './states.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(ROOT, 'tools/render/out');
const BOARDS = join(ROOT, 'docs/mockups/every-screen-swarm-final-2026-10-13/boards');
const W = 393, H = 874; // the boards' phone width; full-page height
const STILL = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const dir = (d) => { const p = join(OUT, d); mkdirSync(p, { recursive: true }); return p; };
const ids = (args) => (args.length ? args : Object.keys(STATES));
const browser = () => pw.chromium.launch({ channel: 'msedge' });
const load = (p) => PNG.sync.read(readFileSync(p));

async function boards(list) {
  const b = await browser(), page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  for (const id of list) {
    const st = STATES[id];
    const html = readFileSync(join(BOARDS, `${id}.dc.html`), 'utf8').replace(/\{\{\s*mode\s*\}\}/g, st.theme === 'night' ? 'night' : st.sun ? 'xv' : '').replace('<script src="./support.js"></script>', `<style>${STILL}</style>`).replace('border-radius: 46px', 'border-radius: 0'); // square corners: the app shot has none
    const tmp = join(dir('boards'), `${id}.html`);
    writeFileSync(tmp, html);
    await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(dir('boards'), `${id}.png`), fullPage: true });
    console.log(JSON.stringify({ id, board: 'ok' }));
  }
  await b.close();
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' };
function serve() {
  const web = join(OUT, 'web');
  const s = createServer((req, res) => {
    let p = join(web, decodeURIComponent(req.url.split('?')[0]));
    if (!existsSync(p) || p.endsWith('\\') || p.endsWith('/')) p = join(web, 'index.html');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Type', TYPES[extname(p)] ?? 'application/octet-stream');
    res.end(readFileSync(p));
  });
  return new Promise((ok) => s.listen(0, () => ok({ url: `http://localhost:${s.address().port}/`, close: () => s.close() })));
}

async function capture(list, suffix = '') {
  if (!existsSync(join(OUT, 'web/index.html'))) throw new Error('No web build: run `node tools/render/render.mjs export` first.');
  const fixtures = {};
  const srv = await serve(), b = await browser();
  for (const id of list) {
    const st = STATES[id];
    fixtures[st.until] ??= execSync(`node --experimental-strip-types --no-warnings -e "import('./tools/render/hera.ts').then(m=>m.build('${st.until}')).then(r=>process.stdout.write(r.text))"`, { cwd: ROOT, maxBuffer: 64e6 }).toString();
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'America/New_York' });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(`2026-10-12T${st.clock}:00-04:00`));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${srv.url}?theme=${st.theme ?? 'light'}${st.sun ? '&sun=1' : ''}`);
    await page.waitForFunction(() => globalThis.__vsa?.ready?.(), null, { timeout: 30000 });
    const err = await page.evaluate((t) => globalThis.__vsa.load(t), fixtures[st.until]);
    if (err) throw new Error(`${id}: fixture refused: ${err}`);
    await page.evaluate((s) => { const v = globalThis.__vsa; v.appearance(s.theme ?? 'light'); v.sun(!!s.sun); v.tab(s.tab ?? 'snap'); if (s.sheet) v.sheet(s.sheet); if (s.log) v.log(true); if (s.deck) v.deck(s.deck); if (s.drawer) v.drawer(true); }, st);
    for (const [i, v] of (st.type ?? []).entries()) await page.locator('input').nth(i).fill(v); // typed values the board shows, in input order
    await page.addStyleTag({ content: STILL });
    // The boards draw a 54 px iPhone status bar in the header color; web has no safe area, so add the same band.
    await page.evaluate(() => { const r = document.getElementById('root'); const head = [...r.querySelectorAll('div')].find((e) => e.getBoundingClientRect().top === 0 && e.getBoundingClientRect().height > 40 && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'); const c = head ? getComputedStyle(head).backgroundColor : '#14243B'; document.body.style.background = c; r.style.paddingTop = '54px'; r.style.boxSizing = 'border-box'; });
    await page.waitForTimeout(800);
    // Full length like the boards: grow the viewport by the hidden height of the screen's scroll area (an open sheet's: the last one in the page).
    const sheetOpen = !!(st.sheet || st.log || st.deck);
    const extra = await page.evaluate((last) => { const xs = [...document.querySelectorAll('div')].filter((e) => e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible').map((e) => e.scrollHeight - e.clientHeight); return xs.length ? (last ? xs[xs.length - 1] : Math.max(...xs)) : 0; }, sheetOpen);
    if (extra) { await page.setViewportSize({ width: W, height: H + extra }); await page.waitForTimeout(300); }
    await page.screenshot({ path: join(dir('shots'), `${id}${suffix}.png`), fullPage: true });
    await ctx.close();
    console.log(JSON.stringify({ id, shot: 'ok', ...(errors.length ? { pageErrors: errors.slice(0, 3) } : {}) }));
  }
  await b.close(); srv.close();
}

// Pads both images to the same size (white), returns the mismatch and the diff image.
function compare(a, b) {
  const w = Math.max(a.width, b.width), h = Math.max(a.height, b.height);
  const pad = (img) => { const p = new PNG({ width: w, height: h, fill: true }); p.data.fill(255); PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0); return p; };
  const A = pad(a), B = pad(b), D = new PNG({ width: w, height: h });
  const n = pixelmatch(A.data, B.data, D.data, w, h, { threshold: 0.1, alpha: 0.2 });
  return { A, B, D, w, h, pct: +(100 * n / (w * h)).toFixed(2) };
}

// The largest changed areas: 40 px grid cells with any red diff pixel, merged by rows into boxes.
function regions(D, w, h) {
  const G = 40, cells = [];
  for (let y = 0; y < h; y += G) for (let x = 0; x < w; x += G) {
    let n = 0;
    for (let yy = y; yy < Math.min(y + G, h); yy += 2) for (let xx = x; xx < Math.min(x + G, w); xx += 2) { const i = (yy * w + xx) * 4; if (D.data[i] > 200 && D.data[i + 1] < 80) n++; }
    if (n > 8) cells.push({ x, y, n });
  }
  const boxes = [];
  for (const c of cells) {
    const b = boxes.find((r) => c.y <= r.y + r.h && c.y >= r.y - G && c.x <= r.x + r.w + G && c.x + G >= r.x - G);
    if (b) { const x2 = Math.max(b.x + b.w, c.x + G), y2 = Math.max(b.y + b.h, c.y + G); b.x = Math.min(b.x, c.x); b.y = Math.min(b.y, c.y); b.w = x2 - b.x; b.h = y2 - b.y; b.n += c.n; } else boxes.push({ x: c.x, y: c.y, w: G, h: G, n: c.n });
  }
  return boxes.sort((a, b) => b.n - a.n).slice(0, 6).map((r) => [r.x, r.y, Math.min(r.w, w - r.x), Math.min(r.h, h - r.y)]);
}

function side(imgs, out, maxW = 1200) {
  const gap = 8, w = imgs.reduce((s, i) => s + i.width, 0) + gap * (imgs.length - 1), h = Math.max(...imgs.map((i) => i.height));
  const p = new PNG({ width: w, height: h, fill: true }); p.data.fill(255);
  let x = 0; for (const i of imgs) { PNG.bitblt(i, p, 0, 0, i.width, i.height, x, 0); x += i.width + gap; }
  writeFileSync(out, PNG.sync.write(p));
  return w > maxW;
}

function diff(list) {
  for (const id of list) {
    const bp = join(OUT, 'boards', `${id}.png`), sp = join(OUT, 'shots', `${id}.png`);
    if (!existsSync(bp) || !existsSync(sp)) { console.log(JSON.stringify({ id, error: `missing ${existsSync(bp) ? 'shot' : 'board'}` })); continue; }
    const { A, B, D, w, h, pct } = compare(load(bp), load(sp));
    side([A, B, D], join(dir('diff'), `${id}.png`));
    console.log(JSON.stringify({ id, mismatchPct: pct, size: { board: [load(bp).width, load(bp).height], app: [load(sp).width, load(sp).height] }, regions: regions(D, w, h) }));
  }
}

function zoom(id, x, y, w, h) {
  const crop = (img) => { const p = new PNG({ width: w, height: h, fill: true }); p.data.fill(255); PNG.bitblt(img, p, x, y, Math.min(w, img.width - x), Math.min(h, img.height - y), 0, 0); return p; };
  const out = join(dir('zoom'), `${id}.png`);
  side([crop(load(join(OUT, 'boards', `${id}.png`))), crop(load(join(OUT, 'shots', `${id}.png`)))], out);
  console.log(out);
}

async function noise(list) {
  await capture(list); await capture(list, '.again');
  for (const id of list) console.log(JSON.stringify({ id, noisePct: compare(load(join(OUT, 'shots', `${id}.png`)), load(join(OUT, 'shots', `${id}.again.png`))).pct }));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'boards') await boards(ids(args));
else if (cmd === 'export') execSync(`npx expo export --platform web --output-dir "${join(OUT, 'web')}"`, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
else if (cmd === 'capture') await capture(ids(args));
else if (cmd === 'diff') diff(ids(args));
else if (cmd === 'zoom') zoom(args[0], ...args.slice(1).map(Number));
else if (cmd === 'noise') await noise(ids(args));
else console.log('commands: boards | export | capture | diff | zoom | noise');
