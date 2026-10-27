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

## Round 2: the conceive rule plus one bison lever

| | bison persist | presence | pronghorn starvation | wolf CV | wolf-bison corr | bison | wolves | mule deer | extinct by year 400 | eligible |
|---|---|---|---|---|---|---|---|---|---|---|
| conceive 0.7 + bison food 0.45 | 20/20 | 19/20 | 48% | 0.38 | 0.60 | 620 | 31 | 285 | none | yes |
| conceive 0.7 + bison food 0.48 | 19/20 | 19/20 | 48% | 0.35 | 0.65 | 646 | 32 | 277 | seed 3 (bison, wolves) | yes |
| conceive 0.7 + bison cooldown 1700 | 19/20 | 18/20 | 47% | 0.39 | 0.64 | 671 | 31 | 270 | seed 3 (bison, wolves) | no |
| conceive 0.7 + cooldown 1500 + food 0.50 | 18/20 | 18/20 | 47% | 0.37 | 0.59 | 616 | 30 | 273 | seeds 3, 19 (bison, wolves), 5 (wolves) | no |

Best: **conceiveEnergy 0.7 with bison.foodValue 0.45** (C7F45). Every gate passes, no extinctions in 20 seeds, bison 620 (v10b 546, v13c 794), bison peak median 1,563 (v13c 1,850), wolves back to 31. The bison-lever-alone version of food 0.45 lost seed 3; with the conceive rule it holds. Wolf CV rises to 0.38 (v10b 0.26), still inside the gate. Mule deer stay near 285 (v10b 85): nothing here touches them, so they remain a separate question. Its 600-year confirm and the drought, cull70 and wolfwipe shocks are running (scratch/rb/C7F45full, C7F45shocks).
