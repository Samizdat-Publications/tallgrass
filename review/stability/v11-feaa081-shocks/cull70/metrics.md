# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit feaa081 (frozen copy); real sim
- Params: {"shoreSpread":1}
- Shocks: cull 70% bison at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 614 | 0.36 | 0.0% | 0.0 | 2.21 | 27 | 56.3 (12 seeds) | 100% | 100% | 14.4 |
| wolf | 12/12 (100%) | 32 | 0.26 | 0.0% | 0.0 | 1.81 | 43 | 82.5 (11 seeds) | 100% | 100% | 22.5 |
| raven | 12/12 (100%) | 506 | 0.41 | 0.0% | 0.0 | 1.97 | 38 | 75.6 (12 seeds) | 100% | 100% | 17.5 |
| pronghorn | 12/12 (100%) | 372 | 0.28 | 0.0% | 0.0 | 1.99 | 42 | 25.0 (12 seeds) | 100% | 100% | 23.1 |
| rabbit | 12/12 (100%) | 544 | 0.31 | 0.0% | 0.0 | 2.02 | 47 | 85.0 (7 seeds) | 100% | 100% | 44.4 |
| cougar | 12/12 (100%) | 7 | 0.53 | 4.1% | 6.3 | 2.49 | 70 | 98.8 (6 seeds) | 100% | 100% | 41.3 |
| coyote | 12/12 (100%) | 63 | 0.33 | 0.0% | 0.0 | 1.98 | 63 | 20.0 (10 seeds) | 100% | 100% | 33.8 |
| prairiedog | 12/12 (100%) | 23 | 0.66 | 1.8% | 3.8 | 3.21 | 36 | 131.3 (2 seeds) | 100% | 92% | 43.8 |
| muledeer | 12/12 (100%) | 86 | 0.92 | 1.3% | 1.3 | 5.05 | 38 | 21.3 (5 seeds) | 100% | 83% | 28.8 |

Max bison generation depth reached: 234.7 (median across seeds 215.7).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.2 | 0.0 | 0.4 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3116.0 | 7596.0 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 95.9% | 17.6 | 17.5 | 8.3 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 99.7 | 1148.6 |
| prairiedog | 99.9% | 4.9 | 0.6 | 44.9 | 0.0 |
| muledeer | 100.0% | 0.4 | 0.0 | 72.6 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 13 | 2.6 | 97 | 105 | 21 | 16 | 0.7 |
| 2 | 50 | 10.0 | 163 | 180 | 17 | 14 | 2.4 |
| 3 | 39 | 7.8 | 151 | 180 | 17 | 10 | 2.1 |
| 4 | 18 | 3.6 | 119 | 126 | 29 | 25 | 1.1 |
| 5 | 18 | 3.6 | 81 | 85 | 29 | 16 | 0.6 |
| 6 | 6 | 1.2 | 62 | 66 | 28 | 23 | 0.4 |
| 7 | 29 | 5.8 | 147 | 149 | 31 | 24 | 1.0 |
| 8 | 29 | 5.8 | 128 | 138 | 18 | 20 | 1.2 |
| 9 | 14 | 2.8 | 78 | 88 | 30 | 26 | 1.2 |
| 10 | 14 | 2.8 | 95 | 100 | 23 | 21 | 0.5 |
| 11 | 36 | 7.2 | 179 | 191 | 23 | 17 | 2.1 |
| 12 | 21 | 4.2 | 125 | 141 | 18 | 20 | 1.5 |

Median plagues per 100 years across seeds: 3.9 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.33. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.35 at a lag of 0.5 years; 17% of seeds reach 0.4. Annual-mean best (median): 0.35.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.31 | 0.28 | 0.36 | 0.25 | 0.21 | 0.07 | 0.36 | 0.25 |
| 2 | 0.31 | 0.29 | 0.19 | 0.12 | 0.06 | -0.03 | 0.19 | 0.12 |
| 3 | 0.28 | 0.29 | 0.29 | 0.23 | 0.23 | 0.15 | 0.29 | 0.23 |
| 4 | 0.33 | 0.32 | 0.42 | 0.39 | 0.33 | 0.20 | 0.42 | 0.39 |
| 5 | 0.33 | 0.29 | 0.37 | 0.28 | 0.24 | 0.19 | 0.37 | 0.28 |
| 6 | 0.33 | 0.31 | 0.41 | 0.28 | 0.17 | 0.07 | 0.41 | 0.28 |
| 7 | 0.36 | 0.34 | 0.37 | 0.36 | 0.26 | 0.14 | 0.37 | 0.36 |
| 8 | 0.33 | 0.31 | 0.39 | 0.30 | 0.24 | 0.10 | 0.39 | 0.30 |
| 9 | 0.36 | 0.35 | 0.15 | 0.06 | 0.00 | -0.07 | 0.15 | 0.06 |
| 10 | 0.32 | 0.34 | 0.18 | 0.12 | 0.07 | -0.04 | 0.18 | 0.12 |
| 11 | 0.33 | 0.30 | 0.34 | 0.29 | 0.21 | 0.09 | 0.34 | 0.29 |
| 12 | 0.35 | 0.36 | 0.28 | 0.20 | 0.18 | 0.09 | 0.28 | 0.20 |

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
| 1 | 600000 | 208.0 | 620 / 0.35 / 0% | 34 / 0.26 / 0% | 508 / 0.41 / 0% | 389 / 0.27 / 0% | 537 / 0.28 / 0% | 6 / 0.56 / 6% | 66 / 0.31 / 0% | 16 / 0.63 / 2% | 26 / 0.93 / 0% | bison 7.5, wolf 8.8, raven 10.0, pronghorn 11.3, rabbit 17.5, cougar 8.8, coyote 18.8, prairiedog 30.0, muledeer 81.3 |
| 2 | 600000 | 228.2 | 540 / 0.36 / 0% | 29 / 0.23 / 0% | 491 / 0.41 / 0% | 325 / 0.25 / 0% | 686 / 0.29 / 0% | 8 / 0.54 / 5% | 63 / 0.31 / 0% | 59 / 0.34 / 0% | 149 / 0.54 / 0% | bison 12.5, wolf 58.8, raven 13.8, pronghorn 31.3, rabbit 38.8, cougar 50.0, coyote 83.8, prairiedog 257.5, muledeer 28.8 |
| 3 | 600000 | 216.0 | 615 / 0.40 / 0% | 35 / 0.26 / 0% | 513 / 0.44 / 0% | 391 / 0.30 / 0% | 703 / 0.29 / 0% | 7 / 0.59 / 6% | 64 / 0.28 / 0% | 55 / 0.59 / 0% | 41 / 1.59 / 1% | bison 7.5, wolf 27.5, raven 17.5, pronghorn 26.3, rabbit 52.5, cougar 51.3, coyote 17.5, prairiedog 32.5, muledeer 22.5 |
| 4 | 600000 | 218.6 | 569 / 0.32 / 0% | 35 / 0.24 / 0% | 511 / 0.40 / 0% | 367 / 0.29 / 0% | 549 / 0.32 / 0% | 7 / 0.55 / 6% | 57 / 0.33 / 0% | 24 / 1.02 / 6% | 66 / 0.95 / 1% | bison 13.8, wolf 48.8, raven 16.3, pronghorn 11.3, rabbit 52.5, cougar 27.5, coyote 27.5, prairiedog 11.3, muledeer 41.3 |
| 5 | 600000 | 223.7 | 528 / 0.35 / 0% | 31 / 0.27 / 0% | 481 / 0.40 / 0% | 351 / 0.28 / 0% | 515 / 0.29 / 0% | 6 / 0.51 / 4% | 68 / 0.33 / 0% | 8 / 0.68 / 1% | 108 / 0.54 / 0% | bison 22.5, wolf 13.8, raven 25.0, pronghorn 20.0, rabbit 53.8, cougar 21.3, coyote 57.5, prairiedog 137.5, muledeer 8.8 |
| 6 | 600000 | 213.5 | 616 / 0.32 / 0% | 29 / 0.26 / 0% | 502 / 0.40 / 0% | 368 / 0.26 / 0% | 492 / 0.31 / 0% | 7 / 0.46 / 2% | 69 / 0.33 / 0% | 7 / 0.82 / 9% | 80 / 0.97 / 2% | bison 41.3, wolf 41.3, raven 43.8, pronghorn 37.5, rabbit 157.5, cougar 57.5, coyote 37.5, prairiedog 7.5, muledeer 23.8 |
| 7 | 600000 | 234.7 | 655 / 0.38 / 0% | 33 / 0.31 / 4% | 518 / 0.36 / 0% | 378 / 0.28 / 0% | 532 / 0.34 / 0% | 8 / 0.52 / 4% | 59 / 0.36 / 1% | 15 / 0.64 / 4% | 120 / 0.76 / 3% | bison 16.3, wolf 15.0, raven 18.8, pronghorn 12.5, rabbit 67.5, cougar 42.5, coyote 30.0, prairiedog 23.8, muledeer 28.8 |
| 8 | 600000 | 215.5 | 614 / 0.43 / 0% | 28 / 0.27 / 0% | 523 / 0.44 / 0% | 369 / 0.29 / 0% | 609 / 0.31 / 0% | 7 / 0.48 / 4% | 66 / 0.33 / 0% | 21 / 0.70 / 1% | 73 / 1.18 / 3% | bison 15.0, wolf 80.0, raven 17.5, pronghorn 77.5, rabbit 30.0, cougar 10.0, coyote 31.3, prairiedog 120.0, muledeer never |
| 9 | 600000 | 218.4 | 537 / 0.37 / 0% | 32 / 0.26 / 0% | 463 / 0.44 / 0% | 376 / 0.28 / 0% | 538 / 0.35 / 0% | 7 / 0.48 / 3% | 70 / 0.36 / 0% | 28 / 0.57 / 0% | 145 / 0.74 / 6% | bison 12.5, wolf 17.5, raven 25.0, pronghorn 15.0, rabbit 21.3, cougar 65.0, coyote 15.0, prairiedog never, muledeer 38.8 |
| 10 | 600000 | 212.9 | 634 / 0.43 / 0% | 28 / 0.35 / 0% | 504 / 0.47 / 0% | 380 / 0.28 / 0% | 514 / 0.34 / 0% | 7 / 0.54 / 3% | 63 / 0.32 / 0% | 11 / 1.30 / 14% | 92 / 0.90 / 0% | bison 22.5, wolf 13.8, raven 15.0, pronghorn 68.8, rabbit 50.0, cougar 41.3, coyote 67.5, prairiedog 43.8, muledeer 92.5 |
| 11 | 600000 | 212.8 | 566 / 0.36 / 0% | 32 / 0.25 / 0% | 471 / 0.42 / 0% | 381 / 0.25 / 0% | 631 / 0.30 / 0% | 6 / 0.54 / 5% | 62 / 0.33 / 1% | 40 / 0.41 / 0% | 61 / 1.35 / 2% | bison 21.3, wolf 45.0, raven 11.3, pronghorn 12.5, rabbit 11.3, cougar 23.8, coyote 241.3, prairiedog 90.0, muledeer never |
| 12 | 600000 | 209.1 | 644 / 0.27 / 0% | 35 / 0.25 / 0% | 577 / 0.32 / 0% | 345 / 0.26 / 0% | 587 / 0.36 / 0% | 8 / 0.47 / 3% | 62 / 0.35 / 0% | 26 / 0.72 / 3% | 160 / 0.54 / 0% | bison 7.5, wolf 8.8, raven 53.8, pronghorn 28.8, rabbit 33.8, cougar 41.3, coyote 36.3, prairiedog 70.0, muledeer 15.0 |
