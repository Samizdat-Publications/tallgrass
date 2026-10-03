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
| M7 | Stability acceptance (20 seeds, 1000+ bison gens, shocks) | v4 DONE: bison/wolves/ravens 20/20, pronghorn 15/20; shocks: cull pass, drought pass except pronghorn recovery, wolfwipe fails strict recovery. v5P candidate acceptance RUNNING |
| M8 | Review rounds 1 to 3 (stills + video) | DONE, triaged in REVIEWS.md |
| M9 | Depth: pronghorn, cougar (opt-in), evolution, chronicle, god tools, scenarios, named seeds, life stories, challenges | DONE |
| M10 | UI design pass, inspector, overlays, documentary mode, photo mode | DONE (round-3 UI fixes landed 14:15) |
| M11 | Audio | DONE |
| M12 | Round 3 fixes: feet (lead + animals builder), world renderer pass (builder), ecology v5 research (lead) | IN PROGRESS |
| M13 | Loop: capture, critique, fix top 3, re-verify | ongoing |

## Ordered backlog (top = next)
1. v5P acceptance and shocks; if they pass, make v5P the default, re-run `tools/challenge_suite.py`, re-mine named worlds with `tools/mine_seeds.py`, update ECOLOGY.md and MORNING.md.
2. v6 screens (prey-scaled wolf capacity X/Y/Z, raven cap AA) and the herding fix (loneIndividual) on top of the winner.
3. Land the animals and world-renderer builders, capture review round 4 (stills + reel + Gemini), redeploy.
4. Journey "making of" page (builder running), link from MORNING.md.
5. Concept-image gap: distant-hill grass character, riparian look, water.
