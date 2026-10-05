// Camera path analysis for the reel (R15 camera pass). The game logs the camera every update (DroneCamera.debugLog, stride 9:
// clock, dt, camera xyz, focus xyz, cut counter). This module (1) counts logged frames where the camera is inside a real tree
// crown, measured in the page against the actual instance matrices and crown geometry (not against the camera's own collision
// proxy), and (2) computes per-frame jerk of the camera position and view direction, leaving out the intentional cuts (snap()).
// Used by tools/video.mjs --camlog <file.json>, and runnable on a saved log: node tools/camlog.mjs <file.json>
import { readFileSync, writeFileSync } from 'node:fs';


/** Runs in the page: how many of the logged frames have the camera inside a crown (an ellipsoid inscribed in each crown's bounding box, `shrink` of its size). */
export const PAGE_INSIDE = `(shrink) => {
  const e = window.__engine, tr = e.trees, log = e.cam.debugLog;
  const M4 = e.camera.matrixWorld.constructor, V3 = e.camera.position.constructor;
  const cols = [];
  const addPool = (pool, kind) => {
    const g = pool.crownMeshes[0].geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    const c = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
    const h = [(b.max.x - b.min.x) / 2 * shrink, (b.max.y - b.min.y) / 2 * shrink, (b.max.z - b.min.z) / 2 * shrink];
    for (let s = 0; s < pool.hi; s++) {
      if (!pool.crownOn[s]) continue;
      const m = new M4().fromArray(pool.crownMats, s * 16);
      cols.push({ kind, x: m.elements[12], y: m.elements[13], z: m.elements[14], inv: m.clone().invert(), c, h });
    }
  };
  for (const p of tr.cw) addPool(p, 'cottonwood');
  for (const p of tr.jun) addPool(p, 'juniper');
  for (const p of tr.thick) addPool(p, 'thicket');
  const v = new V3();
  const out = { frames: 0, inside: 0, insideFrames: [], byKind: {}, minClear: 1e9, minBoom: 1, maxSwing: 0, pushes: e.cam.avoidPushes };
  for (let i = 0; i + 10 < log.length; i += 11) {
    out.frames++;
    const px = log[i + 2], py = log[i + 3], pz = log[i + 4];
    out.minClear = Math.min(out.minClear, py - e.groundHeight(px, pz));
    out.minBoom = Math.min(out.minBoom, log[i + 9]);
    out.maxSwing = Math.max(out.maxSwing, Math.abs(log[i + 10]));
    let hit = null, thick = false;
    for (const k of cols) {
      const dx = k.x - px, dz = k.z - pz;
      if (dx * dx + dz * dz > 2500) continue;
      v.set(px, py, pz).applyMatrix4(k.inv);
      const a = (v.x - k.c[0]) / k.h[0], b = (v.y - k.c[1]) / k.h[1], c = (v.z - k.c[2]) / k.h[2];
      if (a * a + b * b + c * c < 1) { if (k.kind === 'thicket') thick = true; else { hit = k.kind; break; } }
    }
    if (thick) out.inThicket = (out.inThicket ?? 0) + 1;
    if (hit) { out.inside++; out.insideFrames.push(Math.round(log[i] * 100) / 100); out.byKind[hit] = (out.byKind[hit] ?? 0) + 1; }
  }
  return out;
}`;

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/**
 * Jerk of the camera path. Position jerk in m/s^3, angular jerk (of the unit view direction) in rad/s^3. Frames across a cut
 * (the cut counter changed) and the three frames after it are dropped. dt is taken from the log's clock.
 */
export function analyze(log, STRIDE = 11) {
  const n = Math.floor(log.length / STRIDE);
  const P = [], D = [], T = [], C = [];
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    const px = log[o + 2], py = log[o + 3], pz = log[o + 4];
    let dx = log[o + 5] - px, dy = log[o + 6] - py, dz = log[o + 7] - pz;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    P.push([px, py, pz]); D.push([dx, dy, dz]); T.push(log[o]); C.push(log[o + 8]);
  }
  // derivative of a series of vectors against the clock
  const deriv = (V, ang) => {
    const out = [];
    for (let i = 1; i < V.length; i++) {
      const dt = T[i] - T[i - 1];
      if (dt <= 1e-4) { out.push(null); continue; }
      let d;
      if (ang) {
        // angular speed vector: the change of the unit direction per second (small-angle)
        d = [(V[i][0] - V[i - 1][0]) / dt, (V[i][1] - V[i - 1][1]) / dt, (V[i][2] - V[i - 1][2]) / dt];
      } else d = [(V[i][0] - V[i - 1][0]) / dt, (V[i][1] - V[i - 1][1]) / dt, (V[i][2] - V[i - 1][2]) / dt];
      out.push(d);
    }
    return out;
  };
  const metrics = (V, ang) => {
    const vel = deriv(V, ang);
    const speeds = [], acc = [], jerk = [];
    const bad = new Set();
    for (let i = 1; i < n; i++) if (C[i] !== C[i - 1]) for (let k = i; k < i + 4; k++) bad.add(k);
    // velocity v[i] lives between frame i and i+1 (index i in vel is frame i+1)
    const mag = (a) => Math.hypot(a[0], a[1], a[2]);
    for (let i = 0; i < vel.length; i++) if (vel[i] && !bad.has(i + 1)) speeds.push(mag(vel[i]));
    const accv = [];
    for (let i = 1; i < vel.length; i++) {
      const dt = (T[i + 1] - T[i - 1]) / 2;
      if (!vel[i] || !vel[i - 1] || dt <= 1e-4 || bad.has(i + 1) || bad.has(i)) { accv.push(null); continue; }
      const a = [(vel[i][0] - vel[i - 1][0]) / dt, (vel[i][1] - vel[i - 1][1]) / dt, (vel[i][2] - vel[i - 1][2]) / dt];
      accv.push(a); acc.push(mag(a));
    }
    for (let i = 1; i < accv.length; i++) {
      const dt = (T[i + 2] - T[i]) / 2;
      if (!accv[i] || !accv[i - 1] || dt <= 1e-4) continue;
      jerk.push(Math.hypot(accv[i][0] - accv[i - 1][0], accv[i][1] - accv[i - 1][1], accv[i][2] - accv[i - 1][2]) / dt);
    }
    return { maxSpeed: Math.max(0, ...speeds), maxAccel: Math.max(0, ...acc), p99Accel: pct(acc, 0.99), maxJerk: Math.max(0, ...jerk), p99Jerk: pct(jerk, 0.99), p50Jerk: pct(jerk, 0.5), samples: jerk.length };
  };
  let cuts = 0;
  for (let i = 1; i < n; i++) if (C[i] !== C[i - 1]) cuts++;
  const dts = []; for (let i = 1; i < n; i++) dts.push(T[i] - T[i - 1]);
  return { frames: n, seconds: n ? T[n - 1] - T[0] : 0, cuts, dtMedianMs: Math.round(pct(dts, 0.5) * 1000), dtP99Ms: Math.round(pct(dts, 0.99) * 1000), pos: metrics(P, false), view: metrics(D, true) };
}

export function fmt(r) {
  const f = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(2));
  return `frames ${r.frames} over ${r.seconds.toFixed(1)} s, cuts ${r.cuts}, dt median ${r.dtMedianMs} ms, p99 ${r.dtP99Ms} ms\n` +
    `  position: max speed ${f(r.pos.maxSpeed)} m/s, max accel ${f(r.pos.maxAccel)} (p99 ${f(r.pos.p99Accel)}) m/s2, max jerk ${f(r.pos.maxJerk)} (p99 ${f(r.pos.p99Jerk)}, p50 ${f(r.pos.p50Jerk)}) m/s3\n` +
    `  view dir: max rate ${f(r.view.maxSpeed)} rad/s, max accel ${f(r.view.maxAccel)} (p99 ${f(r.view.p99Accel)}) rad/s2, max jerk ${f(r.view.maxJerk)} (p99 ${f(r.view.p99Jerk)}, p50 ${f(r.view.p50Jerk)}) rad/s3`;
}

if (process.argv[1] && process.argv[1].endsWith('camlog.mjs') && process.argv[2]) {
  const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const r = analyze(j.log ?? j, j.stride ?? 9);
  console.log(fmt(r));
  if (j.inside) console.log(`inside a crown: ${j.inside.inside} of ${j.inside.frames} frames`, j.inside.byKind);
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify({ analysis: r, inside: j.inside }, null, 2));
}
