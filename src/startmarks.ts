// Startup timeline: named marks (ms since navigation) on window.__marks, for the load-time probe (tools/loadtime.mjs) and for the
// startup profile. Cheap enough to leave on: a handful of performance.now() reads.
const marks: Record<string, number> = {};
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__marks = marks;

/** Record `name` as now (ms since navigation start). A repeated name keeps its first time. */
export function mark(name: string): void {
  if (!(name in marks)) marks[name] = Math.round(performance.now());
}

/** The first frames' durations (ms), to show where the compiles stall the page. */
export const frameMs: number[] = [];
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__frameMs = frameMs;
