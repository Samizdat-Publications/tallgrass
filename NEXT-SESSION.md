# NEXT SESSION: pick up here

**Updated:** 2026-10-03 08:45

## State
- Live: https://tallgrass.stewartgregerson.workers.dev (deployed 06:35, pre movement fix). Game runs via `npm run dev`.
- Stability evidence: `review/stability/v1-f1d6e2c` (partial), `review/stability/v2-9762475` (20 seeds, 14 reached 1,000 generations, all 14 kept bison, wolves and ravens; 6 early collapses), `review/stability/v2-9762475-shocks`, `review/stability/cascade`.
- Live code diverged from v2: heading-constrained movement, selfish herd, free sight, conception param, grassInit, wolf arrival params. Defaults should equal v3d + selfish herd unless a variant wins.
- Running: `scratch/varC` (evolution fixes only) and `scratch/varE` (plus conceiveEnergy 0.72), 32 seeds x 40 yr each.

## Next 3 steps
1. Pick the best of varC/varE (32 seeds, need >= 80% all species), then run a full 20-seed 1,000-generation acceptance plus shocks from a frozen copy (sample 1000, not 2400, so seasonal cycles aren't aliased). Shocks with a burn-in: run 120 years so the shock lands at year ~48.
2. Review round 3: `tools/stills.mjs` + fresh blind critic; plus a new reel for Gemini. Visual leftovers: fire scar pure black with no smoke, autumn dusk too red, far-distance markers look like noise, dust smear on the wolf follow, bison read grey in some light.
3. Redeploy and refresh MORNING.md screenshots and numbers.

## Gotchas
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running.
- A turn-rate limit can make animals orbit targets: keep the speed-scaled turn radius.
