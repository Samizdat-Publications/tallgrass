# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit 1f3f658 (frozen copy); real sim
- Params: {"evolution2":1,"climate2":0.3,"wolfDenMinDist":280,"wolfTerritory":130,"deer.maxLitter":2,"wolf.sprintCost":0.3,"raven.initial":250,"coyote.initial":30}
- Shocks: drought (2 yr) at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 553 | 0.35 | 0.0% | 0.0 | 2.09 | 24 | 60.0 (12 seeds) | 100% | 100% | 21.9 |
| wolf | 12/12 (100%) | 29 | 0.27 | 0.0% | 0.0 | 1.78 | 42 | 70.0 (10 seeds) | 92% | 100% | 32.5 |
| raven | 12/12 (100%) | 491 | 0.40 | 0.0% | 0.0 | 2.04 | 37 | 82.5 (12 seeds) | 100% | 100% | 28.8 |
| pronghorn | 12/12 (100%) | 367 | 0.28 | 0.0% | 0.0 | 2.00 | 42 | 27.5 (12 seeds) | 100% | 100% | 25.6 |
| rabbit | 12/12 (100%) | 552 | 0.31 | 0.0% | 0.0 | 2.10 | 46 | 25.0 (7 seeds) | 100% | 100% | 33.1 |
| cougar | 11/12 (92%) | 7 | 0.52 | 3.5% | 3.8 | 2.40 | 69 | 121.3 (6 seeds) | 100% | 100% | 27.5 |
| coyote | 12/12 (100%) | 63 | 0.33 | 0.0% | 0.0 | 2.01 | 62 | 20.0 (11 seeds) | 100% | 100% | 46.9 |
| prairiedog | 12/12 (100%) | 24 | 0.66 | 2.1% | 3.8 | 3.26 | 35 | 57.5 (2 seeds) | 100% | 92% | 50.0 |
| muledeer | 12/12 (100%) | 96 | 0.97 | 1.8% | 2.5 | 4.49 | 39 | 38.1 (6 seeds) | 100% | 92% | 30.0 |

Max bison generation depth reached: 232.6 (median across seeds 226.4).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.2 | 0.0 | 0.3 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3072.2 | 7941.0 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 96.5% | 15.7 | 15.0 | 9.4 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 101.9 | 1096.7 |
| prairiedog | 99.6% | 3.3 | 1.9 | 40.6 | 0.0 |
| muledeer | 100.0% | 0.2 | 0.0 | 75.0 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 14 | 2.8 | 69 | 79 | 21 | 21 | 0.8 |
| 2 | 23 | 4.6 | 128 | 131 | 24 | 20 | 1.5 |
| 3 | 9 | 1.8 | 78 | 82 | 20 | 22 | 0.4 |
| 4 | 26 | 5.2 | 142 | 152 | 26 | 25 | 1.5 |
| 5 | 17 | 3.4 | 110 | 117 | 23 | 20 | 0.9 |
| 6 | 12 | 2.4 | 87 | 92 | 24 | 25 | 0.7 |
| 7 | 17 | 3.4 | 88 | 100 | 26 | 27 | 1.2 |
| 8 | 36 | 7.2 | 145 | 158 | 19 | 19 | 1.5 |
| 9 | 17 | 3.4 | 90 | 102 | 22 | 24 | 1.1 |
| 10 | 19 | 3.8 | 100 | 111 | 20 | 24 | 1.0 |
| 11 | 24 | 4.8 | 131 | 134 | 22 | 20 | 1.6 |
| 12 | 34 | 6.8 | 129 | 147 | 20 | 22 | 2.3 |

Median plagues per 100 years across seeds: 3.6 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.33. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.31 at a lag of 0.5 years; 33% of seeds reach 0.4. Annual-mean best (median): 0.31.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.31 | 0.29 | 0.32 | 0.21 | 0.18 | 0.10 | 0.32 | 0.21 |
| 2 | 0.34 | 0.34 | 0.20 | 0.17 | 0.11 | 0.01 | 0.20 | 0.17 |
| 3 | 0.37 | 0.31 | 0.29 | 0.22 | 0.25 | 0.18 | 0.29 | 0.22 |
| 4 | 0.33 | 0.32 | 0.46 | 0.39 | 0.35 | 0.20 | 0.46 | 0.39 |
| 5 | 0.30 | 0.30 | 0.51 | 0.34 | 0.29 | 0.18 | 0.51 | 0.34 |
| 6 | 0.30 | 0.31 | 0.39 | 0.28 | 0.27 | 0.18 | 0.39 | 0.28 |
| 7 | 0.34 | 0.34 | 0.25 | 0.21 | 0.13 | 0.02 | 0.25 | 0.21 |
| 8 | 0.33 | 0.32 | 0.26 | 0.15 | 0.09 | -0.04 | 0.26 | 0.15 |
| 9 | 0.33 | 0.31 | 0.41 | 0.32 | 0.19 | 0.06 | 0.41 | 0.32 |
| 10 | 0.32 | 0.34 | 0.26 | 0.25 | 0.21 | 0.06 | 0.26 | 0.25 |
| 11 | 0.34 | 0.34 | 0.25 | 0.21 | 0.12 | 0.05 | 0.25 | 0.21 |
| 12 | 0.32 | 0.30 | 0.48 | 0.38 | 0.28 | 0.18 | 0.48 | 0.38 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | FAIL | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 213.6 | 492 / 0.40 / 0% | 31 / 0.24 / 0% | 490 / 0.42 / 0% | 318 / 0.28 / 0% | 542 / 0.29 / 0% | 7 / 0.46 / 3% | 69 / 0.31 / 0% | 15 / 0.61 / 1% | 142 / 0.75 / 1% | bison 18.8, wolf 62.5, raven 18.8, pronghorn 8.8, rabbit 71.3, cougar 162.5, coyote 55.0, prairiedog 25.0, muledeer 10.0 |
| 2 | 600000 | 223.0 | 488 / 0.40 / 4% | 30 / 0.29 / 0% | 445 / 0.44 / 2% | 362 / 0.27 / 0% | 602 / 0.34 / 0% | 6 / 0.59 / 8% | 62 / 0.34 / 1% | 33 / 0.48 / 0% | 87 / 1.07 / 3% | bison 52.5, wolf 43.8, raven 53.8, pronghorn 11.3, rabbit 12.5, cougar 28.8, coyote 47.5, prairiedog 75.0, muledeer 222.5 |
| 3 | 600000 | 232.2 | 652 / 0.31 / 0% | 27 / 0.27 / 0% | 543 / 0.38 / 0% | 354 / 0.26 / 0% | 518 / 0.31 / 0% | 7 / 0.59 / 8% | 66 / 0.37 / 1% | 8 / 0.74 / 5% | 212 / 0.53 / 1% | bison 27.5, wolf 26.3, raven 15.0, pronghorn 21.3, rabbit 15.0, cougar 23.8, coyote 23.8, prairiedog 8.8, muledeer 25.0 |
| 4 | 600000 | 223.8 | 597 / 0.35 / 0% | 28 / 0.25 / 0% | 532 / 0.38 / 0% | 353 / 0.28 / 0% | 586 / 0.32 / 0% | 7 / 0.46 / 2% | 61 / 0.33 / 0% | 34 / 0.58 / 0% | 104 / 1.00 / 6% | bison 20.0, wolf 20.0, raven 20.0, pronghorn 32.5, rabbit 26.3, cougar 26.3, coyote 47.5, prairiedog 26.3, muledeer 17.5 |
| 5 | 600000 | 230.9 | 577 / 0.38 / 0% | 31 / 0.28 / 0% | 492 / 0.42 / 0% | 396 / 0.30 / 0% | 540 / 0.30 / 0% | 7 / 0.51 / 3% | 72 / 0.30 / 0% | 17 / 0.78 / 6% | 80 / 1.17 / 4% | bison 35.0, wolf 68.8, raven 38.8, pronghorn 21.3, rabbit 32.5, cougar 73.8, coyote 36.3, prairiedog 55.0, muledeer never |
| 6 | 600000 | 227.0 | 546 / 0.29 / 0% | 26 / 0.23 / 0% | 474 / 0.35 / 0% | 382 / 0.27 / 0% | 535 / 0.31 / 0% | 6 / 0.54 / 4% EXTINCT@500.0yr | 64 / 0.30 / 0% | 10 / 0.66 / 6% | 36 / 1.25 / 0% | bison 40.0, wolf 30.0, raven 92.5, pronghorn 57.5, rabbit 33.8, cougar 11.3, coyote 31.3, prairiedog 50.0, muledeer 8.8 |
| 7 | 600000 | 232.6 | 629 / 0.29 / 0% | 32 / 0.24 / 0% | 548 / 0.35 / 0% | 394 / 0.29 / 0% | 533 / 0.34 / 0% | 8 / 0.45 / 2% | 65 / 0.34 / 0% | 25 / 0.83 / 3% | 116 / 0.81 / 4% | bison 11.3, wolf 41.3, raven 42.5, pronghorn 52.5, rabbit 68.8, cougar 76.3, coyote 57.5, prairiedog 237.5, muledeer 101.3 |
| 8 | 600000 | 229.1 | 560 / 0.33 / 0% | 28 / 0.29 / 0% | 515 / 0.39 / 0% | 354 / 0.29 / 0% | 556 / 0.32 / 0% | 7 / 0.55 / 3% | 58 / 0.33 / 0% | 35 / 0.86 / 9% | 159 / 0.57 / 1% | bison 16.3, wolf 17.5, raven 15.0, pronghorn 30.0, rabbit 42.5, cougar 13.8, coyote 57.5, prairiedog never, muledeer 75.0 |
| 9 | 600000 | 225.7 | 539 / 0.35 / 0% | 28 / 0.27 / 0% | 480 / 0.42 / 0% | 355 / 0.27 / 0% | 559 / 0.31 / 0% | 7 / 0.56 / 5% | 60 / 0.33 / 0% | 30 / 0.56 / 0% | 82 / 0.94 / 2% | bison 13.8, wolf unaffected, raven 16.3, pronghorn 11.3, rabbit 63.8, cougar 7.5, coyote 75.0, prairiedog 23.8, muledeer 7.5 |
| 10 | 600000 | 223.0 | 498 / 0.41 / 0% | 30 / 0.34 / 4% | 413 / 0.43 / 0% | 419 / 0.29 / 0% | 559 / 0.34 / 0% | 6 / 0.48 / 4% | 59 / 0.32 / 0% | 23 / 1.31 / 8% | 33 / 1.45 / 0% | bison 20.0, wolf 96.3, raven 21.3, pronghorn 20.0, rabbit 16.3, cougar 41.3, coyote 46.3, prairiedog 108.8, muledeer 197.5 |
| 11 | 600000 | 232.4 | 511 / 0.37 / 0% | 25 / 0.26 / 0% | 465 / 0.43 / 0% | 372 / 0.27 / 0% | 549 / 0.34 / 0% | 6 / 0.53 / 4% | 59 / 0.34 / 0% | 19 / 0.66 / 1% | 145 / 0.66 / 2% | bison 150.0, wolf 35.0, raven 36.3, pronghorn 31.3, rabbit 18.8, cougar 48.8, coyote 18.8, prairiedog 173.8, muledeer 88.8 |
| 12 | 600000 | 220.6 | 630 / 0.28 / 0% | 34 / 0.22 / 0% | 542 / 0.34 / 0% | 376 / 0.24 / 0% | 638 / 0.30 / 0% | 7 / 0.49 / 4% | 66 / 0.32 / 0% | 47 / 0.64 / 1% | 24 / 1.40 / 0% | bison 23.8, wolf 20.0, raven 41.3, pronghorn 97.5, rabbit 61.3, cougar 25.0, coyote 27.5, prairiedog 7.5, muledeer 30.0 |
