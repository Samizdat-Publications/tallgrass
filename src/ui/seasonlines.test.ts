// Unit tests for the chronicle's season lines and the pack break-up wording. Run: npx tsx src/ui/seasonlines.test.ts
import { SEASON_TICKS, YEAR_TICKS, setCalendarScale } from '../sim/types';
import type { SimEvent } from '../sim/sim';
import type { HistoryRow } from '../sim/worker';
import { SeasonLines, roundMilestone } from './seasonlines';
import { describeEvent, lineageText, yearStartTick } from './describe';

let failures = 0;
let checks = 0;
function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL: ' + msg);
  }
}

for (const scale of [1, 2]) {
  setCalendarScale(scale);
  const label = `(calendar x${scale})`;
  // a season starts at yearStartTick(year) + idx * SEASON_TICKS: idx 0 spring, 1 summer, 2 autumn, 3 winter
  const seasonStart = (year: number, idx: number): number => yearStartTick(year) + idx * SEASON_TICKS;
  const ROWS = SEASON_TICKS / 60;
  /** Rows for one season, the counts moving in a straight line from `from` to `to` (each an array per species). */
  function season(year: number, idx: number, from: number[], to: number[]): HistoryRow[] {
    const rows: HistoryRow[] = [];
    for (let i = 0; i < ROWS; i++) {
      const f = ROWS > 1 ? i / (ROWS - 1) : 1;
      rows.push({ tick: seasonStart(year, idx) + i * 60 + 1, pop: from.map((v, k) => Math.round(v + (to[k] - v) * f)), grass: 0.5 });
    }
    return rows;
  }
  /** Feed a run of seasons, then a closing row so the last one is evaluated. */
  function run(plan: { year: number; idx: number; from: number[]; to: number[] }[], speed = 1): ReturnType<SeasonLines['feed']> {
    const sl = new SeasonLines();
    const rows: HistoryRow[] = [];
    for (const p of plan) rows.push(...season(p.year, p.idx, p.from, p.to));
    const last = plan[plan.length - 1];
    const next = last.idx === 3 ? [last.year + 1, 0] : [last.year, last.idx + 1];
    rows.push({ tick: seasonStart(next[0], next[1]) + 1, pop: last.to, grass: 0.5 });
    return sl.feed(rows, speed);
  }
  // species order: bison, wolf, raven, pronghorn
  const flat = [900, 40, 60, 500];
  const w = (over: Partial<Record<number, number>>) => flat.map((v, i) => over[i] ?? v);

  // a winter that thins the herd: 955 to 860
  let L = run([
    { year: 3, idx: 2, from: flat, to: w({ 0: 955 }) },
    { year: 3, idx: 3, from: w({ 0: 955 }), to: w({ 0: 860 }) },
  ]);
  ok(L.some((l) => l.kind === 'herd' && /Winter thins the herd: 955 bison to 860/.test(l.sentence) || l.kind === 'herd' && /hard winter for the bison: 955 down to 860/.test(l.sentence)), `winter thins the herd ${label}: ${JSON.stringify(L.map((l) => l.sentence))}`);
  ok(L.every((l) => l.tick >= seasonStart(3, 2) && l.tick < seasonStart(4, 0)), `a line is dated inside its season ${label}`);
  ok(L.filter((l) => l.sentence.includes('860')).every((l) => l.tick === seasonStart(4, 0) - 1), `a winter line is dated the last tick of winter ${label}`);

  // a small change says nothing
  L = run([
    { year: 3, idx: 2, from: flat, to: w({ 0: 905 }) },
    { year: 3, idx: 3, from: w({ 0: 905 }), to: w({ 0: 880 }) },
  ]);
  ok(L.length === 0, `a 3% season is not news ${label}`);

  // a spring of fawns that crosses 500
  L = run([
    { year: 3, idx: 3, from: w({ 3: 430 }), to: w({ 3: 440 }) },
    { year: 4, idx: 0, from: w({ 3: 440 }), to: w({ 3: 530 }) },
  ]);
  ok(L.some((l) => l.kind === 'herd' && /pronghorn pass 500/.test(l.sentence)), `a spring of fawns passes 500 ${label}: ${JSON.stringify(L.map((l) => l.sentence))}`);
  ok(roundMilestone(430, 530) === 500 && roundMilestone(510, 530) === 0 && roundMilestone(40, 120) === 50, `roundMilestone ${label}`);

  // pups at the dens: the wolf count jumps in spring (and only in spring)
  L = run([
    { year: 3, idx: 3, from: w({ 1: 30 }), to: w({ 1: 30 }) },
    { year: 4, idx: 0, from: w({ 1: 30 }), to: w({ 1: 38 }) },
  ]);
  ok(L.some((l) => l.kind === 'pups' && /Pups at the dens.*30 wolves to 38|rise from 30 to 38/.test(l.sentence)), `pups at the dens ${label}: ${JSON.stringify(L.map((l) => l.sentence))}`);
  L = run([
    { year: 3, idx: 0, from: w({ 1: 30 }), to: w({ 1: 30 }) },
    { year: 3, idx: 1, from: w({ 1: 30 }), to: w({ 1: 40 }) },
  ]);
  ok(!L.some((l) => l.kind === 'pups'), `no pups line outside spring ${label}`);

  // ravens gather over a year: 30 to 114
  const ravenPlan = [
    { year: 2, idx: 0, from: w({ 2: 30 }), to: w({ 2: 30 }) },
    { year: 2, idx: 1, from: w({ 2: 30 }), to: w({ 2: 50 }) },
    { year: 2, idx: 2, from: w({ 2: 50 }), to: w({ 2: 80 }) },
    { year: 2, idx: 3, from: w({ 2: 80 }), to: w({ 2: 100 }) },
    { year: 3, idx: 0, from: w({ 2: 100 }), to: w({ 2: 114 }) },
  ];
  L = run(ravenPlan);
  ok(L.some((l) => l.kind === 'ravens' && /Ravens flock to the valley: 30 to 114|30 become 114/.test(l.sentence)), `ravens gather ${label}: ${JSON.stringify(L.map((l) => l.sentence))}`);

  // records: needs an old record to beat, and not in the first two years
  const recPlan = [
    { year: 3, idx: 0, from: w({ 0: 900 }), to: w({ 0: 950 }) },
    { year: 3, idx: 1, from: w({ 0: 950 }), to: w({ 0: 1000 }) },
    { year: 3, idx: 2, from: w({ 0: 1000 }), to: w({ 0: 1010 }) },
    { year: 3, idx: 3, from: w({ 0: 1010 }), to: w({ 0: 900 }) },
    { year: 4, idx: 0, from: w({ 0: 900 }), to: w({ 0: 1240 }) },
  ];
  L = run(recPlan);
  ok(L.some((l) => l.kind === 'record' && /1,240 bison/.test(l.sentence)), `a record herd ${label}: ${JSON.stringify(L.map((l) => l.sentence))}`);
  L = run([
    { year: 1, idx: 0, from: w({ 0: 900 }), to: w({ 0: 950 }) },
    { year: 1, idx: 1, from: w({ 0: 950 }), to: w({ 0: 1240 }) },
  ]);
  ok(!L.some((l) => l.kind === 'record'), `no record in the first two years ${label}`);

  // the first (partial) season has no line, and a missing run of rows does not count as a season
  const sl = new SeasonLines();
  const partial = season(3, 2, flat, w({ 0: 400 })).slice(3);
  const out = sl.feed([...partial, { tick: seasonStart(3, 3) + 1, pop: w({ 0: 400 }), grass: 0.5 }], 1);
  ok(out.length === 0, `a season seen only in part says nothing ${label}`);

  // caps: at most two a season and four a year at normal speed, one a season and two a year at 100x
  const crowded = [
    { year: 5, idx: 0, from: w({ 0: 1000, 1: 30, 2: 30, 3: 500 }), to: w({ 0: 1250, 1: 45, 2: 30, 3: 650 }) },
    { year: 5, idx: 1, from: w({ 0: 1250, 1: 45, 3: 650 }), to: w({ 0: 1500, 1: 45, 3: 800 }) },
    { year: 5, idx: 2, from: w({ 0: 1500, 3: 800 }), to: w({ 0: 1100, 3: 600 }) },
  ];
  L = run([{ year: 4, idx: 3, from: w({ 0: 1000, 1: 30, 3: 500 }), to: w({ 0: 1000, 1: 30, 3: 500 }) }, ...crowded]);
  ok(L.length <= 4 && L.length >= 3, `a crowded year keeps at most four lines ${label} (${L.length})`);
  ok(new Set(L.map((l) => Math.floor((l.tick - seasonStart(5, 0)) / SEASON_TICKS))).size >= 2, `lines are spread over seasons ${label}`);
  const fast = run([{ year: 4, idx: 3, from: w({ 0: 1000, 1: 30, 3: 500 }), to: w({ 0: 1000, 1: 30, 3: 500 }) }, ...crowded], 100);
  ok(fast.length <= 2 && fast.length >= 1, `at 100x a year keeps at most two lines ${label} (${fast.length})`);
  ok(new Set(fast.map((l) => l.tick)).size === fast.length, `at 100x no two lines share a season ${label}`);
  ok(YEAR_TICKS === SEASON_TICKS * 4, `calendar sanity ${label}`);
}
setCalendarScale(2);

// ---- pack break-ups say what they mean
const lost = (a = 4): SimEvent => ({ tick: 5000, kind: 'packLost', sp: 1, x: 100, y: 100, a, b: 5000 });
for (let a = 1; a <= 30; a++) {
  const joined = describeEvent(lost(a), { wolvesFell: false });
  ok(!/no more|died|dead/i.test(joined.sentence) && /join|scatter|elsewhere|breaks apart|disbands/.test(joined.sentence), `a pack that breaks up while the count holds does not imply deaths: ${joined.sentence}`);
  ok(joined.card?.title === 'A pack breaks apart', 'its card says it breaks apart');
  const died = describeEvent(lost(a), { wolvesFell: true });
  ok(/not every wolf|fewer wolves/.test(died.sentence), `when the count fell it says so: ${died.sentence}`);
  const unknown = describeEvent(lost(a));
  ok(!/no more/.test(unknown.sentence) && !!unknown.card, `with nothing known it stays neutral: ${unknown.sentence}`);
}

// ---- founders
ok(lineageText(1, 0, false, 0) === 'Founder: arrived with the first wolves', 'a founder wolf');
ok(lineageText(0, 0, true, 0) === 'Founder: arrived with the first bison', 'a founder bison');
ok(/^Generation 12, daughter of #18233$/.test(lineageText(0, 12, false, 18233)), 'a born animal keeps its lineage');

if (failures) {
  console.error(`${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`season lines: all ${checks} checks passed`);
