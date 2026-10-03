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
| M7 | Stability acceptance (20 seeds, 1000+ bison gens, shocks) | v2 passed with caveats; v4 32/32 at 40 yr; v4 1000-gen run IN PROGRESS (started 09:43), shocks next |
| M8 | Review rounds 1 (stills) and 2 (Gemini video) | DONE, triaged in REVIEWS.md |
| M9 | Depth: pronghorn, cougar (opt-in), evolution, events + chronicle, god tools, scenarios, named seeds, life stories | DONE (rabbits stay abstract as wolf small game) |
| M10 | UI design pass, inspector, overlays, documentary mode | DONE; overlays (vegetation, fear, territory, traits) built 10:15, verifying |
| M11 | Audio (ElevenLabs ambience + SFX) | DONE |
| M12 | Review round 3 (stills + fresh critic + video), polish, deploy | NEXT, after renderer builder B1 lands |
| M13 | Loop: capture, critique, fix top 3, re-verify | ongoing |

## Ordered backlog (top = next)
1. Verify the map overlays in captures; commit.
2. v4 acceptance results into MORNING.md; then the v4 shock suite (120 years, shock at year ~48).
3. Merge B1 (fire scar + smoke, autumn dusk, top-map edge, orange wide views).
4. Review round 3: stills + fresh blind critic; new reel + Gemini video critique. Fix top 3.
5. Cougar validation: 32 seeds x 40 years with cougar.initial 6. Promote to default only if it doesn't hurt persistence.
6. Redeploy, refresh MORNING.md screenshots.
7. Landing/journey: assemble the start-to-end image record (owner ruling 2).
