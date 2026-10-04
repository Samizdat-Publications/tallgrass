# NEXT SESSION: pick up here

**Updated:** 2026-10-04 02:20 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- Live: https://tallgrass.stewartgregerson.workers.dev, deployed about 01:36 from b679901 (renderer round 6, animals round 5, documentary camera default).
- Since the deploy (committed, not deployed): snow and frost ease fixed (e82a67b: no snow in early summer after fast-forward), documentary camera cuts across the valley and eases near moves (94182a0).
- Default sim = checkpoint v5. Acceptance: bison/wolves/ravens 20/20 past 1,000 generations, pronghorn 18/20. 300-year shocks recover. v6 and every behaviour tweak rejected with data (DECISIONS.md).
- Review round 6 done and triaged (REVIEWS.md). Builders briefed 02:00 (not committed until I review):
  - renderer af57fcb936ce73c50: world edge and far field, shadow cascade seams, tree variety, dusk sky glow, close-ground detail, wet sheen reading as snow (scratch/snowcheck/s3_crop.png).
  - animals a524942be7b6fd979: wolves readable at distance, herds as stains in wide/dusk/top views, distance motion cue (bob, slope pitch), crisp selection ring, kill readability.
  - UI a1f8911043eb89066: chronicle newest-first with an earlier-entries cue, chapter card drops when its season has passed and avoids labels, H for ambient (hide UI), calmer speed notice.
- Running: calendar re-scale screens on frozen copies (scratch/frozen/cal2, cal4; logs scratch/cal2.log, cal4.log; 32 seeds x 240,000 ticks; year = 1,200 or 600 ticks, biology per tick unchanged, wolf.litter 2.25 or 1.125). Compare with v5 at 100 years: 31/31/31/32. Seed 11 collapsed in both (check whether v5 also loses seed 11).

## Next 3 steps
1. When the cal screens finish: persistence plus tools/dynamics.py (wolf lag in years, recovery speed in years). If one holds v5-level persistence, plan the port: types.ts constants, the non-calendar timers kept at 2,400/1,200/600 ticks as in the frozen patch, wolf.litter, render snow/frost tau scaled to the shorter seasons, UI "1 year every N min", scenarios and challenges in years, named seeds re-mined, challenge suite, then full acceptance (20 seeds x 1,000 generations) and the 300-year shock suite before it can become the default.
2. As builders report: check evidence (stills, bench), commit, show images inline, archive milestone images to journey/ and republish the artifact.
3. Deploy when the builder round lands (worktree, vite build, wrangler, `node scratch/live_check2.mjs`), then review round 7 (stills + video).

## Gotchas
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running (the cal screens run from frozen copies, so live src is safe).
- While a 20-thread batch runs, tsc and vite are slow (minutes). Run them in the background.
- TaskStop on npx jobs leaves orphan node processes; kill by command line.
- Bash heredocs here collapse double backslashes to one: write files containing backslashes (regexes, Windows paths) with the Write tool.
- Background Bash commands are cut off at 2 hours (the node children keep running, but the notification says "stopped"). Keep single jobs under 2 h, or check the log/outputs directly.
- In batch CSVs, "seeds done" in the log includes seeds that finished the full run; a collapsed seed has a short CSV ending in zeros.
