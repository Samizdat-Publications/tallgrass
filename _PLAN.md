# Tallgrass plan

Deadline: `.claude/hooks/run_until.txt` (2026-10-04 12:00). Owner rulings live in DECISIONS.md.

## Milestones
| # | Milestone | Status |
|---|---|---|
| M0 | Phase 0 permission sweep, repo, env, API smoke | DONE 01:20 |
| M1 | DESIGN.md, ADR-001 (TS + Three.js), world generator, shared contract, capture tool | DONE 01:50 |
| M2 | Sim core: vegetation, bison, wolves, ravens, carcasses; deterministic; createSim/SimLike | in progress (lead) |
| M3 | Headless harness: batch runner, metrics, charts (builder) | in progress |
| M4 | Render foundation (engine, terrain, water, sky, trees, post, camera) (builder) | in progress |
| M5 | Grass field (builder) / Animal layer (builder) | in progress |
| M6 | Vertical slice: worker + renderer + minimal HUD (time controls, pop graph), playable via `npm run dev` | todo |
| M7 | Balance to stability acceptance (20 seeds, 1000+ bison gens, shocks) | todo |
| M8 | Review round 1 (stills + charts), fix top issues | todo |
| M9 | Depth: pronghorn, rabbits, cougar, genetics visible, events + chronicle, god tools, scenarios, seeds | todo |
| M10 | UI design pass (DESIGN-UI.md), inspector, overlays, follow-cam documentary mode | todo |
| M11 | Audio (ElevenLabs ambience + SFX) | todo |
| M12 | Video review round (Gemini), more review rounds, polish, deploy | todo |
| M13 | Loop: capture, critique, fix top 3, re-verify | ongoing |

## Ordered backlog (top = next)
1. Sim core M2 (lead): vegetation + bison + wolves + carcasses + ravens, sample() columns, perf < 0.6 ms/tick.
2. Integrate builders' layers into `index.html` + `src/main.ts` + `src/sim/worker.ts`.
3. First balancing loop with run.ts, then batch 8 seeds x 200 gens.
4. Review round 1.
5. Concept art batch (2-3 more Nano Banana images: UI mood, close-up wolves, winter) into art/concept + journey.
6. Species layer 2: pronghorn (fast, flighty, shrub browse), rabbits (fast breeding, hide in shrubs), cougar (ambush from cover).
7. Genetics: trait charts, coat-color selection visible in herds.
8. God tools + scenarios + named seeds.
9. Chronicle + documentary follow-cam + inspector.
10. Overlays: vegetation, fear, trait heatmap.
11. Audio.
12. Full stability suite (20 seeds x 1000+ gens x 4 scenarios) in background, publish to review/stability + MORNING.md.
