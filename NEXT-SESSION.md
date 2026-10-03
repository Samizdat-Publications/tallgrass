# NEXT SESSION: pick up here

**Updated:** 2026-10-03 14:20

## State
- Live: https://tallgrass.stewartgregerson.workers.dev, deployed 13:30 from commit 40f06ef (challenges, overlays, photo mode, UI + renderer round 3). Verified no errors, 60 fps.
- Default sim = checkpoint v4 (5df7663). Acceptance: bison/wolves/ravens 20/20 past 1,000 generations, pronghorn 15/20. Shocks: cull passes, drought passes except pronghorn recovery, wolf wipeout fails strict recovery. All in MORNING.md.
- Review round 3 done (REVIEWS.md). Builders running: animals (a524942be7b6fd979: feet, raven shadows, predator visibility, palette) and world renderer (af57fcb936ce73c50: distant hills, trees, rocks, water, dusk, night glitter, snow). Their files are uncommitted in src/render/; my own uncommitted edits in animals.ts are the cadence-from-screen-speed fix and the feeding tug.
- v5 ecology research (all 32 seeds x 40 yr from frozen copies, compare with `tools/dynamics.py scratch/varF scratch/v5X`): best so far v5M = bison 1250/8000, deer 1000/4500, founderDesync 1, wolfRareHalf 150, grassInit 0.45 (persistence 31/32/30/29 vs v4 32/32/32/30; starvation 26% vs 47%). Key finding: wolves survive on small game with zero prey (seed 22), so they're flat and create a predator pit. Running P-S: M with wolfSmallGame 0.5/0.25 etc.

## Next 3 steps
1. Read P-S. If one is at parity with v4 on persistence and wolves respond (CV > 0.25, corr > 0.4), freeze it and run a long acceptance (20 seeds, aim 1,000 generations; slower breeding means about 2x the ticks).
2. When builders report: review their stills, commit, capture round 4 (stills + reel + Gemini), redeploy from a clean worktree (`git worktree add -f scratch/deploy-<hash>`, vite build, wrangler deploy, `node scratch/live_check2.mjs`).
3. Evolution fix (per-animal neighbour count for the lone factor) once v5 is settled.

## Gotchas
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running.
- While a 20-thread batch runs, tsc and vite are slow (minutes). Run them in the background.
- TaskStop on npx jobs leaves orphan node processes; kill by command line.
- Bash heredocs here collapse double backslashes to one: write files containing backslashes (regexes, Windows paths) with the Write tool.
- Background Bash commands are cut off at 2 hours (the node children keep running, but the notification says "stopped"). Keep single jobs under 2 h, or check the log/outputs directly.
