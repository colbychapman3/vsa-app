// SessionStart hook: a short status so no session starts blind. Stdout is added to the session context.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const sh = (c) => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const count = (c) => sh(c).split('\n').filter(Boolean).length;
const lines = [
  `Git: ${sh('git status -sb').split('\n')[0]}; ${count('git status --short')} uncommitted; ${count('git stash list')} stash`,
  `Last commit: ${sh('git log -1 --format="%h %ad %s" --date=short').slice(0, 140)}`,
];
try {
  const now = readFileSync('ROADMAP.md', 'utf8').split('\n').find((l) => l.includes('Latest TestFlight build'));
  if (now) lines.push(`ROADMAP: ${now.slice(0, 220)}`);
} catch {}
lines.push('Check `eas build:list` for the newest build before naming it (ROADMAP can lag). Phone-check unchecked builds before new feature phases.');
console.log(lines.join('\n'));
