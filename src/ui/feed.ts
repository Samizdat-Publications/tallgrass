// Keeps the chronicle readable: the sim reports far more stampedes, elders and outbreaks than a person wants to read.
// Quiet kinds are rate-limited; the predator-prey drama (packs, extinctions, introductions, droughts, first kill, fire)
// always gets through.
import { SEASON_TICKS, YEAR_TICKS } from '../sim/types';
import type { SimEvent } from '../sim/sim';

// The valley calendar can be scaled (calendarScale), and the game sets it after this module loads, so every window is
// computed when it is used, never copied into a constant.

/** A stampede within this window of the last one (two valley years) is dropped unless it is much bigger. */
export const stampedeGap = (): number => 2 * YEAR_TICKS;
/** "Much bigger" than the last listed stampede, and at least this many ticks later. */
const STAMPEDE_BIGGER = 1.6;
/** ... and at least a season later. */
const stampedeMinGap = (): number => SEASON_TICKS;
/** At most one elder per species per this many ticks, and one across all species per year. */
export const elderGapSpecies = (): number => 3 * YEAR_TICKS;
export const elderGapAny = (): number => YEAR_TICKS;
/** At most one outbreak per species per this many ticks. */
export const outbreakGap = (): number => Math.round(1.5 * YEAR_TICKS);

export class FeedFilter {
  private last = new Map<string, number>();
  private lastCount = new Map<string, number>();

  reset(): void {
    this.last.clear();
    this.lastCount.clear();
  }

  /** True when the event belongs in the chronicle, on the graph and in the card queue. Records what it lets through. */
  accept(e: SimEvent): boolean {
    switch (e.kind) {
      case 'stampede': {
        const key = 'stampede';
        const t = this.last.get(key);
        if (t !== undefined && e.tick >= t) {
          const gap = e.tick - t;
          const bigger = e.a >= (this.lastCount.get(key) ?? 0) * STAMPEDE_BIGGER;
          if (gap < stampedeGap() && !(gap >= stampedeMinGap() && bigger)) return false;
        }
        this.last.set(key, e.tick);
        this.lastCount.set(key, e.a);
        return true;
      }
      case 'elder': {
        const sKey = `elder:${e.sp}`;
        const aKey = 'elder:any';
        const ts = this.last.get(sKey), ta = this.last.get(aKey);
        if (ts !== undefined && e.tick >= ts && e.tick - ts < elderGapSpecies()) return false;
        if (ta !== undefined && e.tick >= ta && e.tick - ta < elderGapAny()) return false;
        this.last.set(sKey, e.tick);
        this.last.set(aKey, e.tick);
        return true;
      }
      case 'outbreak': {
        const key = `outbreak:${e.sp}`;
        const t = this.last.get(key);
        if (t !== undefined && e.tick >= t && e.tick - t < outbreakGap()) return false;
        this.last.set(key, e.tick);
        return true;
      }
      case 'fire':
      case 'rain':
      case 'record': {
        const gap = e.kind === 'record' ? YEAR_TICKS : e.kind === 'rain' ? SEASON_TICKS : Math.round(SEASON_TICKS / 2);
        const t = this.last.get(e.kind);
        if (t !== undefined && e.tick >= t && e.tick - t < gap) return false;
        this.last.set(e.kind, e.tick);
        return true;
      }
      default:
        return true;
    }
  }
}
