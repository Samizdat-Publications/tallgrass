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
| M11 | Audio, plus the documentary narrator | Narrator lines DONE; wiring IN PROGRESS (UI builder) |
| M12 | Round 6 fixes: animals at distance (DONE), UI (DONE), snow lag (DONE), director cuts (DONE), fast-forward throughput (DONE), world edge and far field (renderer builder, IN PROGRESS) | IN PROGRESS |
| M13 | Calendar re-scale (calendarScale 2): screen DONE, acceptance and 300-year shocks RUNNING; adopt as default only if both hold at v5's level | IN PROGRESS |
| M14 | Loop: capture, critique, fix top 3, re-verify | ongoing |

## Ordered backlog (top = next)
1. Calendar: when acceptance (about 05:05) and shocks (about 06:20) finish, decide. If adopted: default calendarScale 2, challenge suite with the new default, named seeds from `tools/mine_seeds.py scratch/cal2 --skip-years 6 --max-years 80` (candidates in NEXT-SESSION.md), MORNING.md, ECOLOGY.md, charts.
2. Land the renderer round and the narrator wiring; probe the real game; commit.
3. Deploy from a clean worktree, verify live, then review round 7 (stills + reel + blind critic + Gemini), triage, fix the top 3.
4. Wolf-tracking screens (wA, wB) for the morning report's next steps.
5. MORNING.md adversarial self-audit before noon: run instructions from a clean clone, screenshots match the build, every number from a real run.
