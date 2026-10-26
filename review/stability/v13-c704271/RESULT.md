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

## Balancing round 3 (2026-10-26, 400 years, 20 seeds, v13b defaults): how long a kill holds the pack

| | bison persist | presence >= 90% | pronghorn starvation | wolf CV | wolf-bison corr | bison | wolves | mule deer | extinct by year 400 |
|---|---|---|---|---|---|---|---|---|---|
| hold 300 ticks | 20/20 | 20/20 | 51% | 0.31 | 0.67 | 794 | 41 | 286 | none |
| hold 500 ticks | 20/20 | 20/20 | 53% | 0.30 | 0.71 | 795 | 44 | 314 | none |
| hold 300, leave 40% | 19/20 | 19/20 | 50% | 0.33 | 0.66 | 747 | 41 | 230 | seed 3 (bison, wolves) |

Closest so far: the short holds pass every gate but pronghorn starvation (51 to 53%, the bar is 50%). But the bison stay about 45% up even with a 300-tick hold, so the hold is not what releases them. A factor screen (8 seeds, 150 years: v10b, feedSettle alone, the bout with full and with 40% bites at a 500-tick hold) is running to find the part that does.

## Factor screen (2026-10-26, 8 seeds, 150 years, means from year 50): what releases the bison

| | kills a year | wolves | bison | mule deer |
|---|---|---|---|---|
| v10b | 223 | 30 | 592 | 141 |
| feedSettle only | 216 | 30 | 575 | 133 |
| bout, full bites, 500-tick hold | 80 | 40 | 823 | 284 |
| bout, 40% bites, 500-tick hold | 79 | 42 | 864 | 301 |

The cut in kills (about -64%) comes from the core of the bout, not from the bite size, the hold length or feedSettle: a pack that stays by its kill keeps topping up from it, so it rarely gets hungry enough to hunt; in v10b the wolves wandered off, got hungry and killed again, leaving 60 to 80% of each carcass. The v10b balance rests on wasteful wolves, and the bout moves the valley to a new level (more bison and mule deer, a little more pronghorn starvation).

Best candidate: feedBoutAge 300 (round 3, A3): every gate but pronghorn starvation (51% against 50%), no extinctions in 20 seeds over 400 years. On screen (tools/killwatch.ts, seed 3, 6 years) the killers stay with a bison kill a median 323 ticks (about 32 s at 1x) and a pronghorn 188 (about 19 s), against 91 in v10b; with the 1,600-tick hold a third of bison kills held their pack past a minute. Its 600-year confirm and shock suite are running (scratch/fbs/A3full, A3shocks).

## A3 confirm and shocks (2026-10-26)

600 years, 20 seeds: bison persist 20/20, presence 20/20, pronghorn starvation 52% (fails by 2 points), wolf CV 0.32, wolf-bison corr 0.68.
Shocks (20 seeds, 300 years; v10b ran 12 seeds, 250 years, so seeds 1 to 12 at year 250 compare like for like): after the **drought**, 4 of those 12 valleys lost their bison (seeds 1, 4, 9, 10; v10b none) and the wolves fell with them; after **wolfwipe** 1 (seed 3; v10b none); **cull70** none. Too many bison meet a drought and crash. **A3 is not adoptable.**

## The lie-up is the conflict (2026-10-26, 8 seeds, 150 years)

| | kills a year | wolves | bison | mule deer | killers gone from a bison kill (median ticks) | meat left when they go |
|---|---|---|---|---|---|---|
| v10b + feedSettle | 216 | 30 | 575 | 133 | 90 | 81% |
| bout without the lie-up, 40% bites | 198 | 31 | 623 | 93 | 79 | 86% |
| bout without the lie-up, 20% bites | 146 | 30 | 777 | 225 | | |
| full bout (lie-up) | 79 | 42 | 864 | 301 | 289 to 323 (a third never left with the long hold) | 40 to 51% |

Without the lie-up the balance comes back (kills -8%, bison +8%) but so does the walk-off; with it, the kills fall by two thirds and the bison overshoot. The bout alone cannot have both: keeping the scene and the stability needs the bison held down from below (calf survival, fecundity or grazing) once the wolves are efficient, a planned rebalancing with its own screens.
