// Per-sim calendar (S6a): two sims with different calendar scales in one process must each behave exactly as if alone.
// The calendar used to be a module global (setCalendarScale in types.ts) that every sim module read, so the second sim built
// rewrote the first one's seasons. Now the sim reads seasonTicks(p) / yearTicks(p) and env.seasonTicks / env.yearTicks; the global
// stays only for the UI, renderer and headless reports.
import { createSim, type Sim } from './sim';
import { SPECIES_COUNT } from './types';

let checks = 0, failures = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) { failures++; console.log(`FAIL ${msg}`); }
}

const TICKS = 2400; // one year at scale 1, two at scale 2: both sims pass the seasonal events (exodus, returns, pulses)
const CHUNK = 200;

/** A short FNV fingerprint of the run so far: every species count each chunk, then every live animal and some grass. */
class Print {
  h = 0x811c9dc5;
  private readonly f = new Float32Array(1);
  private readonly u = new Uint32Array(this.f.buffer);
  mix(v: number): void { this.h = Math.imul(this.h ^ (v >>> 0), 0x01000193) >>> 0; }
  mixF(x: number): void { this.f[0] = x; this.mix(this.u[0]); }
  pops(sim: Sim): void { const p = sim.populations(); for (let s = 0; s < SPECIES_COUNT; s++) this.mix(p[s]); this.mixF(sim.env.state.season); }
  end(sim: Sim): string {
    const a = sim.a;
    for (let i = 0; i < a.hi; i++) if (a.alive[i]) { this.mix(i); this.mix(a.sp[i]); this.mixF(a.x[i]); this.mixF(a.y[i]); this.mixF(a.energy[i]); }
    const g = sim.veg.grass;
    for (let c = 0; c < g.length; c += 7) this.mixF(g[c]);
    return this.h.toString(16).padStart(8, '0');
  }
}

const make = (seed: number, calendarScale: number): Sim => createSim({ seed, params: { calendarScale } });

function alone(seed: number, scale: number): string {
  const sim = make(seed, scale), pr = new Print();
  for (let t = 0; t < TICKS; t += CHUNK) { sim.step(CHUNK); pr.pops(sim); }
  return pr.end(sim);
}

// side by side: A is built first, then B (the old global ends up at B's scale), and they step in turns
function together(seedA: number, scaleA: number, seedB: number, scaleB: number): [string, string] {
  const a = make(seedA, scaleA), b = make(seedB, scaleB);
  const pa = new Print(), pb = new Print();
  for (let t = 0; t < TICKS; t += CHUNK) {
    a.step(CHUNK); pa.pops(a);
    b.step(CHUNK); pb.pops(b);
  }
  return [pa.end(a), pb.end(b)];
}

const soloA = alone(3, 2);
const soloB = alone(7, 1);
ok(soloA === alone(3, 2), 'a sim alone repeats itself');
const [withA, withB] = together(3, 2, 7, 1);
ok(withA === soloA, `scale-2 sim beside a scale-1 sim: ${withA}, alone ${soloA}`);
ok(withB === soloB, `scale-1 sim beside a scale-2 sim: ${withB}, alone ${soloB}`);
ok(soloA !== soloB, 'the two runs differ (the check is not vacuous)');

console.log(`calendar: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
