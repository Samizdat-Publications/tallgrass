# Tallgrass plan

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
