# NEXT SESSION: pick up here

**Updated:** 2026-10-03 10:10

## State
- Live: https://tallgrass.stewartgregerson.workers.dev (deployed 08:55, checkpoint v4 + cougar code). Game runs via `npm run dev`.
- Default sim = checkpoint v4 (5df7663): 32/32 worlds keep bison, wolves and ravens for 40 years, pronghorn 30/32.
- Running: v4 acceptance, 20 seeds x 1,000 bison generations, 20 threads, from frozen copy `scratch/frozen/5df7663` (log `scratch/accept_v4.log`, out `review/stability/v4-5df7663`). ETA about 11:30.
- B1 builder (renderer: fire scar + smoke, autumn dusk, top-map edge, orange wide views) still running; it has uncommitted edits in src/render/{sky,smoke,terrain}.ts and dev/grass.ts. Don't commit those until it reports.
- Just built: `src/render/overlay.ts` (vegetation, fear, territory, trait heatmap overlays, one draped mesh; pack labels and a legend). Worker sends `packs`, `packSerials`, `traitGrid`. Needs a visual check in the browser.

## Next 3 steps
1. Verify overlays in a capture (`tools/capture.mjs`, call `__overlay.setMode('territory')` etc.), fix, commit.
2. When acceptance finishes: `.venv/Scripts/python tools/charts.py review/stability/v4-5df7663`, write real numbers into MORNING.md, then run the shock suite: `npx tsx scratch/frozen/5df7663/src/headless/batch.ts --seeds 20 --ticks 288000 --sample 1000 --threads 15 --out review/stability/v4-5df7663-shocks --scenario cull70,drought,wolfwipe`.
3. Review round 3 after B1 lands: stills to review/round-03, fresh blind critic, new reel + Gemini video review.

## Gotchas
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running.
- While a 20-thread batch runs, tsc and vite are slow (minutes). Run them in the background.
- TaskStop on npx jobs leaves orphan node processes; kill by command line.
- Bash heredocs here collapse double backslashes to one: write files containing backslashes (regexes, Windows paths) with the Write tool.
- Background Bash commands are cut off at 2 hours (the node children keep running, but the notification says "stopped"). Keep single jobs under 2 h, or check the log/outputs directly.
