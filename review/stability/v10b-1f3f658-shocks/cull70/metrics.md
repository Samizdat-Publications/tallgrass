# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit 1f3f658 (frozen copy); real sim
- Params: {"evolution2":1,"climate2":0.3,"wolfDenMinDist":280,"wolfTerritory":130,"deer.maxLitter":2,"wolf.sprintCost":0.3,"raven.initial":250,"coyote.initial":30}
- Shocks: cull 70% bison at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 567 | 0.33 | 0.0% | 0.0 | 2.13 | 25 | 55.0 (11 seeds) | 100% | 100% | 11.9 |
| wolf | 12/12 (100%) | 30 | 0.25 | 0.0% | 0.0 | 1.73 | 41 | 27.5 (10 seeds) | 100% | 100% | 35.0 |
| raven | 12/12 (100%) | 509 | 0.37 | 0.0% | 0.0 | 1.93 | 37 | 53.8 (12 seeds) | 100% | 100% | 16.9 |
| pronghorn | 12/12 (100%) | 374 | 0.26 | 0.0% | 0.0 | 1.95 | 43 | 27.5 (12 seeds) | 100% | 100% | 36.3 |
| rabbit | 12/12 (100%) | 577 | 0.32 | 0.0% | 0.0 | 2.07 | 44 | 67.5 (5 seeds) | 100% | 100% | 38.8 |
| cougar | 11/12 (92%) | 6 | 0.52 | 5.3% | 6.3 | 2.53 | 68 | 91.9 (10 seeds) | 100% | 100% | 52.5 |
| coyote | 12/12 (100%) | 62 | 0.33 | 0.0% | 0.0 | 1.96 | 63 | 15.0 (9 seeds) | 100% | 100% | 30.6 |
| prairiedog | 11/12 (92%) | 25 | 0.60 | 1.5% | 3.1 | 2.93 | 31 | 92.5 (4 seeds) | 92% | 92% | 46.3 |
| muledeer | 12/12 (100%) | 110 | 0.88 | 0.9% | 1.3 | 4.76 | 37 | 18.8 (7 seeds) | 100% | 100% | 41.3 |

Max bison generation depth reached: 235.8 (median across seeds 223.6).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.2 | 0.0 | 0.4 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2987.9 | 8264.6 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 94.7% | 18.4 | 22.5 | 9.4 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 99.2 | 1061.6 |
| prairiedog | 100.0% | 2.2 | 0.0 | 39.7 | 0.0 |
| muledeer | 100.0% | 0.2 | 0.0 | 64.0 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 10 | 2.0 | 52 | 55 | 24 | 21 | 0.7 |
| 2 | 22 | 4.4 | 139 | 139 | 25 | 23 | 1.0 |
| 3 | 17 | 3.4 | 97 | 104 | 19 | 21 | 0.8 |
| 4 | 40 | 8.0 | 142 | 155 | 26 | 23 | 1.4 |
| 5 | 9 | 1.8 | 82 | 86 | 25 | 23 | 0.7 |
| 6 | 12 | 2.4 | 86 | 93 | 22 | 23 | 0.8 |
| 7 | 20 | 4.0 | 113 | 129 | 28 | 28 | 1.4 |
| 8 | 47 | 9.4 | 185 | 212 | 20 | 21 | 2.5 |
| 9 | 17 | 3.4 | 87 | 103 | 21 | 23 | 1.4 |
| 10 | 17 | 3.4 | 118 | 135 | 25 | 18 | 1.4 |
| 11 | 30 | 6.0 | 127 | 127 | 23 | 17 | 1.4 |
| 12 | 53 | 10.6 | 155 | 174 | 18 | 19 | 2.6 |

Median plagues per 100 years across seeds: 3.7 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.33. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.39 at a lag of 0.5 years; 42% of seeds reach 0.4. Annual-mean best (median): 0.39.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.30 | 0.29 | 0.40 | 0.32 | 0.34 | 0.19 | 0.40 | 0.32 |
| 2 | 0.36 | 0.35 | 0.20 | 0.13 | 0.05 | -0.02 | 0.20 | 0.13 |
| 3 | 0.33 | 0.32 | 0.32 | 0.28 | 0.29 | 0.17 | 0.32 | 0.28 |
| 4 | 0.32 | 0.30 | 0.46 | 0.41 | 0.35 | 0.23 | 0.46 | 0.41 |
| 5 | 0.34 | 0.30 | 0.42 | 0.30 | 0.19 | 0.07 | 0.42 | 0.30 |
| 6 | 0.30 | 0.33 | 0.43 | 0.40 | 0.39 | 0.27 | 0.43 | 0.40 |
| 7 | 0.33 | 0.33 | 0.44 | 0.44 | 0.36 | 0.21 | 0.44 | 0.44 |
| 8 | 0.33 | 0.33 | 0.29 | 0.22 | 0.16 | 0.01 | 0.29 | 0.22 |
| 9 | 0.34 | 0.30 | 0.39 | 0.32 | 0.27 | 0.12 | 0.39 | 0.32 |
| 10 | 0.33 | 0.33 | 0.18 | 0.15 | 0.12 | 0.01 | 0.18 | 0.15 |
| 11 | 0.34 | 0.34 | 0.21 | 0.17 | 0.10 | 0.01 | 0.21 | 0.17 |
| 12 | 0.28 | 0.30 | 0.39 | 0.26 | 0.22 | 0.14 | 0.39 | 0.26 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 214.7 | 562 / 0.33 / 0% | 31 / 0.23 / 0% | 530 / 0.37 / 0% | 342 / 0.27 / 0% | 561 / 0.29 / 0% | 7 / 0.47 / 2% | 65 / 0.30 / 0% | 18 / 0.68 / 2% | 163 / 0.55 / 0% | bison 37.5, wolf 60.0, raven 41.3, pronghorn 11.3, rabbit 38.8, cougar 136.3, coyote 53.8, prairiedog 10.0, muledeer 42.5 |
| 2 | 600000 | 225.9 | 565 / 0.31 / 0% | 31 / 0.22 / 0% | 489 / 0.37 / 0% | 362 / 0.25 / 0% | 573 / 0.35 / 0% | 6 / 0.52 / 7% | 61 / 0.36 / 0% | 20 / 0.94 / 14% | 23 / 0.84 / 0% | bison 8.8, wolf 28.8, raven 11.3, pronghorn 48.8, rabbit 38.8, cougar 82.5, coyote 87.5, prairiedog never, muledeer 81.3 |
| 3 | 600000 | 225.2 | 642 / 0.34 / 0% | 30 / 0.31 / 0% | 545 / 0.40 / 0% | 376 / 0.28 / 0% | 545 / 0.32 / 0% | 8 / 0.51 / 4% | 61 / 0.33 / 0% | 15 / 0.65 / 4% | 219 / 0.54 / 1% | bison 25.0, wolf 25.0, raven 11.3, pronghorn 22.5, rabbit 15.0, cougar 42.5, coyote 18.8, prairiedog 188.8, muledeer 22.5 |
| 4 | 600000 | 234.3 | 625 / 0.31 / 0% | 27 / 0.25 / 0% | 546 / 0.35 / 0% | 373 / 0.26 / 0% | 594 / 0.30 / 0% | 6 / 0.55 / 7% | 56 / 0.32 / 0% | 33 / 0.52 / 0% | 114 / 0.91 / 6% | bison 7.5, wolf 48.8, raven 50.0, pronghorn 7.5, rabbit 76.3, cougar 71.3, coyote 46.3, prairiedog 51.3, muledeer 45.0 |
| 5 | 600000 | 219.6 | 604 / 0.35 / 0% | 28 / 0.27 / 0% | 516 / 0.37 / 0% | 373 / 0.26 / 0% | 479 / 0.30 / 0% | 6 / 0.58 / 7% | 69 / 0.34 / 0% | 13 / 0.91 / 9% | 176 / 0.52 / 1% | bison 10.0, wolf 13.8, raven 13.8, pronghorn 140.0, rabbit 66.3, cougar 75.0, coyote 35.0, prairiedog 46.3, muledeer 40.0 |
| 6 | 600000 | 235.8 | 566 / 0.31 / 0% | 27 / 0.24 / 0% | 488 / 0.37 / 0% | 376 / 0.27 / 0% | 563 / 0.33 / 0% | 6 / 0.52 / 7% | 63 / 0.30 / 0% | 11 / 0.51 / 2% | 55 / 1.13 / 1% | bison 10.0, wolf 41.3, raven 12.5, pronghorn 8.8, rabbit 28.8, cougar 16.3, coyote 61.3, prairiedog 36.3, muledeer 33.8 |
| 7 | 600000 | 224.5 | 630 / 0.27 / 0% | 33 / 0.23 / 0% | 570 / 0.33 / 0% | 396 / 0.27 / 0% | 593 / 0.33 / 0% | 8 / 0.47 / 3% | 59 / 0.33 / 0% | 33 / 0.55 / 0% | 145 / 0.58 / 0% | bison 76.3, wolf 71.3, raven 78.8, pronghorn 7.5, rabbit 53.8, cougar 16.3, coyote 26.3, prairiedog 76.3, muledeer 26.3 |
| 8 | 600000 | 222.7 | 568 / 0.33 / 0% | 31 / 0.26 / 0% | 501 / 0.40 / 0% | 345 / 0.26 / 0% | 607 / 0.33 / 0% | 7 / 0.52 / 3% | 61 / 0.33 / 0% | 56 / 0.50 / 0% | 106 / 0.97 / 6% | bison 26.3, wolf 12.5, raven 22.5, pronghorn 110.0, rabbit 30.0, cougar 36.3, coyote 16.3, prairiedog 50.0, muledeer 102.5 |
| 9 | 600000 | 224.9 | 517 / 0.41 / 0% | 28 / 0.27 / 0% | 457 / 0.44 / 0% | 368 / 0.25 / 0% | 585 / 0.30 / 0% | 6 / 0.56 / 8% | 59 / 0.34 / 0% | 33 / 0.47 / 0% | 53 / 1.22 / 1% | bison 28.8, wolf 16.3, raven 18.8, pronghorn 43.8, rabbit 73.8, cougar 67.5, coyote 15.0, prairiedog 23.8, muledeer 137.5 |
| 10 | 600000 | 214.9 | 561 / 0.37 / 0% | 29 / 0.34 / 4% | 461 / 0.42 / 0% | 416 / 0.27 / 0% | 581 / 0.33 / 0% | 6 / 0.58 / 6% EXTINCT@500.0yr | 65 / 0.33 / 0% | 30 / 0.92 / 1% | 38 / 1.37 / 0% | bison 13.8, wolf 60.0, raven 15.0, pronghorn 178.8, rabbit 16.3, cougar 20.0, coyote 18.8, prairiedog unaffected, muledeer 20.0 |
| 11 | 600000 | 222.1 | 507 / 0.37 / 0% | 28 / 0.27 / 0% | 452 / 0.44 / 0% | 382 / 0.26 / 0% | 560 / 0.34 / 0% | 6 / 0.52 / 4% | 62 / 0.34 / 0% | 19 / 0.71 / 3% EXTINCT@495.0yr | 137 / 0.67 / 3% | bison 10.0, wolf 46.3, raven 46.3, pronghorn 72.5, rabbit 18.8, cougar 62.5, coyote 10.0, prairiedog 118.8, muledeer 7.5 |
| 12 | 600000 | 221.6 | 642 / 0.31 / 0% | 31 / 0.24 / 0% | 520 / 0.36 / 0% | 401 / 0.25 / 0% | 633 / 0.30 / 0% | 6 / 0.49 / 5% | 70 / 0.28 / 0% | 63 / 0.41 / 0% | 76 / 1.26 / 1% | bison 8.8, wolf 23.8, raven 11.3, pronghorn 28.8, rabbit 88.8, cougar 15.0, coyote 63.8, prairiedog 7.5, muledeer 67.5 |
