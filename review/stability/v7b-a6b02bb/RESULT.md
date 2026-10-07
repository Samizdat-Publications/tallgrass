# v7b acceptance (frozen a6b02bb), 20 seeds x 1,000 bison generations, 2026-10-06 18:38 to 21:10

Params on top of v6b: raptors 1, stormCells 1, cougar.initial 6, muledeer.initial 60, herdSpacingGraze 1.6, raptorDogPref 0.25.

| Gate (V2-PLAN section 3) | v7b | v7a | v6b | Result |
|---|---|---|---|---|
| Bison persist >= 19 of 20 | 20/20 | 19/20 | 20/20 | pass |
| Core species persist >= 18 of 20 | 20 each | 19 to 20 | 20 each | pass |
| Wolf annual CV >= 0.2, lag corr >= 0.4 | 0.27, 0.62 at 1 yr | 0.26 | 0.23 | pass |
| Raven CV >= 0.1 | 0.18 (min 0.16) | 0.18 | | pass |
| Every species present >= 90% in >= 18 of 20 worlds | prairie dogs 17/20 (mean 99%, worst 74%); all others 20/20 | prairie dogs 11/20 | 20/20 | FAIL by one world |

Verdict: not adopted; v6b stays the default. raptorDogPref 0.25 fixed most of v7a's loss (11 to 17 of 20 worlds) but not all of it. In the 200-year screens even v7a without raptors lost the towns in 1 of 32 worlds, so the other v7 additions also cost prairie dogs a little over long runs.
Next: v7c (raptorDogPref 0.1) acceptance started 21:12 from the same worktree (log scratch/accept_v7c.log, out scratch/frozen/a6b02bb/review/stability/v7c-a6b02bb). If prairie dogs still miss, screen which of cougars, mule deer and herd spacing costs the towns.
