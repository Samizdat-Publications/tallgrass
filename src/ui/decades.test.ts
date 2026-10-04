// Decade lines and drought arcs (S18). Run: npx tsx src/ui/decades.test.ts
import { YEAR_TICKS, setCalendarScale } from '../sim/types';
import type { SimEvent, SimEventKind } from '../sim/sim';
import type { HistoryRow } from '../sim/worker';
import { DecadeLines } from './seasonlines';
import { yearStartTick } from './describe';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}
const EM_DASH = String.fromCharCode(0x2014);

for (const scale of [1, 2]) {
  setCalendarScale(scale);
  const label = `(calendar x${scale})`;
  /** Rows from year a to year b (exclusive), every 60 ticks, pop interpolated per species, grass from a function. */
  function rows(a: number, b: number, from: number[], to: number[], grass: (t: number) => number = () => 0.5): HistoryRow[] {
    const t0 = yearStartTick(a), t1 = yearStartTick(b);
    const out: HistoryRow[] = [];
    for (let t = Math.max(0, t0); t < t1; t += 60) {
      const f = (t - t0) / (t1 - t0);
      out.push({ tick: t, pop: from.map((v, k) => Math.round(v + (to[k] - v) * f)), grass: grass(t) });
    }
    return out;
  }
  const ev = (kind: SimEventKind, year: number, frac = 0.3, a = 0, sp = -1): SimEvent => ({
    tick: Math.round(yearStartTick(year) + frac * YEAR_TICKS), kind, sp, x: 400, y: 100, a, b: 0,
  });
  const decade = (fromYear: number, from: number[], to: number[], events: SimEvent[] = []) => {
    const d = new DecadeLines();
    // the decade before, steady, so the "vs last decade" comparison has a base, then the decade itself, then one row to close it
    const out = d.feed(rows(fromYear - 10, fromYear, from, from), []);
    out.push(...d.feed(rows(fromYear, fromYear + 10, from, to), events));
    out.push(...d.feed([{ tick: yearStartTick(fromYear + 10) + 1, pop: to, grass: 0.5 }]));
    return out.filter((l) => l.kind === 'decade' && l.year === fromYear + 9);
  };
  const base = [500, 20, 60, 300, 0, 0];

  const wolf = decade(11, base, [480, 40, 60, 300, 0, 0], [ev('packFounded', 12), ev('packFounded', 14), ev('packFounded', 17)]);
  ok(wolf.length === 1 && wolf[0].title === 'The Wolf Decade', `wolf decade ${label}: ${JSON.stringify(wolf.map((l) => l.sentence))}`);
  ok(/three new packs/.test(wolf[0]?.sentence ?? ''), `wolf decade mentions packs ${label}: ${wolf[0]?.sentence}`);
  ok(/^Years 11 to 20/.test(wolf[0]?.sentence ?? ''), `decade sentence starts with its years ${label}`);

  const dust = decade(21, base, base, [ev('drought', 22), ev('droughtEnd', 23), ev('drought', 26), ev('fire', 26, 0.5)]);
  ok(dust[0]?.title === 'The Dust Years', `dust years ${label}: ${dust[0]?.title}`);

  const lean = decade(31, base, [250, 20, 60, 300, 0, 0]);
  ok(lean[0]?.title === 'The Lean Years', `lean years ${label}: ${lean[0]?.title}`);

  const quiet = decade(41, base, base);
  ok(quiet[0]?.title === 'The Quiet Years', `quiet years ${label}: ${quiet[0]?.title}`);

  const town = decade(51, [500, 20, 60, 300, 0, 0, 0, 200], [500, 20, 60, 300, 0, 0, 0, 180], [ev('sylvaticPlague', 54, 0.4, 150, 7)]);
  ok(town[0]?.title === 'The Town That Came Back', `town came back ${label}: ${town[0]?.title}`);

  const wolfless = decade(61, base, [500, 0, 60, 300, 0, 0]);
  ok(wolfless[0]?.title !== 'The Wolf Decade', `wolves dying out is not a wolf decade ${label}`);

  // a partial first decade (the sim starts late in year 1, a load mid-way) writes nothing
  const part = new DecadeLines();
  const pl = [...part.feed(rows(5, 11, base, base))];
  ok(pl.filter((l) => l.kind === 'decade').length === 0, `partial decade is skipped ${label}`);

  // drought arc: drought in year 12, fire in its summer, ends year 13, grass back in year 14 -> one arc line
  const arc = new DecadeLines();
  const grass = (t: number) => (t < yearStartTick(12) ? 0.6 : t < yearStartTick(14) ? 0.25 : 0.58);
  const evs = [ev('drought', 12, 0.1), ev('fire', 12, 0.4), ev('droughtEnd', 13, 0.5)];
  const lines = [...arc.feed(rows(1, 12, base, base, grass)), ...arc.feed(rows(12, 16, base, base, grass), evs)];
  const arcs = lines.filter((l) => l.kind === 'arc');
  ok(arcs.length === 1, `one arc line ${label}: ${JSON.stringify(arcs.map((l) => l.sentence))}`);
  ok(/years 12 to 13/.test(arcs[0]?.sentence ?? '') && /fire took/.test(arcs[0]?.sentence ?? '') && /grass was back/.test(arcs[0]?.sentence ?? ''), `arc tells the thread ${label}: ${arcs[0]?.sentence}`);
  ok((arcs[0]?.year ?? 0) === 14, `arc closes when the grass is back ${label}: year ${arcs[0]?.year}`);

  for (const l of [...wolf, ...dust, ...lean, ...quiet, ...town, ...wolfless, ...arcs]) {
    ok(!l.sentence.includes(EM_DASH) && !/undefined|NaN/.test(l.sentence) && l.sentence.endsWith('.'), `clean sentence ${label}: ${l.sentence}`);
  }
  if (scale === 2) for (const l of [...wolf, ...dust, ...lean, ...quiet, ...town, ...arcs]) console.log(`  ${l.title.padEnd(26)} ${l.sentence}`);
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
