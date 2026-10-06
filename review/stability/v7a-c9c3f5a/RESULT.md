# v7a acceptance (frozen c9c3f5a), 20 seeds x 1,000 bison generations

Params on top of v6b: raptors 1, stormCells 1, cougar.initial 6, muledeer.initial 60, herdSpacingGraze 1.6.
Seeds 1 to 14 ran on the cloud VM (review/stability/v7a-c9c3f5a-partial14), seeds 15 to 20 locally on 2026-10-06 (68 min, 6 threads). The sim is deterministic per seed, so the two halves combine.

| Gate (V2-PLAN section 3) | v7a | v6b | Result |
|---|---|---|---|
| Bison persist in >= 19 of 20 | 19/20 (seed 15 lost its bison in year 948) | 20/20 | pass, at the limit |
| Core species (bison, wolf, raven, pronghorn) persist in >= 18 of 20 | 19, 20, 20, 20 | 20 each | pass |
| Wolf annual CV >= 0.2, lag corr >= 0.4 | 0.26, 0.63 at 1 yr | 0.23 | pass |
| Raven CV >= 0.1 (annual means, median over seeds) | 0.18 (min 0.16) | | pass |
| Every species present >= 90% of sampled time in >= 18 of 20 worlds | prairie dogs 11/20 (mean 91%, worst 66%); cougars 19/20; others 20/20 | prairie dogs 20/20 (mean 99.8%) | FAIL |

Verdict: v7a fails the presence gate for prairie dogs and is a clear regression on them against v6b (plague years absent: median 141 per seed). v6b stays the default; the shock suite was not run.
Eagles and hawks are seasonal, so their persistence counts are not gated.
Tool output: python tools/dynamics.py review/stability/v7a-c9c3f5a
