// Unit tests for storm cells and lightning (V2-PLAN.md S6). Run: npx tsx src/sim/storms.test.ts
import { MAX_STORM_CELLS, STORM_EXIT_M, STORM_STRIDE, STRIKE_STRIDE, StormCells } from './storms';
import { createSim } from './sim';
import { EnvState, Weather } from './types';

let failures = 0;
function ok(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

const SIZE = 512;
function env(over: Partial<EnvState> = {}): EnvState {
  return { tick: 0, year: 0, season: 2, dayFrac: 0.5, weather: Weather.Clear, rain: 0, windDir: 0, windStrength: 0.45, warmth: 0.7, ...over };
}
const dry = () => 0.8;

// no storm weather, no cells, and no draws taken from the stream
{
  const s = new StormCells(1, SIZE, { lightningRate: 1, lightningIgnite: 1 });
  const before = s.rng.getState().join();
  for (let t = 0; t < 100; t++) s.update(t, env(), dry);
  ok(s.cells.length === 0, 'clear weather spawns no cells');
  ok(s.rng.getState().join() === before, 'clear weather draws nothing');
  ok(s.toArray(env(), 0).length === 0, 'no cells, no blizzard: empty snapshot array');
}

// a storm day spawns 1 or 2 cells upwind of the valley, moving with the wind
{
  let two = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const wind = (seed * 0.7) % (2 * Math.PI);
    const s = new StormCells(seed, SIZE, { lightningRate: 0, lightningIgnite: 0 });
    s.update(0, env({ weather: Weather.Storm, windDir: wind }), dry);
    const n = s.cells.length;
    ok(n === 1 || n === 2, `seed ${seed}: 1 or 2 cells (got ${n})`);
    if (n === 2) two++;
    ok(s.starts.length === 3 && s.starts[2] === n, 'one storm start with the cell count');
    const dx = Math.cos(wind), dy = Math.sin(wind);
    const extent = (SIZE / 2) * (Math.abs(dx) + Math.abs(dy));
    for (const c of s.cells) {
      const along = ((c.x - SIZE / 2) * dx + (c.y - SIZE / 2) * dy);
      ok(along <= -(extent + 149) && along >= -(extent + 251) - 5, `seed ${seed}: spawns 150 to 250 m upwind of the valley edge (along ${along.toFixed(1)}, extent ${extent.toFixed(1)})`);
      const sp = Math.hypot(c.vx, c.vy) / 0.15;
      ok(sp >= 2.49 && sp <= 5.01, `seed ${seed}: speed 2.5 to 5 m/s (got ${sp.toFixed(2)})`);
      ok(c.r >= 60 && c.r <= 120, `seed ${seed}: radius 60 to 120 m`);
      ok(Math.abs(c.vx / (c.vx * c.vx + c.vy * c.vy) ** 0.5 - dx) < 1e-9, `seed ${seed}: moves with the wind`);
    }
    // a second Storm tick is the same storm: no new cells
    s.update(1, env({ weather: Weather.Storm, windDir: wind }), dry);
    ok(s.cells.length === n && s.starts.length === 0, 'one storm start per storm');
  }
  ok(two > 50 && two < 110, `second cell about 40% of storms (got ${two}/200)`);
}

// motion and exit
{
  const s = new StormCells(5, SIZE, { lightningRate: 0, lightningIgnite: 0 });
  s.spawn(-200, 256, 0.5, 0, 80, 1, 5000);
  s.update(0, env(), dry);
  ok(Math.abs(s.cells[0].x - -199.5) < 1e-9 && s.cells[0].y === 256, 'cell moves vx per tick');
  let t = 1;
  while (s.cells.length && t < 5000) s.update(t++, env(), dry);
  ok(s.cells.length === 0, 'cell leaves');
  // exit when 400 m past the centre along the track: x = 256 + 400 = 656
  ok(Math.abs(t - (656 + 200) / 0.5) <= 2, `cell dropped at 400 m past the centre (tick ${t})`);
  // life ends a cell early
  const s2 = new StormCells(5, SIZE, { lightningRate: 0, lightningIgnite: 0 });
  s2.spawn(0, 0, 0.1, 0, 80, 1, 10);
  for (let k = 0; k < 10; k++) s2.update(k, env(), dry);
  ok(s2.cells.length === 0, 'cell dies when its life runs out');
  ok(STORM_EXIT_M === 400, 'exit constant');
  // at most 4 cells
  const s3 = new StormCells(5, SIZE, { lightningRate: 0, lightningIgnite: 0 });
  for (let k = 0; k < 9; k++) s3.spawn(0, 0, 0, 0, 80, 1, 100);
  ok(s3.cells.length === MAX_STORM_CELLS, 'cell cap');
}

// strikes: certain at rate 1 with intensity 1, never at rate 0, and always inside the cell
{
  const s = new StormCells(9, SIZE, { lightningRate: 1, lightningIgnite: 0 });
  s.spawn(256, 256, 0, 0, 100, 1, 1000);
  // age 0 has intensity 0 (swells from nothing); step to mid life
  for (let t = 0; t < 500; t++) s.update(t, env({ season: 0.5 }), dry);
  const strikes = s.drainStrikes();
  ok(strikes.length % STRIKE_STRIDE === 0 && strikes.length > 0, 'strikes recorded');
  ok(s.drainStrikes().length === 0, 'drain clears the buffer');
  for (let k = 0; k < strikes.length; k += STRIKE_STRIDE) {
    ok(Math.hypot(strikes[k] - 256, strikes[k + 1] - 256) <= 100.001, 'strike inside the cell');
    ok(strikes[k + 3] === 0, 'no ignition when lightningIgnite is 0');
  }
  const z = new StormCells(9, SIZE, { lightningRate: 0, lightningIgnite: 1 });
  z.spawn(256, 256, 0, 0, 100, 1, 1000);
  for (let t = 0; t < 500; t++) z.update(t, env(), dry);
  ok(z.drainStrikes().length === 0 && z.fires.length === 0, 'rate 0, no strikes');
  // the strike buffer is capped when nobody drains it
  const c = new StormCells(9, SIZE, { lightningRate: 1, lightningIgnite: 0 });
  c.spawn(256, 256, 0, 0, 100, 1, 100000);
  for (let t = 0; t < 5000; t++) c.update(t, env(), dry);
  ok(c.drainStrikes().length <= 64 * STRIKE_STRIDE, 'undrained strikes are capped');
}

// ignition gates: season window, rain, fuel; and the snapshot flag
{
  function fires(e: Partial<EnvState>, fuel: number, ign = 1, rate = 1): { fires: number; flagged: number } {
    const s = new StormCells(3, SIZE, { lightningRate: rate, lightningIgnite: ign });
    s.spawn(256, 256, 0, 0, 100, 1, 2000);
    let n = 0;
    for (let t = 0; t < 1000; t++) {
      s.update(t, env(e), () => fuel);
      n += s.fires.length / 2;
    }
    const st = s.drainStrikes();
    let flagged = 0;
    for (let k = 3; k < st.length; k += STRIKE_STRIDE) flagged += st[k];
    return { fires: n, flagged };
  }
  const base = fires({ season: 2, rain: 0 }, 0.8);
  ok(base.fires > 100, `dry cured grass in season ignites (got ${base.fires})`);
  ok(base.flagged > 0 && base.flagged <= base.fires, 'strikes record whether they ignited (buffer keeps the latest 64)');
  ok(fires({ season: 1.0, rain: 0 }, 0.8).fires === 0, 'too early in summer: no fires');
  ok(fires({ season: 3.5, rain: 0 }, 0.8).fires === 0, 'winter: no fires');
  ok(fires({ season: 1.4, rain: 0 }, 0.8).fires > 0 && fires({ season: 3.1, rain: 0 }, 0.8).fires > 0, 'window edges are inclusive');
  ok(fires({ season: 2, rain: 0.35 }, 0.8).fires === 0, 'rain at 0.35: no fires');
  ok(fires({ season: 2, rain: 0.34 }, 0.8).fires > 0, 'rain just under 0.35: fires');
  ok(fires({ season: 2, rain: 0 }, 0.3).fires === 0, 'grass at 0.3 is not enough');
  ok(fires({ season: 2, rain: 0 }, 0.31).fires > 0, 'grass above 0.3 burns');
  ok(fires({ season: 2, rain: 0 }, 0.8, 0).fires === 0, 'lightningIgnite 0: no fires');
  const half = fires({ season: 2, rain: 0 }, 0.8, 0.15, 1);
  ok(half.fires > 0 && half.fires < base.fires * 0.3, `lightningIgnite scales fires (got ${half.fires} vs ${base.fires})`);
}

// determinism: same seed, same sequence; different seed, different
{
  function run(seed: number): string {
    const s = new StormCells(seed, SIZE, { lightningRate: 0.2, lightningIgnite: 0.5 });
    const out: number[] = [];
    for (let t = 0; t < 3000; t++) {
      s.update(t, env({ weather: t % 1000 === 0 ? Weather.Storm : Weather.Clear, windDir: 1 }), dry);
      if (t % 1000 === 0) out.push(...s.starts);
      out.push(...s.fires);
    }
    return out.join(',') + '|' + Array.from(s.drainStrikes()).join(',');
  }
  ok(run(4) === run(4), 'same seed repeats');
  ok(run(4) !== run(5), 'different seed differs');
}

// blizzard look: snow and strong wind, no cells, no draws
{
  const s = new StormCells(2, SIZE, { lightningRate: 1, lightningIgnite: 1 });
  const before = s.rng.getState().join();
  const calm = s.toArray(env({ weather: Weather.Snow, windStrength: 0.5 }), 10);
  const gale = s.toArray(env({ weather: Weather.Snow, windStrength: 0.8 }), 10);
  ok(calm.length === 0, 'light snow: no cell');
  ok(gale.length === STORM_STRIDE && gale[4] === 1 && gale[3] > 0.7, 'blizzard cell over the valley, kind 1');
  ok(s.rng.getState().join() === before, 'blizzard look takes no draws');
}

// in the sim: off is inert, on has columns, a forced storm moves cells and shows up in the snapshot
{
  const off = createSim({ seed: 3 });
  off.step(50);
  ok(off.storms === null, 'stormCells 0: no StormCells object');
  const rowOff = off.sample();
  ok(rowOff.fires_lightning === 0 && rowOff.storm_cells === 0, 'off: columns are zero');
  const so = off.snapshot(false);
  ok(so.storms === undefined && so.strikes === undefined, 'off: no storms in the snapshot');

  const on = createSim({ seed: 3, params: { stormCells: 1, lightningRate: 0.5, lightningIgnite: 1 } });
  ok(on.storms !== null, 'stormCells 1: object exists');
  // force a storm day: the env flag is private, so poke it
  (on.env as unknown as { storm: boolean }).storm = true;
  on.apply({ kind: 'rain', ticks: 400 });
  on.step(20);
  ok(on.env.state.weather === Weather.Storm, 'forced storm weather');
  ok(on.storms!.cells.length >= 1, 'storm weather spawns cells in the sim');
  ok(on.events.some((e) => e.kind === 'storm'), 'storm event emitted');
  on.step(1500);
  const snap = on.snapshot(false);
  ok(snap.storms instanceof Float32Array && snap.storms.length % STORM_STRIDE === 0, 'snapshot carries storms');
  ok(snap.strikes instanceof Float32Array && snap.strikes.length % STRIKE_STRIDE === 0, 'snapshot carries strikes');
  ok(on.snapshot(false).strikes!.length === 0, 'strikes are cleared after a snapshot');
  const row = on.sample();
  ok(Number.isFinite(row.fires_lightning) && Number.isFinite(row.storm_cells), 'on: columns are numbers');
  ok(on.sample().fires_lightning === 0, 'fires_lightning counts since the last sample');
}

// the sim with storms on is deterministic
{
  const a = createSim({ seed: 8, params: { stormCells: 1 } });
  const b = createSim({ seed: 8, params: { stormCells: 1 } });
  for (const s of [a, b]) {
    (s.env as unknown as { storm: boolean }).storm = true;
    s.apply({ kind: 'rain', ticks: 300 });
    s.step(2500);
  }
  ok(a.populations().join() === b.populations().join(), 'same seed, same populations with storms on');
  ok(a.veg.meanGrass() === b.veg.meanGrass(), 'same seed, same grass with storms on');
}

if (failures) {
  console.error(`${failures} storm test(s) failed`);
  process.exit(1);
}
console.log('storms: all passed');
