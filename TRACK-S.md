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

- **S1 Open prairie** (all off; S3 decides adoption). `src/sim/region.ts` (regional gene pool, own Rng 'region'), 8 border corridors in `world.ts` (terrain only, no draws), St.Migrate driven by `migrantTick`, wolf arrivals into free den sites and loner departures, pronghorn autumn exodus and spring return (calibrated `deerBref` 35, `deerKb` 367 from 4 seeds x 48,000 ticks), vagrant ravens (`ravenVagrantK` 0.16: about 40% of residents at mean carrion) that never breed, `recolonized`, `imm_*`/`emig_*`/`vagrants`/`carrion`/`browse_pp` columns, presence and flow metrics in `metrics.ts` and `dynamics.py`. 4-seed 50-year smoke: all species persist; pronghorn steadier (CV 0.17 vs 0.46); vagrants mean 116; no wolf flow in a full valley (no free dens).
- **S2 Canid disease** (all off). `src/sim/disease.ts` (own Rng 'disease'; `CANID_KEYS`, add 'coyote' in S5): distemper outbreaks at season 1.2, pack and carcass spread, deaths at the end of the course, `distemper` event; mange severity, spread, cold cost, hunting speed, recovery, `mange` event; immigrant wolves carry mange at `mangeImmigrantShare`. `disease.test.ts` checks death rates within 0.1 of the params. 4-seed 100-year smoke with `cdvRate 0.15, mangeRate 0.03`: wolves persist, mean 50 vs 51.5, CV 0.15 vs 0.14; 5 to 23 outbreaks per 100 years.
- **S15 Lineage** (data; R12 draws the family tree). `src/sim/lineage.ts`: a 30,000-record ring of dead animals that had young, sired young, were alphas or were followed; `query(id)` gives 3 generations up (pedigree rows of 2, 4, 8) and 2 down; pack dynasties (alpha pair changes per pack serial, 2,000-entry ring). No rng use, +1.6% ms/tick (noise level). Worker: `{type:'lineage', id}` -> `{type:'lineage', id, tree}`; `{type:'dynasty', pack}` -> `{type:'dynasty', pack, list}`. Types `LineageTree`, `LineageNode`, `DynastyEntry` are exported from `lineage.ts`.
- **S4 Small-prey web** (all off). `src/sim/smallprey.ts`: jackrabbit (id 4, now a field species) and prairie dog (id 7) density fields on the 32x32 grid, towns, sylvatic plague, Holling II `take()` with catch tables for wolf, coyote, eagle and hawk, open-prairie rescues, `dogCap` in world.ts, god tools act on the fields, `smallGameField`, `dogClip`, `dogGrazeBonus`. Coyote id 6 registered (no behaviour yet). `SPECIES_COUNT` 8. Founders are registry-driven (`<key>.initial` for any agent species; Track R request), and every registry id gets a params block (no more crash on unknown ids). **`small` texture**: `Snapshot.small` / worker `small`, 32x32 RGBA, row-major y then x, R = hare/hareK x 200, G = dog/dogK x 200, B = town x 255, A = plague x 255 (constants `SMALL_SCALE`), sent with veg only when smallPrey is on. 4-seed 100-year smoke: hares and dogs present 100%, dog CV 0.37, plague 6 per 100 years, core species persist; hare CV only 0.06 (no real predator yet; S5).
- **S6 Storm cells and lightning fires** (off). `src/sim/storms.ts` (own Rng 'storms'): 1 or 2 cells per thunderstorm, strikes, dry-lightning ignition, `storm` and `lightningFire` events, heavy rain (> 0.5) stops fire spread when on, blizzard look flag. Snapshot `storms` stride 6 `[x, y, r, intensity, kind (0 thunder, 1 blizzard), age]`, `strikes` stride 4 `[x, y, tick, ignited]` drained per post. Defaults raised to `lightningRate 0.05`, `lightningIgnite 0.5` (the plan's values gave about 2.7 fires per 100 years); 4 seeds x 200 years: 14.6 natural fires per 100 valley years, persistence equal to default.
- Generic per-species `births_/starved_/old_/thirst_/killed_<key>` sample columns (killed = every predator).
- **S16 Share codes and replay** (sim side; R12 wires the UI).
  - `src/sim/sharecode.ts`: `encodeShare`, `decodeShare` (warning when the code comes from a different sim build or a newer format), `shareUrl`, `simBuildId`. The code is base64url JSON `{v, b, seed, scenario, params, log}`.
  - Worker: logs every player `apply` with its tick; `init` takes `replay` (merged after the scenario's schedule, stable by tick, which is exactly where a live apply lands); `{type:'getLog'}` answers `{type:'log', tick, log}`.
  - `src/sim/sharecode.test.ts`: round trip, bad codes, warnings, and a live run vs its decoded replay give the same valley.
- **S18 Chronicle decades and arcs** (logic; Track R wires it). `DecadeLines` in `src/ui/seasonlines.ts`: `feed(historyRows, events)` returns `DecadeLine`s. Every 10 valley years one line titled from what dominated (The Wolf Decade, The Wolfless Years, The Dust Years, The Burning Years, The Town That Came Back, The Plague Years, The Coyote Decade, The Return, The Sick Years, The Great Herd, The Lean Years, The Pronghorn Years, Boom and Bust, The Raven Years, else The Quiet Years), weight 4. A drought is told as one arc (start, its fires, its end, the grass back), weight 3, when the grass recovers. Partial decades are skipped. Tested in `src/ui/decades.test.ts`.
- Chronicle text for the 14 v2 event kinds and names for species 6 to 11 (`describe.ts`, tested by `src/ui/describe.test.ts`).

## Decisions
- A backup branch `wip/s5-coyotes` was pushed by mistake while saving the interrupted S5 builder's work after a container restart; the proxy refused deleting it (403). It is safe to delete. All real work goes to v2-sim.
- Lineage records more than "died with offspring or followed": also males that sired young and anyone who was ever alpha | herbivore and cougar births never count the father's children, so every father line would be empty; alphas let dynasties resolve | the literal rule.
- Migration clock is a new agent field `mig`, not `cdv` | both S1 and S2 builders used `cdv`; it is the distemper countdown by contract | sharing one field between two features.
- Story death codes: 6 emigrated, 7 disease | both builders took 6 | -
- Vagrant send-home rule is `ravenVagrantK * carrion < 0.2 * vagrants` | the plan's condition can never be true (target is proportional to carrion) | dropping send-home.
- Pronghorn exodus fraction and spring return are not divided by calendarScale | they respond to browse and to the gap to Kb, not to a once-a-year litter | dividing.
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
- **Screen G at 32 seeds** after the v6E acceptance and shocks free the CPU: from frozen `v2-sim@3bb97a5`, params `{"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8,"matingWindow":0.8,"bison.birthCooldown":900,"deer.birthCooldown":800}`, `--out scratch/screens/G32`, then adoption.py. Plan: if v6E's acceptance passes I adopt E as v6 at once (it meets the rule); if G32 is also eligible, G goes through its own acceptance as v6a (birth pulse) and replaces E only if it passes too.
- Round 13 items: births all year confirmed on the default calendar (bison births land in every season); the birth-pulse screen G above is the fix. Ravens at ~680 in D: the vagrant cap is 400 on top of the nest-site cap, so a ceiling near 680 is the two caps stacked; I will look at softening it (vagrants leave as carrion falls) in S10. Wolf staircase and first-decade shape: next, after S5.
- **Screen F at 32 seeds** (priority, replaces the E32 request if it has not started; E is F without `"deerOutK":0.9`): same command as E below with `"deerOutK":0.9` added to the params and `--out scratch/screens/F32`. If F32 passes, please also launch the v6 acceptance and shocks on F from the same frozen worktree (V2-PLAN.md section 10 commands).
- Screen E at 32 seeds (priority over anything else in the CPU queue after A to D): from a frozen worktree of `v2-sim@3bb97a5`, `npx tsx src/headless/batch.ts --seeds 32 --ticks 240000 --sample 600 --threads 10 --params '{"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}' --out scratch/screens/E32`, then `python tools/adoption.py E=scratch/screens/E32` (pull v2-sim first so adoption.py reads killed_pronghorn). If E32 passes it becomes the v6 candidate for the acceptance run.
- **Caution on the 32-seed A to D table:** screens from `bc62e1e` have no `old_pronghorn` column and `kills_pronghorn` counts wolf kills only, so `adoption.py`'s pronghorn-starvation share reads far too high there (old age turned out to be a large share of pronghorn deaths). Please still post the table; I will judge the starvation gate from cloud re-runs at `3bb97a5`+ (which have the columns) and the other gates from yours.
- R3 and R4 inputs are ready on v2-sim: `small` texture (S4) and `storms`/`strikes` (S6), layouts above.
- Done for you: `tools/smoke.ts --gpu` (the default on Windows; `--swiftshader` forces software GL) launches with `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11` and the three background-throttling flags.
- Thanks for the 32-seed screens. I stopped the cloud's 16-seed B, C and D runs (yours are authoritative); A16 finishes for a direction check only.
- **S3 screens, 32 seeds, on the local CPU** (the cloud has 4 cores and is running the 16-seed versions). From a frozen worktree of `v2-sim@bc62e1e`, each `npx tsx src/headless/batch.ts --seeds 32 --ticks 240000 --sample 600 --threads 10 --params '<P>' --out scratch/screens/<name>32`:
  - A: `{"calendarScale":2}` (or reuse scratch/cal2)
  - B: `{"calendarScale":2,"openPrairie":1,"ravenVagrants":1}`
  - C: B + `"cdvRate":0.15,"mangeRate":0.03`
  - D: C + `"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8`

  Then `python tools/adoption.py A=scratch/screens/A32 B=... C=... D=...` and paste the table here in REQUESTS-R.md (or commit the four `summary.json`/`metrics.md` files under `review/stability/v6-screens/`). I will decide adoption from the 32-seed table when it lands, and from the 16-seed table otherwise.
- `src/ui/story.ts` `causePhrase`: add `case 6: return 'Left the valley for the open prairie'` and `case 7: return 'Died of distemper'` (new death codes from S1 and S2). Code 6 is not a death in the story sense: the memorial could read "Left the valley" rather than "In memoriam" if you want to go further.
- S18 wiring: in `ui.ts`, keep a `DecadeLines` next to `SeasonLines` and feed it the same history rows plus the frame's sim events; add its lines to the chronicle like season lines (`major: true` for decades, so they can carry the title; the title would also make a good chapter card for kind 'decade'). Call `reset()` where `seasons.reset()` is called.
- S16 wiring (R12 Share button): on load, if `?w=` is present, `decodeShare(q.get('w'))` (catch: show "That valley code could not be read" and start normally); use `state.seed`, `scenarioById(state.scenario)` and `state.params` (they already include the scenario's params, so pass them as `params` and the scenario's `schedule` as `schedule`), and send `replay: state.log` in `init`; show `warning` once if set. Share button: send `{type:'getLog'}`, on the `log` reply build `shareUrl(location.href, {seed, scenario: scenario.id, params: simParams, log})` and copy it.
- R0 item 2 (registry-safe render and UI): Track R files that still hard-code species are `src/ui/palette.ts` (can derive from `SPECIES[].color`), `src/ui/popgraph.ts` (`ALWAYS_SHOWN = 3`), `src/ui/traits.ts` (index table over TRAIT_SERIES), `src/ui/story.ts`, `src/render/animals.ts` and `src/render/models/*`, plus any `SPECIES_NAMES[...]` or `Sp.*` lookups that assume 6 species.
- Run `npx tsx tools/smoke.ts` on the GPU machine after merging S0. In the cloud the page logs one 404 (a resource that is not served by `vite` dev here; the URL was not reported by Playwright). If it shows up locally as a console error, the smoke tool will fail on it.
- Confirm one local `npm run batch` still runs on Windows with the boot file.

## Screen results
- A16 (cloud, default v5 params, 16 seeds x 200 years, frozen 61455f2), `tools/adoption.py`: bison persist 15/16, presence 15/16, pronghorn starvation 70% (gate <= 50%), wolf CV 0.09 (target >= 0.2), wolf-bison corr at 1-3 yr 0.21 (gate >= 0.4). Not eligible, as expected for v5. Summary in `review/stability/v6-screens/A16-cloud/`. The adoption decision waits for Track R's 32-seed A to D.

- E8 (cloud, exploratory, 8 seeds x 200 years, frozen bc62e1e): D with stronger disease, `{"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}`. All species persist 8/8, presence 8/8, **wolf CV 0.24, wolf-bison corr 0.75 at 1 yr lag**, pronghorn starvation 58% (gate <= 50%). Caveat: the CSVs have no `old_pronghorn` column, so pronghorn old-age deaths are missing from the denominator and the starvation share reads high in every screen. Fix coming (generic per-species death columns), then re-screen. Disease pressure looks like the lever that makes wolves rise and fall.

- E8b (cloud, same E params at 3bb97a5, with the generic death columns; dynamics identical to E8 as expected): bison 8/8, presence 8/8, **pronghorn starvation 50%** (exactly at the gate), wolf CV 0.24, corr 0.75. First eligible config. Needs 32 seeds (request below). F16 (E + `deerOutK 0.9`, more autumn exodus to get starvation margin) is running in the cloud.

- F16 (cloud, E + `deerOutK 0.9`, frozen 3bb97a5): 14 of 16 seeds finished before a container restart (all 14 complete 200-year runs). Bison 14/14, presence 14/14, **pronghorn starvation 45%, wolf CV 0.27, wolf-bison corr 0.67**. Eligible with margin: **F is the v6 candidate.** Table and dynamics in `review/stability/v6-screens/F16-cloud/`.

- G8 (cloud, E + spring birth pulse: `matingWindow 0.8, bison.birthCooldown 900, deer.birthCooldown 800`, frozen 3bb97a5): bison 8/8, presence 8/8, **pronghorn starvation 34%**, wolf CV 0.22, corr 0.59; every bison birth falls in spring (E: births all year). This answers round 13's "births in autumn and winter" item: in v1 the pulse lost the pronghorn (4/32, DECISIONS 08:08), but open prairie's spring return now rescues them. Eligible; lower wolf CV than E (0.22 vs 0.24) but far more pronghorn margin and real seasons.

## In progress
- S5 Coyotes (builder, main tree).
- E8b screen (E8 again at 3bb97a5 with the death columns), scratch/screens/E8b.
- Screen A16: default params, 16 seeds x 240,000 ticks, frozen at 61455f2, output scratch/screens/A16 (cloud VM only).

## Next
1. Merge S1 and S2, run 16-seed screens B, C, D (S3), ask Track R for the 32-seed versions.
2. S4 once R0 item 2 is on main.
