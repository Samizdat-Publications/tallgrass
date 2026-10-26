# v13 (feedBout 1, the feeding bout) against v10b: baseline result, FAILS one gate

Run 2026-10-25 at c704271: 20 seeds each, baseline scenario, until 1,000 bison generations or 1,440,000 ticks (600 years), sample every 2,000 ticks. `scratch/fb/off` is v10b (the old default), `scratch/fb/on` is v13 (the default live as 1.0.9 since 2026-10-25 by owner ruling, adopted before this finished).

Standard gates (tools/adoption.py --burn 0.15):

| | bison persist | presence >= 90% | pronghorn starvation | wolf CV | wolf-bison corr | eligible |
|---|---|---|---|---|---|---|
| v10b | 20/20 | 20/20 | 39% | 0.26 | 0.54 | yes |
| v13 | 19/20 | 19/20 | 55% (fails) | 0.31 | 0.71 | no |

Mean populations, years 120 to 600:

| | bison | wolves | pronghorn | mule deer | coyotes | ravens | prairie dogs | cougars |
|---|---|---|---|---|---|---|---|---|
| v10b | 543 | 31.8 | 370 | 82.4 | 79.9 | 514 | 17.8 | 7.2 |
| v13 | 777 | 46.9 | 384 | 326 | 77.8 | 562 | 22.0 | 5.0 |

Seed 3 lost its bison and then its wolves: the bison boomed to about 1,600 by year 200, crashed to 0 by year 220, and the wolves died out over the next 60 years. Wolves that eat their kills need fewer of them (kills about -58% in tools/killwatch.ts), so the bison overshoot what the grass carries; the same release quadruples the mule deer and pushes pronghorn into starvation.

The dynamics are livelier (wolf CV and the wolf-bison lag correlation both up), which is what the critics ask for, but the default should pass the gates. Balancing screens with `feedBoutLeave` (the pack leaves once a share of the kill is eaten, so it kills more often) are running: scratch/fbs/L40, L55, L55A8 (400 years, 20 seeds each).
