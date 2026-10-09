// Seasonal visitors in the population panel. Golden eagles winter in the valley and red-tailed hawks summer in it
// (src/sim/sp/raptor.ts), so a count of zero at the wrong time of year is a bird that is away, not a species that died out.
// This module says when each one is due to be away, so the panel can write "away for the summer" and draw the gap as a
// quiet dashed stretch instead of a drop to zero. Pure: no DOM, so it runs under Node.
import { SPECIES_KEYS } from '../sim/types';
import { seasonPhrase } from './describe';

interface Migrant {
  /** Season position (0..4, 0 = spring start) at which the birds come back. */
  arrive: number;
  /** Season position at which they leave. */
  leave: number;
  /** The season the panel names for the stretch they are away ("away for the summer"). */
  awayFor: 'summer' | 'winter';
}

/** The raptor schedule (raptor.ts): eagles arrive at season 2.5 and leave at 0.5; hawks return at 0.3 and leave at 2.4. */
const MIGRANTS: Record<string, Migrant> = {
  eagle: { arrive: 2.5, leave: 0.5, awayFor: 'summer' },
  hawk: { arrive: 0.3, leave: 2.4, awayFor: 'winter' },
};

/** Birds fly in over a few days, not on the stroke of the arrival tick: a count of zero this long after it is still "on their way". */
const ARRIVAL_GRACE = 0.15;

const norm = (season: number): number => ((season % 4) + 4) % 4;

function migrantOf(sp: number): Migrant | null {
  return MIGRANTS[SPECIES_KEYS[sp] ?? ''] ?? null;
}

/** True for the species that come and go with the seasons (eagle, hawk). */
export function isMigrant(sp: number): boolean {
  return migrantOf(sp) !== null;
}

/** True when `season` (0..4, wraps) falls in the stretch this migrant is meant to be away, including the few days it takes to arrive. */
export function inAwayWindow(sp: number, season: number): boolean {
  const m = migrantOf(sp);
  if (!m) return false;
  const s = norm(season);
  const a = m.leave, b = norm(m.arrive + ARRIVAL_GRACE);
  // the away stretch runs from `leave` round to `arrive` (+ grace); it wraps the year end when arrive is the smaller number
  return a <= b ? s >= a && s < b : s >= a || s < b;
}

export type AwayState = 'away' | 'arriving' | null;

/**
 * What a count of `pop` means for `sp` at `season`. Null for an ordinary reading (including a migrant that is at zero in its own
 * season: that one really is gone). 'arriving' is a visitor this valley has not yet seen at all; 'away' one that has been and gone.
 */
export function awayState(sp: number, season: number, pop: number, everSeen: boolean): AwayState {
  if (pop > 0 || !inAwayWindow(sp, season)) return null;
  return everSeen ? 'away' : 'arriving';
}

/** "away for the summer" / "away for the winter". */
export function awayLabel(sp: number): string {
  const m = migrantOf(sp);
  return m ? `away for the ${m.awayFor}` : 'away';
}

/** "arriving in mid-autumn": for a visitor that has not come yet, in the same words as the header's season. */
export function arrivingLabel(sp: number): string {
  const m = migrantOf(sp);
  return m ? `arriving in ${seasonPhrase(m.arrive)}` : 'arriving';
}

/** The words for a state, or '' for none. */
export function awayText(sp: number, state: AwayState): string {
  return state === 'away' ? awayLabel(sp) : state === 'arriving' ? arrivingLabel(sp) : '';
}

/**
 * Which rows of a series are "away": the count is zero in the migrant's away stretch. `seasonAt(i)` is the season of row i.
 * A row of zero anywhere else (a real crash) is not flagged, so the line still falls there.
 */
export function awayRows(sp: number, vals: ArrayLike<number>, seasonAt: (i: number) => number, from = 0, to = vals.length): boolean[] {
  const out: boolean[] = [];
  if (!isMigrant(sp)) {
    for (let i = from; i < to; i++) out.push(false);
    return out;
  }
  for (let i = from; i < to; i++) out.push(vals[i] === 0 && inAwayWindow(sp, seasonAt(i)));
  return out;
}

/**
 * The values to draw: each away row takes the nearest present value before it (or, at the start, the first one after it; or `floor`
 * when nothing was ever present), so an away stretch is a level line to be drawn dashed, not a plunge to zero.
 */
export function holdAway(vals: ArrayLike<number>, away: boolean[], from = 0, floor = 0): number[] {
  const n = away.length;
  const out: number[] = new Array(n);
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    if (!away[i]) prev = vals[from + i];
    out[i] = away[i] ? prev : vals[from + i];
  }
  // a leading away stretch borrows the first present value
  let first = NaN;
  for (let i = 0; i < n; i++) if (!away[i]) { first = vals[from + i]; break; }
  for (let i = 0; i < n && away[i]; i++) out[i] = Number.isFinite(first) ? first : floor;
  for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) out[i] = floor;
  return out;
}
