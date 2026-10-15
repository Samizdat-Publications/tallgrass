// Disk retention for scratch/ and agent worktrees. Each worktree is a full checkout
// (about 1.8 GB with review/ and node_modules), so leftovers pile up fast.
//
// Usage:
//   npm run clean            (dry run: lists what would go and how big it is)
//   npm run clean -- --apply (actually deletes)
//     [--days 2]             (scratch entries younger than this are kept)
//
// Removes:
//   - worktrees whose HEAD is already on main and that have no uncommitted tracked edits
//     (the branch itself is kept; only the folder goes)
//   - scratch/ entries older than --days that are not a live worktree
// Keeps: worktrees with unmerged commits or uncommitted edits, scratch/_salvage, scratch/KEEP*.
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const di = argv.indexOf('--days');
const days = di >= 0 ? Number(argv[di + 1]) : 2;
const root = resolve('.');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

function sizeOf(p) {
  let s = 0;
  const walk = (q) => {
    let st;
    try { st = statSync(q, { throwIfNoEntry: false }); } catch { return; }
    if (!st) return;
    if (st.isDirectory()) { for (const e of readdirSync(q)) walk(join(q, e)); } else s += st.size;
  };
  walk(p);
  return s;
}
const gb = (b) => (b / 1e9).toFixed(2) + ' GB';
const norm = (p) => resolve(p).toLowerCase();

// Parse worktrees (skip the main checkout).
const wts = [];
let cur = null;
for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
  if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; wts.push(cur); }
  else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
  else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (line.startsWith('locked')) cur.locked = true;
}
const others = wts.filter((w) => norm(w.path) !== norm(root));
const livePaths = new Set(others.map((w) => norm(w.path)));

let total = 0;
const plan = [];
for (const w of others) {
  const label = `${w.path} [${w.branch ?? 'detached'}]`;
  let merged = false;
  try { execFileSync('git', ['merge-base', '--is-ancestor', w.head, 'main'], { cwd: root }); merged = true; } catch {}
  let dirty = 0;
  try { dirty = git('-C', w.path, 'status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).length; } catch {}
  if (w.locked) { console.log(`keep  ${label}: locked`); continue; }
  if (!merged) { console.log(`keep  ${label}: has commits not on main`); continue; }
  if (dirty) { console.log(`keep  ${label}: ${dirty} uncommitted edits`); continue; }
  const s = sizeOf(w.path);
  total += s;
  plan.push({ kind: 'worktree', path: w.path, size: s, label });
}

const cutoff = Date.now() - days * 864e5;
const scratch = join(root, 'scratch');
for (const e of readdirSync(scratch)) {
  const p = join(scratch, e);
  if (e === '_salvage' || e.startsWith('KEEP')) continue;
  if (livePaths.has(norm(p))) continue;
  if ([...livePaths].some((lp) => lp.startsWith(norm(p) + '\\') || lp.startsWith(norm(p) + '/'))) continue;
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st || st.mtimeMs > cutoff) continue;
  const s = sizeOf(p);
  total += s;
  plan.push({ kind: 'scratch', path: p, size: s, label: p });
}

for (const it of plan) console.log(`${apply ? 'del ' : 'would'} ${gb(it.size).padStart(9)}  ${it.label}`);
console.log(`${apply ? 'Freeing' : 'Would free'} ${gb(total)} (${plan.length} items).${apply ? '' : ' Run with --apply to delete.'}`);

if (apply) {
  for (const it of plan) {
    if (it.kind === 'worktree') {
      // git sometimes fails on Windows ("Invalid argument") partway through; finish the folder by hand, prune drops the record.
      try { git('worktree', 'remove', '--force', it.path); } catch { rmSync(it.path, { recursive: true, force: true, maxRetries: 3 }); }
    } else {
      rmSync(it.path, { recursive: true, force: true, maxRetries: 3 });
    }
  }
  git('worktree', 'prune');
  console.log('Done.');
}
