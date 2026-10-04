// The heritable trait series the worker records in every history row (see TRAIT_SERIES in src/sim/worker.ts).
// The order here mirrors that list exactly: one series per recorded gene of each species with `traits` set in the
// registry, in registry order (speed, size, coat darkness; pronghorn has no size series). The rule is re-derived here from
// the registry rather than imported because worker.ts runs the sim as a side effect and must never be loaded on the main
// thread. If the worker's rule changes, change TRAIT_KINDS_BY_KEY below with it.
import { SPECIES } from '../sim/species';
import { mixHex } from './chartutil';

export type TraitKind = 'speed' | 'size' | 'coat';

export interface TraitDef {
  /** Index into HistoryRow.traits. */
  index: number;
  sp: number;
  kind: TraitKind;
  label: string;
}

const TRAIT_LABEL: Record<TraitKind, string> = { speed: 'speed', size: 'size', coat: 'coat darkness' };
/** Trait kinds recorded for a species with `traits` set, when they differ from all three (mirrors SERIES_OVERRIDE in worker.ts). */
const TRAIT_KINDS_BY_KEY: Record<string, TraitKind[]> = { pronghorn: ['speed', 'coat'] };
const ALL_KINDS: TraitKind[] = ['speed', 'size', 'coat'];

export const TRAITS: TraitDef[] = SPECIES.filter((s) => s.traits)
  .flatMap((s) => (TRAIT_KINDS_BY_KEY[s.key] ?? ALL_KINDS).map((kind) => ({ sp: s.id, kind, label: `${s.name} ${TRAIT_LABEL[kind]}` })))
  .map((t, index) => ({ index, ...t }));
export const TRAIT_COUNT = TRAITS.length;

/** Index of a species' trait in HistoryRow.traits, or -1 when it is not recorded. */
export function traitIndex(sp: number, kind: TraitKind): number {
  const t = TRAITS.find((x) => x.sp === sp && x.kind === kind);
  return t ? t.index : -1;
}

// The coat gene runs 0 (pale) to 1 (dark). These ramps are the colors it implies for each species.
const COAT_RAMP: Record<string, [string, string]> = {
  bison: ['#D8B88C', '#3A2616'], // tan to dark brown
  wolf: ['#E6E2D8', '#34373E'], // bone-grey to charcoal
  pronghorn: ['#EBD6AA', '#7A4A28'], // sand to rust-brown
};

/** The color a coat value implies for a species (pale 0 to dark 1). A species with no ramp of its own uses the bison's. */
export function coatColor(sp: number, v: number): string {
  const [pale, dark] = COAT_RAMP[SPECIES[sp]?.key ?? ''] ?? COAT_RAMP.bison;
  return mixHex(pale, dark, v);
}
