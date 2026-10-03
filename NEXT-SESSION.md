# NEXT SESSION: pick up here

**Updated:** 2026-10-03 18:00

## State
- Live: https://tallgrass.stewartgregerson.workers.dev, deployed 17:55 from 7f09fdd (v5 sim, retuned challenges, all round-3 visual fixes). Verified no errors, 60 fps.
- Default sim = checkpoint v5 (src/sim/params.ts). v5 acceptance: bison/wolves/ravens 20/20 past 1,000 generations, pronghorn 18/20. v5 shocks: persistence 90-100%; strict bison recovery fails because herds overshoot (evolution still climbing during the first century). 300-year shock rerun is still to do.
- All builders done and committed (animals, world renderer, UI, journey page). journey/index.html is the making-of draft (regenerate with tools/journey_page.py after archiving new images).
- v6 research: v6X = v5 + wolfPreyRef 1000 makes wolves track prey (corr 0.63, CV 0.29) at near-equal persistence. Litter genes evolve fast (pronghorn 1.0 -> 1.42 in 40 yr), so maxLitter caps (bison 1, deer 2) are being screened over 100 years: scratch/v6X100, v6AD (+ loneIndividual + caps), v6AE (+ caps).

## Next 3 steps
1. Read the 100-year screens; pick v6 (likely v6X plus caps); run its 1,000-generation acceptance (about 1.5 to 2 h at 20 threads) and a 300-year shock suite (shock at about year 120, after evolution settles).
2. Review round 4 on the deployed build: `node tools/stills.mjs --out review/round-04 --set review --timeout 400000`, copy v5 charts in, fresh blind critic; reel via `node tools/video.mjs --out review/round-04-video/reel.mp4`, then `.venv/Scripts/python tools/gemini_video_review.py review/round-04-video/reel.mp4`. Do captures while the CPU is quiet.
3. If v6 is adopted: re-run tools/challenge_suite.py and tools/mine_seeds.py, update MORNING.md and ECOLOGY.md, redeploy.

## Gotchas
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running.
- While a 20-thread batch runs, tsc and vite are slow (minutes). Run them in the background.
- TaskStop on npx jobs leaves orphan node processes; kill by command line.
- Bash heredocs here collapse double backslashes to one: write files containing backslashes (regexes, Windows paths) with the Write tool.
- Background Bash commands are cut off at 2 hours (the node children keep running, but the notification says "stopped"). Keep single jobs under 2 h, or check the log/outputs directly.
