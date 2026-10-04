# NEXT SESSION: pick up here

**Updated:** 2026-10-04 00:00

## State
- Live: https://tallgrass.stewartgregerson.workers.dev, deployed 21:00 from e958d19. Since then (not yet deployed): documentary camera by default when idle, clear-sight director shots, director follow easing, adaptive render scale, snow-lag fix, cougar country retune, 300-year shock evidence.
- Default sim = checkpoint v5. v5 acceptance: bison/wolves/ravens 20/20 past 1,000 generations, pronghorn 18/20. v5 300-year shocks: all species recover (cull 100%, drought 80 to 85%, wolf wipeout 90 to 100%). v6 research (prey-scaled wolves, litter caps, herding) NOT adopted: loses pronghorn over centuries. Spring birth pulse, climate cycles, near-equilibrium start, nearest-neighbour herding: all rejected with data in DECISIONS.md.
- Owner rulings: images inline in chat (SendUserFile render) as they're made; historical images in the making-of artifact https://claude.ai/artifact/7jPHUFvbzTv6AUz5UCA3Mu (republish scratch/artifact_journey/making-of.html after `tools/journey_page.py --artifact --out scratch/artifact_journey/making-of.html`, with files mapped to journey/*).
- Builders working round 5: animals (a524942be7b6fd979: pronghorn glow, sick tint, wolf contrast, gallop slide, kill stagger), renderer (af57fcb936ce73c50: snow as sand, burnt trees, moonlit grass, lawn green, far land, shadow flicker), UI (a1f8911043eb89066: graph labels, sparklines, chronicle cut-off, documentary chip, cards at 100x).
- Running: raven screens rv1/rv2 (carrion-limited ravens, 100 years).

## Next 3 steps
1. As builders report: check their evidence, commit, show images inline, archive to journey/ and republish the artifact.
2. When all three land: deploy (worktree, vite build, wrangler, `node scratch/live_check2.mjs`), then review round 6.
3. Ravens: if rv1/rv2 keep persistence at v5 level and break the ceiling, adopt (then acceptance + challenge suite + seed mining again).

## Gotchas
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running.
- While a 20-thread batch runs, tsc and vite are slow (minutes). Run them in the background.
- TaskStop on npx jobs leaves orphan node processes; kill by command line.
- Bash heredocs here collapse double backslashes to one: write files containing backslashes (regexes, Windows paths) with the Write tool.
- Background Bash commands are cut off at 2 hours (the node children keep running, but the notification says "stopped"). Keep single jobs under 2 h, or check the log/outputs directly.
