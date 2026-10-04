# Tallgrass plan

Deadline: `.claude/hooks/run_until.txt` (2026-10-04 12:00). Owner rulings live in DECISIONS.md.

## Milestones
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
| M8 | Review rounds 1 to 6 (stills + video) | DONE, triaged in REVIEWS.md |
| M9 | Depth: pronghorn, cougar (opt-in), evolution, chronicle, god tools, scenarios, named seeds, life stories, challenges | DONE |
| M10 | UI design pass, inspector, overlays, documentary mode, photo mode, ambient view | DONE |
| M11 | Audio, plus the documentary narrator | DONE (narrator committed fcf8971) |
| M12 | Round 6 fixes: animals, UI, snow lag, director cuts, fast-forward (DONE); world edge and far field (renderer builder), water (water builder), Field notes (UI builder) | IN PROGRESS |
| M13 | Calendar re-scale (calendarScale 2) | ADOPTED 06:25 and deployed 06:30: acceptance 19/20 per species; shock suite merge pending (re-run of seeds 15 to 20) |
| M14 | Loop: capture, critique, fix top 3, re-verify | ongoing |

## Ordered backlog (top = next)
1. Merge the cal2 shock suite (automatic when the re-run ends), fill MORNING.md, charts.
2. Land renderer, water and Field notes; deploy; review round 7 (stills + reel + blind critic + Gemini); fix the top 3.
3. MORNING.md adversarial self-audit before noon: run instructions from a clean clone, screenshots match the build, every number from a real run.
4. Next research (for the owner): pronghorn genuinely hard for wolves to catch + prey-scaled wolves; evolution costs; drought refuges over 1,000 generations.
