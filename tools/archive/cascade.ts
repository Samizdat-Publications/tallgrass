// Trophic cascade evidence: the same world run as "Yellowstone return" (wolves arrive in year 3) and as
// "Island of plenty" (no predators). Writes a CSV per scenario per seed for tools/cascade_chart.py.
import { mkdirSync, writeFileSync } from 'node:fs';
import { Sim } from '../src/sim/sim';
import { SCENARIOS } from '../src/scenarios';

const seeds = (process.argv[2] ?? '7,8,9').split(',').map(Number);
const years = Number(process.argv[3] ?? 15);
const out = process.argv[4] ?? 'review/stability/cascade';
mkdirSync(out, { recursive: true });
for (const id of ['yellowstone', 'island']) {
  const sc = SCENARIOS.find((s) => s.id === id)!;
  for (const seed of seeds) {
    const sim = new Sim({ seed, params: sc.params });
    const sched = sc.schedule.slice();
    const rows = ['tick,year,bison,pronghorn,wolf,raven,grass'];
    for (let t = 1; t <= years * 2400; t++) {
      while (sched.length && sim.tick >= sched[0].tick) sim.apply(sched.shift()!.iv);
      sim.step(1);
      if (t % 240 === 0) {
        const p = sim.populations();
        rows.push([t, (t / 2400).toFixed(2), p[0], p[3], p[1], p[2], sim.veg.meanGrass().toFixed(4)].join(','));
      }
    }
    writeFileSync(`${out}/${id}_seed${seed}.csv`, rows.join('\n'));
    console.log('wrote', `${out}/${id}_seed${seed}.csv`);
  }
}
