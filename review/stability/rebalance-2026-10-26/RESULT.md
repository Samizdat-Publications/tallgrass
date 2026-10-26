# Rebalancing (owner ruling 2026-10-26): keep the wolves' lie-up, hold the bison down from below

Starting point: checkpoint v13c (live as 1.0.11; feedBout 1, feedSettle 1, feedBoutAge 300). Its problem (review/stability/v13-c704271/RESULT.md): wolves that stay by their kill hunt about two thirds less, so the bison settle about 45% above v10b, mule deer about 3.4 times, pronghorn starvation 51 to 52%, and after a drought 4 of 12 valleys lose their bison (v10b none). The fix should hold the grazers down from below (births and grass) instead of asking the wolves to waste meat again.

All screens: 20 seeds, 400 years, baseline, on the v13c defaults; gates by tools/adoption.py --burn 0.15 against v10b (scratch/fb/off); means from year 120 to 400 (scratch/rb/means.py).

## Round 1: one lever each

| | bison persist | presence | pronghorn starvation | wolf CV | wolf-bison corr | bison | wolves | mule deer | extinct by year 400 | eligible |
|---|---|---|---|---|---|---|---|---|---|---|
| v10b | 20/20 | 20/20 | 39% | 0.26 | 0.54 | 546 | 32 | 85 | none | yes |
| v13c | 20/20 | 20/20 | 51% | 0.31 | 0.67 | 794 | 41 | 286 | none | no |
| leanLitter 1.2 | 19/20 | 19/20 | 49% | 0.33 | 0.70 | 757 | 40 | 272 | seed 3 (bison, wolves) | yes |
| conceiveEnergy 0.7 | 20/20 | 19/20 | 48% | 0.31 | 0.70 | 769 | 40 | 291 | none | yes |
| bison.birthCooldown 1700 | 20/20 | 20/20 | 52% | 0.34 | 0.61 | 703 | 33 | 293 | none | no |
| bison.foodValue 0.45 | 19/20 | 19/20 | 52% | 0.38 | 0.61 | 617 | 31 | 278 | seed 3 (bison, wolves) | no |

The condition-to-conceive rule (all grazers) fixes the starvation gate; the bison-only levers bring the bison down. Neither touches the mule deer, which the wolves' lower kill rate releases. Round 2 combines conceiveEnergy 0.7 with each bison lever.
