// Unit tests for the R8 bison behaviours: the session schedule, the tree grid, the sparring pairs and every pose with its offsets.
// Run: npx tsx src/render/behaviours.test.ts
import { AGENT_STRIDE, F_JUVENILE, F_MALE, Sp, St } from '../sim/types';
import { BEH, BisonBehaviour, MAX_OFF, SPAR_GAP, TreeGrid, alertYawCode, newBisonIn, newBisonOut, packBisonA, packBisonB, rutK, sessionAt } from './behaviours';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// ---- the schedule is a pure function of the id and the clock, with the share of time and the lengths asked for
{
  let active = 0, n = 0, minLen = 99, maxLen = 0, bad = 0;
  const o = { len: 0, n: 0 };
  for (let id = 1; id <= 40; id++) {
    for (let t = 0; t < 3000; t += 0.5) {
      const tau = sessionAt(id, 5, t, 40, 80, 0.5, 6, 10, o);
      n++;
      if (tau >= 0) {
        active++;
        minLen = Math.min(minLen, o.len);
        maxLen = Math.max(maxLen, o.len);
        if (tau >= o.len) bad++;
        if (sessionAt(id, 5, t, 40, 80, 0.5, 6, 10) !== tau) bad++;
      }
    }
  }
  const share = active / n;
  // (the windows run 40 to 80 s, 60 on average; half hold a session of 8 s on average: about 6.7%)
  ok(share > 0.05 && share < 0.085, `sessions fill about 6.7% of the time (${(share * 100).toFixed(1)}%)`);
  ok(minLen >= 6 - 1e-6 && maxLen <= 10 + 1e-6 && maxLen - minLen > 2, `lengths run 6 to 10 s (${minLen.toFixed(1)} to ${maxLen.toFixed(1)})`);
  ok(bad === 0, 'tau is inside the session and the same call gives the same answer');
  let diff = 0;
  for (let t = 0; t < 600; t += 1) if ((sessionAt(1, 5, t, 40, 80, 0.5, 8) >= 0) !== (sessionAt(2, 5, t, 40, 80, 0.5, 8) >= 0)) diff++;
  ok(diff > 20, 'two animals are not in step');
  ok(rutK(1.0) === 0 && rutK(1.8) > 0.9 && rutK(2.6) === 0, 'the rut runs from about 1.2 to 2.4');
}

// ---- the tree grid
{
  const trees = new Float32Array([100, 100, 10, 5, 140, 100, 20, 7, 30, 30, 3, 2]);
  const g = new TreeGrid();
  g.set(trees);
  const out = { x: 0, z: 0, r: 0 };
  ok(g.nearest(103, 100, 3, out) && out.x === 100 && Math.abs(out.r - 0.35) < 1e-6, 'finds the trunk 3 m off and its radius');
  ok(!g.nearest(110, 100, 3, out), 'nothing within reach 10 m from the next');
  ok(g.nearest(139, 100, 5, out) && out.x === 140, 'the nearest of several');
  ok(g.nearest(30.5, 30, 2, out) && out.r === 0.22, 'a sapling has a trunk the width of a post at least');
}

// ---- one bison step helper
const bb = new BisonBehaviour();
const inp = newBisonIn();
const out = newBisonOut();
function step(slot: number, over: Partial<typeof inp>, dt = 0.05): void {
  Object.assign(inp, { slot, id: 1000 + slot, state: St.Graze, spd: 0, flags: 0, x: 100, z: 100, dt, running: dt, timeScale: 1, season: 1.4, snow: 0, dry: 1, bare: 1, vs: 1, camD: 40, selfBellow: false }, over);
  bb.step(inp, out);
}
/** Run an animal for `secs` of clock from `t0` and gather what it does. */
function run(slot: number, over: Partial<typeof inp>, t0: number, secs: number): { now: Set<number>; maxOff: number; max: Record<string, number>; first: Record<string, number> } {
  const r = { now: new Set<number>(), maxOff: 0, max: { wallow: 0, rub: 0, spar: 0, dig: 0, bellow: 0, play: 0, lift: 0, air: 0, dust: 0 } as Record<string, number>, first: {} as Record<string, number> };
  for (let t = t0; t < t0 + secs; t += 0.05) {
    step(slot, { ...over, clock: t });
    r.now.add(out.now);
    r.maxOff = Math.max(r.maxOff, Math.hypot(out.ox, out.oz));
    for (const k of Object.keys(r.max)) { const v = (out as unknown as Record<string, number>)[k]; if (v > r.max[k]) { r.max[k] = v; } if (v > 0.5 && r.first[k] === undefined) r.first[k] = t; }
  }
  return r;
}

// ---- wallow: on bare dry ground, standing about, in summer; never on wet ground, in snow or in winter
{
  bb.reset(1);
  const r = run(1, {}, 0, 600);
  ok(r.now.has(BEH.Wallow) && r.max.wallow > 0.95, `a bison on bare dry ground wallows (peak ${r.max.wallow.toFixed(2)})`);
  ok(r.max.dust >= 4.9, 'and raises dust');
  ok(r.maxOff <= MAX_OFF + 1e-6, `within ${MAX_OFF} m of where it stands (${r.maxOff.toFixed(2)})`);
  for (const [name, over] of [['on damp ground', { dry: 0.2 }], ['on grass', { bare: 0.1 }], ['in snow', { snow: 0.5 }], ['in winter', { season: 3.3 }], ['while walking', { state: St.Walk, spd: 1.2 }], ['in a time-lapse', { timeScale: 10 }], ['far from the camera', { camD: 400 }]] as Array<[string, Partial<typeof inp>]>) {
    bb.reset(2);
    const q = run(2, over, 0, 900);
    ok(!q.now.has(BEH.Wallow) && q.max.wallow === 0, `no wallow ${name}`);
  }
  // it lies down for it (the pose asks for lying) and gets up after
  bb.reset(3);
  let lay = false, up = false;
  for (let t = 0; t < 600; t += 0.05) { step(3, { clock: t }); if (out.now === BEH.Wallow && out.lie === 1) lay = true; if (lay && out.now === BEH.None && out.lie < 0 && out.wallow === 0) up = true; }
  ok(lay && up, 'it lies down for the wallow and gets up after');
}

// ---- rub: walk to a tree, stand side-on, lean in, walk back
{
  const tg = new BisonBehaviour();
  tg.setTrees(new Float32Array([100, 100, 12, 6]));
  tg.reset(4);
  const i = newBisonIn();
  const o = newBisonOut();
  let rubbed = 0, maxOff = 0, minD = 99, faceOk = false;
  for (let t = 0; t < 400; t += 0.05) {
    Object.assign(i, { slot: 4, id: 2004, state: St.Idle, spd: 0, flags: 0, x: 102.6, z: 100.9, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.4, snow: 0, dry: 0.2, bare: 0.2, vs: 1, camD: 40, selfBellow: false });
    tg.step(i, o);
    if (o.rub > 0.9) {
      rubbed++;
      const px = i.x + o.ox, pz = i.z + o.oz;
      minD = Math.min(minD, Math.hypot(px - 100, pz - 100));
      // the tree must be on its right: right = (-sin h, cos h)
      const rx = -Math.sin(o.face), rz = Math.cos(o.face);
      const dx = 100 - px, dz = 100 - pz;
      const l = Math.hypot(dx, dz);
      if (o.faceOn && (rx * dx + rz * dz) / l > 0.98) faceOk = true;
    }
    maxOff = Math.max(maxOff, Math.hypot(o.ox, o.oz));
  }
  ok(rubbed > 50, `a bison within reach of a tree rubs against it now and then (${rubbed} frames)`);
  ok(maxOff <= MAX_OFF + 1e-6, `the walk to the tree is within ${MAX_OFF} m (${maxOff.toFixed(2)})`);
  ok(minD > 0.5 && minD < 1.3, `it stands against the bark, not in it (${minD.toFixed(2)} m from the trunk centre)`);
  ok(faceOk, 'side-on, the tree on its right');
  // out of reach: none
  const far = new BisonBehaviour();
  far.setTrees(new Float32Array([100, 100, 12, 6]));
  far.reset(5);
  let any = false;
  for (let t = 0; t < 400; t += 0.05) { Object.assign(i, { slot: 5, id: 2005, state: St.Idle, spd: 0, flags: 0, x: 108, z: 100, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.4, snow: 0, dry: 0.2, bare: 0.2, vs: 1, camD: 40, selfBellow: false }); far.step(i, o); if (o.rub > 0.1) any = true; }
  ok(!any, 'a bison 8 m from the nearest tree does not rub');
}

// ---- spar: two bulls within 6 m, grazing, in season
{
  const sb = new BisonBehaviour();
  const N = 4;
  const agents = new Float32Array(N * AGENT_STRIDE);
  const ids = new Uint32Array([11, 12, 13, 14]);
  const slots = new Int32Array([0, 1, 2, 3]);
  const put = (k: number, x: number, z: number, fl: number, st: number): void => {
    const o = k * AGENT_STRIDE;
    agents[o] = Sp.Bison; agents[o + 1] = x; agents[o + 2] = z; agents[o + 4] = 0; agents[o + 7] = st; agents[o + 8] = fl;
  };
  put(0, 200, 200, F_MALE, St.Graze);
  put(1, 204.5, 201, F_MALE, St.Graze);
  put(2, 300, 300, F_MALE, St.Graze); // alone
  put(3, 302, 300, F_MALE | F_JUVENILE, St.Graze); // a young bull: not a sparring partner
  for (let s = 0; s < N; s++) sb.reset(s);
  sb.planPairs(agents, ids, N, slots, 200, 200, 1.4);
  // peek at the pairing through behaviour: both bulls of the pair spar, the loner and the young one never do
  const seen = [false, false, false, false];
  const offs = [0, 0, 0, 0];
  const lock: number[] = [0, 0];
  for (let t = 0; t < 900; t += 0.05) {
    for (let k = 0; k < N; k++) {
      Object.assign(inp, { slot: k, id: ids[k], state: St.Graze, spd: 0, flags: agents[k * AGENT_STRIDE + 8], x: agents[k * AGENT_STRIDE + 1], z: agents[k * AGENT_STRIDE + 2], dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.4, snow: 0, dry: 0.2, bare: 0.2, vs: 1, camD: 40, selfBellow: false });
      sb.step(inp, out);
      if (out.spar > 0.9) { seen[k] = true; if (k < 2) lock[k] = out.sparPh; }
      offs[k] = Math.max(offs[k], Math.hypot(out.ox, out.oz));
    }
  }
  ok(seen[0] && seen[1], 'two bulls 4.6 m apart, grazing, in the rut, spar');
  ok(!seen[2] && !seen[3], 'a lone bull and a young one do not');
  ok(lock[0] !== lock[1], 'the two shove half a cycle apart');
  ok(offs[0] <= MAX_OFF && offs[1] <= MAX_OFF && offs[0] > 0.2, `each walks up, not far (${offs[0].toFixed(2)} and ${offs[1].toFixed(2)} m)`);
  // out of season: nobody is paired
  const sb2 = new BisonBehaviour();
  for (let s = 0; s < N; s++) sb2.reset(s);
  sb2.planPairs(agents, ids, N, slots, 200, 200, 2.6);
  let any = false;
  for (let t = 0; t < 400; t += 0.05) { Object.assign(inp, { slot: 0, id: 11, state: St.Graze, spd: 0, flags: F_MALE, x: 200, z: 200, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 2.6, snow: 0, dry: 0.2, bare: 0.2, vs: 1, camD: 40, selfBellow: false }); sb2.step(inp, out); if (out.spar > 0.1) any = true; }
  ok(!any, 'no sparring after the summer');
  // the heads meet: two bulls end SPAR_GAP apart, facing each other
  const sb3 = new BisonBehaviour();
  for (let s = 0; s < 2; s++) sb3.reset(s);
  sb3.planPairs(agents, ids, 2, slots, 200, 200, 1.4);
  let gap = 99, faced = false;
  for (let t = 0; t < 900; t += 0.05) {
    const p: Array<{ x: number; z: number; f: number; on: boolean; sp: number }> = [];
    for (let k = 0; k < 2; k++) {
      Object.assign(inp, { slot: k, id: ids[k], state: St.Graze, spd: 0, flags: F_MALE, x: agents[k * AGENT_STRIDE + 1], z: agents[k * AGENT_STRIDE + 2], dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.4, snow: 0, dry: 0.2, bare: 0.2, vs: 1, camD: 40, selfBellow: false });
      sb3.step(inp, out);
      p.push({ x: inp.x + out.ox, z: inp.z + out.oz, f: out.face, on: out.faceOn, sp: out.spar });
    }
    if (p[0].sp > 0.95 && p[1].sp > 0.95) {
      gap = Math.min(gap, Math.hypot(p[0].x - p[1].x, p[0].z - p[1].z));
      const toB = Math.atan2(p[1].z - p[0].z, p[1].x - p[0].x);
      if (Math.cos(p[0].f - toB) > 0.99 && Math.cos(p[1].f - (toB + Math.PI)) > 0.99) faced = true;
    }
  }
  ok(Math.abs(gap - SPAR_GAP) < 0.3, `foreheads meet: the centres end ${gap.toFixed(2)} m apart`);
  ok(faced, 'each faces the other');
}

// ---- bellow: asked for by the audio, a bull raises its head for the clip, and nobody else does; with no audio a bull in the rut bellows on its own
{
  const bl = new BisonBehaviour();
  bl.reset(6);
  bl.reset(7);
  const i = newBisonIn();
  const o = newBisonOut();
  bl.startBellow(6, 4.6, 50);
  let on = 0, started = 0, peak = 0, other = 0;
  for (let t = 49; t < 60; t += 0.05) {
    Object.assign(i, { slot: 6, id: 2006, state: St.Graze, spd: 0, flags: F_MALE, x: 100, z: 100, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.8, camD: 30, dry: 0.2, bare: 0.2, snow: 0, vs: 1, selfBellow: false });
    bl.step(i, o);
    if (o.now === BEH.Bellow) on += 0.05;
    if (o.bellowStarted) started++;
    peak = Math.max(peak, o.bellow);
    Object.assign(i, { slot: 7, id: 2007 });
    bl.step(i, o);
    other = Math.max(other, o.bellow);
  }
  ok(Math.abs(on - 4.6) < 0.2 && started === 1 && peak > 0.95, `the bull bellows for the length of the clip, once (${on.toFixed(1)} s, ${started} start, peak ${peak.toFixed(2)})`);
  ok(other === 0, 'and the bull next to it does not');
  ok(bl.quietFor(60) > 9 && bl.quietFor(60) < 11, 'the layer knows how long the audio has been quiet');
  // self-made: only in the rut, only a bull, only when the audio is quiet
  const sm = new BisonBehaviour();
  sm.reset(8);
  const count = (over: Partial<typeof inp>): number => { let n = 0; for (let t = 0; t < 1200; t += 0.05) { Object.assign(i, { slot: 8, id: 2008, state: St.Graze, spd: 0, flags: F_MALE, x: 100, z: 100, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.8, camD: 30, dry: 0.2, bare: 0.2, snow: 0, vs: 1, selfBellow: true, ...over }); sm.step(i, o); if (o.bellowStarted) n++; } return n; };
  ok(count({}) >= 3, 'a bull bellows on its own now and then in the rut');
  ok(count({ season: 0.5 }) === 0 && count({ selfBellow: false }) === 0 && count({ flags: 0 }) === 0, 'not out of season, not while the audio is calling, not a cow');
}

// ---- snow dig and calf play
{
  const d = new BisonBehaviour();
  d.reset(9);
  const i = newBisonIn();
  const o = newBisonOut();
  let dig = 0;
  for (let t = 0; t < 20; t += 0.05) { Object.assign(i, { slot: 9, id: 2009, state: St.Graze, spd: 0.2, flags: 0, x: 100, z: 100, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 3.4, camD: 30, dry: 0, bare: 0, snow: 0.4, vs: 1, selfBellow: false }); d.step(i, o); dig = Math.max(dig, o.dig); }
  ok(dig > 0.95 && o.head === 1, 'a bison grazing in snow swings its head down and across');
  d.reset(9);
  dig = 0;
  for (let t = 0; t < 20; t += 0.05) { Object.assign(i, { slot: 9, id: 2009, state: St.Graze, spd: 0.2, flags: 0, x: 100, z: 100, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.4, camD: 30, dry: 1, bare: 0, snow: 0, vs: 1, selfBellow: false }); d.step(i, o); dig = Math.max(dig, o.dig); }
  ok(dig === 0, 'none on bare ground');
  const c = new BisonBehaviour();
  c.reset(10);
  let play = 0, maxOff = 0, lift = 0, air = 0, endOff = 0, was = false, sessions = 0, spd = 0;
  for (let t = 0; t < 400; t += 0.05) {
    Object.assign(i, { slot: 10, id: 2010, state: St.Graze, spd: 0, flags: F_JUVENILE, x: 100, z: 100, dt: 0.05, running: 0.05, timeScale: 1, clock: t, season: 1.0, camD: 30, dry: 0.2, bare: 0.2, snow: 0, vs: 0.55, selfBellow: false });
    c.step(i, o);
    play = Math.max(play, o.play);
    maxOff = Math.max(maxOff, Math.hypot(o.ox, o.oz));
    lift = Math.max(lift, o.lift);
    air = Math.max(air, o.air);
    spd = Math.max(spd, o.spd);
    const on = o.now === BEH.Play;
    if (on && !was) sessions++;
    if (!on && was) endOff = Math.hypot(o.ox, o.oz);
    was = on;
  }
  ok(sessions >= 5 && play > 0.95, `a calf plays every 10 to 30 s (${sessions} sessions in 400 s)`);
  ok(maxOff > 0.8 && maxOff <= MAX_OFF, `the ring is within ${MAX_OFF} m of its spot (${maxOff.toFixed(2)})`);
  ok(lift > 0.1 && air > 0.9, 'it bucks off the ground, feet tucked');
  ok(endOff < 0.5, `and a session ends back at its spot (${endOff.toFixed(2)})`);
  ok(spd > 1.5, `at a calf's run (${spd.toFixed(1)} m/s)`);
}

// ---- the two floats the shader reads: every weight comes back in 6-bit steps, an animal with nothing on packs to exactly 0
{
  const o = newBisonOut();
  ok(packBisonA(o) === 0 && packBisonB(o) === 0, 'nothing going on packs to 0');
  Object.assign(o, { dig: 0.5, wallow: 1, rub: 0.25, air: 1, bellow: 0.75, play: 1, spar: 0.6, sparPh: 0.5 });
  const a = packBisonA(o), b = packBisonB(o);
  let q = Math.floor(a / 262144);
  ok(q === 15, 'air');
  let r = a - q * 262144;
  q = Math.floor(r / 4096); ok(Math.abs(q / 63 - 0.25) < 0.01, 'rub'); r -= q * 4096;
  q = Math.floor(r / 64); ok(q === 63, 'wallow'); r -= q * 64;
  ok(Math.abs(r / 63 - 0.5) < 0.01, 'dig');
  q = Math.floor(b / 262144); ok(q === 1, 'the later bull is marked');
  r = b - q * 262144;
  q = Math.floor(r / 4096); ok(Math.abs(q / 63 - 0.6) < 0.01, 'spar'); r -= q * 4096;
  q = Math.floor(r / 64); ok(q === 63, 'play'); r -= q * 64;
  ok(Math.abs(r / 63 - 0.75) < 0.01, 'bellow');
  ok(a < 16777216 && b < 16777216, 'both fit a float exactly');
  o.spar = 0;
  ok(packBisonB(o) === Math.round(0.75 * 63) + 64 * 63, 'a bull that is not shoving carries no mark');
}

// ---- r-alert2: the head yaw of a watching bison rides in the top bits of the two floats, decoded as the shader does (models/shader.ts, BEHAV), beside every other weight
{
  const o = newBisonOut();
  Object.assign(o, { dig: 1, wallow: 0.5, rub: 1, air: 1, bellow: 1, play: 0.4, spar: 1, sparPh: 0.5 });
  let worst = 0, exact = true, others = true;
  for (let c = 1; c <= 127; c++) {
    const a = packBisonA(o, c), b = packBisonB(o, c);
    if (Math.fround(a) !== a || Math.fround(b) !== b || a >= 16777216 || b >= 16777216) exact = false;
    let pa = a, pb = b;
    const yq = Math.floor(pa / 4194304); pa -= yq * 4194304;
    let yc = Math.floor(pb / 524288); pb -= yc * 524288;
    yc = yc * 4 + yq;
    const yaw = yc > 0.5 ? ((yc - 64) / 63) * 1.0 : 0;
    worst = Math.max(worst, Math.abs(yaw - (c - 64) / 63));
    if (yc !== c) others = false;
    // the rest decodes as before
    let q = Math.floor(pa / 262144); if (q !== 15) others = false; pa -= q * 262144;
    q = Math.floor(pa / 4096); if (q !== 63) others = false; pa -= q * 4096;
    q = Math.floor(pa / 64); if (q !== Math.round(0.5 * 63)) others = false; pa -= q * 64;
    if (pa !== 63) others = false;
    q = Math.floor(pb / 262144); if (q !== 1) others = false; pb -= q * 262144;
    q = Math.floor(pb / 4096); if (q !== 63) others = false; pb -= q * 4096;
    q = Math.floor(pb / 64); if (q !== Math.round(0.4 * 63)) others = false; pb -= q * 64;
    if (pb !== 63) others = false;
  }
  ok(exact, 'the yaw code leaves both floats exact (below 2^24)');
  ok(others && worst < 1e-9, 'all 127 yaw codes round trip beside the seven weights');
  ok(alertYawCode(0, 1) === 64 && alertYawCode(1, 1) === 127 && alertYawCode(-1, 1) === 1 && alertYawCode(5, 1) === 127, 'the code: 64 straight on, 1..127 across the range, clamped');
  ok(packBisonA(newBisonOut()) === 0 && packBisonB(newBisonOut()) === 0, 'no yaw, nothing else: still 0');
}

// ---- in a time-lapse, or far from the camera, nothing is displaced and every weight eases to nothing
{
  const t = new BisonBehaviour();
  t.reset(11);
  const i = newBisonIn();
  const o = newBisonOut();
  let moved = 0;
  for (let k = 0; k < 6000; k++) {
    Object.assign(i, { slot: 11, id: 2011, state: St.Graze, spd: 0, flags: F_JUVENILE, x: 100, z: 100, dt: 0.05, running: 0.05, timeScale: k < 3000 ? 1 : 10, clock: k * 0.05, season: 1.0, camD: 30, dry: 1, bare: 1, snow: 0, vs: 0.55, selfBellow: false });
    t.step(i, o);
    if (k >= 3100 && (o.ox !== 0 || o.oz !== 0 || o.play > 0 || o.wallow > 0)) moved++;
  }
  ok(moved === 0, 'at 10x the offsets and the poses are gone');
}

console.log(`${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
