// Lineage (S15): who begat whom, kept for the family tree panel, plus pack alpha dynasties.
//
// Living animals are read from the agent arrays. An animal that dies is written to a ring of RING_CAP records
// when it left offspring (children >= 1, or it mated as a male), was ever a pack alpha, or was ever followed by the player.
// Everything here is pure bookkeeping: no rng draws, no effect on sim behaviour, and no per-tick allocation
// (typed arrays are sized once; queries, which are rare and on request, may allocate freely).

import type { Agents } from './agents';

/** Death cause codes, the index into this list is the code. Must match the cause union of Sim.die(). */
export const DEATH_CAUSES = ['starve', 'thirst', 'old', 'killed', 'culled', 'removed', 'emigrated', 'disease'] as const;

export const RING_CAP = 30000;
export const DYNASTY_CAP = 2000;
/** Longest child list returned per animal in a query (earliest born kept). */
export const MAX_LISTED = 60;
/** Followed ids remembered before the oldest is forgotten. */
const MAX_FOLLOWED = 4096;

/** One animal, alive or dead. All fields are plain values, safe to post across the worker boundary. */
export interface LineageNode {
  id: number;
  /** Species id (Sp). */
  sp: number;
  male: boolean;
  /** Tick of birth (0 for founders). */
  born: number;
  /** Tick of death, -1 while alive. */
  died: number;
  /** Death cause code (see DEATH_CAUSES), -1 while alive. */
  cause: number;
  /** Generations since the founders (founders are 0). */
  gen: number;
  /** Offspring count as the sim keeps it (mothers always count; sires count only for wolves and ravens). Can exceed the listed children. */
  children: number;
  kills: number;
  alive: boolean;
  /** Pack serial (the number shown in pack names), -1 for none. For the dead: the pack at death, or the last alpha pack. */
  pack: number;
  /** Was ever the alpha of a pack. */
  alpha: boolean;
  /** Mother id, 0 for a founder. */
  parentA: number;
  /** Father id, 0 for a founder or unknown. */
  parentB: number;
}

/** A child (or grandchild) list is sorted by birth tick then id. Dead childless descendants are not recorded, so
 * the list can be shorter than the parent's `children` count. */
export interface LineageDescendant {
  node: LineageNode;
  /** This child's own children (the queried animal's grandchildren), at most MAX_LISTED. */
  children: LineageNode[];
}

export interface LineageTree {
  /** The queried animal. */
  self: LineageNode;
  /**
   * Ancestors by generation, null where unknown (founder, or the record was overwritten in the ring).
   * up[0] = [mother, father]; up[1] = [mother's mother, mother's father, father's mother, father's father];
   * up[2] = the 8 great-grandparents in the same order. Index k's parents are at 2k and 2k+1 of the next row.
   */
  up: [(LineageNode | null)[], (LineageNode | null)[], (LineageNode | null)[]];
  /** Children, each with their own children. */
  down: LineageDescendant[];
}

/** One alpha pair of a pack. An id of 0 means that seat was empty. */
export interface DynastyEntry {
  tick: number;
  /** Alpha female id (0 = vacant). */
  f: number;
  /** Alpha male id (0 = vacant). */
  m: number;
}

/** Open-addressing id -> int map in typed arrays, with deletion by backward shift. Id 0 is not a valid key. */
class IdTable {
  private keys: Uint32Array;
  private vals: Int32Array;
  private mask: number;
  private shift: number;
  n = 0;

  constructor(bits: number) {
    this.keys = new Uint32Array(1 << bits);
    this.vals = new Int32Array(1 << bits);
    this.mask = (1 << bits) - 1;
    this.shift = 32 - bits;
  }

  private home(id: number): number {
    return Math.imul(id, 0x9e3779b1) >>> this.shift;
  }

  get(id: number): number {
    let i = this.home(id);
    for (;;) {
      const k = this.keys[i];
      if (k === id) return this.vals[i];
      if (k === 0) return -1;
      i = (i + 1) & this.mask;
    }
  }

  set(id: number, v: number): void {
    let i = this.home(id);
    for (;;) {
      const k = this.keys[i];
      if (k === id) { this.vals[i] = v; return; }
      if (k === 0) { this.keys[i] = id; this.vals[i] = v; this.n++; return; }
      i = (i + 1) & this.mask;
    }
  }

  delete(id: number): void {
    let i = this.home(id);
    for (;;) {
      const k = this.keys[i];
      if (k === 0) return;
      if (k === id) break;
      i = (i + 1) & this.mask;
    }
    this.keys[i] = 0;
    this.n--;
    let j = i;
    for (;;) {
      j = (j + 1) & this.mask;
      const k = this.keys[j];
      if (k === 0) return;
      const h = this.home(k);
      // an entry whose home lies cyclically in (i, j] must stay where it is
      if (i <= j ? i < h && h <= j : i < h || h <= j) continue;
      this.keys[i] = k;
      this.vals[i] = this.vals[j];
      this.keys[j] = 0;
      i = j;
    }
  }
}

/** What the lineage needs to see of the sim's wolf packs (the sim's own arrays, shared by reference). */
export interface PackView {
  alive: Uint8Array;
  serial: Int32Array;
  alphaF: Int32Array;
  alphaM: Int32Array;
}

export class Lineage {
  readonly cap: number;
  readonly dynCap: number;
  private a: Agents;
  private packs: PackView;

  // ring of dead records
  private rId: Uint32Array;
  private rParentA: Uint32Array;
  private rParentB: Uint32Array;
  private rBorn: Int32Array;
  private rDied: Int32Array;
  private rPack: Int32Array;
  private rGen: Uint16Array;
  private rChildren: Uint16Array;
  private rKills: Uint16Array;
  private rSp: Uint8Array;
  private rMale: Uint8Array;
  private rCause: Uint8Array;
  private rAlpha: Uint8Array;
  private head = 0;
  /** Records currently held (<= cap). */
  count = 0;
  /** Records ever written. */
  written = 0;
  private index: IdTable;

  // per-agent-slot marks, valid only while the stored id equals the slot's current id
  private sireId = new Uint32Array(0);
  private alphaId = new Uint32Array(0);
  private alphaSerial = new Int32Array(0);

  private followed = new Set<number>();

  // dynasty ring
  private dSerial: Int32Array;
  private dTick: Int32Array;
  private dF: Uint32Array;
  private dM: Uint32Array;
  private dHead = 0;
  dynCount = 0;
  private lastSerial: Int32Array;
  private lastF: Uint32Array;
  private lastM: Uint32Array;

  constructor(a: Agents, packs: PackView, cap = RING_CAP, dynCap = DYNASTY_CAP) {
    this.a = a;
    this.packs = packs;
    this.cap = cap;
    this.dynCap = dynCap;
    this.rId = new Uint32Array(cap);
    this.rParentA = new Uint32Array(cap);
    this.rParentB = new Uint32Array(cap);
    this.rBorn = new Int32Array(cap);
    this.rDied = new Int32Array(cap);
    this.rPack = new Int32Array(cap);
    this.rGen = new Uint16Array(cap);
    this.rChildren = new Uint16Array(cap);
    this.rKills = new Uint16Array(cap);
    this.rSp = new Uint8Array(cap);
    this.rMale = new Uint8Array(cap);
    this.rCause = new Uint8Array(cap);
    this.rAlpha = new Uint8Array(cap);
    let bits = 4;
    while (1 << bits < cap * 2) bits++;
    this.index = new IdTable(bits);
    this.dSerial = new Int32Array(dynCap);
    this.dTick = new Int32Array(dynCap);
    this.dF = new Uint32Array(dynCap);
    this.dM = new Uint32Array(dynCap);
    const np = packs.alive.length;
    this.lastSerial = new Int32Array(np);
    this.lastF = new Uint32Array(np);
    this.lastM = new Uint32Array(np);
  }

  // ------------------------------------------------------------------ hooks called by the sim

  /** The player started following this animal: it will be recorded when it dies, whether or not it breeds. */
  follow(id: number): void {
    if (id === 0) return;
    const f = this.followed;
    if (f.has(id)) return;
    if (f.size >= MAX_FOLLOWED) f.delete(f.values().next().value as number);
    f.add(id);
  }

  /** A male was chosen as a mate (herbivores and cougars do not credit the sire's child count at birth). */
  onMate(slot: number): void {
    if (this.sireId.length < this.a.cap) this.growMarks();
    this.sireId[slot] = this.a.id[slot];
  }

  /** Called from Sim.die() just before the slot is freed. */
  onDeath(slot: number, cause: number, tick: number): void {
    const a = this.a;
    const id = a.id[slot];
    const sired = slot < this.sireId.length && this.sireId[slot] === id;
    const isAlpha = slot < this.alphaId.length && this.alphaId[slot] === id;
    if (a.children[slot] === 0 && !sired && !isAlpha && !(this.followed.size > 0 && this.followed.has(id))) return;
    const pk = a.pack[slot];
    let pack = -1;
    if (pk >= 0) pack = this.packs.serial[pk];
    else if (isAlpha) pack = this.alphaSerial[slot];

    const s = this.head;
    if (this.count === this.cap) this.index.delete(this.rId[s]);
    else this.count++;
    this.rId[s] = id;
    this.rParentA[s] = a.parentA[slot];
    this.rParentB[s] = a.parentB[slot];
    this.rBorn[s] = a.born[slot];
    this.rDied[s] = tick;
    this.rPack[s] = pack;
    this.rGen[s] = a.gen[slot];
    this.rChildren[s] = a.children[slot];
    this.rKills[s] = a.kills[slot];
    this.rSp[s] = a.sp[slot];
    this.rMale[s] = a.male[slot];
    this.rCause[s] = cause;
    this.rAlpha[s] = isAlpha ? 1 : 0;
    this.index.set(id, s);
    this.head = s + 1 === this.cap ? 0 : s + 1;
    this.written++;
  }

  /** Called once per tick after the sim has settled each pack's alphas; logs any change of alpha pair. */
  syncAlphas(tick: number): void {
    const p = this.packs, a = this.a;
    const n = p.alive.length;
    for (let pk = 0; pk < n; pk++) {
      if (!p.alive[pk]) { this.lastSerial[pk] = 0; continue; }
      const ser = p.serial[pk];
      if (ser !== this.lastSerial[pk]) { this.lastSerial[pk] = ser; this.lastF[pk] = 0; this.lastM[pk] = 0; }
      const fi = p.alphaF[pk], mi = p.alphaM[pk];
      const f = fi >= 0 && a.alive[fi] ? a.id[fi] : 0;
      const m = mi >= 0 && a.alive[mi] ? a.id[mi] : 0;
      if (f === this.lastF[pk] && m === this.lastM[pk]) continue;
      if (f !== 0 && f !== this.lastF[pk]) this.markAlpha(fi, ser);
      if (m !== 0 && m !== this.lastM[pk]) this.markAlpha(mi, ser);
      this.lastF[pk] = f;
      this.lastM[pk] = m;
      const d = this.dHead;
      this.dSerial[d] = ser;
      this.dTick[d] = tick;
      this.dF[d] = f;
      this.dM[d] = m;
      this.dHead = d + 1 === this.dynCap ? 0 : d + 1;
      if (this.dynCount < this.dynCap) this.dynCount++;
    }
  }

  private markAlpha(slot: number, serial: number): void {
    if (this.alphaId.length < this.a.cap) this.growMarks();
    this.alphaId[slot] = this.a.id[slot];
    this.alphaSerial[slot] = serial;
  }

  private growMarks(): void {
    const cap = this.a.cap;
    const s = new Uint32Array(cap); s.set(this.sireId); this.sireId = s;
    const al = new Uint32Array(cap); al.set(this.alphaId); this.alphaId = al;
    const sr = new Int32Array(cap); sr.set(this.alphaSerial); this.alphaSerial = sr;
  }

  // ------------------------------------------------------------------ queries (UI requests)

  /** Is this id held in the ring of dead records? */
  hasRecord(id: number): boolean {
    return this.index.get(id) >= 0;
  }

  /** Alpha pairs of one pack serial over time, oldest first (only the last DYNASTY_CAP changes of all packs are kept). */
  dynasty(packSerial: number): DynastyEntry[] {
    const out: DynastyEntry[] = [];
    const start = this.dynCount < this.dynCap ? 0 : this.dHead;
    for (let k = 0; k < this.dynCount; k++) {
      const d = (start + k) % this.dynCap;
      if (this.dSerial[d] === packSerial) out.push({ tick: this.dTick[d], f: this.dF[d], m: this.dM[d] });
    }
    return out;
  }

  /** Family tree of one animal: 3 generations up, 2 down. Null when the id is neither alive nor recorded. */
  query(id: number): LineageTree | null {
    const a = this.a;
    const live = new Map<number, number>();
    for (let i = 0; i < a.hi; i++) if (a.alive[i]) live.set(a.id[i], i);
    const nodeOf = (x: number): LineageNode | null => {
      if (x === 0) return null;
      const s = this.index.get(x);
      if (s >= 0) return this.recordNode(s);
      const i = live.get(x);
      return i === undefined ? null : this.liveNode(i);
    };
    const self = nodeOf(id);
    if (!self) return null;

    const row = (prev: (LineageNode | null)[]): (LineageNode | null)[] => {
      const out: (LineageNode | null)[] = [];
      for (const p of prev) out.push(p ? nodeOf(p.parentA) : null, p ? nodeOf(p.parentB) : null);
      return out;
    };
    const up0 = [nodeOf(self.parentA), nodeOf(self.parentB)];
    const up1 = row(up0);
    const up2 = row(up1);

    // children: every recorded or living animal naming a target as a parent (two passes: children, then theirs)
    const kidsOf = (targets: Set<number>): Map<number, LineageNode[]> => {
      const out = new Map<number, LineageNode[]>();
      const add = (par: number, node: () => LineageNode): void => {
        if (par === 0 || !targets.has(par)) return;
        let l = out.get(par);
        if (!l) out.set(par, (l = []));
        l.push(node());
      };
      for (let k = 0; k < this.count; k++) {
        const pa = this.rParentA[k], pb = this.rParentB[k];
        if (targets.has(pa) || targets.has(pb)) {
          const n = this.recordNode(k);
          add(pa, () => n);
          if (pb !== pa) add(pb, () => n);
        }
      }
      for (let i = 0; i < a.hi; i++) {
        if (!a.alive[i]) continue;
        const pa = a.parentA[i], pb = a.parentB[i];
        if (targets.has(pa) || targets.has(pb)) {
          const n = this.liveNode(i);
          add(pa, () => n);
          if (pb !== pa) add(pb, () => n);
        }
      }
      for (const l of out.values()) l.sort((p, q) => p.born - q.born || p.id - q.id);
      return out;
    };
    const kids = (kidsOf(new Set([id])).get(id) ?? []).slice(0, MAX_LISTED);
    const grand = kids.length > 0 ? kidsOf(new Set(kids.map((k) => k.id))) : new Map<number, LineageNode[]>();
    const down = kids.map((node) => ({ node, children: (grand.get(node.id) ?? []).slice(0, MAX_LISTED) }));
    return { self, up: [up0, up1, up2], down };
  }

  private recordNode(s: number): LineageNode {
    return {
      id: this.rId[s], sp: this.rSp[s], male: this.rMale[s] === 1, born: this.rBorn[s], died: this.rDied[s], cause: this.rCause[s],
      gen: this.rGen[s], children: this.rChildren[s], kills: this.rKills[s], alive: false, pack: this.rPack[s], alpha: this.rAlpha[s] === 1,
      parentA: this.rParentA[s], parentB: this.rParentB[s],
    };
  }

  private liveNode(i: number): LineageNode {
    const a = this.a;
    const id = a.id[i];
    const isAlpha = i < this.alphaId.length && this.alphaId[i] === id;
    return {
      id, sp: a.sp[i], male: a.male[i] === 1, born: a.born[i], died: -1, cause: -1,
      gen: a.gen[i], children: a.children[i], kills: a.kills[i], alive: true, pack: a.pack[i] >= 0 ? this.packs.serial[a.pack[i]] : -1, alpha: isAlpha,
      parentA: a.parentA[i], parentB: a.parentB[i],
    };
  }
}
