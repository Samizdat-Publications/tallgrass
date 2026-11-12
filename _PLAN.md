# Tallgrass plan

## Fable change order (from 11/11/2026): the current plan

Why and evidence: `docs/FABLE-REVIEW.md`. Who does what: `docs/ROUTING.md`. Everything below this section is history.

Rules for every package:
- A look change is judged on the fixed shots (`npm run shots`, then `npm run score`): the contact sheet goes to Fable, then to the owner, before it goes live.
- A refactor that should not change the picture must leave every shot byte-identical (`npm run check`).
- A sim change is a param that is off by default, and off reproduces the golden hash. A new default is a checkpoint, judged by the gates tool and the shock suite, and the owner sees the charts first.
- `npm run check` passes before every commit to main.

### Harness (first)
| ID | Package | Who | Acceptance (the measurement) | Status |
|---|---|---|---|---|
| H1 | Deterministic capture: `?capture=1` mode, `tools/shots.json` (14 fixed shots), `tools/shots.mjs` | builder | `node tools/shots.mjs --shots all --verify` exits 0: two page loads give byte-identical PNGs, also under CPU load | DONE 11/12 within a measured noise tolerance, not byte-identical |
| H2 | Reference set, scorecard, contact sheet: `reference/`, `tools/scorecard.py` | builder | `--selftest` passes; a run writes `summary.md`, `sheet.jpg` and a history row; an unchanged build reports every shot `identical` | DONE |
| H6 | Lints: `tools/lint.mjs` | builder | exits 0 on the tree, exits 1 on a new em dash, a tracked secret or a new file over 5 MB | DONE |
| H7 | Gate: `tools/check.mjs` (preflight, typecheck, lint, tests, gate shots with drift check); `--full` adds every shot twice and the GPU budget | builder | `npm run check` exits 0 on a clean tree in under 5 minutes and exits 1 when a gate shot drifts from its baseline | DONE (fast mode; --full untested) |
| H8 | Accept the first baselines and set the GPU budget from a quiet-GPU `gpubench` run | fable | `reference/baseline.json` and `tools/perf-budget.json` committed; the first contact sheet shown to the owner | baselines DONE 11/12; GPU budget waits for a quiet GPU |
| H9 | Archive the one-off shot scripts in `tools/` that `shots.mjs` replaces (move to `tools/archive/`, fix the docs that name them) | grunt | `tools/` holds only tools a current doc names; `npm run check` passes | open |

### Sim harness
| ID | Package | Who | Acceptance | Status |
|---|---|---|---|---|
| S1 | Balancing loop: one versioned gates tool (adoption, shocks, drought, ceiling, means, promoted from `scratch/rb` and `tools/adoption.py`); a staged screen runner (8 seeds x 150 years, then 20 x 400, then shocks), canary seeds first (3, then 2, 1, 4, 9, 10), stop when a gate is lost, one screen at a time on all cores; each config appends a row to `review/stability/sensitivity.jsonl` | builder | Re-judging the stored v14 summary reproduces its recorded verdicts; a known-bad config (v13 defaults) is rejected by the filter stage in under 30 minutes | DONE 11/12 (v14 passes, v13 rejected; time target needs a quiet machine) |
| S6a | Guard hash and pins: a slow test with 3 seeds x 240,000 ticks and every optional system on (`npm run test:long`); Node pinned (`.nvmrc`, `engines`); `setCalendarScale` no longer a module global | builder | `npm run test:long` passes twice with the same hashes; two sims with different calendars in one process do not disturb each other (new test) | open |
| S2 | Dynamics truth table: `ECOLOGY-TRUTH.md` with sourced real ranges (share of adult bison deaths from wolves, herd change when wolves are removed, calving rate, wolves per 1,000 prey, others the scout finds), and `gates` reports sim value against range for each | scout for sources, fable picks the targets, builder wires it | Every row has a source link; the tool prints the table for a screen; v14 is scored (expected to miss the predation rows) | open |

### Looks (after H8; each ends with a contact sheet for the owner)
| ID | Package | Who | Acceptance | Status |
|---|---|---|---|---|
| L2a | One light: the three uniform sets and four lighting copies become one shared chunk and one uniform block; a warning on every missed shader-chunk replace | builder | **Zero drift**: every shot byte-identical to the baseline; GPU time within noise | DONE 11/12 |
| L1 | Ground and grass as one surface (far ground carries the grass look; taller, denser near blades with a dark base) | fable designs and tunes, builder implements | `concept_golden`, `golden_wide` and `midday_mid`: far and mid band detail and contrast move toward the concept and the concept score rises; frame cost at most 0.6 ms at 1440p; Fable and owner approve the sheet | open |
| L2b | One sun: sky-derived ambient, stronger low-sun hill shading, haze as distance and height fog from the same sun, tone curve settled by A/B (ACES or AgX) with metered exposure | fable designs and tunes, builder implements | `golden_wide`: the 5th percentile of L* in the far band falls toward the concept's (less wash) and lit against shaded slope contrast rises; no shot's score falls by more than 2; at most 0.4 ms | open |
| L3 | Water that mirrors the sky; a wider, uneven creek | fable, builder | `creek_golden` and `concept_golden`: water pixels brighter than the bank at grazing angles (today darker); sheet approved | open |
| L4 | Grounding: far meshes match near meshes, screen-space contact shadows, near meshes cast shadows. First split `animals.ts` `update()` (zero drift) | builder, fable reviews | `bison_close` and `herd_mid`: no visible material seam inside one herd; hooves read as planted; at most 0.8 ms | open |
| L5 | Trees: canopy outline, leaf colour variation, far hand-over, midday palette (owner's MAYBE-WANTS item) | fable, builder | `midday_mid`, `golden_wide`: sheet approved; no GPU cost | open |

### Logic (CPU work, runs beside the looks)
| ID | Package | Who | Acceptance | Status |
|---|---|---|---|---|
| S6b | Retire about 16 dead params behind a "retired keys" list (old share codes still load); split `sim.ts` along the `sp/` seams; rewrite `ECOLOGY.md` | builder; fable writes ECOLOGY.md | Golden and long guard hashes unchanged; an old share code with a retired key loads | open |
| S3 | One recruitment rule: young raised follows forage per head, for every grazer (param, off by default) | fable designs, builder implements | Off: golden unchanged. On: passes the S1 filter stage | open |
| S4 | One intake index for hunters; wolves count mule deer (param, off by default) | fable designs, builder implements | Off: golden unchanged. On: passes the S1 filter stage | open |
| S5 | Checkpoint v15: predation matters again, lie-up kept. S3 and S4 on, old patches off | fable; grunt runs the screens | Every v14 gate passes at 600 years; wolves cause 15 to 30% of adult bison deaths; removing wolves changes the bison mean by at least 20%; drought losses no worse than v14 (1 of 12); owner approves the charts | open |
| S7 | Perf checkpoint: 100x that reaches 100x. Optimise freely, validate statistically against the live checkpoint, re-record the golden | builder; grunt runs the comparison | Headless ticks per second at least doubled; the gates tool finds no difference from the live checkpoint at 20 x 400 | open |

L2a result (11/12/2026, builder, every shot within capture noise of the baseline): shared GLSL helpers in `src/render/common.ts` (`TERRAIN_SHADOW_GLSL`, `shadowedLightsBegin`, `SKY_AMBIENT_GLSL`, `HEMI_AMBIENT_GLSL`), checked shader patches (`patchSrc` warns once when a three.js chunk search misses), grass light, wind, time and weather uniforms are now the shared uniform objects. Lighting copies that are NOT identical, left separate, are the L2b worklist: grass hill shadow (near horizon map only, no far blend or overcast fade); grass ambient (three's hemisphere irradiance on a view-space normal plus its own bounce term); animal uniforms (own time, probed ambient, scaled fog and snow); sky-colour ambient with different coefficients in dust, hoppers, smoke, clouds (sky.ts), storms, tree bark and cranes; two different sun-glitter lobes (water, flood); water `irrSun` without shadow; foliage and leaf-card rim light with different constants; terrain's hand-written sun term. One frame of lag in the grass's light and wind is gone in live play.

Carried over from the old Next 5 (small, fit in between): the rust-red creek bank colour (folds into L3), the pale smudge at dusk (catch it with a fixed-clock capture, now possible with H1), night readability branch `r-night-v1` (re-judge on the `night_mid` and `concept_night` shots, then merge or drop).


## Day run (2026-10-09 ~15:30 to 2026-10-10 ~15:30): DAY-PLAN.md
Focus: close-range visuals (golden-hour look toward the concept, real ground, authored animals on our rig, animals that notice, snow, trees spike), a motion critic that can see motion (Gemini frame-rate sampling), and v11 (bison bands that move on and keep the herd) on the CPU overnight. Status: planned, not started.

## Tonight (2026-10-09, 03:30 to 13:00): NIGHT-PLAN.md
Result: checkpoint v10 "The long breath" ADOPTED and live (climate regimes, bounded evolution, fewer and bigger wolf packs), plus a faster sim, the breathing-valley look, damped seasons and trails at speed, documentary camera v3, rare sightings, UI and close-up fixes. v10b (next candidate) acceptance running. Next steps: MORNING.md "Next 5".

## v2 (current, from 2026-10-04): the plan is V2-PLAN.md
| Phase | Work packages | Status |
|---|---|---|
| 1 alpha (target: before the 2026-10-08 quota reset) | S0, R0, S1, S2, S3, R1, R2, S4, S5, R3, S6, R4, M1 | not started |
| 2 beta | S7 + R5, S8 + R6, R7, R8, S9, S10, S11 + R9, S15 + S16 + R12, S17 + R13, S12 + R10, S13 + R11, R14, R15, M2 | not started |
| 3 v2.0 | S14 + R16, S18, R17, M3 | not started |

The order, the two-track split and every spec are in V2-PLAN.md (section 6 has the order). The v1 backlog at the bottom of this file is folded in: item 1 is R1, item 2 is S1, S3 and S5, item 3 is S9, item 4 is S10, item 5 is R2 (drought ground, pond aprons, creek width) and S11 (spring green-up), item 6 is M3.

## v1: the overnight run (2026-10-03 01:00 to 2026-10-04 12:00), finished and live
Deadline: `.claude/hooks/run_until.txt` (2026-10-04 12:00). Owner rulings live in DECISIONS.md.

### Milestones
| # | Milestone | Status |
|---|---|---|
| M0 | Phase 0 permission sweep, repo, env, API smoke | DONE 01:20 |
| M1 | DESIGN.md, ADR-001 (TS + Three.js), world generator, shared contract, capture tool | DONE 01:50 |
| M2 | Sim core: vegetation, bison, wolves, ravens, carcasses, pronghorn; deterministic | DONE |
| M3 | Headless harness: batch runner, metrics, charts | DONE |
| M4 | Render foundation (engine, terrain, water, sky, trees, post, camera) | DONE |
| M5 | Grass field, animal layer | DONE |
| M6 | Vertical slice: worker + renderer + full UI, `npm run dev` | DONE 02:55 |
| M7 | Stability acceptance (20 seeds, 1000+ bison gens, shocks) | v5 DEFAULT since Saturday 16:45: bison/wolves/ravens 20/20, pronghorn 18/20; 300-year shocks recover. v6 rejected (pronghorn over centuries). |
| M8 | Review rounds 1 to 10 (stills + video) | DONE: 10 rounds (blind critic and Gemini video), all triaged in REVIEWS.md |
| M9 | Depth: pronghorn, cougar (opt-in), evolution, chronicle, god tools, scenarios, named seeds, life stories, challenges | DONE |
| M10 | UI design pass, inspector, overlays, documentary mode, photo mode, ambient view | DONE |
| M11 | Audio, plus the documentary narrator | DONE (narrator committed fcf8971) |
| M12 | Round 6 to 8 fixes: animals, UI, snow lag, director cuts, fast-forward, world edge and far field, water, Field notes, winter, rain, territories, grey wolves, pond glare | DONE, deployed 09:51 (aee1c66) |
| M13 | Calendar re-scale (calendarScale 2) | ADOPTED 06:25: acceptance 19/20 per species; 300-year shocks merged (cull 19/20 persist, all recover; drought about 90% recover) |
| M15 | Predator research: Hungry wolves (opt-in scenario) | Acceptance done 10:01: bison, wolves, ravens 19/20, pronghorn 0/20; stays opt-in |
| M16 | Riparian green ribbon and lighter pond rims (renderer builder) | DONE, deployed 10:59 (b4ff936) |
| M14 | Loop: capture, critique, fix top 3, re-verify | ongoing |

### Ordered backlog (top = next)
1. Close-range animation (every Gemini round): check the 1.2 s takedown (11:19) on video, foot planting on hunt close-ups, varied raven flapping.
2. Pronghorn under prey-scaled wolves: a fawning brake, so 'Hungry wolves' can keep its pronghorn over 1,000 generations.
3. Evolution costs per species plus a bison single-calf cap; re-run the acceptance.
4. Herd shape: personal space while grazing.
5. Drought ground grading (pale straw), pond aprons, creek width variation.
6. Landing page: deploy beside the game if the owner likes the draft.
