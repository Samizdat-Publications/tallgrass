// Public contract between the UI and the game (main.ts). Types only.
import type { EnvState } from '../sim/types';
import type { HistoryRow, AnimalDetail } from '../sim/worker';
import type { SimEvent } from '../sim/sim';

export type ToolId = 'rain' | 'drought' | 'fire' | 'plague' | 'cull' | 'addWolves' | 'addBison' | 'removeWolves';
export type OverlayId = 'none' | 'vegetation' | 'fear' | 'territory' | 'traits';

export interface UIActions {
  /** 0 = pause, 1, 10, 100 */
  setSpeed(speed: number): void;
  skipToEvent(): void;
  /** Positional tools (fire, addWolves, addBison) are armed; main handles the ground click. null disarms. */
  armTool(tool: ToolId | null): void;
  /** Instant tools (rain, drought, plague, cull, removeWolves). */
  applyTool(tool: ToolId): void;
  follow(id: number | null): void;
  select(id: number | null): void;
  flyTo(x: number, y: number): void;
  setOverlay(o: OverlayId): void;
  setCinematic(on: boolean): void;
  newWorld(seed: string, scenario: string): void;
}

export interface UIFrame {
  tick: number;
  env: EnvState;
  pop: number[];
  /** New history rows since the last frame. */
  history: HistoryRow[];
  /** New events since the last frame. */
  events: SimEvent[];
  selected: AnimalDetail | null;
  /** -1 while skipping to the next event. */
  speed: number;
  ticksPerSec: number;
  seed: string;
  scenario: string;
  following: number | null;
}

/** Scenario ids passed to UIActions.newWorld, with the names the menu shows. */
export const SCENARIOS: { id: string; name: string; blurb: string }[] = [
  { id: 'baseline', name: 'Open prairie', blurb: 'Bison, wolves and ravens settle in together.' },
  { id: 'yellowstone', name: 'Yellowstone return', blurb: 'No wolves at first. Then they come back.' },
  { id: 'plenty', name: 'Island of plenty', blurb: 'No predators. See how far the herds can grow.' },
  { id: 'drought', name: 'The long drought', blurb: 'The rains fail and the grass thins out.' },
  { id: 'collapse', name: 'Collapse', blurb: 'A fragile valley, pushed to the edge.' },
];

/** Positional tools stay armed until the player clicks the ground; the rest apply instantly. */
export const POSITIONAL_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['fire', 'addWolves', 'addBison']);
