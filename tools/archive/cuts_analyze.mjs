// r-cuts: read the luma series of tools/cuts_clip.mjs and report what happens around each cut.
// node tools/cuts_analyze.mjs scratch/cuts/before.json [scratch/cuts/after.json ...]
// The series is the display luma of every frame (0..1). A cut is a frame where the camera's cut counter goes up. The dip (a fade through
// a soft dark, last pass) is divided out, so what is compared is the picture itself: S = (L - dark x dip) / (1 - dip).
// Per cut that changes the shot:
//   pre    the luma of the old shot, settled (median 0.8 to 0.1 s before the dip began, or before the cut without a dip)
//   first  the luma of the new shot over its first lit frames (dip under 0.5)
//   post   the luma of the new shot, settled (1.6 to 2.6 s after the cut)
//   |f-p|   how far the first lit frames sit from the old shot: the jolt the viewer's eye takes (the number the adaptation reduces)
//   |f-s|   how far the first lit frames sit from the settled new shot: the part that is "wrong exposure" and settles
//   settle  seconds after the first lit frame until the luma is within 8% of post for good
import { readFileSync } from 'node:fs';

const DARK = 0.022;
const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

for (const file of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const F = j.frames; // [t, luma, cutCount, shotId, dip, renderMs]
  const S = F.map((r) => (r[4] < 0.5 ? (r[1] - DARK * r[4]) / (1 - r[4]) : NaN));
  const cuts = [];
  for (let i = 1; i < F.length; i++) if (F[i][2] !== F[i - 1][2] && F[i][0] > 3 && F[i][0] < j.secs - 3) cuts.push(i);
  const win = (lo, hi, i0) => { const o = []; for (let k = 0; k < F.length; k++) if (F[k][0] >= F[i0][0] + lo && F[k][0] <= F[i0][0] + hi && Number.isFinite(S[k])) o.push(S[k]); return o; };
  console.log(`\n== ${file}  (${j.query})  frames ${F.length}, mean render ${(F.reduce((s, r) => s + r[5], 0) / F.length).toFixed(2)} ms`);
  console.log('  t(s)   dip  pre    first  post   |f-p|  |f-s|  settle(s)');
  const rows = [];
  for (const i of cuts) {
    let dipStart = i;
    while (dipStart > 0 && F[dipStart - 1][4] > 0.001) dipStart--;
    let shotChange = false;
    for (let k = Math.max(1, dipStart - 4); k <= Math.min(F.length - 1, i + 1); k++) if (F[k][3] !== F[k - 1][3]) shotChange = true;
    if (!shotChange) continue;
    const pre = med(win(-0.8, -0.1, dipStart));
    // first lit frames: from the cut on, the first three frames with the dip under 0.5
    const lit = [];
    for (let k = i; k < F.length && lit.length < 3; k++) if (Number.isFinite(S[k])) lit.push(k);
    if (!lit.length) continue;
    const first = med(lit.map((k) => S[k]));
    const post = med(win(1.6, 2.6, i));
    if (![pre, first, post].every(Number.isFinite)) continue;
    let settle = 0;
    for (let k = lit[0]; k < F.length && F[k][0] < F[i][0] + 3; k++) if (Number.isFinite(S[k]) && Math.abs(S[k] - post) > 0.08 * post) settle = F[k][0] - F[lit[0]][0];
    const r = { t: F[i][0], dip: F[dipStart][4] > 0.001 || F[i][4] > 0.001, pre, first, post, fp: Math.abs(first - pre), fs: Math.abs(first - post), settle };
    rows.push(r);
    console.log(`  ${r.t.toFixed(1).padStart(5)}   ${r.dip ? 'y' : '-'}   ${pre.toFixed(3)}  ${first.toFixed(3)}  ${post.toFixed(3)}  ${r.fp.toFixed(3)}  ${r.fs.toFixed(3)}  ${settle.toFixed(2)}`);
  }
  const m = (k) => rows.reduce((s, r) => s + r[k], 0) / Math.max(1, rows.length);
  console.log(`  ${rows.length} shot cuts: mean |first-pre| ${m('fp').toFixed(3)}, mean |first-settled| ${m('fs').toFixed(3)}, mean settle ${m('settle').toFixed(2)} s, worst |first-pre| ${Math.max(0, ...rows.map((r) => r.fp)).toFixed(3)}`);
  // the biggest single-frame steps of the picture itself (the dip divided out), anywhere in the clip
  const big = [];
  for (let k = 1; k < F.length; k++) if (Number.isFinite(S[k]) && Number.isFinite(S[k - 1])) { const d = Math.abs(S[k] - S[k - 1]); if (d > 0.05) big.push(`${F[k][0].toFixed(1)}s:${d.toFixed(2)}`); }
  console.log(`  frame-to-frame picture steps over 0.05 luma: ${big.length} ${big.slice(0, 16).join(' ')}`);
}
