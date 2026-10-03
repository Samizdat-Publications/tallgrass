// Keeps the chronicle readable: the sim reports far more stampedes, elders and outbreaks than a person wants to read.
// Quiet kinds are rate-limited; the predator-prey drama (packs, extinctions, introductions, droughts, first kill, fire)
// always gets through.
import { YEAR_TICKS } from '../sim/types';
import type { SimEvent } from '../sim/sim';

/** A stampede within this window of the last one is dropped unless it is much bigger. */
export const STAMPEDE_GAP = 2 * YEAR_TICKS;
/** "Much bigger" than the last listed stampede, and at least this many ticks later. */
const STAMPEDE_BIGGER = 1.6;
const STAMPEDE_MIN_GAP = 600;
/** At most one elder per species per this many ticks, and one across all species per year. */
export const ELDER_GAP_SPECIES = 3 * YEAR_TICKS;
export const ELDER_GAP_ANY = YEAR_TICKS;
/** At most one outbreak per species per this many ticks. */
export const OUTBREAK_GAP = Math.round(1.5 * YEAR_TICKS);

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
          if (gap < STAMPEDE_GAP && !(gap >= STAMPEDE_MIN_GAP && bigger)) return false;
        }
        this.last.set(key, e.tick);
        this.lastCount.set(key, e.a);
        return true;
      }
      case 'elder': {
        const sKey = `elder:${e.sp}`;
        const aKey = 'elder:any';
        const ts = this.last.get(sKey), ta = this.last.get(aKey);
        if (ts !== undefined && e.tick >= ts && e.tick - ts < ELDER_GAP_SPECIES) return false;
        if (ta !== undefined && e.tick >= ta && e.tick - ta < ELDER_GAP_ANY) return false;
        this.last.set(sKey, e.tick);
        this.last.set(aKey, e.tick);
        return true;
      }
      case 'outbreak': {
        const key = `outbreak:${e.sp}`;
        const t = this.last.get(key);
        if (t !== undefined && e.tick >= t && e.tick - t < OUTBREAK_GAP) return false;
        this.last.set(key, e.tick);
        return true;
      }
      case 'fire':
      case 'rain':
      case 'record': {
        const gap = e.kind === 'record' ? YEAR_TICKS : e.kind === 'rain' ? 600 : 300;
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
