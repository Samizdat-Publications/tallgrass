// Colors shared by canvas drawing code and the DOM UI. Species colours come from the registry (src/sim/species.ts), so a
// species added there is coloured everywhere: canvas code reads SPECIES_COLORS[id], the DOM reads the --sp-<id> custom
// properties that GameUI installs on its root through applySpeciesVars (there are no static --sp-N rules in ui.css).
// The first six: bison amber-brown, wolf blue, raven violet, pronghorn teal (clear of the sage of the grass), rabbit bone,
// cougar rose. Every pair is at least 30 apart in CIE Lab, and none sits near the grass or the gold accent.
import { SPECIES } from '../sim/species';

export const SPECIES_COLORS: string[] = SPECIES.map((s) => s.color);
/** Colour for a species id (or any other number), falling back to the dim paper tone for an id the registry does not know. */
export function speciesColor(sp: number): string {
  return SPECIES_COLORS[sp] ?? '#B8AD95';
}
/** Define --sp-<id> on an element for every species in the registry. */
export function applySpeciesVars(el: HTMLElement): void {
  for (const s of SPECIES) el.style.setProperty(`--sp-${s.id}`, s.color);
}
export const GRASS_COLOR = '#93B36B';
export const PAPER = '#EFE6D0';
export const PAPER_DIM = '#B8AD95';
export const GOLD = '#D9B65C';
export const EMBER = '#E0763C';
export const SANS = "'Alegreya Sans', system-ui, sans-serif";
export const SERIF = "'Alegreya', Georgia, serif";
