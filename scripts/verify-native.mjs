// What a store build needs that typecheck and the unit tests can't see. Works on a temporary copy of the repo,
// so nothing in the working tree changes, and needs no Mac:
//   - the iOS project generates (config plugins load) and carries no push entitlement
//     (plugins/withoutPush.js exists to strip aps-environment; the ad-hoc profile refuses it);
//   - the camera and photo permission texts are present and no microphone text sneaks in;
//   - the Swift text reader is committed and Expo's autolinking finds the VsaText pod;
//   - generated files (knowledge index, map data and image) match what their scripts produce now;
//   - app.json / eas.json basics for a TestFlight build are valid.
// It does NOT compile Swift: after each store build, confirm VsaText appears in the EAS build log.
// Run:  npm run verify:native   (verify:release runs typecheck, tests and the iOS bundle first)
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const win = process.platform === 'win32';
const failures = [];
const check = (ok, what, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `: ${detail}`}`); if (!ok) failures.push(what); };
const run = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: win, maxBuffer: 64 * 1024 * 1024 });
const walk = (dir, out = []) => { for (const f of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, f.name); if (f.isDirectory()) walk(p, out); else out.push(p); } return out; };
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

const app = json(join(root, 'app.json')).expo, eas = json(join(root, 'eas.json'));
check(/^\d+\.\d+\.\d+$/.test(app.version ?? ''), 'app.json version is x.y.z', String(app.version));
check(!!app.ios?.bundleIdentifier, 'app.json has an iOS bundle identifier');
check(eas.build?.production?.autoIncrement === true && eas.cli?.appVersionSource === 'remote', 'eas.json: production build auto-increments, version source is remote');
check((app.plugins ?? []).includes('./plugins/withoutPush.js') && existsSync(join(root, 'plugins/withoutPush.js')), 'push-stripping plugin is listed and present');

const tmp = mkdtempSync(join(tmpdir(), 'vsa-verify-'));
try {
  // Skip only the root-level folders: modules/vsa-text/ios is source and must be in the copy.
  cpSync(root, tmp, { recursive: true, filter: (src) => !['node_modules', '.git', 'dist', 'ios', 'android', '.expo'].includes(relative(root, src)) });
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'), 'junction');

  // Generated files: rerun the generators in the copy and compare with the committed outputs.
  // builtAt is the build date: reuse the committed one, or this check would fail every day after the commit.
  run(tmp, 'node', ['scripts/build-knowledge.mjs', '--date', json(join(root, 'assets/knowledge/index.json')).builtAt]);
  run(tmp, 'node', ['scripts/export-map.mjs']);
  for (const f of ['assets/knowledge/index.json', 'src/app/map/data.ts', 'assets/terminal-map.jpg']) {
    check(readFileSync(join(tmp, f)).equals(readFileSync(join(root, f))), `${f} is current`, 'regenerate it with its script and commit it');
  }

  // The iOS project, generated without installing pods.
  if (win) console.log('skip iOS project checks (entitlements, permission texts): expo prebuild for iOS cannot run on Windows. CI runs them on Linux; push before building.');
  else {
    run(tmp, 'npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install']);
    const files = walk(join(tmp, 'ios'));
    const entitlements = files.filter((f) => f.endsWith('.entitlements'));
    check(entitlements.length > 0, 'iOS project has an entitlements file');
    check(entitlements.every((f) => !readFileSync(f, 'utf8').includes('aps-environment')), 'no push (aps-environment) entitlement');
    const plist = files.find((f) => /[\\/]Info\.plist$/.test(f));
    const info = plist ? readFileSync(plist, 'utf8') : '';
    check(info.includes('NSCameraUsageDescription') && info.includes('NSPhotoLibraryUsageDescription'), 'camera and photo permission texts are present');
    check(!info.includes('NSMicrophoneUsageDescription'), 'no microphone permission text');
  }

  // Native source: committed, and discovered by Expo's autolinking.
  const swift = ['modules/vsa-text/ios/VsaText.podspec', 'modules/vsa-text/ios/VsaTextModule.swift'];
  if (existsSync(join(root, '.git'))) {
    const tracked = run(root, 'git', ['ls-files', 'modules/vsa-text/ios']).split(/\r?\n/);
    for (const f of swift) check(tracked.includes(f), `${f} is committed`, 'a .gitignore rule may hide it; EAS only uploads committed files');
  }
  const linked = JSON.parse(run(tmp, 'npx', ['expo-modules-autolinking', 'resolve', '--platform', 'apple', '--json']));
  const vsa = (linked.modules ?? []).find((m) => m.packageName === 'vsa-text');
  check(!!vsa?.pods?.some((p) => p.podName === 'VsaText') && !!vsa?.modules?.some((m) => m.class === 'VsaTextModule'), 'autolinking finds the VsaText pod and VsaTextModule');
} catch (e) {
  check(false, 'verification ran to the end', String(e.stderr || e.message).split('\n').slice(0, 6).join(' | '));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) { console.error(`\n${failures.length} check(s) failed. Do not build.`); process.exit(1); }
console.log('\nAll native and release checks passed. Still confirm VsaText in the EAS build log after the build.');
