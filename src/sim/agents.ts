// Struct-of-arrays agent storage with a deterministic free list.

/** Gene indices. Values are multipliers around 1, except COAT (0 pale .. 1 dark) and HERD/BOLD (0..2). */
export const G_SPEED = 0;
export const G_SIZE = 1;
export const G_SIGHT = 2;
export const G_BOLD = 3;
export const G_HERD = 4;
export const G_COAT = 5;
export const G_LITTER = 6;
export const NG = 7;
export const GENE_NAMES = ['speed', 'size', 'sight', 'boldness', 'herding', 'coat', 'litter'];

export class Agents {
  cap = 0;
  /** Highest slot ever used + 1, so loops can stop early. */
  hi = 0;
  count = 0;
  nextId = 1;
  private free: number[] = [];

  alive!: Uint8Array;
  sp!: Uint8Array;
  male!: Uint8Array;
  state!: Uint8Array;
  id!: Uint32Array;
  x!: Float32Array;
  y!: Float32Array;
  vx!: Float32Array;
  vy!: Float32Array;
  dvx!: Float32Array;
  dvy!: Float32Array;
  heading!: Float32Array;
  energy!: Float32Array;
  hydration!: Float32Array;
  stamina!: Float32Array;
  alt!: Float32Array;
  fleeX!: Float32Array;
  fleeY!: Float32Array;
  /** Generic target point (a cougar's ambush spot). */
  tx!: Float32Array;
  ty!: Float32Array;
  age!: Int32Array;
  born!: Int32Array;
  timer!: Int32Array;
  flee!: Int32Array;
  pregnant!: Int32Array;
  cooldown!: Int32Array;
  infected!: Int32Array;
  immune!: Int32Array;
  target!: Int32Array;
  targetId!: Uint32Array;
  mother!: Int32Array;
  motherId!: Uint32Array;
  pack!: Int16Array;
  /** Same-species herd-mates within reach at the last herd scan (herbivores). */
  nbr!: Uint8Array;
  gen!: Uint16Array;
  kills!: Uint16Array;
  children!: Uint16Array;
  parentA!: Uint32Array;
  parentB!: Uint32Array;
  genes!: Float32Array;
  mateGenes!: Float32Array;
  mateId!: Uint32Array;
  /** 0 native, 1 immigrant, 2 vagrant (later work packages; always 0 until then). */
  origin!: Uint8Array;
  /** Generic countdown (migration and dispersal timers). */
  cdv!: Uint16Array;
  /** Mange severity 0..1. */
  mange!: Float32Array;

  constructor(cap: number) {
    this.grow(cap);
  }

  private grow(cap: number): void {
    const old = this.cap;
    const g = <T extends { length: number; set(a: ArrayLike<number>): void }>(C: new (n: number) => T, prev: T | undefined, stride = 1): T => {
      const a = new C(cap * stride);
      if (prev) a.set(prev as unknown as ArrayLike<number>);
      return a;
    };
    this.alive = g(Uint8Array, this.alive);
    this.sp = g(Uint8Array, this.sp);
    this.male = g(Uint8Array, this.male);
    this.state = g(Uint8Array, this.state);
    this.id = g(Uint32Array, this.id);
    this.x = g(Float32Array, this.x);
    this.y = g(Float32Array, this.y);
    this.vx = g(Float32Array, this.vx);
    this.vy = g(Float32Array, this.vy);
    this.dvx = g(Float32Array, this.dvx);
    this.dvy = g(Float32Array, this.dvy);
    this.heading = g(Float32Array, this.heading);
    this.energy = g(Float32Array, this.energy);
    this.hydration = g(Float32Array, this.hydration);
    this.stamina = g(Float32Array, this.stamina);
    this.alt = g(Float32Array, this.alt);
    this.fleeX = g(Float32Array, this.fleeX);
    this.fleeY = g(Float32Array, this.fleeY);
    this.tx = g(Float32Array, this.tx);
    this.ty = g(Float32Array, this.ty);
    this.age = g(Int32Array, this.age);
    this.born = g(Int32Array, this.born);
    this.timer = g(Int32Array, this.timer);
    this.flee = g(Int32Array, this.flee);
    this.pregnant = g(Int32Array, this.pregnant);
    this.cooldown = g(Int32Array, this.cooldown);
    this.infected = g(Int32Array, this.infected);
    this.immune = g(Int32Array, this.immune);
    this.target = g(Int32Array, this.target);
    this.targetId = g(Uint32Array, this.targetId);
    this.mother = g(Int32Array, this.mother);
    this.motherId = g(Uint32Array, this.motherId);
    this.pack = g(Int16Array, this.pack);
    this.nbr = g(Uint8Array, this.nbr);
    this.gen = g(Uint16Array, this.gen);
    this.kills = g(Uint16Array, this.kills);
    this.children = g(Uint16Array, this.children);
    this.parentA = g(Uint32Array, this.parentA);
    this.parentB = g(Uint32Array, this.parentB);
    this.genes = g(Float32Array, this.genes, NG);
    this.mateGenes = g(Float32Array, this.mateGenes, NG);
    this.mateId = g(Uint32Array, this.mateId);
    this.origin = g(Uint8Array, this.origin);
    this.cdv = g(Uint16Array, this.cdv);
    this.mange = g(Float32Array, this.mange);
    // newly added slots go on the free list in descending order so pop() yields ascending slots
    for (let i = cap - 1; i >= old; i--) this.free.push(i);
    this.cap = cap;
  }

  spawn(): number {
    if (this.free.length === 0) this.grow(this.cap * 2);
    const i = this.free.pop()!;
    this.alive[i] = 1;
    this.id[i] = this.nextId++;
    this.state[i] = 0;
    this.vx[i] = this.vy[i] = this.dvx[i] = this.dvy[i] = 0;
    this.stamina[i] = 1;
    this.alt[i] = 0;
    this.fleeX[i] = this.fleeY[i] = 0;
    this.tx[i] = this.ty[i] = 0;
    this.age[i] = 0;
    this.timer[i] = 0;
    this.flee[i] = 0;
    this.pregnant[i] = 0;
    this.cooldown[i] = 0;
    this.infected[i] = 0;
    this.immune[i] = 0;
    this.target[i] = -1;
    this.targetId[i] = 0;
    this.mother[i] = -1;
    this.motherId[i] = 0;
    this.pack[i] = -1;
    this.nbr[i] = 0;
    this.gen[i] = 0;
    this.kills[i] = 0;
    this.children[i] = 0;
    this.parentA[i] = 0;
    this.parentB[i] = 0;
    this.mateId[i] = 0;
    this.origin[i] = 0;
    this.cdv[i] = 0;
    this.mange[i] = 0;
    this.hydration[i] = 1;
    if (i + 1 > this.hi) this.hi = i + 1;
    this.count++;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
    this.free.push(i);
  }

  /** Is slot i alive and still the same individual? */
  same(i: number, id: number): boolean {
    return i >= 0 && this.alive[i] === 1 && this.id[i] === id;
  }
}
