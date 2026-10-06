# v7a prairie dog diagnosis (2026-10-06)

32 seeds x 240,000 ticks (200 valley years) each, frozen c9c3f5a, stats from year 5. Base = v7a params: raptors 1, stormCells 1, cougar.initial 6, muledeer.initial 60, herdSpacingGraze 1.6.

```
zen/c9c3f5a/review/stability/v7diag/full                     n=32  pd presence>=90%: 27  mean presence 0.968  mean pd 22  bison alive 32
c9c3f5a/review/stability/v7diag/noraptor                     n=32  pd presence>=90%: 31  mean presence 0.992  mean pd 37  bison alive 32
/c9c3f5a/review/stability/v7diag/nostorm                     n=32  pd presence>=90%: 26  mean presence 0.958  mean pd 25  bison alive 32
```

Raptors cause the prairie dog loss; storm cells do not. Next candidate (v7b): v7a with raptor predation on prairie dogs reduced (or raptors off), then a 32-seed screen and the 20-seed acceptance. CSVs stay in the frozen worktree (scratch, not committed).
