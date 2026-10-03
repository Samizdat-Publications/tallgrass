// Uniform bucket grid rebuilt every tick with a counting sort. O(N) build, cache-friendly queries.

export class BucketGrid {
  readonly bs: number;
  readonly nb: number;
  /** Agents per bucket (also used as a coarse density map). */
  readonly counts: Int32Array;
  readonly start: Int32Array;
  items: Int32Array;
  n = 0;
  private cursor: Int32Array;

  constructor(worldSize: number, bucketSize: number) {
    this.bs = bucketSize;
    this.nb = Math.ceil(worldSize / bucketSize);
    this.counts = new Int32Array(this.nb * this.nb);
    this.start = new Int32Array(this.nb * this.nb + 1);
    this.cursor = new Int32Array(this.nb * this.nb);
    this.items = new Int32Array(1024);
  }

  bucketOf(x: number, y: number): number {
    let bx = (x / this.bs) | 0, by = (y / this.bs) | 0;
    if (bx < 0) bx = 0; else if (bx >= this.nb) bx = this.nb - 1;
    if (by < 0) by = 0; else if (by >= this.nb) by = this.nb - 1;
    return by * this.nb + bx;
  }

  /** Build from a list of slots and their positions. */
  build(slots: Int32Array, n: number, xs: Float32Array, ys: Float32Array): void {
    const counts = this.counts;
    counts.fill(0);
    if (this.items.length < n) this.items = new Int32Array(Math.max(n, this.items.length * 2));
    const bk = this.cursor; // reuse as temp bucket ids? no: compute twice to avoid alloc
    for (let k = 0; k < n; k++) {
      const i = slots[k];
      counts[this.bucketOf(xs[i], ys[i])]++;
    }
    const start = this.start;
    start[0] = 0;
    for (let b = 0; b < counts.length; b++) start[b + 1] = start[b] + counts[b];
    bk.set(start.subarray(0, counts.length));
    for (let k = 0; k < n; k++) {
      const i = slots[k];
      const b = this.bucketOf(xs[i], ys[i]);
      this.items[bk[b]++] = i;
    }
    this.n = n;
  }
}
