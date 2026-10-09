# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit 97eef97 (frozen copy); real sim
- Params: {"evolution2":1,"climate2":0.3,"wolfDenMinDist":280,"wolfTerritory":130}
- Shocks: drought (2 yr) at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 542 | 0.36 | 0.0% | 0.0 | 2.06 | 24 | 47.5 (11 seeds) | 100% | 100% | 19.4 |
| wolf | 12/12 (100%) | 34 | 0.25 | 0.0% | 0.0 | 1.78 | 41 | 37.5 (12 seeds) | 92% | 100% | 41.9 |
| raven | 12/12 (100%) | 475 | 0.39 | 0.0% | 0.0 | 2.05 | 39 | 47.5 (11 seeds) | 100% | 100% | 22.5 |
| pronghorn | 12/12 (100%) | 544 | 0.43 | 0.0% | 0.0 | 2.88 | 47 | 10.0 (12 seeds) | 100% | 92% | 22.5 |
| rabbit | 12/12 (100%) | 591 | 0.31 | 0.0% | 0.0 | 2.01 | 45 | 47.5 (8 seeds) | 100% | 100% | 31.3 |
| cougar | 11/12 (92%) | 6 | 0.55 | 5.0% | 3.8 | 2.71 | 70 | 60.6 (4 seeds) | 100% | 100% | 30.0 |
| coyote | 12/12 (100%) | 63 | 0.34 | 0.0% | 0.0 | 2.19 | 60 | 15.0 (12 seeds) | 100% | 100% | 33.8 |
| prairiedog | 12/12 (100%) | 23 | 0.62 | 1.0% | 3.1 | 3.01 | 34 | 200.0 (2 seeds) | 100% | 100% | 74.4 |
| muledeer | 12/12 (100%) | 36 | 1.14 | 0.7% | 1.3 | 6.36 | 47 | 67.5 (5 seeds) | 92% | 100% | 20.6 |

Max bison generation depth reached: 238.8 (median across seeds 223.6).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 1713.1 | 14906.2 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 95.0% | 20.6 | 21.3 | 9.7 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 100.5 | 1065.4 |
| prairiedog | 100.0% | 1.6 | 0.0 | 42.8 | 0.0 |
| muledeer | 100.0% | 1.0 | 0.0 | 173.0 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 35 | 7.0 | 156 | 161 | 20 | 18 | 1.8 |
| 2 | 27 | 5.4 | 91 | 105 | 28 | 24 | 1.3 |
| 3 | 11 | 2.2 | 97 | 103 | 23 | 16 | 0.6 |
| 4 | 19 | 3.8 | 107 | 115 | 28 | 24 | 1.2 |
| 5 | 31 | 6.2 | 160 | 176 | 24 | 18 | 1.6 |
| 6 | 11 | 2.2 | 85 | 95 | 26 | 25 | 0.7 |
| 7 | 25 | 5.0 | 131 | 144 | 27 | 24 | 1.5 |
| 8 | 24 | 4.8 | 110 | 117 | 20 | 21 | 1.1 |
| 9 | 13 | 2.6 | 118 | 123 | 25 | 25 | 1.0 |
| 10 | 24 | 4.8 | 132 | 143 | 18 | 21 | 1.4 |
| 11 | 22 | 4.4 | 99 | 114 | 23 | 17 | 1.3 |
| 12 | 22 | 4.4 | 104 | 114 | 23 | 29 | 1.2 |

Median plagues per 100 years across seeds: 4.6 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.34. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.35 at a lag of 0.5 years; 17% of seeds reach 0.4. Annual-mean best (median): 0.35.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.36 | 0.28 | 0.25 | 0.23 | 0.26 | 0.16 | 0.25 | 0.23 |
| 2 | 0.30 | 0.31 | 0.37 | 0.29 | 0.20 | 0.11 | 0.37 | 0.29 |
| 3 | 0.33 | 0.30 | 0.24 | 0.17 | 0.15 | 0.01 | 0.24 | 0.17 |
| 4 | 0.34 | 0.30 | 0.45 | 0.37 | 0.30 | 0.14 | 0.45 | 0.37 |
| 5 | 0.34 | 0.31 | 0.17 | 0.15 | 0.10 | 0.02 | 0.17 | 0.15 |
| 6 | 0.35 | 0.36 | 0.27 | 0.33 | 0.29 | 0.20 | 0.27 | 0.33 |
| 7 | 0.34 | 0.31 | 0.39 | 0.36 | 0.29 | 0.22 | 0.39 | 0.36 |
| 8 | 0.31 | 0.31 | 0.44 | 0.31 | 0.18 | 0.07 | 0.44 | 0.31 |
| 9 | 0.30 | 0.30 | 0.40 | 0.33 | 0.22 | 0.03 | 0.40 | 0.33 |
| 10 | 0.34 | 0.29 | 0.31 | 0.25 | 0.23 | 0.14 | 0.31 | 0.25 |
| 11 | 0.36 | 0.33 | 0.28 | 0.24 | 0.19 | 0.08 | 0.28 | 0.24 |
| 12 | 0.31 | 0.32 | 0.40 | 0.29 | 0.24 | 0.11 | 0.40 | 0.29 |

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
| 1 | 600000 | 225.2 | 603 / 0.35 / 0% | 33 / 0.28 / 0% | 517 / 0.39 / 0% | 519 / 0.49 / 0% | 642 / 0.28 / 0% | 6 / 0.54 / 6% | 55 / 0.36 / 0% | 40 / 0.50 / 0% | 105 / 1.20 / 6% | bison 11.3, wolf 32.5, raven 15.0, pronghorn never, rabbit 71.3, cougar 58.8, coyote 37.5, prairiedog 130.0, muledeer 12.5 |
| 2 | 600000 | 220.3 | 489 / 0.38 / 0% | 34 / 0.22 / 0% | 438 / 0.41 / 0% | 536 / 0.41 / 0% | 578 / 0.31 / 0% | 6 / 0.56 / 5% | 62 / 0.30 / 0% | 21 / 0.48 / 1% | 19 / 0.74 / 1% | bison 25.0, wolf 25.0, raven 27.5, pronghorn 51.3, rabbit 25.0, cougar 47.5, coyote 7.5, prairiedog 37.5, muledeer 83.8 |
| 3 | 600000 | 238.8 | 624 / 0.38 / 0% | 32 / 0.30 / 0% | 524 / 0.40 / 0% | 545 / 0.46 / 0% | 596 / 0.30 / 0% | 6 / 0.57 / 6% | 64 / 0.33 / 0% | 14 / 0.70 / 2% | 23 / 0.83 / 1% | bison 38.8, wolf 42.5, raven 40.0, pronghorn 48.8, rabbit 16.3, cougar 173.8, coyote 27.5, prairiedog 38.8, muledeer 40.0 |
| 4 | 600000 | 224.4 | 585 / 0.36 / 0% | 36 / 0.27 / 0% | 504 / 0.39 / 0% | 562 / 0.44 / 0% | 560 / 0.30 / 0% | 8 / 0.54 / 4% | 63 / 0.34 / 0% | 20 / 0.55 / 0% | 48 / 1.52 / 1% | bison 12.5, wolf 82.5, raven 15.0, pronghorn 27.5, rabbit 91.3, cougar 20.0, coyote 27.5, prairiedog 86.3, muledeer 10.0 |
| 5 | 600000 | 217.7 | 543 / 0.32 / 0% | 37 / 0.23 / 0% | 466 / 0.38 / 0% | 583 / 0.44 / 0% | 649 / 0.31 / 0% | 6 / 0.53 / 4% | 60 / 0.34 / 0% | 51 / 0.71 / 1% | 15 / 0.44 / 0% | bison 20.0, wolf 21.3, raven 25.0, pronghorn 16.3, rabbit 32.5, cougar 36.3, coyote 212.5, prairiedog 41.3, muledeer 73.8 |
| 6 | 600000 | 220.9 | 468 / 0.36 / 0% | 34 / 0.26 / 0% | 408 / 0.39 / 0% | 557 / 0.43 / 0% | 597 / 0.36 / 0% | 7 / 0.56 / 5% | 48 / 0.35 / 0% | 15 / 1.01 / 11% | 60 / 1.14 / 2% | bison 18.8, wolf 62.5, raven 20.0, pronghorn 18.8, rabbit 32.5, cougar 8.8, coyote 130.0, prairiedog 88.8, muledeer 45.0 |
| 7 | 600000 | 235.7 | 542 / 0.25 / 0% | 32 / 0.17 / 0% | 491 / 0.32 / 0% | 561 / 0.48 / 0% | 607 / 0.31 / 0% | 8 / 0.43 / 1% | 59 / 0.34 / 1% | 38 / 0.54 / 0% | 46 / 1.47 / 2% | bison 43.8, wolf 68.8, raven 45.0, pronghorn 22.5, rabbit 68.8, cougar 10.0, coyote 30.0, prairiedog 156.3, muledeer 26.3 |
| 8 | 600000 | 215.6 | 466 / 0.37 / 0% | 35 / 0.24 / 0% | 409 / 0.42 / 0% | 539 / 0.38 / 0% | 571 / 0.31 / 0% | 7 / 0.57 / 5% | 67 / 0.31 / 0% | 19 / 0.65 / 3% | 21 / 1.13 / 0% | bison 13.8, wolf 53.8, raven 13.8, pronghorn 16.3, rabbit 30.0, cougar 23.8, coyote 55.0, prairiedog 127.5, muledeer 157.5 |
| 9 | 600000 | 221.7 | 544 / 0.35 / 0% | 31 / 0.27 / 0% | 484 / 0.39 / 0% | 485 / 0.38 / 0% | 580 / 0.30 / 0% | 6 / 0.51 / 4% | 69 / 0.30 / 0% | 19 / 0.75 / 4% | 184 / 0.59 / 7% | bison 46.3, wolf 41.3, raven 27.5, pronghorn 8.8, rabbit 27.5, cougar 23.8, coyote 37.5, prairiedog 130.0, muledeer 11.3 |
| 10 | 600000 | 222.9 | 421 / 0.40 / 0% | 38 / 0.24 / 0% | 376 / 0.41 / 0% | 614 / 0.44 / 0% | 587 / 0.29 / 0% | 6 / 0.55 / 4% | 63 / 0.34 / 0% | 37 / 0.58 / 0% | 20 / 1.15 / 0% | bison 18.8, wolf unaffected, raven 17.5, pronghorn 56.3, rabbit 51.3, cougar 18.8, coyote 65.0, prairiedog 60.0, muledeer unaffected |
| 11 | 600000 | 226.8 | 481 / 0.36 / 0% | 31 / 0.21 / 0% | 413 / 0.40 / 0% | 544 / 0.41 / 0% | 545 / 0.33 / 0% | 6 / 0.61 / 8% EXTINCT@498.8yr | 64 / 0.36 / 0% | 25 / 0.55 / 1% | 27 / 1.26 / 0% | bison 53.8, wolf 31.3, raven 100.0, pronghorn 76.3, rabbit 18.8, cougar 112.5, coyote 10.0, prairiedog 8.8, muledeer 12.5 |
| 12 | 600000 | 236.5 | 600 / 0.31 / 0% | 35 / 0.25 / 0% | 548 / 0.37 / 0% | 458 / 0.39 / 0% | 622 / 0.32 / 0% | 7 / 0.57 / 7% | 66 / 0.31 / 0% | 35 / 0.72 / 3% | 146 / 0.60 / 1% | bison 13.8, wolf 58.8, raven 13.8, pronghorn 10.0, rabbit 26.3, cougar 37.5, coyote 25.0, prairiedog 62.5, muledeer 15.0 |
