# v7c acceptance (frozen a6b02bb), 20 seeds x 1,000 bison generations, 2026-10-06 21:12 to 23:15

Params on top of v6b: raptors 1, stormCells 1, cougar.initial 6, muledeer.initial 60, herdSpacingGraze 1.6, raptorDogPref 0.1.

| Gate (V2-PLAN section 3) | v7c | v7b | v7a | Result |
|---|---|---|---|---|
| Bison persist >= 19 of 20 | 20/20 | 20/20 | 19/20 | pass |
| Core species persist >= 18 of 20 | 20 each | 20 each | 19 to 20 | pass |
| Wolf annual CV >= 0.2, lag corr >= 0.4 | 0.26, 0.64 at 1 yr | 0.27 | 0.26 | pass |
| Raven CV >= 0.1 | 0.18 (min 0.14) | 0.18 | 0.18 | pass |
| Every species present >= 90% in >= 18 of 20 worlds | prairie dogs 18/20 (worst 80%), cougars 20/20 (worst 95%), all others 20/20 | prairie dogs 17/20 | prairie dogs 11/20 | pass, at the limit |

Note: prairie dogs were alive at the end of the run in 17 of 20 worlds; the gate is time present, which passes.
Verdict: acceptance PASSES. Shock suite started 23:17 from the same worktree (cull70, drought, wolfwipe; 20 seeds x 720,000 ticks; log scratch/shocks_v7c.log; out scratch/frozen/a6b02bb/review/stability/v7c-a6b02bb-shocks; about 2 h). Adopt only if bison recover in at least 80% of worlds after each shock (TRACK-S Handoff item 3, six params with raptorDogPref 0.1).
