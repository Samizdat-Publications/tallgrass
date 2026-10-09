# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit 1f3f658 (frozen copy); real sim
- Params: {"evolution2":1,"climate2":0.3,"wolfDenMinDist":280,"wolfTerritory":130,"deer.maxLitter":2,"wolf.sprintCost":0.3,"raven.initial":250,"coyote.initial":30}
- Shocks: wolves removed at tick 210000 (year 175.0); introduce 8 wolves at tick 300000 (year 250.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 577 | 0.41 | 0.0% | 0.0 | 2.97 | 25 | 43.8 (11 seeds) | 100% | 100% | 42.5 |
| wolf | 12/12 (100%) | 29 | 0.32 | 2.2% | 9.4 | 1.87 | 39 | 45.0 (5 seeds) | 100% | 100% | 37.5 |
| raven | 12/12 (100%) | 510 | 0.40 | 0.0% | 0.0 | 1.95 | 34 | 37.5 (12 seeds) | 100% | 100% | 45.0 |
| pronghorn | 12/12 (100%) | 374 | 0.28 | 0.0% | 0.0 | 1.99 | 42 | 25.0 (12 seeds) | 100% | 100% | 32.5 |
| rabbit | 12/12 (100%) | 558 | 0.31 | 0.0% | 0.0 | 2.13 | 47 | 15.0 (7 seeds) | 100% | 100% | 27.5 |
| cougar | 12/12 (100%) | 7 | 0.50 | 3.7% | 5.0 | 2.51 | 69 | 66.3 (9 seeds) | 100% | 100% | 40.6 |
| coyote | 12/12 (100%) | 64 | 0.34 | 0.0% | 0.0 | 2.16 | 62 | 15.0 (10 seeds) | 100% | 100% | 25.6 |
| prairiedog | 12/12 (100%) | 20 | 0.79 | 1.8% | 3.1 | 3.78 | 34 | 90.0 (2 seeds) | 100% | 83% | 46.9 |
| muledeer | 12/12 (100%) | 138 | 0.72 | 4.8% | 3.1 | 3.76 | 36 | 12.5 (7 seeds) | 100% | 92% | 30.0 |

Max bison generation depth reached: 238.4 (median across seeds 227.5).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 97.9% | 2.0 | 8.8 | 1.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3045.0 | 8534.5 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 96.3% | 18.6 | 15.6 | 9.5 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 105.1 | 1153.3 |
| prairiedog | 99.9% | 5.9 | 0.6 | 48.5 | 0.0 |
| muledeer | 100.0% | 0.0 | 0.0 | 36.8 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 3.2 | 81 | 86 | 22 | 21 | 0.7 |
| 2 | 35 | 7.0 | 161 | 167 | 23 | 19 | 2.0 |
| 3 | 9 | 1.8 | 80 | 83 | 23 | 19 | 0.5 |
| 4 | 30 | 6.0 | 123 | 133 | 26 | 20 | 1.1 |
| 5 | 15 | 3.0 | 103 | 104 | 24 | 16 | 0.9 |
| 6 | 20 | 4.0 | 75 | 82 | 27 | 23 | 0.6 |
| 7 | 20 | 4.0 | 115 | 124 | 24 | 23 | 1.3 |
| 8 | 29 | 5.8 | 159 | 168 | 19 | 20 | 1.4 |
| 9 | 23 | 4.6 | 102 | 113 | 26 | 28 | 1.1 |
| 10 | 12 | 2.4 | 82 | 94 | 25 | 17 | 0.7 |
| 11 | 20 | 4.0 | 112 | 115 | 25 | 19 | 1.3 |
| 12 | 24 | 4.8 | 120 | 142 | 22 | 23 | 1.6 |

Median plagues per 100 years across seeds: 4.0 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.34. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.30 at a lag of 0.5 years; 17% of seeds reach 0.4. Annual-mean best (median): 0.30.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.31 | 0.31 | 0.22 | 0.13 | 0.16 | 0.09 | 0.22 | 0.13 |
| 2 | 0.35 | 0.31 | 0.22 | 0.16 | 0.06 | -0.05 | 0.22 | 0.16 |
| 3 | 0.31 | 0.30 | 0.24 | 0.16 | 0.14 | 0.04 | 0.24 | 0.16 |
| 4 | 0.34 | 0.31 | 0.52 | 0.41 | 0.33 | 0.19 | 0.52 | 0.41 |
| 5 | 0.31 | 0.31 | 0.47 | 0.36 | 0.25 | 0.15 | 0.47 | 0.36 |
| 6 | 0.32 | 0.30 | 0.39 | 0.33 | 0.25 | 0.15 | 0.39 | 0.33 |
| 7 | 0.33 | 0.33 | 0.30 | 0.24 | 0.11 | 0.01 | 0.30 | 0.24 |
| 8 | 0.33 | 0.30 | 0.30 | 0.22 | 0.11 | -0.05 | 0.30 | 0.22 |
| 9 | 0.35 | 0.31 | 0.29 | 0.28 | 0.22 | 0.05 | 0.29 | 0.28 |
| 10 | 0.35 | 0.33 | 0.18 | 0.10 | -0.02 | -0.13 | 0.18 | 0.10 |
| 11 | 0.35 | 0.36 | 0.20 | 0.19 | 0.12 | 0.03 | 0.20 | 0.19 |
| 12 | 0.34 | 0.34 | 0.36 | 0.29 | 0.22 | 0.12 | 0.36 | 0.29 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 231.0 | 570 / 0.42 / 0% | 29 / 0.41 / 10% | 513 / 0.39 / 0% | 331 / 0.25 / 0% | 514 / 0.31 / 0% | 7 / 0.48 / 4% | 72 / 0.31 / 0% | 14 / 1.06 / 14% | 179 / 0.64 / 1% | bison 145.0, wolf 33.8, raven 96.3, pronghorn 191.3, rabbit 21.3, cougar 32.5, coyote 25.0, prairiedog 12.5, muledeer 31.3 |
| 2 | 600000 | 227.9 | 560 / 0.32 / 0% | 32 / 0.26 / 1% | 516 / 0.38 / 0% | 350 / 0.26 / 0% | 635 / 0.31 / 0% | 7 / 0.48 / 3% | 67 / 0.35 / 0% | 40 / 0.45 / 0% | 122 / 0.72 / 5% | bison 18.8, wolf 20.0, raven 35.0, pronghorn 20.0, rabbit 41.3, cougar 42.5, coyote 33.8, prairiedog 12.5, muledeer never |
| 3 | 600000 | 227.0 | 700 / 0.45 / 0% | 28 / 0.42 / 2% | 530 / 0.44 / 0% | 410 / 0.33 / 0% | 532 / 0.30 / 0% | 5 / 0.61 / 10% | 67 / 0.31 / 0% | 10 / 0.97 / 7% | 140 / 0.94 / 7% | bison 40.0, wolf 42.5, raven 42.5, pronghorn 108.8, rabbit 31.3, cougar 42.5, coyote 131.3, prairiedog 77.5, muledeer 162.5 |
| 4 | 600000 | 222.4 | 620 / 0.34 / 0% | 31 / 0.32 / 0% | 554 / 0.36 / 0% | 361 / 0.29 / 0% | 590 / 0.31 / 0% | 6 / 0.50 / 5% | 61 / 0.34 / 1% | 21 / 0.49 / 1% | 194 / 0.55 / 1% | bison 58.8, wolf 73.8, raven 108.8, pronghorn 22.5, rabbit 82.5, cougar 27.5, coyote 16.3, prairiedog 37.5, muledeer 8.8 |
| 5 | 600000 | 217.5 | 584 / 0.33 / 0% | 29 / 0.30 / 0% | 517 / 0.37 / 0% | 375 / 0.27 / 0% | 539 / 0.31 / 0% | 7 / 0.51 / 5% | 70 / 0.31 / 0% | 19 / 0.69 / 2% | 168 / 0.58 / 0% | bison 35.0, wolf 16.3, raven 25.0, pronghorn 87.5, rabbit 16.3, cougar 7.5, coyote 7.5, prairiedog 60.0, muledeer 30.0 |
| 6 | 600000 | 221.7 | 561 / 0.42 / 0% | 29 / 0.36 / 5% | 487 / 0.43 / 0% | 353 / 0.29 / 0% | 539 / 0.30 / 0% | 7 / 0.49 / 4% | 63 / 0.32 / 0% | 10 / 0.76 / 10% | 108 / 0.67 / 1% | bison 38.8, wolf 15.0, raven 45.0, pronghorn 20.0, rabbit 12.5, cougar 76.3, coyote 26.3, prairiedog 23.8, muledeer 36.3 |
| 7 | 600000 | 230.2 | 592 / 0.39 / 0% | 35 / 0.27 / 0% | 507 / 0.37 / 0% | 395 / 0.27 / 0% | 568 / 0.33 / 0% | 8 / 0.50 / 2% | 63 / 0.33 / 0% | 29 / 0.66 / 0% | 110 / 0.85 / 5% | bison 31.3, wolf 41.3, raven 28.8, pronghorn 23.8, rabbit 82.5, cougar 70.0, coyote 62.5, prairiedog 146.3, muledeer 28.8 |
| 8 | 600000 | 216.7 | 566 / 0.44 / 0% | 31 / 0.31 / 1% | 480 / 0.40 / 0% | 372 / 0.31 / 0% | 602 / 0.30 / 0% | 7 / 0.50 / 3% | 56 / 0.33 / 0% | 31 / 0.94 / 3% | 160 / 0.76 / 14% | bison 20.0, wolf 11.3, raven 90.0, pronghorn 27.5, rabbit 23.8, cougar 25.0, coyote 71.3, prairiedog never, muledeer 73.8 |
| 9 | 600000 | 238.4 | 556 / 0.40 / 0% | 30 / 0.32 / 3% | 490 / 0.40 / 0% | 374 / 0.27 / 0% | 574 / 0.31 / 0% | 7 / 0.49 / 3% | 58 / 0.35 / 0% | 24 / 0.54 / 0% | 136 / 0.72 / 6% | bison 68.8, wolf 200.0, raven 72.5, pronghorn 11.3, rabbit 11.3, cougar 82.5, coyote 22.5, prairiedog 86.3, muledeer 48.8 |
| 10 | 600000 | 232.4 | 609 / 0.50 / 0% | 24 / 0.55 / 14% | 489 / 0.42 / 0% | 416 / 0.35 / 0% | 488 / 0.33 / 0% | 5 / 0.63 / 9% | 66 / 0.35 / 0% | 19 / 1.65 / 20% | 154 / 0.67 / 5% | bison 67.5, wolf 15.0, raven 45.0, pronghorn 58.8, rabbit 76.3, cougar 38.8, coyote 17.5, prairiedog 56.3, muledeer 13.8 |
| 11 | 600000 | 218.4 | 543 / 0.43 / 0% | 27 / 0.36 / 4% | 470 / 0.43 / 0% | 375 / 0.28 / 0% | 548 / 0.36 / 0% | 6 / 0.55 / 6% | 59 / 0.35 / 0% | 16 / 0.81 / 1% | 121 / 0.79 / 8% | bison 45.0, wolf 101.3, raven 46.3, pronghorn 180.0, rabbit 31.3, cougar 16.3, coyote 50.0, prairiedog 22.5, muledeer 22.5 |
| 12 | 600000 | 228.5 | 679 / 0.33 / 0% | 31 / 0.30 / 3% | 558 / 0.34 / 0% | 395 / 0.22 / 0% | 578 / 0.34 / 0% | 6 / 0.49 / 4% | 71 / 0.34 / 0% | 36 / 0.95 / 0% | 44 / 1.52 / 1% | bison 45.0, wolf 96.3, raven 18.8, pronghorn 37.5, rabbit 11.3, cougar 60.0, coyote 13.8, prairiedog never, muledeer 16.3 |
