// Share codes (V2-PLAN.md S16): a whole valley as a URL parameter, `?w=<code>`.
// The code is base64url JSON: { v, b, seed, scenario, params, log }, where log lists every intervention the player
// made with its tick. Replaying applies each one at its exact tick (the worker schedules them), so the sim, which is
// deterministic from seed + params + interventions, rebuilds the same valley.
// `b` fingerprints the sim build: the default params. When the reader's build differs, decodeShare() still returns the
// world but adds a warning, because the same code may grow a different valley.

import { defaultParams } from './params';
import type { Intervention } from './types';

/** Share code format version. Bump when the JSON layout changes. */
export const SHARE_VERSION = 1;

export interface LoggedIntervention {
  tick: number;
  iv: Intervention;
}

export interface ShareState {
  seed: number;
  scenario: string;
  params: Record<string, number>;
  log: LoggedIntervention[];
}

export interface DecodedShare {
  state: ShareState;
  /** Set when the code was made by a different sim build or a newer format; the valley may not replay the same. */
  warning?: string;
}

/** FNV-1a over a string, as 8 hex digits. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

let buildId: string | null = null;
/** Fingerprint of this sim build: changes when any default parameter changes. */
export function simBuildId(): string {
  buildId ??= fnv(JSON.stringify(defaultParams()));
  return buildId;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Round to 4 decimals so float noise does not bloat the code. Interventions are made from UI values, so this is exact enough. */
const tidy = (x: unknown): unknown =>
  typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : Array.isArray(x) ? x.map(tidy) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, tidy(v)])) : x;

export function encodeShare(s: ShareState): string {
  const body = {
    v: SHARE_VERSION,
    b: simBuildId(),
    seed: s.seed,
    scenario: s.scenario,
    params: s.params,
    log: s.log.map((e) => [e.tick, tidy(e.iv)]),
  };
  return toBase64Url(JSON.stringify(body));
}

const IV_KINDS = new Set(['cull', 'remove', 'introduce', 'drought', 'rain', 'fire', 'plague', 'lightning', 'blizzard', 'flood', 'disease', 'grove']);

/** Parse a share code. Throws on a code that is not one (bad base64, bad JSON, missing fields). */
export function decodeShare(code: string): DecodedShare {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(code.trim()));
  } catch {
    throw new Error('not a valley code');
  }
  const o = raw as { v?: unknown; b?: unknown; seed?: unknown; scenario?: unknown; params?: unknown; log?: unknown };
  if (!o || typeof o !== 'object' || typeof o.v !== 'number' || typeof o.seed !== 'number' || !Number.isFinite(o.seed)) {
    throw new Error('not a valley code');
  }
  const params: Record<string, number> = {};
  if (o.params && typeof o.params === 'object') {
    for (const [k, v] of Object.entries(o.params as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  }
  const log: LoggedIntervention[] = [];
  if (Array.isArray(o.log)) {
    for (const e of o.log) {
      if (!Array.isArray(e) || typeof e[0] !== 'number' || !e[1] || typeof e[1] !== 'object') continue;
      const iv = e[1] as Intervention;
      if (!IV_KINDS.has((iv as { kind?: string }).kind ?? '')) continue;
      log.push({ tick: Math.max(0, Math.floor(e[0])), iv });
    }
    log.sort((a, b) => a.tick - b.tick); // stable: same-tick interventions keep their order
  }
  const state: ShareState = { seed: o.seed, scenario: typeof o.scenario === 'string' ? o.scenario : 'prairie', params, log };
  let warning: string | undefined;
  if (o.v > SHARE_VERSION) warning = 'This valley code comes from a newer version of Tallgrass; it may not open the same valley.';
  else if (o.b !== simBuildId()) warning = 'This valley code was made with a different version of Tallgrass, so the valley may grow differently.';
  return { state, warning };
}

/** The URL that opens this valley: the page's own URL with ?w= set and the per-world parameters removed. */
export function shareUrl(base: string, s: ShareState): string {
  const u = new URL(base);
  for (const k of ['seed', 'scenario', 'challenge', 'p']) u.searchParams.delete(k);
  u.searchParams.set('w', encodeShare(s));
  return u.toString();
}
