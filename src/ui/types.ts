// Public contract between the UI and the game (main.ts). Types only, plus the scenario list.
import type { EnvState } from '../sim/types';
import { SCENARIOS as GAME_SCENARIOS } from '../scenarios';
import type { HistoryRow, AnimalDetail } from '../sim/worker';
import type { SimEvent, StoryEntry } from '../sim/sim';

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
  /** Hand the camera back to the player when the documentary camera is driving. */
  takeCamera?(): void;
  /** Load a challenge by id (the page reloads with ?challenge=id). */
  startChallenge(id: string): void;
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
  /** Life story of the selected animal (kept after it dies, with a final 'died' entry). */
  story?: StoryEntry[];
  /** Id of the animal the story belongs to. */
  storyId?: number;
  /** Wolf packs holding a territory right now (for challenges). */
  packs?: number;
  /** True while the documentary camera is driving on its own (nobody has touched the camera for a while). */
  autoCamera?: boolean;
}

/**
 * Scenario ids passed to UIActions.newWorld, with the names and blurbs the menu shows. They come straight from
 * src/scenarios.ts so the menu and the game can never drift apart (scenarioById also accepts the old aliases).
 */
export const SCENARIOS: { id: string; name: string; blurb: string }[] = GAME_SCENARIOS.map((x) => ({ id: x.id, name: x.name, blurb: x.blurb }));

/** Positional tools stay armed until the player clicks the ground; the rest apply instantly. */
export const POSITIONAL_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(['fire', 'addWolves', 'addBison']);
