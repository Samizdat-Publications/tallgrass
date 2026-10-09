// Bison herd bands (param herdBands, off by default).
//
// Real plains bison graze in bands of a few dozen (cows, calves and young bulls) with grass between the bands. With herdBands on every bison
// carries a band id (Agents.band). The herd scan in sim.ts uses it: cohesion and alignment look only at band-mates, other bands within
// bandGap push away softly. This file keeps the bookkeeping: founding bands, joining strays, and the periodic split and merge.
//
// Determinism: all draws come from the generator below, derived from the seed with its own salt. Nothing here touches the main stream
// and nothing calls rng.fork(), so a run with herdBands off is bit-identical to a run without this file.
import { Agents } from './agents';
import { Params } from './params';
import { hashSeed, Rng } from './rng';
import { Sp } from './types';

/** Ticks between centre refreshes (also when stray bison are assigned a band). */
export const BAND_REFRESH = 30;
/** A stray bison (introduced or arrived) joins the nearest band if its centre is within this many metres, else it starts a band. */
const JOIN_RADIUS = 45;

export interface BandStats {
  /** Bands with at least one living member. */
  bands: number;
  /** Mean members per band. */
  mean: number;
  /** Median over bands of the distance (m) to the nearest other band's centre (NaN with fewer than 2 bands). */
  gap: number;
}

export class Bands {
  private rng: Rng;
  private next = 0;
  /** Per band id: centre and member count at the last refresh. */
  private cx: number[] = [];
  private cy: number[] = [];
  private cnt: number[] = [];

  constructor(private a: Agents, private p: Params, seed: number) {
    this.rng = new Rng(hashSeed(seed + ':bands'));
  }

  private bison(): number[] {
    const a = this.a, out: number[] = [];
    for (let i = 0; i < a.hi; i++) if (a.alive[i] && a.sp[i] === Sp.Bison) out.push(i);
    return out;
  }

  /** Split the founding bison into bands of about bandSize by where they stand: K seeds, a few rounds of nearest-seed assignment. */
  seedFounders(): void {
    const a = this.a, rng = this.rng;
    const slots = this.bison();
    const n = slots.length;
    if (n === 0) return;
    const K = Math.max(1, Math.round(n / Math.max(1, this.p.bandSize)));
    // K distinct bison as the first seeds (partial shuffle on a copy)
    const pool = slots.slice();
    const sx: number[] = [], sy: number[] = [];
    for (let k = 0; k < K; k++) {
      const j = k + rng.int(n - k);
      const t = pool[k]; pool[k] = pool[j]; pool[j] = t;
      sx.push(a.x[pool[k]]);
      sy.push(a.y[pool[k]]);
    }
    const own = new Int32Array(n);
    for (let round = 0; round < 6; round++) {
      const mx = new Float64Array(K), my = new Float64Array(K), mc = new Int32Array(K);
      for (let q = 0; q < n; q++) {
        const i = slots[q];
        let best = 0, bd = 1e18;
        for (let k = 0; k < K; k++) {
          const dx = a.x[i] - sx[k], dy = a.y[i] - sy[k];
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = k; }
        }
        own[q] = best;
        mx[best] += a.x[i]; my[best] += a.y[i]; mc[best]++;
      }
      for (let k = 0; k < K; k++) if (mc[k] > 0) { sx[k] = mx[k] / mc[k]; sy[k] = my[k] / mc[k]; }
    }
    for (let q = 0; q < n; q++) a.band[slots[q]] = own[q];
    this.next = K;
    this.refresh();
  }

  /** Called every tick from the sim loop (after the herd positions are final for the tick). */
  step(t: number): void {
    const check = Math.max(1, this.p.bandCheck | 0);
    if (t % BAND_REFRESH === 0 || t % check === 0) this.refresh();
    if (t % check === 0) {
      if (this.split()) this.refresh();
      if (this.merge()) this.refresh();
    }
  }

  /** Recompute centres and counts, and put every band-less bison (introduced or arrived) in a band. */
  private refresh(): void {
    const a = this.a;
    const m = this.next;
    this.cx.length = this.cy.length = this.cnt.length = m;
    for (let b = 0; b < m; b++) { this.cx[b] = 0; this.cy[b] = 0; this.cnt[b] = 0; }
    let strays = false;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Bison) continue;
      const b = a.band[i];
      if (b < 0) { strays = true; continue; }
      this.cx[b] += a.x[i]; this.cy[b] += a.y[i]; this.cnt[b]++;
    }
    for (let b = 0; b < m; b++) if (this.cnt[b] > 0) { this.cx[b] /= this.cnt[b]; this.cy[b] /= this.cnt[b]; }
    if (!strays) return;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Bison || a.band[i] >= 0) continue;
      let best = -1, bd = JOIN_RADIUS * JOIN_RADIUS;
      for (let b = 0; b < this.next; b++) {
        if (this.cnt[b] === 0) continue;
        const dx = a.x[i] - this.cx[b], dy = a.y[i] - this.cy[b];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = b; }
      }
      if (best < 0) {
        best = this.next++;
        this.cx.push(a.x[i]); this.cy.push(a.y[i]); this.cnt.push(1);
      } else {
        const c = this.cnt[best];
        this.cx[best] = (this.cx[best] * c + a.x[i]) / (c + 1);
        this.cy[best] = (this.cy[best] * c + a.y[i]) / (c + 1);
        this.cnt[best] = c + 1;
      }
      a.band[i] = best;
    }
  }

  /** A band larger than bandMax splits in two along a random axis through its centre; the far half gets a new id. Returns true if any split. */
  private split(): boolean {
    const a = this.a, max = this.p.bandMax;
    const m = this.next;
    let ux: number[] | null = null, uy: number[] = [], nid: number[] = [];
    for (let b = 0; b < m; b++) {
      if (this.cnt[b] <= max) continue;
      if (ux === null) { ux = new Array(m).fill(0); uy = new Array(m).fill(0); nid = new Array(m).fill(-1); }
      const ang = this.rng.next() * Math.PI;
      ux[b] = Math.cos(ang); uy[b] = Math.sin(ang);
      nid[b] = this.next++;
    }
    if (ux === null) return false;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Bison) continue;
      const b = a.band[i];
      if (b < 0 || b >= m || nid[b] < 0) continue;
      if ((a.x[i] - this.cx[b]) * ux[b] + (a.y[i] - this.cy[b]) * uy[b] > 0) a.band[i] = nid[b];
    }
    return true;
  }

  /** A band smaller than bandMin merges into the nearest other band. Returns true if any merge. */
  private merge(): boolean {
    const a = this.a, min = this.p.bandMin;
    const m = this.next;
    const to = new Int32Array(m).fill(-1);
    let any = false;
    for (let b = 0; b < m; b++) {
      const c = this.cnt[b];
      if (c === 0 || c >= min) continue;
      let best = -1, bd = 1e18;
      for (let o = 0; o < m; o++) {
        if (o === b || this.cnt[o] === 0) continue;
        const dx = this.cx[o] - this.cx[b], dy = this.cy[o] - this.cy[b];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = o; }
      }
      if (best < 0) continue;
      to[b] = best;
      const co = this.cnt[best];
      this.cx[best] = (this.cx[best] * co + this.cx[b] * c) / (co + c);
      this.cy[best] = (this.cy[best] * co + this.cy[b] * c) / (co + c);
      this.cnt[best] = co + c;
      this.cnt[b] = 0;
      any = true;
    }
    if (!any) return false;
    for (let i = 0; i < a.hi; i++) {
      if (!a.alive[i] || a.sp[i] !== Sp.Bison) continue;
      let b = a.band[i];
      if (b < 0 || b >= m) continue;
      while (to[b] >= 0) b = to[b];
      a.band[i] = b;
    }
    return true;
  }

  /** The centre of a band at the last refresh, or false when the band has no living members. */
  centre(b: number, out: Float64Array): boolean {
    if (b < 0 || b >= this.cnt.length || this.cnt[b] === 0) return false;
    out[0] = this.cx[b];
    out[1] = this.cy[b];
    return true;
  }

  /** Read-only summary for the sample columns. */
  stats(): BandStats {
    const ids: number[] = [];
    let total = 0;
    for (let b = 0; b < this.cnt.length; b++) if (this.cnt[b] > 0) { ids.push(b); total += this.cnt[b]; }
    const gaps: number[] = [];
    for (const b of ids) {
      let bd = 1e18;
      for (const o of ids) {
        if (o === b) continue;
        const dx = this.cx[o] - this.cx[b], dy = this.cy[o] - this.cy[b];
        const d = dx * dx + dy * dy;
        if (d < bd) bd = d;
      }
      if (bd < 1e18) gaps.push(Math.sqrt(bd));
    }
    gaps.sort((p, q) => p - q);
    const g = gaps.length;
    return {
      bands: ids.length,
      mean: ids.length ? total / ids.length : NaN,
      gap: g === 0 ? NaN : g % 2 ? gaps[(g - 1) / 2] : (gaps[g / 2 - 1] + gaps[g / 2]) / 2,
    };
  }
}
