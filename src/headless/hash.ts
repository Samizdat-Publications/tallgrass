// Golden-hash fingerprint of a deterministic sim run (V2-PLAN.md S0).
//   npx tsx src/headless/hash.ts --seed 3 --ticks 24000 [--params '{"x":1}']
// Prints `seed=3 ticks=24000 hash=xxxxxxxx`. Any change to default behaviour moves the hash; a new param that is
// off by default must leave it unchanged. Base species are hashed by key, never by array length, so adding
// species ids to the registry does not move it.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createSim } from '../sim/sim';
import { SPECIES_KEYS } from '../sim/types';
import { argNum, argStr, parseCliArgs, parseParams } from './scenarios';

const BASE = ['bison', 'wolf', 'raven', 'pronghorn', 'rabbit', 'cougar'];

export function simHash(seed: number, ticks: number, params: Record<string, number> = {}): string {
  const sim = createSim({ seed, params });
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v >>> 0), 0x01000193) >>> 0;
  };
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  const mixF = (x: number) => {
    f[0] = x;
    mix(u[0]);
  };
  const keys = SPECIES_KEYS as readonly string[];
  for (let t = 0; t < ticks; t += 600) {
    sim.step(Math.min(600, ticks - t));
    const pop = sim.populations();
    for (const k of BASE) mix(pop[keys.indexOf(k)]);
  }
  const a = sim.a;
  for (let i = 0; i < a.hi; i++) {
    if (!a.alive[i]) continue;
    mix(i);
    mix(a.sp[i]);
    mixF(a.x[i]);
    mixF(a.y[i]);
    mixF(a.energy[i]);
  }
  const g = sim.veg.grass;
  for (let c = 0; c < g.length; c += 7) mixF(g[c]);
  return h.toString(16).padStart(8, '0');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseCliArgs(process.argv.slice(2));
  const seed = argNum(args, 'seed', 3);
  const ticks = argNum(args, 'ticks', 24000);
  const params = parseParams(argStr(args, 'params'), (p) => readFileSync(p, 'utf8'));
  console.log(`seed=${seed} ticks=${ticks} hash=${simHash(seed, ticks, params)}`);
}
