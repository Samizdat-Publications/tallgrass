// Unit tests for the render-side canid state (R3): the mousing leap, the chorus pose, mange packing and migrant columns.
// Run: npx tsx src/render/canids.test.ts
import { F_MANGE, F_MIGRANT, Sp, St } from '../sim/types';
import { CanidState, LEAP_TIME, PIN_TIME, newIn, newOut } from './canids';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const cs = new CanidState();
const inp = newIn();
const out = newOut();
function frame(slot: number, over: Partial<typeof inp>, dt = 0.05): void {
  Object.assign(inp, { slot, id: 100 + slot, sp: Sp.Coyote, state: St.Idle, spd: 0, flags: 0, energy: 1, x: 100, z: 100, h: 0.5, dt, running: dt, timeScale: 1, vs: 1.35 }, over);
  cs.step(inp, out);
}

// ---- mousing: stand still in the stalk, then a leap that lifts off, arcs and lands, then pins, then ends
{
  cs.reset(3);
  let clock = 0, began = -1, maxLift = 0, maxAir = 0, landed = false, ended = -1, minPitch = 0, maxPitch = 0;
  for (let i = 0; i < 600; i++) {
    clock += 0.05;
    frame(3, { state: St.Stalk, spd: 0, clock });
    if (out.leapStarted && began < 0) began = clock;
    maxLift = Math.max(maxLift, out.lift);
    maxAir = Math.max(maxAir, out.air);
    minPitch = Math.min(minPitch, out.pitch);
    maxPitch = Math.max(maxPitch, out.pitch);
    if (out.landed) landed = true;
    if (began > 0 && clock > began + LEAP_TIME + PIN_TIME + 0.2 && out.air === 0 && out.lift === 0 && ended < 0) ended = clock;
  }
  ok(began > 1.2 && began < 3.6, `a coyote mousing springs after 1.2 to 2.8 s of stillness (began ${began.toFixed(2)})`);
  ok(maxLift > 0.6 && maxLift < 1.2, `the arc peaks at about 0.8 m (peak ${maxLift.toFixed(2)})`);
  ok(maxAir > 0.99, 'fully off the ground at the top');
  ok(landed, 'a landing is reported');
  ok(maxPitch > 0.3 && minPitch < -0.6, `nose up at the spring, down at the landing (${maxPitch.toFixed(2)}, ${minPitch.toFixed(2)})`);
  ok(ended > 0, 'the leap ends');
  // it travelled forward along its heading: the offset after the first leap is about the reach, along h
  cs.reset(4);
  let clk = 0;
  let o0 = 0, o1 = 0;
  for (let i = 0; i < 90; i++) { clk += 0.05; frame(4, { state: St.Stalk, spd: 0, clock: clk }); }
  o0 = Math.hypot(out.ox, out.oz);
  for (let i = 0; i < 40; i++) { clk += 0.05; frame(4, { state: St.Stalk, spd: 0, clock: clk }); }
  o1 = Math.hypot(out.ox, out.oz);
  ok(o1 >= o0 - 1e-6 && o1 < 3, `the offset builds while it mouses and stays bounded (${o0.toFixed(2)} -> ${o1.toFixed(2)})`);
  // and melts away when it walks off
  for (let i = 0; i < 200; i++) { clk += 0.05; frame(4, { state: St.Walk, spd: 1.3, clock: clk }); }
  ok(Math.hypot(out.ox, out.oz) < 1e-3, 'the offset melts away once it moves on');
  // a wolf never leaps, and a stalker that is moving does not either
  cs.reset(5);
  let leaped = false;
  for (let i = 0; i < 300; i++) { clk += 0.05; frame(5, { sp: Sp.Wolf, state: St.Stalk, spd: 0, clock: clk }); if (out.leapStarted) leaped = true; }
  ok(!leaped, 'wolves do not mouse');
  cs.reset(6);
  for (let i = 0; i < 300; i++) { clk += 0.05; frame(6, { state: St.Stalk, spd: 1, clock: clk }); if (out.leapStarted) leaped = true; }
  ok(!leaped, 'a coyote stalking on the move does not leap');
}

// ---- the chorus: a resting coyote near the site sits up for the call, then settles
{
  cs.reset(7);
  cs.reset(8);
  cs.startChorus(100, 100, 8, 10, true);
  let clock = 10, sat = 0, yipQ = 0;
  for (let i = 0; i < 400; i++) {
    clock += 0.05;
    frame(7, { state: St.Rest, clock });
    if (out.howl > sat) sat = out.howl;
    if (Math.floor(out.pack / 16) >= 11) yipQ = 1;
    if (i === 100) ok(out.howl > 0.9 && out.howlWant, 'sitting 5 s into the call');
  }
  ok(sat > 0.95, 'it sits fully up');
  ok(yipQ === 1, 'it yips in the second part of the call');
  ok(out.howl === 0 && !out.howlWant, 'and settles after');
  // one far away or not resting is left alone
  cs.startChorus(100, 100, 8, 500, true);
  clock = 500;
  let far = 0, awake = 0;
  for (let i = 0; i < 100; i++) {
    clock += 0.05;
    frame(8, { state: St.Rest, x: 400, z: 400, clock });
    far = Math.max(far, out.howl);
    frame(8, { state: St.Walk, spd: 1, clock });
    awake = Math.max(awake, out.howl);
  }
  ok(far === 0, 'a coyote far from the site does not join');
  ok(awake === 0, 'a coyote that is walking does not sit');
  ok(cs.choirOn(502) && !cs.choirOn(520), 'choirOn follows the window');
  // with no audio for a while the layer makes its own at dusk, once, then waits
  const cs2 = new CanidState();
  let made = 0;
  for (let t = 0; t < 400; t += 1) if (cs2.maybeSelfChorus(t, true, 1, () => ({ x: 1, z: 2 }))) made++;
  ok(made >= 3 && made <= 10, `self-made choruses at dusk come every 30 to 70 s (${made} in 400 s)`);
  const cs3 = new CanidState();
  cs3.startChorus(0, 0, 8, 5, true);
  let made3 = 0;
  for (let t = 5; t < 140; t += 1) if (cs3.maybeSelfChorus(t, true, 1, () => ({ x: 1, z: 2 }))) made3++;
  ok(made3 === 0, 'no self-made chorus while the audio is calling');
  let made4 = 0;
  for (let t = 0; t < 400; t += 1) if (new CanidState().maybeSelfChorus(t, false, 1, () => ({ x: 1, z: 2 }))) made4++;
  ok(made4 === 0, 'none by day');
}

// ---- mange: the flag packs a severity in the fraction, and the air and howl bits stay clear of it
{
  cs.reset(9);
  let clock = 0;
  for (let i = 0; i < 200; i++) { clock += 0.05; frame(9, { flags: F_MANGE, energy: 0.2, clock }); }
  const frac = out.pack - Math.floor(out.pack);
  ok(frac > 0.8 && frac < 1, `a run-down mangy animal is badly mangy (${frac.toFixed(2)})`);
  ok(Math.floor(out.pack) === 0, 'and nothing else is set');
  cs.reset(10);
  for (let i = 0; i < 200; i++) { clock += 0.05; frame(10, { flags: 0, clock }); }
  ok(out.pack === 0, 'a healthy one packs nothing');
  cs.reset(11);
  for (let i = 0; i < 200; i++) { clock += 0.05; frame(11, { sp: Sp.Wolf, flags: F_MANGE, energy: 1, clock }); }
  const f2 = out.pack - Math.floor(out.pack);
  ok(f2 > 0.45 && f2 < 0.6, `a mangy wolf in condition is moderately mangy (${f2.toFixed(2)})`);
}

// ---- migrant columns
{
  const N = 6;
  const agents = new Float32Array(N * 12);
  const slots = new Int32Array(N);
  const h = 0.6;
  for (let i = 0; i < N; i++) {
    const lat = (i - 2.5) * 5.5;
    agents[i * 12] = Sp.Deer;
    agents[i * 12 + 1] = 200 - Math.sin(h) * lat;
    agents[i * 12 + 2] = 200 + Math.cos(h) * lat;
    agents[i * 12 + 3] = h;
    agents[i * 12 + 4] = 1.6;
    agents[i * 12 + 7] = St.Migrate;
    agents[i * 12 + 8] = F_MIGRANT;
    slots[i] = 20 + i;
    cs.reset(20 + i);
  }
  cs.planColumns(agents, N, slots, () => 1.6, () => false);
  let clock = 0;
  const pos: Array<{ al: number; lat: number }> = [];
  for (let step = 0; step < 200; step++) {
    clock += 0.05;
    for (let i = 0; i < N; i++) {
      frame(20 + i, { sp: Sp.Deer, state: St.Migrate, spd: 1.6, flags: F_MIGRANT, x: agents[i * 12 + 1], z: agents[i * 12 + 2], clock }, 0.05);
      if (step === 199) {
        const x = agents[i * 12 + 1] + out.ox - 200, z = agents[i * 12 + 2] + out.oz - 200;
        pos.push({ al: x * Math.cos(h) + z * Math.sin(h), lat: -x * Math.sin(h) + z * Math.cos(h) });
      }
    }
  }
  const spread = (a: number[]): number => Math.max(...a) - Math.min(...a);
  ok(spread(pos.map((p) => p.lat)) < 3, `a line abreast 27 m wide becomes a file (width ${spread(pos.map((p) => p.lat)).toFixed(1)} m)`);
  const als = pos.map((p) => p.al).sort((a, b) => a - b);
  let minGap = 99;
  for (let i = 1; i < als.length; i++) minGap = Math.min(minGap, als[i] - als[i - 1]);
  ok(minGap > 1.8, `with room between them (gap ${minGap.toFixed(1)} m)`);
  ok(spread(als) < 30, `and a short column (${spread(als).toFixed(1)} m)`);
  // a lone migrant, or two different species, are not put in a column
  const lone = new Float32Array(12);
  lone[0] = Sp.Deer; lone[4] = 1.6; lone[8] = F_MIGRANT;
  cs.reset(40);
  cs.planColumns(lone, 1, new Int32Array([40]), () => 1.6, () => false);
  for (let i = 0; i < 100; i++) frame(40, { sp: Sp.Deer, state: St.Migrate, spd: 1.6, flags: F_MIGRANT, clock: i * 0.05 });
  ok(out.ox === 0 && out.oz === 0, 'a lone migrant is left where it is');
  // plan again with nobody migrating: the targets clear and the offsets ease back
  cs.planColumns(new Float32Array(0), 0, new Int32Array(0), () => 1.6, () => false);
  for (let i = 0; i < 400; i++) frame(20, { sp: Sp.Deer, state: St.Walk, spd: 1.2, clock: i * 0.05 });
  ok(Math.abs(out.ox) + Math.abs(out.oz) < 1e-3, 'the file breaks up when the group stops migrating');
}

console.log(`${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
