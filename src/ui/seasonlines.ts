// Season lines for the chronicle. The sim reports events (a pack founded, a drought), but a valley also has quieter news
// that only shows in the numbers: winter thinning a herd, a spring of calves, pups at the dens, ravens gathering, a
// record herd. This module reads the population history the UI already receives and, as each season closes, writes at
// most a couple of plain sentences about what changed. Pure (no DOM), so it can run under Node and be unit tested.
import { SEASON_TICKS } from '../sim/types';
import type { SimEvent } from '../sim/sim';
import type { HistoryRow } from '../sim/worker';
import { fmtInt, regionWord, seasonName, seasonOfTick, yearOfTick, yearStartTick } from './describe';

export interface SeasonLine {
  /** Tick just before the season ended, so the chronicle tags it with the season it is about. */
  tick: number;
  year: number;
  sentence: string;
  /** The species it is about (-1 for none): tints the timeline node. */
  sp: number;
  /** 1 (small) to 5: how much the line matters when a busy year folds its smaller entries. */
  weight: number;
  /** Which kind of line, for tests and for ranking. */
  kind: 'herd' | 'pups' | 'ravens' | 'record' | 'wolves';
}

const BISON = 0, WOLF = 1, RAVEN = 2, PRONGHORN = 3;

/** A herd must move by this fraction over a season, and by at least this many animals, to be worth a line. */
const HERD_FRACTION = 0.09;
const HERD_MIN = 20;
/** Wolf pups: the spring count rises by this fraction and by at least this many wolves. */
const PUP_FRACTION = 0.15;
const PUP_MIN = 3;
/**
 * Ravens gather and scatter over a year, not a season: the count is compared with the same season a year ago. Up by
 * 60% (and 20 birds) is a flock gathering, down by 40% is them drifting away; neither more than once in two years.
 */
const RAVEN_UP_FRACTION = 0.6;
const RAVEN_UP_MIN = 20;
const RAVEN_DOWN_FRACTION = 0.4;
const RAVEN_DOWN_MIN = 20;
const RAVEN_EVERY_YEARS = 2;
/** A hard season for the wolves: down by a quarter. */
const WOLF_DOWN_FRACTION = 0.25;
const WOLF_DOWN_MIN = 4;
/** A record must beat the old one by this much, the old one must be a real herd, and it is announced at most this often. */
const RECORD_MARGIN = 1.08;
const RECORD_MIN: Record<number, number> = { [BISON]: 150, [WOLF]: 12 };
const RECORD_FROM_YEAR = 3;
const RECORD_EVERY_YEARS = 2;
/** The most season lines per season and per year, at normal speed and at 100x. */
const PER_SEASON = 2;
const PER_YEAR = 4;
const PER_SEASON_FAST = 1;
const PER_YEAR_FAST = 2;
/** A season needs this share of its rows to count (a partial first season, or rows missed while the tab slept, do not). */
const COVERAGE = 0.7;

const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
const NAME = ['bison', 'wolves', 'ravens', 'pronghorn'];

function hash(a: number, b: number, c: number): number {
  return (Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 7, 40503) ^ Math.imul((c | 0) + 3, 977)) >>> 0;
}
const pickOf = <T>(list: T[], h: number): T => list[h % list.length];

/** The first round number (100, 250, 500, 1,000, 2,500...) that the count crossed on the way up, or 0. */
export function roundMilestone(from: number, to: number): number {
  const marks = [50, 100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
  for (const m of marks) if (from < m && to >= m) return m;
  return 0;
}

interface Season {
  key: number;
  year: number;
  idx: number;
  firstTick: number;
  lastTick: number;
  start: number[];
  hasStart: boolean;
  end: number[];
  max: number[];
}

export class SeasonLines {
  private cur: Season | null = null;
  private prevEnd: number[] | null = null;
  /** The biggest count each species has had before the season now closing. */
  private record: number[] = [];
  private lastRecordYear = new Map<number, number>();
  /** The raven count at the end of each recent season, newest last (a year is four of them). */
  private ravenEnds: number[] = [];
  private lastRavenYear = -99;
  private yearLines = new Map<number, number>();

  reset(): void {
    this.cur = null;
    this.prevEnd = null;
    this.record = [];
    this.lastRecordYear.clear();
    this.ravenEnds = [];
    this.lastRavenYear = -99;
    this.yearLines.clear();
  }

  /** Feed new history rows, oldest first. `speed` is the sim speed of this frame (100 and up writes fewer lines). */
  feed(rows: HistoryRow[], speed: number): SeasonLine[] {
    const out: SeasonLine[] = [];
    const fast = speed >= 100 || speed < 0;
    for (const r of rows) {
      const year = yearOfTick(r.tick);
      const idx = Math.floor(seasonOfTick(r.tick));
      const key = year * 4 + idx;
      const c = this.cur;
      if (c && key < c.key) continue; // out of order: ignore
      if (!c || key !== c.key) {
        if (c) out.push(...this.close(c, fast));
        this.cur = {
          key, year, idx, firstTick: r.tick, lastTick: r.tick,
          start: this.prevEnd ? this.prevEnd.slice() : r.pop.slice(), hasStart: !!this.prevEnd, end: r.pop.slice(), max: r.pop.slice(),
        };
        continue;
      }
      c.lastTick = r.tick;
      c.end = r.pop;
      for (let s = 0; s < r.pop.length; s++) if (r.pop[s] > (c.max[s] ?? 0)) c.max[s] = r.pop[s];
    }
    return out;
  }

  private close(c: Season, fast: boolean): SeasonLine[] {
    this.prevEnd = c.end.slice();
    const lines: SeasonLine[] = [];
    const covered = c.lastTick - c.firstTick >= COVERAGE * SEASON_TICKS - 60;
    const tick = yearStartTick(c.year) + (c.idx + 1) * SEASON_TICKS - 1; // the last tick of this season
    if (c.hasStart && covered) {
      const season = SEASON_NAMES[c.idx];
      const h0 = hash(c.year, c.idx, 0);

      // records: the biggest herd, the most wolves
      let recordSp = -1;
      for (const sp of [BISON, WOLF]) {
        const old = this.record[sp] ?? 0;
        const peak = c.max[sp] ?? 0;
        const last = this.lastRecordYear.get(sp) ?? -99;
        if (c.year >= RECORD_FROM_YEAR && old >= (RECORD_MIN[sp] ?? 1e9) && peak > old * RECORD_MARGIN && c.year - last >= RECORD_EVERY_YEARS) {
          const n = fmtInt(peak);
          const sentence = sp === BISON
            ? pickOf([`The biggest herd yet: ${n} bison, the most the valley has held.`, `A record herd: ${n} bison graze the valley.`], h0)
            : pickOf([`The most wolves yet: ${n}, more than the valley has ever held.`, `A record for the wolves: ${n} now range the valley.`], h0 + 1);
          lines.push({ tick, year: c.year, sentence, sp, weight: 3, kind: 'record' });
          this.lastRecordYear.set(sp, c.year);
          recordSp = sp;
        }
      }

      // pups at the dens: the wolf count jumps in spring
      const w0 = c.start[WOLF] ?? 0, w1 = c.end[WOLF] ?? 0;
      if (c.idx === 0 && w1 - w0 >= PUP_MIN && w1 >= w0 * (1 + PUP_FRACTION)) {
        lines.push({
          tick, year: c.year, sp: WOLF, weight: 2, kind: 'pups',
          sentence: pickOf([`Pups at the dens: ${fmtInt(w0)} wolves to ${fmtInt(w1)}.`, `Pups at the dens, and the wolves rise from ${fmtInt(w0)} to ${fmtInt(w1)}.`], h0 + 2),
        });
      } else if (w0 - w1 >= WOLF_DOWN_MIN && w1 <= w0 * (1 - WOLF_DOWN_FRACTION)) {
        lines.push({
          tick, year: c.year, sp: WOLF, weight: 2, kind: 'wolves',
          sentence: pickOf([`A hard ${season} for the wolves: ${fmtInt(w0)} down to ${fmtInt(w1)}.`, `The wolves fall from ${fmtInt(w0)} to ${fmtInt(w1)} this ${season}.`], h0 + 3),
        });
      }

      // ravens gather where there is carrion, and drift away when there is not (read against a year ago)
      const r1 = c.end[RAVEN] ?? 0;
      const r0 = this.ravenEnds.length >= 4 ? this.ravenEnds[this.ravenEnds.length - 4] : -1;
      if (r0 >= 0 && c.year - this.lastRavenYear >= RAVEN_EVERY_YEARS) {
        if (r1 - r0 >= RAVEN_UP_MIN && r1 >= r0 * (1 + RAVEN_UP_FRACTION)) {
          lines.push({
            tick, year: c.year, sp: RAVEN, weight: 2, kind: 'ravens',
            sentence: pickOf([`Ravens flock to the valley: ${fmtInt(r0)} to ${fmtInt(r1)}.`, `The ravens gather: ${fmtInt(r0)} become ${fmtInt(r1)}.`], h0 + 4),
          });
          this.lastRavenYear = c.year;
        } else if (r0 - r1 >= RAVEN_DOWN_MIN && r1 <= r0 * (1 - RAVEN_DOWN_FRACTION)) {
          lines.push({
            tick, year: c.year, sp: RAVEN, weight: 1, kind: 'ravens',
            sentence: pickOf([`The ravens drift away: ${fmtInt(r0)} to ${fmtInt(r1)}.`, `Fewer ravens over the valley: ${fmtInt(r0)} down to ${fmtInt(r1)}.`], h0 + 5),
          });
          this.lastRavenYear = c.year;
        }
      }

      // the herds: bison and pronghorn rise and fall with the seasons
      const herds: SeasonLine[] = [];
      for (const sp of [BISON, PRONGHORN]) {
        if (sp === recordSp) continue; // the record line already says it
        const a = c.start[sp] ?? 0, b = c.end[sp] ?? 0;
        const d = b - a;
        if (Math.abs(d) < HERD_MIN || a <= 0 || Math.abs(d) < a * HERD_FRACTION) continue;
        herds.push({ tick, year: c.year, sp, weight: 2, kind: 'herd', sentence: herdLine(c.idx, sp, a, b, hash(c.year, c.idx, sp + 10)) });
      }
      herds.sort((x, y) => Math.abs(sizeOf(y, c)) - Math.abs(sizeOf(x, c)));
      lines.push(...herds);

      // records first (they are news), then the biggest swings; thinned per season and per year
      lines.sort((x, y) => y.weight - x.weight);
    }
    this.ravenEnds.push(c.end[RAVEN] ?? 0);
    if (this.ravenEnds.length > 8) this.ravenEnds.shift();
    // fold the record peaks of this season into the running record
    for (const sp of [BISON, WOLF]) if ((c.max[sp] ?? 0) > (this.record[sp] ?? 0)) this.record[sp] = c.max[sp];

    const perSeason = fast ? PER_SEASON_FAST : PER_SEASON;
    const perYear = fast ? PER_YEAR_FAST : PER_YEAR;
    const kept: SeasonLine[] = [];
    for (const ln of lines) {
      if (kept.length >= perSeason) break;
      const used = this.yearLines.get(c.year) ?? 0;
      if (used >= perYear) break;
      this.yearLines.set(c.year, used + 1);
      kept.push(ln);
    }
    return kept;
  }
}

function sizeOf(l: SeasonLine, c: Season): number {
  const a = c.start[l.sp] ?? 0, b = c.end[l.sp] ?? 0;
  return a > 0 ? (b - a) / a : 0;
}

/** One plain sentence for a herd that moved a lot over a season: a spring of calves, winter thinning, and so on. */
function herdLine(idx: number, sp: number, a: number, b: number, h: number): string {
  const name = NAME[sp];
  const up = b > a;
  const A = fmtInt(a), B = fmtInt(b);
  const young = sp === BISON ? 'calves' : 'fawns';
  if (idx === 0) {
    // spring
    if (up) {
      const m = roundMilestone(a, b);
      if (m) return pickOf([`A spring of ${young}: the ${name} pass ${fmtInt(m)}.`, `${young[0].toUpperCase()}${young.slice(1)} are born, and the ${name} pass ${fmtInt(m)}.`], h);
      return pickOf([sp === BISON ? `A spring of ${young}: the bison herd grows from ${A} to ${B}.` : `A spring of ${young}: the pronghorn rise from ${A} to ${B}.`, `${young[0].toUpperCase()}${young.slice(1)} on the grass: ${A} ${name} become ${B}.`], h);
    }
    return pickOf([`A lean spring: the ${name} fall from ${A} to ${B}.`, `Spring is hard on the ${name}: ${A} to ${B}.`], h);
  }
  if (idx === 1) {
    return up
      ? pickOf([`A good summer on the grass: the ${name} rise from ${A} to ${B}.`, `The ${name} fatten on the summer grass: ${A} to ${B}.`], h)
      : pickOf([`A hard summer: the ${name} fall from ${A} to ${B}.`, `Summer thins the ${name}: ${A} to ${B}.`], h);
  }
  if (idx === 2) {
    return up
      ? pickOf([`A kind autumn: the ${name} climb from ${A} to ${B}.`, `The ${name} come through autumn stronger: ${A} to ${B}.`], h)
      : pickOf([`Autumn takes its toll on the ${name}: ${A} to ${B}.`, `The ${name} dwindle through autumn: ${A} down to ${B}.`], h);
  }
  return up
    ? pickOf([`A mild winter: the ${name} hold and grow, ${A} to ${B}.`, `The ${name} winter well: ${A} to ${B}.`], h)
    : sp === BISON
      ? pickOf([`Winter thins the herd: ${A} bison to ${B}.`, `A hard winter for the bison: ${A} down to ${B}.`], h)
      : pickOf([`Winter thins the pronghorn: ${A} to ${B}.`, `A hard winter for the pronghorn: ${A} down to ${B}.`], h);
}

// ---------------------------------------------------------------------------------------------------------
// decades and arcs (V2-PLAN.md S18)
// ---------------------------------------------------------------------------------------------------------

export interface DecadeLine {
  tick: number;
  year: number;
  /** "The Wolf Decade": a chapter title for a decade line, or a short name for an arc. */
  title: string;
  sentence: string;
  /** The species it is about (-1 for none). */
  sp: number;
  /** Decade lines are 4 (they summarise a lot), arcs 3. */
  weight: number;
  kind: 'decade' | 'arc';
}

/** Valley years per decade line, and the share of a decade's rows needed to sum it up. */
const DECADE_YEARS = 10;
const DECADE_COVERAGE = 0.6;
const PRAIRIE_DOG = 7;

interface Decade {
  idx: number;
  firstTick: number;
  lastTick: number;
  rows: number;
  start: number[];
  end: number[];
  sum: number[];
  zeroRows: number[];
  max: number[];
  kinds: Map<string, number>;
  dogLost: number;
}

interface Candidate {
  title: string;
  score: number;
  sp: number;
  fact: string;
}

/** Whole-number words for the few counts that read better spelled out. */
const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n: number): string => SMALL[n] ?? fmtInt(n);

/**
 * Decade lines and multi-event arcs for the chronicle. Feed it the history rows and the sim events the UI already
 * receives (any order across calls, oldest first within one). Every 10 valley years it writes one line titled from what
 * dominated: "Years 11 to 20: The Wolf Decade. Wolves rose from 24 to 41, and three new packs took ranges." A drought
 * is followed as one thread (its fires, its end, the grass coming back) and told once, when the grass has recovered.
 * Pure (no DOM).
 */
export class DecadeLines {
  private cur: Decade | null = null;
  private prevMean: number[] | null = null;
  private pendingEvents: SimEvent[] = [];
  // the open drought arc
  private arc: { startTick: number; startYear: number; grass0: number; fires: string[]; endTick: number; endYear: number } | null = null;
  private grassBefore = 0;

  reset(): void {
    this.cur = null;
    this.prevMean = null;
    this.pendingEvents = [];
    this.arc = null;
    this.grassBefore = 0;
  }

  feed(rows: HistoryRow[], events: SimEvent[] = []): DecadeLine[] {
    const out: DecadeLine[] = [];
    for (const e of events) {
      this.pendingEvents.push(e);
      const arcLine = this.arcEvent(e);
      if (arcLine) out.push(arcLine);
    }
    for (const r of rows) {
      const year = yearOfTick(r.tick);
      const idx = Math.floor((year - 1) / DECADE_YEARS);
      const c = this.cur;
      if (c && idx < c.idx) continue;
      if (!c || idx !== c.idx) {
        if (c) {
          const line = this.close(c);
          if (line) out.push(line);
        }
        this.cur = {
          idx, firstTick: r.tick, lastTick: r.tick, rows: 0, start: r.pop.slice(), end: r.pop.slice(), sum: r.pop.map(() => 0),
          zeroRows: r.pop.map(() => 0), max: r.pop.slice(), kinds: new Map(), dogLost: 0,
        };
      }
      const d = this.cur!;
      d.lastTick = r.tick;
      d.rows++;
      d.end = r.pop;
      for (let s = 0; s < r.pop.length; s++) {
        d.sum[s] = (d.sum[s] ?? 0) + r.pop[s];
        if (r.pop[s] <= 0) d.zeroRows[s] = (d.zeroRows[s] ?? 0) + 1;
        if (r.pop[s] > (d.max[s] ?? 0)) d.max[s] = r.pop[s];
      }
      // events up to this row belong to this decade
      this.pendingEvents = this.pendingEvents.filter((e) => {
        if (e.tick > r.tick) return true;
        if (Math.floor((yearOfTick(e.tick) - 1) / DECADE_YEARS) === d.idx) {
          d.kinds.set(e.kind, (d.kinds.get(e.kind) ?? 0) + 1);
          if (e.kind === 'sylvaticPlague') d.dogLost += Math.max(0, e.a);
        }
        return false;
      });
      const arcLine = this.arcGrass(r);
      if (arcLine) out.push(arcLine);
    }
    return out;
  }

  // ---- arcs: drought, fire, rain, green-up -------------------------------------------------------------------

  private arcEvent(e: SimEvent): DecadeLine | null {
    if (e.kind === 'drought' && !this.arc) {
      this.arc = { startTick: e.tick, startYear: yearOfTick(e.tick), grass0: this.grassBefore, fires: [], endTick: -1, endYear: -1 };
    } else if (this.arc && (e.kind === 'fire' || e.kind === 'lightningFire') && this.arc.fires.length < 3) {
      const where = regionWord(e.x, e.y);
      this.arc.fires.push(`${e.kind === 'lightningFire' ? 'lightning set' : 'fire took'} the ${where && where !== 'central' ? `${where} ` : ''}prairie in ${seasonName(seasonOfTick(e.tick))} of year ${yearOfTick(e.tick)}`);
    } else if (this.arc && e.kind === 'droughtEnd' && this.arc.endTick < 0) {
      this.arc.endTick = e.tick;
      this.arc.endYear = yearOfTick(e.tick);
    }
    return null;
  }

  private arcGrass(r: HistoryRow): DecadeLine | null {
    const a = this.arc;
    if (!a) {
      // a slow running mean of the grass, so a drought knows what "back" means
      this.grassBefore = this.grassBefore ? this.grassBefore * 0.98 + r.grass * 0.02 : r.grass;
      return null;
    }
    if (a.endTick < 0) {
      if (yearOfTick(r.tick) - a.startYear > 8) this.arc = null; // a drought that never ends in the record: drop it
      return null;
    }
    const recovered = r.grass >= 0.9 * a.grass0;
    const gaveUp = yearOfTick(r.tick) - a.endYear >= 4;
    if (!recovered && !gaveUp) return null;
    this.arc = null;
    const len = Math.max(1, a.endYear - a.startYear);
    const span = a.endYear === a.startYear ? `a drought in year ${a.startYear}` : `the drought of years ${a.startYear} to ${a.endYear}`;
    const parts = [`${cap(span)}${a.endYear === a.startYear ? '' : `, ${words(len)} ${len === 1 ? 'year' : 'years'} long`}`];
    if (a.fires.length) parts.push(a.fires.join(', and '));
    parts.push(recovered
      ? (yearOfTick(r.tick) <= a.endYear ? 'the grass came back the same year' : `by year ${yearOfTick(r.tick)} the grass was back`)
      : `four years on, the grass has still not fully come back`);
    return {
      tick: r.tick, year: yearOfTick(r.tick), title: a.fires.length ? 'Drought and fire' : 'The drought years', sp: -1, weight: 3, kind: 'arc',
      sentence: `${parts.join('; ')}.`,
    };
  }

  // ---- decade lines ------------------------------------------------------------------------------------------

  private close(d: Decade): DecadeLine | null {
    const firstYear = d.idx * DECADE_YEARS + 1, lastYear = firstYear + DECADE_YEARS - 1;
    const span = yearStartTick(lastYear + 1) - yearStartTick(firstYear);
    const mean = d.sum.map((s) => s / Math.max(1, d.rows));
    const prev = this.prevMean;
    this.prevMean = mean;
    if (d.lastTick - d.firstTick < DECADE_COVERAGE * span) return null; // a partial decade (the first one, or a load mid-way)
    const n = (k: string) => d.kinds.get(k) ?? 0;
    const absent = (s: number) => d.rows > 0 && (d.zeroRows[s] ?? 0) / d.rows > 0.7;
    const change = (s: number) => ((d.start[s] ?? 0) > 0 ? (d.end[s] ?? 0) / d.start[s] : (d.end[s] ?? 0) > 0 ? 9 : 1);
    const vsPrev = (s: number) => (prev && (prev[s] ?? 0) > 0 ? mean[s] / prev[s] : 1);
    const cands: Candidate[] = [];
    const B = 0, W = 1, R = 2, P = 3;

    const fires = n('fire') + n('lightningFire');
    const droughts = n('drought');
    const packs = n('packFounded');
    const w0 = fmtInt(d.start[W] ?? 0), w1 = fmtInt(d.end[W] ?? 0);
    const b0 = fmtInt(d.start[B] ?? 0), b1 = fmtInt(d.end[B] ?? 0);

    if (n('mesoRelease')) cands.push({ title: 'The Coyote Decade', score: 9, sp: 6, fact: 'with the wolves few, the coyotes took over the valley' });
    if (absent(W) && (d.start[W] ?? 0) + (d.max[W] ?? 0) > 0) cands.push({ title: 'The Wolfless Years', score: 8, sp: W, fact: 'the valley went without wolves for most of it' });
    else if (absent(W) && prev && (prev[W] ?? 0) > 0) cands.push({ title: 'The Wolfless Years', score: 8, sp: W, fact: 'no wolves ranged the valley' });
    if (n('recolonized')) cands.push({ title: 'The Return', score: 7.5, sp: -1, fact: 'animals the valley had lost found their own way back' });
    if (n('sylvaticPlague') && (d.end[PRAIRIE_DOG] ?? 0) >= 0.6 * (d.max[PRAIRIE_DOG] ?? 0) && (d.max[PRAIRIE_DOG] ?? 0) > 0) {
      cands.push({ title: 'The Town That Came Back', score: 7, sp: PRAIRIE_DOG, fact: `plague emptied the prairie dog towns${d.dogLost ? ` (${fmtInt(d.dogLost)} died)` : ''}, and they filled again` });
    } else if (n('sylvaticPlague')) {
      cands.push({ title: 'The Plague Years', score: 6, sp: PRAIRIE_DOG, fact: 'plague swept the prairie dog towns' });
    }
    if (droughts >= 2 || (droughts >= 1 && fires >= 2)) cands.push({ title: 'The Dust Years', score: 5 + droughts + 0.5 * fires, sp: -1, fact: `${words(droughts)} ${droughts === 1 ? 'drought' : 'droughts'}${fires ? ` and ${words(fires)} ${fires === 1 ? 'fire' : 'fires'}` : ''} dried the valley out` });
    else if (fires >= 3) cands.push({ title: 'The Burning Years', score: 4 + fires, sp: -1, fact: `fire swept the prairie ${words(fires)} times` });
    const wc = change(W), wp = vsPrev(W);
    if (!absent(W) && (wc >= 1.4 || wp >= 1.35) && (d.end[W] ?? 0) >= 8) {
      cands.push({ title: 'The Wolf Decade', score: 4 + 3 * Math.max(wc, wp) + 0.5 * packs, sp: W, fact: `wolves rose from ${w0} to ${w1}${packs >= 2 ? `, and ${words(packs)} new packs took ranges` : ''}` });
    } else if (!absent(W) && (wc <= 0.6 || wp <= 0.65) && (d.start[W] ?? 0) >= 8) {
      cands.push({ title: 'The Lean Years for the Wolves', score: 3 + 3 / Math.max(0.2, Math.min(wc, wp)) * 0.5, sp: W, fact: `the wolves fell from ${w0} to ${w1}` });
    }
    if (n('distemper') >= 1 || n('mange') >= 2) cands.push({ title: 'The Sick Years', score: 3.5 + n('distemper') + 0.5 * n('mange'), sp: W, fact: 'disease ran through the wolves' });
    const bc = change(B);
    if (bc >= 1.3 && (d.end[B] ?? 0) >= 100) cands.push({ title: 'The Great Herd', score: 2 + 3 * bc, sp: B, fact: `the bison grew from ${b0} to ${b1}` });
    else if (bc <= 0.65 && (d.start[B] ?? 0) >= 50) cands.push({ title: 'The Lean Years', score: 2 + 3 / Math.max(0.2, bc) * 0.5, sp: B, fact: `the bison fell from ${b0} to ${b1}` });
    const pc = change(P);
    if (pc >= 1.6 && (d.end[P] ?? 0) >= 50) cands.push({ title: 'The Pronghorn Years', score: 1.5 + 2 * pc, sp: P, fact: `the pronghorn rose from ${fmtInt(d.start[P] ?? 0)} to ${fmtInt(d.end[P] ?? 0)}` });
    if (n('hareBoom') >= 1 && n('hareCrash') >= 1) cands.push({ title: 'Boom and Bust', score: 3, sp: 4, fact: 'the jackrabbits boomed and crashed' });
    const rc = change(R);
    if (rc >= 1.8 && (d.end[R] ?? 0) >= 40) cands.push({ title: 'The Raven Years', score: 1 + 1.5 * rc, sp: R, fact: `the ravens gathered, ${fmtInt(d.start[R] ?? 0)} to ${fmtInt(d.end[R] ?? 0)}` });

    const tick = yearStartTick(lastYear + 1) - 1;
    cands.sort((x, y) => y.score - x.score);
    if (!cands.length) {
      const fact = `the bison ${bc >= 1 ? 'held at' : 'eased to'} ${b1} and the wolves ${w1 === w0 ? 'held at' : 'settled at'} ${w1}`;
      return { tick, year: lastYear, title: 'The Quiet Years', sp: -1, weight: 4, kind: 'decade', sentence: `Years ${firstYear} to ${lastYear}: the quiet years; ${fact}.` };
    }
    const top = cands[0];
    const second = cands.find((c) => c !== top && c.sp !== top.sp && c.title !== top.title);
    const facts = [top.fact, second?.fact].filter(Boolean).join(', and ');
    return { tick, year: lastYear, title: top.title, sp: top.sp, weight: 4, kind: 'decade', sentence: `Years ${firstYear} to ${lastYear}, ${top.title.replace(/^The /, 'the ')}: ${facts}.` };
  }
}

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
