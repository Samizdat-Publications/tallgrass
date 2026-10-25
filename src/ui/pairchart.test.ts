// The Pair view's axis (four equal round steps, never below zero) and the map legend's entries. Run: npx tsx src/ui/pairchart.test.ts
import { SPECIES } from '../sim/species';
import { glyphColor } from '../render/glyphs';
import { glyphLegendEntries } from './glyphlegend';
import { pairAxis } from './pairchart';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

// an axis always has four equal steps, a floor at or above zero, and covers the series
const cases: [number, number][] = [[0, 0], [17, 24], [18, 17], [200, 800], [3, 1500], [0, 9], [40, 41], [250, 262], [0, 100000], [5, 5]];
for (const [lo, hi] of cases) {
  const a = pairAxis(lo, hi);
  ok(a.lo >= 0, `floor not below zero for ${lo}..${hi} (${a.lo})`);
  ok(Math.abs(a.hi - a.lo - a.step * 4) < 1e-9, `four equal steps for ${lo}..${hi} (${a.lo}..${a.hi} by ${a.step})`);
  ok(a.lo <= lo + 1e-9 && a.hi >= hi - 1e-9, `covers ${lo}..${hi} (${a.lo}..${a.hi})`);
  ok(Number.isInteger(a.step) && Number.isInteger(a.lo), `whole numbers on the axis for ${lo}..${hi}`);
}
// a quiet series does not fill the chart: wolves at 17 to 18 sit in a range of a few times their swing
const quiet = pairAxis(17, 18);
ok(quiet.hi - quiet.lo >= 5, `a flat series keeps a wide axis (${quiet.lo}..${quiet.hi})`);
// not-a-number input still gives a usable axis
const bad = pairAxis(NaN, NaN);
ok(bad.hi > bad.lo, 'an empty series gets an axis');

// the legend: the species with marks on the map that are alive, in registry order; the hunters take the glyph colours
const pop = SPECIES.map(() => 0);
const idx = (k: string) => SPECIES.findIndex((s) => s.key === k);
pop[idx('bison')] = 500; pop[idx('wolf')] = 20; pop[idx('rabbit')] = 900; pop[idx('cougar')] = 5; pop[idx('eagle')] = 0;
const e = glyphLegendEntries(pop);
ok(e.map((x) => x.name).join(',') === 'Bison,Wolf,Cougar', `legend lists the species with a mark that are alive, not the jackrabbit or an absent eagle (${e.map((x) => x.name).join(',')})`);
const wolf = e.find((x) => x.name === 'Wolf');
ok(!!wolf && wolf.color === glyphColor(SPECIES[idx('wolf')]) && wolf.color !== SPECIES[idx('wolf')].color, 'the legend carries the wolf mark colour, not the panel blue');
ok(glyphColor(SPECIES[idx('bison')]) === SPECIES[idx('bison')].color, 'a herbivore keeps its panel colour on the map');
const hunters = ['wolf', 'cougar', 'coyote'].map((k) => glyphColor(SPECIES[idx(k)]));
ok(new Set(hunters).size === 3, 'wolf, cougar and coyote marks are three different colours');
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
// every predator mark is bright and sits well away from the bison's amber on the map (round 37: an orange cougar read as a bison)
const dist = (a: number[], c: number[]) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
const bisonRgb = rgb(glyphColor(SPECIES[idx('bison')]));
for (const k of ['wolf', 'cougar', 'coyote']) {
  const c = rgb(glyphColor(SPECIES[idx(k)]));
  ok(Math.max(...c) > 200 && dist(c, bisonRgb) > 90, `${k} mark is bright and far from the bison's: ${glyphColor(SPECIES[idx(k)])}`);
}

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`pairchart: ${checks} checks passed`);
