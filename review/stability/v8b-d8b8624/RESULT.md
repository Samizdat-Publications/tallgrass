# v8b acceptance (frozen d8b8624), 20 seeds x 1,000 bison generations, 2026-10-07 23:15 to 2026-10-08 01:20

Params on top of v7c: snowDepth 1, dynamicTrees 1, treeCwRecruit 0.003, dogRescueYears 8.

| Gate (V2-PLAN section 3) | v8b | v8 | v7c | Result |
|---|---|---|---|---|
| Bison persist >= 19 of 20 | 20/20 | 20/20 | 20/20 | pass |
| Core species persist >= 18 of 20 | 20 each | 20 each | 20 each | pass |
| Wolf annual CV >= 0.2, lag corr >= 0.4 | 0.27, 0.56 at 1 yr | 0.27 | 0.26 | pass |
| Raven CV >= 0.1 | 0.20 (min 0.17) | 0.19 | 0.18 | pass |
| Every species present >= 90% in >= 18 of 20 worlds | all 20/20; prairie dogs worst 98% | prairie dogs 17/20 | prairie dogs 18/20 | pass |

Verdict: acceptance PASSES with margin. Shock suite running (cull70, drought, wolfwipe; log scratch/shocks_v8b.log).
