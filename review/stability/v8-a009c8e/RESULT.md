# v8 acceptance (frozen a009c8e), 20 seeds x 1,000 bison generations, 2026-10-07 19:30 to 22:35

Params on top of v7c: snowDepth 1, dynamicTrees 1, treeCwRecruit 0.003.

| Gate (V2-PLAN section 3) | v8 | v7c | Result |
|---|---|---|---|
| Bison persist >= 19 of 20 | 20/20 | 20/20 | pass |
| Core species persist >= 18 of 20 | 20 each | 20 each | pass |
| Wolf annual CV >= 0.2, lag corr >= 0.4 | 0.27, 0.54 at 1 yr | 0.26, 0.64 | pass |
| Raven CV >= 0.1 | 0.19 (min 0.17) | 0.18 | pass |
| Every species present >= 90% in >= 18 of 20 worlds | prairie dogs 17/20 (worst 84%, mean 96%); all others 20/20 | prairie dogs 18/20 | FAIL by one world |

Verdict: not adopted; v7c stays. Shocks not run. In the 200-year screen the same params looked better than control for prairie dogs (32/32), so the long runs expose town fragility the short screens miss. Planner item: make prairie dog towns more robust over centuries (recolonisation from the open prairie, plague recovery) before the next checkpoint attempt.
