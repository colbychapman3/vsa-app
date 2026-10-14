// Stop hook: when code changed, typecheck and tests must pass before the turn can end.
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch {}
if (input.stop_hook_active) process.exit(0); // already retried once; don't loop
const changed = execSync('git status --porcelain', { encoding: 'utf8' }).split('\n')
  .map((l) => l.slice(3)).filter((p) => /^(src|tests|modules|plugins)\/|^App\.tsx$|^index\.ts$/.test(p));
if (!changed.length) process.exit(0);
for (const cmd of ['npm run typecheck', 'npm test']) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  if (r.status !== 0) {
    const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-15).join('\n');
    console.error(`Stop blocked: \`${cmd}\` failed with code changes in the tree. Fix it or say plainly that it fails.\n${tail}`);
    process.exit(2);
  }
}
