# NEXT SESSION: pick up here

**Updated:** 2026-10-03 ~01:55

## Right now
- Lead (Opus) is writing the sim core in `src/sim/` (sim.ts, agents, vegetation, behaviors). Contract: `src/sim/types.ts` (Snapshot, AGENT_STRIDE=12, SimLike, Intervention). World gen: `src/sim/world.ts` (done).
- Four builder agents (general-purpose, model sonnet) are running in the background on disjoint files:
  1. render foundation: src/render/{engine,terrain,water,sky,trees,post,camera}.ts + dev/terrain.html
  2. grass: src/render/grass.ts + dev/grass.html
  3. animals: src/render/animals.ts + src/render/models/ + dev/animals.html
  4. harness: src/headless/{batch,batchWorker,metrics,mocksim,run,scenarios}.ts + tools/charts.py
  Their screenshots land in scratch/b1..b3. Review what comes back before merging; commit after review.

## Next 3 steps
1. Finish sim core, run `npx tsx src/headless/run.ts --seed 1 --ticks 50000` and get bison + wolves coexisting.
2. Integrate: `src/sim/worker.ts` (runs Sim, posts Snapshot), `src/main.ts` + `index.html` (Engine + GrassField + AnimalLayer + HUD).
3. Batch 8 seeds, charts, first balancing pass. Then review round 1.

## Gotchas
- Git Bash rewrites `/dev/x.html` args: pass `dev/x.html` to tools/capture.mjs (it normalizes).
- Custom agent types `builder`/`blind-critic` are NOT registered this session: use general-purpose + model override + pasted role prompt (blind-critic prompt: `.claude/agents/blind-critic.md`, give it ONLY a folder path, tools Read/Glob).
- Coordinate convention: sim (x, y) -> three (x, h, y); rotation.y = -heading.
- Every generated image goes to `journey/` via `tools/journey.py` (owner ruling).
- Gemini text/video model: `gemini-3.1-pro-preview` (2.5-pro is 404). Image: `gemini-3-pro-image`.
