// The heritable trait series the worker records in every history row (see TRAIT_SERIES in src/sim/worker.ts).
// The order here mirrors that list exactly. It is copied rather than imported because worker.ts runs the sim
// as a side effect and must never be loaded on the main thread.
import { mixHex } from './chartutil';

export type TraitKind = 'speed' | 'size' | 'coat';

export interface TraitDef {
  /** Index into HistoryRow.traits. */
  index: number;
  sp: number;
  kind: TraitKind;
  label: string;
}

export const TRAITS: TraitDef[] = [
  { index: 0, sp: 0, kind: 'speed', label: 'Bison speed' },
  { index: 1, sp: 0, kind: 'size', label: 'Bison size' },
  { index: 2, sp: 0, kind: 'coat', label: 'Bison coat darkness' },
  { index: 3, sp: 1, kind: 'speed', label: 'Wolf speed' },
  { index: 4, sp: 1, kind: 'size', label: 'Wolf size' },
  { index: 5, sp: 1, kind: 'coat', label: 'Wolf coat darkness' },
  { index: 6, sp: 3, kind: 'speed', label: 'Pronghorn speed' },
  { index: 7, sp: 3, kind: 'coat', label: 'Pronghorn coat darkness' },
];
export const TRAIT_COUNT = TRAITS.length;

/** Index of a species' trait in HistoryRow.traits, or -1 when it is not recorded. */
export function traitIndex(sp: number, kind: TraitKind): number {
  const t = TRAITS.find((x) => x.sp === sp && x.kind === kind);
  return t ? t.index : -1;
}

// The coat gene runs 0 (pale) to 1 (dark). These ramps are the colors it implies for each species.
const COAT_RAMP: Record<number, [string, string]> = {
  0: ['#D8B88C', '#3A2616'], // bison: tan to dark brown
  1: ['#E6E2D8', '#34373E'], // wolf: bone-grey to charcoal
  3: ['#EBD6AA', '#7A4A28'], // pronghorn: sand to rust-brown
};

/** The color a coat value implies for a species (pale 0 to dark 1). */
export function coatColor(sp: number, v: number): string {
  const [pale, dark] = COAT_RAMP[sp] ?? COAT_RAMP[0];
  return mixHex(pale, dark, v);
}
