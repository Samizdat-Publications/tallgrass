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
| M8 | Review rounds 1 to 9 (stills + video) | Rounds 1 to 8 DONE and triaged in REVIEWS.md; round 9 (blind critic on the 09:51 build) running |
| M9 | Depth: pronghorn, cougar (opt-in), evolution, chronicle, god tools, scenarios, named seeds, life stories, challenges | DONE |
| M10 | UI design pass, inspector, overlays, documentary mode, photo mode, ambient view | DONE |
| M11 | Audio, plus the documentary narrator | DONE (narrator committed fcf8971) |
| M12 | Round 6 to 8 fixes: animals, UI, snow lag, director cuts, fast-forward, world edge and far field, water, Field notes, winter, rain, territories, grey wolves, pond glare | DONE, deployed 09:51 (aee1c66) |
| M13 | Calendar re-scale (calendarScale 2) | ADOPTED 06:25: acceptance 19/20 per species; 300-year shocks merged (cull 19/20 persist, all recover; drought about 90% recover) |
| M15 | Predator research: Hungry wolves (opt-in scenario) | Acceptance done 10:01: bison, wolves, ravens 19/20, pronghorn 0/20; stays opt-in |
| M16 | Riparian green ribbon and lighter pond rims (renderer builder) | IN PROGRESS, report due 11:05 |
| M14 | Loop: capture, critique, fix top 3, re-verify | ongoing |

## Ordered backlog (top = next)
1. Riparian round: review against the concept image, paired GPU A/B, commit, deploy by 11:30, live check.
2. Round 9 critique: save, triage in REVIEWS.md, add scores to MORNING.md.
3. Morning screenshots from the final build, journey + making-of artifact republish.
4. MORNING.md adversarial self-audit before noon; NEXT-SESSION.md current; push.
5. For the owner (Next 5 in MORNING.md): pronghorn under prey-scaled wolves, evolution costs per species, herd spacing while grazing, riparian and creek detail, landing page.
