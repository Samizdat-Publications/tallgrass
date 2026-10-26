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

## Balancing round 1 (2026-10-26, 400 years, 20 seeds, feedSettle off): the pack's share of the kill (feedBoutLeave)

| | bison persist | presence >= 90% | pronghorn starvation | wolf CV | wolf-bison corr | bison | wolves | mule deer | extinct by year 400 |
|---|---|---|---|---|---|---|---|---|---|
| v10b (off) | 20/20 | 20/20 | 39% | 0.26 | 0.54 | 546 | 32 | 85 | none |
| v13 | 19/20 | 19/20 | 55% | 0.31 | 0.71 | 779 | 45 | 331 | seed 3 (bison, wolves) |
| leave at 40% | 20/20 | 18/20 | 51% | 0.30 | 0.71 | 762 | 41 | 215 | none |
| leave at 55% | 20/20 | 8/20 | 51% | 0.60 | 0.21 | 745 | 28 | 227 | seed 9 (wolves) |
| leave at 55%, hold 800 ticks | 20/20 | 11/20 | 51% | 0.53 | 0.28 | 754 | 32 | 229 | none |

None passes. Every variant keeps the bison about 40% up: what holds them down in v10b is how many kills a wolf needs, and eating kills properly cuts that need whatever share the pack leaves; the wolf population cannot grow enough to make it up (territory and pack size cap it), and leaving more meat starves the wolves instead (presence 8 to 11 of 20). Round 2 raises wolf energy use with the pack leaving 40% (wolf.metabolism x1.3 and x1.6) and with the full bout (x1.6): scratch/fbs/M13, M16, Z16, on the v13b defaults.

## Balancing round 2 (2026-10-26, 400 years, 20 seeds, v13b defaults): wolf energy use

| | presence >= 90% | pronghorn starvation | wolf CV | bison | wolves | wolves extinct by year 400 |
|---|---|---|---|---|---|---|
| leave 40%, wolf metabolism x1.3 | 5/20 | 53% | 0.79 | 800 | 22 | 7 seeds |
| leave 40%, x1.6 | 0/20 | 54% | 2.42 | 883 | 3 | 12 seeds |
| full bout, x1.6 | 0/20 | 53% | 1.59 | 888 | 4 | 13 seeds |

Wrong lever: a hungrier wolf does not kill more, it starves (the wolves are limited by how hard a kill is, not by appetite). Round 3 shortens how long a kill holds the pack (feedBoutAge 300 and 500, the v10b return window was 500), so the feed and the lie-up still show and the wolves get their hunting rhythm back: scratch/fbs/A3, A5, A3L.
