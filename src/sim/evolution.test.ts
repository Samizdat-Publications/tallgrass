// Unit tests for Evolution v2 (S9): the master param, per-species sprint costs and the wolf coat search image.
// Run: npx tsx src/sim/evolution.test.ts
import { applyOverrides, defaultParams } from './params';
import { createSim } from './sim';
import { createSim as createPinned, defaultParams as pinnedDefaults } from './testpins';
import { COAT_RANGE } from './species';
import { SPECIES_COUNT, Sp } from './types';
import { simHash } from '../headless/hash';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// 1. everything is off in the pre-v10 world (testpins pins evolution2 0), and on in the v10 default world
{
  const v10 = applyOverrides(defaultParams(), {});
  ok(v10.evolution2 === 1 && v10.species[Sp.Bison].maxLitter === 1 && v10.species[Sp.Wolf].sprintCost === 0.3, 'v10: evolution2 is on in the default world, even with no overrides');
  const p = pinnedDefaults();
  ok(p.evolution2 === 0 && p.coatSearch === 0 && p.herdEyes === 0 && p.sprintCost === 0, 'evolution params are off by default');
  ok(p.species.every((s) => s.sprintCost === 0), 'per-species sprintCost is 0 by default');
  ok(p.species[Sp.Bison].maxLitter === 99, 'bison maxLitter is uncapped by default');
  const q = applyOverrides(pinnedDefaults(), {});
  ok(q.coatSearch === 0 && q.herdEyes === 0, 'empty overrides change nothing');
}

// 2. the master param fills in the plan's values, and explicit values win
{
  const p = applyOverrides(defaultParams(), { evolution2: 1 });
  ok(p.species[Sp.Bison].sprintCost === 0.2 && p.species[Sp.Deer].sprintCost === 0.05, 'master: bison and pronghorn sprint costs');
  ok(p.species[Sp.Wolf].sprintCost === 0.3 && p.species[Sp.Coyote].sprintCost === 0.1, 'master: wolf and coyote sprint costs (v10b: wolf 0.3)');
  ok(p.species[Sp.Cougar].sprintCost === 0 && p.species[Sp.Raven].sprintCost === 0, 'master: other species keep 0');
  ok(p.species[Sp.Bison].maxLitter === 1 && p.species[Sp.Deer].maxLitter === defaultParams().species[Sp.Deer].maxLitter, 'master: bison litter capped at 1, pronghorn unchanged');
  ok(p.herdEyes === 1.5 && p.coatSearch === 1 && p.leanLitter === 0.8, 'master: herdEyes 1.5, coat search on, leanLitter stays at its v6 value');
  ok(p.coatSearchBoost === 1.3 && p.coatSearchWindow === 0.1, 'coat search is x1.3 within 0.1');
  const q = applyOverrides(defaultParams(), { evolution2: 1, herdEyes: 0, 'bison.sprintCost': 0.5, coatSearch: 0, 'bison.maxLitter': 2 });
  ok(q.herdEyes === 0 && q.species[Sp.Bison].sprintCost === 0.5 && q.coatSearch === 0 && q.species[Sp.Bison].maxLitter === 2, 'explicit overrides beat the master, even zero');
  ok(q.species[Sp.Wolf].sprintCost === 0.3, 'unset parts still take the master value');
  let threw = false;
  try { applyOverrides(defaultParams(), { 'bison.nope': 1 }); } catch { threw = true; }
  ok(threw, 'unknown species params still throw');
}

// 3. off reproduces the default run exactly, and the new columns exist either way
{
  const base = simHash(3, 1800, { evolution2: 0 });
  ok(simHash(3, 1800, { evolution2: 0, coatSearch: 0, herdEyes: 0 }) === base, 'explicit zeros reproduce the evolution2-off hash');
  ok(simHash(3, 1800) === simHash(3, 1800, { evolution2: 1 }), 'v10: the default hash is the evolution2-on hash');
  const off = createPinned({ seed: 3 });
  off.step(1200);
  const row = off.sample();
  ok(['coatvar_bison', 'coatvar_pronghorn', 'coatvar_wolf', 'search_wolf'].every((k) => k in row), 'sample has the S9 columns with the feature off');
  ok(Number.isNaN(row.search_wolf), 'no search image with coatSearch off');
  ok(Number.isFinite(row.coatvar_bison) && row.coatvar_bison >= 0 && row.coatvar_bison < 0.05, 'founder bison coat variance is small and finite');
  ok(off.packCoat.every((v) => v === -1), 'no image is stored with coatSearch off');
}

// 4. with the search image on, packs learn the coats they kill; the image stays inside the prey's coat range, is deterministic, and the run goes on
{
  const run = (): { img: number[]; row: Record<string, number>; kills: number } => {
    const s = createSim({ seed: 5, params: { evolution2: 1 } });
    s.step(9000);
    const img: number[] = [];
    for (let pk = 0; pk < s.packAlive.length; pk++) {
      if (!s.packAlive[pk]) continue;
      for (let sp = 0; sp < SPECIES_COUNT; sp++) {
        const v = s.packCoat[pk * SPECIES_COUNT + sp];
        if (v >= 0) {
          img.push(v);
          const [lo, hi] = COAT_RANGE[sp] ?? [0, 1];
          ok(v >= lo - 1e-6 && v <= hi + 1e-6, `image for species ${sp} lies inside its coat range (${v.toFixed(3)})`);
        }
      }
    }
    return { img, row: s.sample(), kills: s.totalKills };
  };
  const r1 = run();
  ok(r1.kills > 0, 'wolves killed something in 9,000 ticks');
  ok(r1.img.length > 0, 'at least one pack has a coat search image after kills');
  ok(Number.isFinite(r1.row.search_wolf) && r1.row.search_wolf >= 0.62 && r1.row.search_wolf <= 1, 'search_wolf is the mean bison image, inside the bison coat range');
  ok(r1.row.pop_bison > 100 && r1.row.pop_wolf > 0, 'the world is still alive');
  const r2 = run();
  ok(JSON.stringify(r1.img) === JSON.stringify(r2.img) && r1.kills === r2.kills, 'same seed, same images and kills (deterministic)');
}

// 5. a pack's image drifts toward the coat just killed at the stated rate
{
  const s = createSim({ seed: 5, params: { coatSearch: 1, coatSearchRate: 0.5 } });
  const k = Sp.Bison; // pack 0, prey bison
  ok(s.packCoat[k] === -1, 'a fresh pack has no image');
  s.learnCoat(0, Sp.Bison, 0.9);
  ok(s.packCoat[k] === Math.fround(0.9), 'the first kill sets the image');
  s.learnCoat(0, Sp.Bison, 0.7);
  ok(Math.abs(s.packCoat[k] - 0.8) < 1e-6, 'the next kill moves it by the rate (0.5) toward that coat');
  s.learnCoat(0, Sp.Deer, 0.4);
  ok(Math.abs(s.packCoat[k] - 0.8) < 1e-6 && Math.abs(s.packCoat[Sp.Deer] - 0.4) < 1e-6, 'images are kept per prey species');
  ok(s.packCoat.length === s.packAlive.length * SPECIES_COUNT, 'one image slot per pack and prey species');
}

if (failures > 0) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`evolution.test.ts: ${checks} checks passed`);
