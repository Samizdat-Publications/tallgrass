# v12 candidate (v10b + shoreSpread 1 + shoreOpen 2): acceptance result, NOT ADOPTED

v12 = the v11 waterhole fix (bison drink in waves and walk back off the bank) with the walk-off kept off woody cover (`shoreOpen 2`: no push where tree and shrub cover is 0.5 or more), the try that tested whether the walk into the creek woods caused v11's mule deer cost. Frozen f219729. Acceptance 20 x 1,200 years (seeds 1-20, same as v10b and v11), shocks 12 x 500 years x cull70, drought, wolfwipe.

Standard gates (tools/adoption.py --burn 0.15): eligible (bison 20/20, presence 20/20, pronghorn starvation 39%, wolf CV 0.25, wolf-bison corr 0.52).

Years 120 to 1,200, mean of per-seed means (scratch/v12 and DECISIONS 2026-10-10 23:35):

| | near-water share | bison | wolves | pronghorn | mule deer | coyotes | ravens | prairie dogs |
|---|---|---|---|---|---|---|---|---|
| v10b | 0.543 | 548 | 31.7 | 369 | 85.7 | 77.9 | 513 | 19.5 |
| v11 | 0.446 | 568 | 34.0 | 371 | 56.4 | 77.5 | 518 | 18.6 |
| v12 | 0.472 | 555 | 33.4 | 370 | 72.7 | 76.6 | 513 | 17.5 |

Shocks, share of worlds recovered (cull70 / drought / wolfwipe):

| | mule deer | bison | wolves |
|---|---|---|---|
| v10b | 100 / 92 / 92% | 100 / 100 / 100% | 100 / 100 / 100% |
| v11 | 83 / 83 / 67% | | |
| v12 | 100 / 83 / 75% | 100 / 83 / 100% | 100 / 83 / 100% |

The hypothesis held in part: keeping the walk-off out of the woods cut the deer cost from -34% to -15% and kept about 70% of v11's crowding cut (400-year screen: deer +5%; the cost again shows only over centuries). But the deer still fall 15% (lower in 12 of 20 seeds), deer and herd recovery after shocks is weaker than v10b's, and a 0.54 to 0.47 near-water share would still read as a ring of bison at the pond.

Decision (2026-10-11 01:20): not adopted; v10b stays the default. Both params stay off by default and are live: `?p=shoreSpread:1,shoreOpen:2` shows v12. Branch v12-adopt (cd4508c, golden 0bd8322f, a60095a5, 17bd11eb) is kept unmerged. Seeds 21-40 for v12 and v10b were still running at the decision (scratch/v12/acc_sA_21, acc_v10b_21) and are added below when done.

The waterhole ring is probably not a drinking-schedule problem: the next try should look at where bison graze between drinks (grass near water stays greenest in the dry years every review shot uses), not at how they leave the bank.
