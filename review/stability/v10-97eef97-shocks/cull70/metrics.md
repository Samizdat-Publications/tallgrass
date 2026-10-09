# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit 97eef97 (frozen copy); real sim
- Params: {"evolution2":1,"climate2":0.3,"wolfDenMinDist":280,"wolfTerritory":130}
- Shocks: cull 70% bison at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 508 | 0.37 | 0.0% | 0.0 | 2.14 | 27 | 45.0 (11 seeds) | 100% | 100% | 14.4 |
| wolf | 12/12 (100%) | 34 | 0.25 | 0.0% | 0.0 | 1.72 | 41 | 50.0 (10 seeds) | 92% | 100% | 33.1 |
| raven | 12/12 (100%) | 446 | 0.41 | 0.0% | 0.0 | 2.18 | 39 | 70.0 (11 seeds) | 100% | 100% | 23.1 |
| pronghorn | 12/12 (100%) | 552 | 0.42 | 0.0% | 0.0 | 2.89 | 47 | 10.0 (12 seeds) | 100% | 100% | 37.5 |
| rabbit | 12/12 (100%) | 560 | 0.31 | 0.0% | 0.0 | 2.06 | 48 | 55.0 (7 seeds) | 100% | 100% | 31.3 |
| cougar | 11/12 (92%) | 7 | 0.55 | 4.3% | 5.0 | 2.62 | 68 | 102.5 (7 seeds) | 100% | 100% | 55.6 |
| coyote | 12/12 (100%) | 64 | 0.33 | 0.0% | 0.0 | 2.11 | 58 | 20.0 (10 seeds) | 100% | 100% | 50.6 |
| prairiedog | 12/12 (100%) | 22 | 0.65 | 1.2% | 2.5 | 3.41 | 34 | 102.5 (4 seeds) | 100% | 92% | 35.0 |
| muledeer | 12/12 (100%) | 36 | 1.00 | 0.9% | 1.3 | 5.68 | 48 | 67.5 (7 seeds) | 92% | 100% | 43.1 |

Max bison generation depth reached: 237.0 (median across seeds 225.4).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.2 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 1758.8 | 14924.8 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 95.7% | 20.2 | 18.1 | 9.3 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 100.7 | 1027.1 |
| prairiedog | 99.9% | 3.1 | 0.6 | 43.8 | 0.0 |
| muledeer | 100.0% | 0.4 | 0.0 | 177.9 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 30 | 6.0 | 151 | 162 | 18 | 20 | 1.7 |
| 2 | 17 | 3.4 | 75 | 85 | 27 | 23 | 0.8 |
| 3 | 15 | 3.0 | 82 | 95 | 20 | 17 | 0.8 |
| 4 | 15 | 3.0 | 111 | 116 | 28 | 19 | 0.9 |
| 5 | 39 | 7.8 | 158 | 175 | 22 | 18 | 1.6 |
| 6 | 16 | 3.2 | 102 | 110 | 25 | 24 | 1.1 |
| 7 | 25 | 5.0 | 132 | 140 | 24 | 24 | 1.5 |
| 8 | 21 | 4.2 | 110 | 120 | 18 | 21 | 1.2 |
| 9 | 15 | 3.0 | 116 | 118 | 25 | 29 | 0.9 |
| 10 | 22 | 4.4 | 144 | 150 | 23 | 22 | 1.3 |
| 11 | 15 | 3.0 | 99 | 109 | 25 | 18 | 1.0 |
| 12 | 18 | 3.6 | 94 | 106 | 22 | 28 | 1.1 |

Median plagues per 100 years across seeds: 3.5 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.33. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.37 at a lag of 0.5 years; 33% of seeds reach 0.4. Annual-mean best (median): 0.37.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.36 | 0.27 | 0.24 | 0.22 | 0.25 | 0.16 | 0.24 | 0.22 |
| 2 | 0.32 | 0.33 | 0.37 | 0.36 | 0.28 | 0.14 | 0.37 | 0.36 |
| 3 | 0.36 | 0.28 | 0.39 | 0.38 | 0.33 | 0.20 | 0.39 | 0.38 |
| 4 | 0.33 | 0.30 | 0.46 | 0.41 | 0.32 | 0.21 | 0.46 | 0.41 |
| 5 | 0.34 | 0.30 | 0.23 | 0.30 | 0.29 | 0.21 | 0.23 | 0.30 |
| 6 | 0.33 | 0.31 | 0.38 | 0.31 | 0.19 | 0.07 | 0.38 | 0.31 |
| 7 | 0.36 | 0.31 | 0.43 | 0.37 | 0.28 | 0.17 | 0.43 | 0.37 |
| 8 | 0.32 | 0.31 | 0.41 | 0.28 | 0.16 | 0.03 | 0.41 | 0.28 |
| 9 | 0.31 | 0.30 | 0.42 | 0.34 | 0.25 | 0.04 | 0.42 | 0.34 |
| 10 | 0.32 | 0.32 | 0.26 | 0.19 | 0.15 | 0.06 | 0.26 | 0.19 |
| 11 | 0.35 | 0.34 | 0.30 | 0.25 | 0.18 | 0.09 | 0.30 | 0.25 |
| 12 | 0.35 | 0.33 | 0.34 | 0.31 | 0.23 | 0.08 | 0.34 | 0.31 |

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
| muledeer | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 234.1 | 566 / 0.34 / 0% | 34 / 0.26 / 0% | 507 / 0.38 / 0% | 484 / 0.52 / 0% | 621 / 0.27 / 0% | 6 / 0.58 / 6% | 55 / 0.36 / 0% | 33 / 0.64 / 0% | 144 / 0.88 / 16% | bison 20.0, wolf 31.3, raven 60.0, pronghorn 36.3, rabbit 72.5, cougar 73.8, coyote 55.0, prairiedog 81.3, muledeer 96.3 |
| 2 | 600000 | 216.2 | 533 / 0.39 / 0% | 34 / 0.24 / 0% | 451 / 0.44 / 0% | 532 / 0.39 / 0% | 559 / 0.33 / 0% | 7 / 0.51 / 4% | 59 / 0.32 / 0% | 13 / 0.90 / 13% | 20 / 0.74 / 0% | bison 20.0, wolf 20.0, raven 22.5, pronghorn 38.8, rabbit 25.0, cougar 45.0, coyote 43.8, prairiedog 67.5, muledeer 280.0 |
| 3 | 600000 | 222.7 | 519 / 0.39 / 0% | 37 / 0.26 / 0% | 462 / 0.41 / 0% | 517 / 0.39 / 0% | 646 / 0.28 / 0% | 7 / 0.55 / 8% | 53 / 0.36 / 0% | 25 / 0.74 / 0% | 18 / 0.68 / 0% | bison 60.0, wolf 236.3, raven 75.0, pronghorn 46.3, rabbit 15.0, cougar 130.0, coyote 23.8, prairiedog 37.5, muledeer 178.8 |
| 4 | 600000 | 228.1 | 498 / 0.43 / 0% | 35 / 0.28 / 0% | 447 / 0.42 / 0% | 507 / 0.40 / 0% | 558 / 0.30 / 0% | 7 / 0.57 / 10% | 66 / 0.33 / 0% | 13 / 0.79 / 8% | 51 / 1.42 / 3% | bison 11.3, wolf 35.0, raven 13.8, pronghorn 17.5, rabbit 26.3, cougar 70.0, coyote 53.8, prairiedog 221.3, muledeer 68.8 |
| 5 | 600000 | 228.4 | 474 / 0.36 / 0% | 36 / 0.20 / 0% | 423 / 0.38 / 0% | 598 / 0.49 / 0% | 689 / 0.30 / 0% | 6 / 0.50 / 3% | 51 / 0.34 / 0% | 62 / 0.46 / 0% | 16 / 0.50 / 0% | bison 8.8, wolf 42.5, raven 10.0, pronghorn 17.5, rabbit 32.5, cougar 48.8, coyote 57.5, prairiedog 78.8, muledeer 53.8 |
| 6 | 600000 | 227.1 | 487 / 0.32 / 0% | 33 / 0.27 / 0% | 438 / 0.38 / 0% | 589 / 0.49 / 0% | 544 / 0.31 / 0% | 6 / 0.55 / 4% EXTINCT@500.0yr | 57 / 0.33 / 0% | 18 / 0.65 / 3% | 61 / 1.03 / 4% | bison 43.8, wolf 63.8, raven 47.5, pronghorn 7.5, rabbit 27.5, cougar 58.8, coyote 30.0, prairiedog 33.8, muledeer 7.5 |
| 7 | 600000 | 210.4 | 482 / 0.38 / 0% | 35 / 0.22 / 0% | 434 / 0.40 / 0% | 596 / 0.46 / 0% | 617 / 0.31 / 0% | 7 / 0.50 / 4% | 65 / 0.36 / 1% | 31 / 0.67 / 5% | 45 / 1.50 / 1% | bison 11.3, wolf 20.0, raven 12.5, pronghorn 45.0, rabbit 53.8, cougar 13.8, coyote 30.0, prairiedog 13.8, muledeer 7.5 |
| 8 | 600000 | 228.0 | 540 / 0.37 / 0% | 34 / 0.23 / 0% | 445 / 0.42 / 0% | 576 / 0.42 / 0% | 552 / 0.31 / 0% | 8 / 0.50 / 4% | 66 / 0.32 / 0% | 20 / 0.38 / 0% | 20 / 1.18 / 0% | bison 17.5, wolf 93.8, raven 18.8, pronghorn 97.5, rabbit 30.0, cougar 45.0, coyote 51.3, prairiedog 28.8, muledeer 72.5 |
| 9 | 600000 | 211.4 | 544 / 0.36 / 0% | 31 / 0.30 / 0% | 483 / 0.41 / 0% | 552 / 0.48 / 0% | 553 / 0.30 / 0% | 7 / 0.49 / 3% | 66 / 0.31 / 0% | 16 / 0.62 / 2% | 124 / 0.97 / 15% | bison 21.3, wolf 38.8, raven 23.8, pronghorn 22.5, rabbit 75.0, cougar 111.3, coyote 100.0, prairiedog 35.0, muledeer 15.0 |
| 10 | 600000 | 223.7 | 407 / 0.44 / 0% | 36 / 0.24 / 0% | 373 / 0.43 / 0% | 570 / 0.39 / 0% | 561 / 0.32 / 0% | 5 / 0.55 / 4% | 64 / 0.32 / 0% | 29 / 0.55 / 0% | 20 / 1.17 / 0% | bison 10.0, wolf unaffected, raven 12.5, pronghorn 53.8, rabbit 55.0, cougar 23.8, coyote 50.0, prairiedog 18.8, muledeer unaffected |
| 11 | 600000 | 220.8 | 481 / 0.34 / 0% | 31 / 0.22 / 0% | 426 / 0.37 / 0% | 551 / 0.41 / 0% | 545 / 0.34 / 0% | 6 / 0.58 / 5% | 64 / 0.35 / 0% | 19 / 0.75 / 4% | 26 / 1.31 / 1% | bison 7.5, wolf 28.8, raven 75.0, pronghorn 140.0, rabbit 18.8, cougar 52.5, coyote 68.8, prairiedog never, muledeer 16.3 |
| 12 | 600000 | 237.0 | 591 / 0.31 / 0% | 34 / 0.25 / 0% | 550 / 0.38 / 0% | 437 / 0.38 / 0% | 565 / 0.33 / 0% | 7 / 0.58 / 10% | 64 / 0.35 / 0% | 23 / 0.64 / 1% | 154 / 0.55 / 1% | bison 8.8, wolf 18.8, raven 70.0, pronghorn 31.3, rabbit 87.5, cougar 66.3, coyote 25.0, prairiedog 27.5, muledeer 32.5 |
