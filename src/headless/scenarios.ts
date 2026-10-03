// Shock scenarios for the batch harness, plus small CLI helpers shared by batch.ts, batchWorker.ts and run.ts.

import { Sp, type Intervention, type SimLike } from '../sim/types';

// ---------------------------------------------------------------------------------------------------------------
// scenarios
// ---------------------------------------------------------------------------------------------------------------

export interface ScenarioEvent {
  /** Fraction of the run at which the event fires. In --generations mode this is a fraction of the generation target. */
  frac: number;
  label: string;
  intervention: Intervention;
}

export interface ScenarioDef {
  name: string;
  description: string;
  events: ScenarioEvent[];
  /** Index of the event whose preceding window defines the prior range. */
  priorEvent: number;
  /** Index of the event from which recovery time is measured. */
  recoveryEvent: number;
}

export const SCENARIOS: Record<string, ScenarioDef> = {
  baseline: {
    name: 'baseline',
    description: 'No shocks: the long-run stability test.',
    events: [],
    priorEvent: 0,
    recoveryEvent: 0,
  },
  cull70: {
    name: 'cull70',
    description: 'At 40% of the run, 70% of the bison are removed.',
    events: [{ frac: 0.4, label: 'cull 70% bison', intervention: { kind: 'cull', species: Sp.Bison, fraction: 0.7 } }],
    priorEvent: 0,
    recoveryEvent: 0,
  },
  drought: {
    name: 'drought',
    description: 'At 40% of the run, a two-year drought (4800 ticks, severity 0.8).',
    events: [{ frac: 0.4, label: 'drought (2 yr)', intervention: { kind: 'drought', ticks: 4800, severity: 0.8 } }],
    priorEvent: 0,
    recoveryEvent: 0,
  },
  wolfwipe: {
    name: 'wolfwipe',
    description: 'At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.',
    events: [
      { frac: 0.35, label: 'wolves removed', intervention: { kind: 'remove', species: Sp.Wolf } },
      { frac: 0.5, label: 'introduce 8 wolves', intervention: { kind: 'introduce', species: Sp.Wolf, count: 8 } },
    ],
    priorEvent: 0,
    recoveryEvent: 1,
  },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS);

/** "all" expands to every scenario; a comma list is accepted too. */
export function resolveScenarios(arg: string | undefined): string[] {
  const a = (arg ?? 'baseline').trim();
  if (a === 'all') return [...SCENARIO_NAMES];
  const names = a.split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of names) {
    if (!SCENARIOS[n]) throw new Error(`unknown scenario "${n}" (known: ${SCENARIO_NAMES.join(', ')}, all)`);
  }
  return names;
}

// ---------------------------------------------------------------------------------------------------------------
// sim loading
// ---------------------------------------------------------------------------------------------------------------

export type CreateSim = (opts: { seed: number; params?: Record<string, number> }) => SimLike;

/**
 * Load the real sim (src/sim/sim.ts) or the mock. The specifier is built at runtime so type-checking and bundlers
 * do not require src/sim/sim.ts to exist while it is being written.
 */
export async function loadCreateSim(mock: boolean): Promise<CreateSim> {
  if (mock) {
    const m = await import('./mocksim');
    return m.createMockSim;
  }
  const href = new URL('../sim/sim.ts', import.meta.url).href;
  let mod: Record<string, unknown>;
  try {
    mod = (await import(/* @vite-ignore */ href)) as Record<string, unknown>;
  } catch (e) {
    const err = new Error(`could not import src/sim/sim.ts (${(e as Error).message}). Use --mock to test the harness without it.`);
    (err as Error & { fatal?: boolean }).fatal = true;
    throw err;
  }
  if (typeof mod.createSim !== 'function') {
    const err = new Error('src/sim/sim.ts does not export createSim(opts)');
    (err as Error & { fatal?: boolean }).fatal = true;
    throw err;
  }
  return mod.createSim as CreateSim;
}

// ---------------------------------------------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------------------------------------------

export type Args = Record<string, string | true>;

/** Minimal parser: `--key value`, `--key=value`, and bare `--flag`. A value starting with "--" is treated as a new flag. */
export function parseCliArgs(argv: readonly string[], booleans: readonly string[] = []): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (booleans.includes(key) || next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function argNum(args: Args, key: string, dflt: number): number {
  const v = args[key];
  if (v === undefined || v === true) return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} expects a number, got "${v}"`);
  return n;
}

export function argStr(args: Args, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * --params accepts strict JSON ('{"k": 1.2}'), relaxed JSON without quoted keys ({k:1.2}, which survives PowerShell
 * stripping the double quotes), or @path/to/file.json.
 */
export function parseParams(raw: string | undefined, readFile: (p: string) => string): Record<string, number> {
  if (!raw) return {};
  let text = raw.trim();
  if (text.startsWith('@')) text = readFile(text.slice(1));
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    const relaxed = text.replace(/([{,]\s*)([A-Za-z_][\w.]*)\s*:/g, '$1"$2":');
    try {
      obj = JSON.parse(relaxed);
    } catch (e) {
      throw new Error(`could not parse --params ${JSON.stringify(raw)}: ${(e as Error).message}`);
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('--params must be a JSON object');
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v !== 'number') throw new Error(`--params value for "${k}" must be a number`);
    out[k] = v;
  }
  return out;
}
