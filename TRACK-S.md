# Track S status (simulation and ecology)

Only Track S writes this file (V2-PLAN.md section 4.3). Track R reads it with `git show origin/v2-sim:TRACK-S.md`.

## Cloud smoke test (2026-10-04, UTC)
- `node -v`: v22.22.0. `nproc`: 4. Python 3.11.15 (`python` is already on PATH, so the Stop hook works).
- `npm ci`: ok. `npm run typecheck`: ok.
- `npx tsx src/headless/run.ts --seed 1 --ticks 2400 --every 600`: ok, 1.95 ms/tick (513 ticks/s), init 292 ms.
- `pip install numpy matplotlib`: ok.
- nproc is 4, so screens here are 16-seed direction screens at `--threads 3`; 32-seed screens and acceptance runs go to Track R (section 4.5).
- `npm test`: green (about 45 s; the golden check is 3 seeds x 24,000 ticks in parallel).
- `batch.ts` was broken on this VM: worker threads died with ERR_MODULE_NOT_FOUND because the inherited tsx loader does not resolve extensionless imports in Node 22 worker threads. Fixed in S0 with `src/headless/batchWorkerBoot.mjs` (registers tsx inside the worker). Should be harmless on Windows; Track R please confirm one local batch still runs.
- Browser smoke (`npx tsx tools/smoke.ts`): Chromium launches (Playwright's own build is missing, the tool falls back to /opt/pw-browsers/chromium), the page loads and the sim runs, but software GL draws about one frame every 2 s, so `__ready` never fires. The tool reports SKIP (exit 2) in that case. Run it on the GPU machine.

## Done
- **S0 Foundations.**
  - Golden hash: `src/headless/hash.ts`, `tools/golden.json` (seeds 3, 7, 11 at 24,000 ticks: e6b99005, 19759373, 7bc34541, recorded at v1 6155768 and unchanged after the refactor).
  - `npm test` (`tools/run-tests.ts`): every `src/**/*.test.ts`, the metrics self-test, then the golden check. `--no-golden` skips the slow part while iterating.
  - Species registry `src/sim/species.ts` (SpeciesDef, DIET, IS_PREY, THREAT, isGrazer, COAT_BASE/COAT_RANGE, PARAM_PREFIX) with `src/sim/species.test.ts`. `types.ts` derives SPECIES_COUNT (still 6), SPECIES_NAMES and SPECIES_KEYS from it. Sim prey/predator grids, the grazer loop, wolf and cougar target choice (DIET weights), coat, flier checks and `gen_*` columns use the registry. Worker TRAIT_SERIES and the trait grid are sized from the registry (same 8 series, same order).
  - Python tools (`charts.py`, `dynamics.py`, `cycle_stats.py`, `mine_seeds.py`) read species from the CSV `pop_*` header via `tools/species_cols.py`; output is byte-identical on existing batches.
  - Event serial: `Sim.eventSerial`; the worker's post() and skip loop use serials, so trimming no longer drops events (unit-tested with 9,000 events).
  - Contract: `St.Migrate = 11` ('migrating'), `F_MANGE = 32`, `F_MIGRANT = 64`, agent fields `origin`, `cdv`, `mange`, snapshot fields `small?`, `storms?`, `strikes?`, and the 14 new event kinds. `describe.ts` already falls through to a default sentence for unknown kinds.
  - Elder text now says the animal died at a great age.
  - `tools/smoke.ts` browser smoke tool (see above).

- **S16 Share codes and replay** (sim side; R12 wires the UI).
  - `src/sim/sharecode.ts`: `encodeShare`, `decodeShare` (warning when the code comes from a different sim build or a newer format), `shareUrl`, `simBuildId`. The code is base64url JSON `{v, b, seed, scenario, params, log}`.
  - Worker: logs every player `apply` with its tick; `init` takes `replay` (merged after the scenario's schedule, stable by tick, which is exactly where a live apply lands); `{type:'getLog'}` answers `{type:'log', tick, log}`.
  - `src/sim/sharecode.test.ts`: round trip, bad codes, warnings, and a live run vs its decoded replay give the same valley.
- Chronicle text for the 14 v2 event kinds and names for species 6 to 11 (`describe.ts`, tested by `src/ui/describe.test.ts`).

## Decisions
- Share-code build check fingerprints the default params (`simBuildId`) | it changes exactly when the default world changes (each adoption), needs no build step, and is the same in worker, page and Node | a git hash injected by Vite (not available to the headless tools).
- Smoke tool is `tools/smoke.ts`, not `tools/smoke.mjs` | section 4.3 gives Track S `tools/*.ts`, not `.mjs` | writing a Track R file.
- Smoke tool exits 2 (SKIP) when frames arrive slower than 1 per second | software GL in the cloud is too slow for the ready gate, and that is not a broken build | failing the cloud run every time.
- Registry: pronghorn is guild `browser`; `isGrazer` covers grazer and browser. `core` is true for bison, wolf, raven, pronghorn | they are the species present by default | marking all six core.
- Rabbits now run the grazer loop when introduced (before they stood inert) | unreachable by default (0 rabbits, hash unchanged) and rabbits become a field species in S4 anyway | adding a param for dead code.
- Per-species biology that is genuinely unique stays keyed on `Sp` (wolf packs, cougar camouflage and mate search, stampedes, preyScale wolf capacity weights, births/starved/old CSV columns) | a registry flag for each would be noise | full generalisation.
- S6 (storms) started in parallel with S1 and S2, ahead of S3, S4 and S5 | S4 waits on R0 item 2 (not on main yet) and S6 touches little else, so the cloud CPU stays busy | idling until R0 item 2 lands. S6 adoption still waits for v6 (as v6c).
- `tools/adoption.py` applies the S3 rule; with fewer than 32 seeds the thresholds scale (30/32 and 29/32 of n) | the cloud has 4 cores, so 16-seed screens | hard-coding 32.
- batch.ts workers boot through `batchWorkerBoot.mjs` | fixes cloud batches with no change to results | running screens single-threaded.

## Requests for Track R
- S16 wiring (R12 Share button): on load, if `?w=` is present, `decodeShare(q.get('w'))` (catch: show "That valley code could not be read" and start normally); use `state.seed`, `scenarioById(state.scenario)` and `state.params` (they already include the scenario's params, so pass them as `params` and the scenario's `schedule` as `schedule`), and send `replay: state.log` in `init`; show `warning` once if set. Share button: send `{type:'getLog'}`, on the `log` reply build `shareUrl(location.href, {seed, scenario: scenario.id, params: simParams, log})` and copy it.
- R0 item 2 (registry-safe render and UI): Track R files that still hard-code species are `src/ui/palette.ts` (can derive from `SPECIES[].color`), `src/ui/popgraph.ts` (`ALWAYS_SHOWN = 3`), `src/ui/traits.ts` (index table over TRAIT_SERIES), `src/ui/story.ts`, `src/render/animals.ts` and `src/render/models/*`, plus any `SPECIES_NAMES[...]` or `Sp.*` lookups that assume 6 species.
- Run `npx tsx tools/smoke.ts` on the GPU machine after merging S0. In the cloud the page logs one 404 (a resource that is not served by `vite` dev here; the URL was not reported by Playwright). If it shows up locally as a console error, the smoke tool will fail on it.
- Confirm one local `npm run batch` still runs on Windows with the boot file.

## In progress
- S1 (builder, main tree), S2 (builder, worktree), S6 (builder, worktree).
- Screen A16: default params, 16 seeds x 240,000 ticks, frozen at 61455f2, output scratch/screens/A16 (cloud VM only).

## Next
1. Merge S1 and S2, run 16-seed screens B, C, D (S3), ask Track R for the 32-seed versions.
2. S4 once R0 item 2 is on main.
