# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit feaa081 (frozen copy); real sim
- Params: {"shoreSpread":1}
- Shocks: wolves removed at tick 210000 (year 175.0); introduce 8 wolves at tick 300000 (year 250.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 610 | 0.42 | 0.0% | 0.0 | 3.45 | 26 | 30.6 (10 seeds) | 100% | 100% | 43.8 |
| wolf | 12/12 (100%) | 31 | 0.32 | 1.5% | 5.0 | 1.97 | 43 | 66.9 (8 seeds) | 100% | 100% | 34.4 |
| raven | 12/12 (100%) | 503 | 0.42 | 0.0% | 0.0 | 1.97 | 37 | 32.5 (11 seeds) | 100% | 100% | 50.0 |
| pronghorn | 12/12 (100%) | 375 | 0.29 | 0.0% | 0.0 | 2.12 | 39 | 22.5 (12 seeds) | 100% | 100% | 30.0 |
| rabbit | 12/12 (100%) | 558 | 0.32 | 0.0% | 0.0 | 2.08 | 46 | 40.0 (6 seeds) | 100% | 100% | 38.8 |
| cougar | 12/12 (100%) | 7 | 0.54 | 4.5% | 5.6 | 2.50 | 64 | 123.8 (5 seeds) | 100% | 100% | 41.9 |
| coyote | 12/12 (100%) | 63 | 0.32 | 0.0% | 0.0 | 2.04 | 60 | 20.0 (12 seeds) | 100% | 100% | 40.6 |
| prairiedog | 12/12 (100%) | 22 | 0.75 | 6.5% | 7.5 | 3.71 | 33 | 52.5 (3 seeds) | 100% | 83% | 72.5 |
| muledeer | 12/12 (100%) | 100 | 1.02 | 1.6% | 1.3 | 5.79 | 34 | 21.3 (9 seeds) | 100% | 67% | 64.4 |

Max bison generation depth reached: 230.9 (median across seeds 221.9).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 99.0% | 2.4 | 4.4 | 1.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3172.0 | 7793.2 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 95.5% | 18.4 | 19.4 | 9.3 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 98.8 | 1132.5 |
| prairiedog | 99.0% | 6.3 | 4.4 | 48.1 | 0.0 |
| muledeer | 100.0% | 0.0 | 0.0 | 72.2 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 13 | 2.6 | 78 | 87 | 26 | 18 | 0.7 |
| 2 | 24 | 4.8 | 105 | 115 | 23 | 17 | 1.1 |
| 3 | 36 | 7.2 | 139 | 163 | 18 | 14 | 1.7 |
| 4 | 24 | 4.8 | 120 | 128 | 25 | 23 | 1.2 |
| 5 | 16 | 3.2 | 107 | 111 | 26 | 15 | 0.8 |
| 6 | 8 | 1.6 | 77 | 81 | 26 | 24 | 0.3 |
| 7 | 26 | 5.2 | 128 | 133 | 28 | 29 | 1.2 |
| 8 | 24 | 4.8 | 109 | 120 | 24 | 25 | 0.9 |
| 9 | 22 | 4.4 | 109 | 109 | 22 | 21 | 1.3 |
| 10 | 21 | 4.2 | 106 | 113 | 24 | 21 | 0.8 |
| 11 | 28 | 5.6 | 142 | 153 | 23 | 22 | 1.6 |
| 12 | 18 | 3.6 | 99 | 111 | 21 | 22 | 1.1 |

Median plagues per 100 years across seeds: 4.6 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.32. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.32 at a lag of 0.5 years; 8% of seeds reach 0.4. Annual-mean best (median): 0.32.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.31 | 0.28 | 0.39 | 0.27 | 0.25 | 0.11 | 0.39 | 0.27 |
| 2 | 0.33 | 0.34 | 0.04 | -0.01 | -0.05 | -0.20 | 0.04 | -0.01 |
| 3 | 0.29 | 0.28 | 0.44 | 0.38 | 0.37 | 0.27 | 0.44 | 0.38 |
| 4 | 0.33 | 0.30 | 0.30 | 0.30 | 0.22 | 0.12 | 0.30 | 0.30 |
| 5 | 0.29 | 0.30 | 0.33 | 0.24 | 0.23 | 0.10 | 0.33 | 0.24 |
| 6 | 0.32 | 0.31 | 0.35 | 0.24 | 0.13 | -0.02 | 0.35 | 0.24 |
| 7 | 0.38 | 0.34 | 0.36 | 0.34 | 0.27 | 0.12 | 0.36 | 0.34 |
| 8 | 0.35 | 0.34 | 0.31 | 0.22 | 0.13 | 0.01 | 0.31 | 0.22 |
| 9 | 0.35 | 0.33 | 0.20 | 0.07 | 0.03 | -0.04 | 0.20 | 0.07 |
| 10 | 0.34 | 0.31 | 0.29 | 0.24 | 0.23 | 0.09 | 0.29 | 0.24 |
| 11 | 0.32 | 0.32 | 0.23 | 0.21 | 0.14 | 0.05 | 0.23 | 0.21 |
| 12 | 0.32 | 0.35 | 0.34 | 0.30 | 0.26 | 0.16 | 0.34 | 0.30 |

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
| prairiedog | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | PASS | FAIL | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 220.7 | 607 / 0.42 / 0% | 32 / 0.36 / 4% | 516 / 0.42 / 0% | 361 / 0.29 / 0% | 517 / 0.28 / 0% | 5 / 0.57 / 5% | 63 / 0.31 / 0% | 14 / 0.71 / 8% | 123 / 0.71 / 2% | bison 62.5, wolf 8.8, raven 66.3, pronghorn 20.0, rabbit 36.3, cougar 7.5, coyote 21.3, prairiedog 35.0, muledeer never |
| 2 | 600000 | 224.8 | 552 / 0.42 / 0% | 31 / 0.30 / 1% | 481 / 0.44 / 0% | 327 / 0.29 / 0% | 586 / 0.34 / 0% | 7 / 0.51 / 4% | 63 / 0.33 / 0% | 22 / 1.20 / 6% | 148 / 0.71 / 4% | bison 42.5, wolf 36.3, raven 86.3, pronghorn 32.5, rabbit 50.0, cougar 50.0, coyote 35.0, prairiedog never, muledeer 21.3 |
| 3 | 600000 | 225.5 | 596 / 0.47 / 0% | 34 / 0.30 / 2% | 491 / 0.42 / 0% | 375 / 0.33 / 0% | 717 / 0.28 / 0% | 7 / 0.53 / 4% | 64 / 0.29 / 0% | 54 / 0.58 / 0% | 43 / 1.52 / 0% | bison 10.0, wolf 46.3, raven 21.3, pronghorn 107.5, rabbit 91.3, cougar 86.3, coyote 46.3, prairiedog 76.3, muledeer 105.0 |
| 4 | 600000 | 214.8 | 598 / 0.42 / 0% | 32 / 0.28 / 0% | 509 / 0.39 / 0% | 384 / 0.29 / 0% | 573 / 0.30 / 0% | 6 / 0.66 / 9% | 59 / 0.33 / 0% | 27 / 0.84 / 2% | 69 / 1.08 / 1% | bison 70.0, wolf 21.3, raven 72.5, pronghorn 27.5, rabbit 27.5, cougar 45.0, coyote 31.3, prairiedog 137.5, muledeer never |
| 5 | 600000 | 230.9 | 593 / 0.35 / 0% | 30 / 0.32 / 1% | 511 / 0.39 / 0% | 365 / 0.27 / 0% | 520 / 0.30 / 0% | 6 / 0.54 / 5% | 65 / 0.29 / 0% | 9 / 0.75 / 1% | 51 / 1.06 / 1% | bison 46.3, wolf 90.0, raven 27.5, pronghorn 62.5, rabbit 16.3, cougar 26.3, coyote 50.0, prairiedog 58.8, muledeer never |
| 6 | 600000 | 223.5 | 621 / 0.48 / 0% | 26 / 0.40 / 7% | 505 / 0.41 / 0% | 352 / 0.26 / 0% | 493 / 0.31 / 0% | 7 / 0.54 / 4% | 73 / 0.32 / 0% | 6 / 0.82 / 6% | 164 / 0.60 / 1% | bison 55.0, wolf 10.0, raven 32.5, pronghorn 26.3, rabbit 23.8, cougar 32.5, coyote 25.0, prairiedog 61.3, muledeer 58.8 |
| 7 | 600000 | 220.2 | 635 / 0.38 / 0% | 35 / 0.33 / 4% | 510 / 0.40 / 0% | 391 / 0.32 / 0% | 529 / 0.34 / 0% | 8 / 0.50 / 4% | 59 / 0.38 / 1% | 22 / 0.70 / 9% | 42 / 1.46 / 1% | bison 26.3, wolf 56.3, raven 57.5, pronghorn 22.5, rabbit 21.3, cougar 67.5, coyote 61.3, prairiedog 17.5, muledeer 13.8 |
| 8 | 600000 | 223.0 | 633 / 0.57 / 0% | 28 / 0.41 / 5% | 501 / 0.46 / 0% | 391 / 0.32 / 0% | 544 / 0.34 / 0% | 6 / 0.53 / 5% | 67 / 0.35 / 0% | 17 / 0.72 / 3% | 115 / 0.99 / 6% | bison 83.8, wolf 45.0, raven 43.8, pronghorn 62.5, rabbit 83.8, cougar 47.5, coyote 51.3, prairiedog 120.0, muledeer 70.0 |
| 9 | 600000 | 225.1 | 631 / 0.53 / 0% | 29 / 0.42 / 4% | 483 / 0.48 / 0% | 395 / 0.32 / 0% | 587 / 0.33 / 0% | 6 / 0.57 / 8% | 71 / 0.35 / 0% | 32 / 0.52 / 0% | 130 / 0.93 / 7% | bison 33.8, wolf 11.3, raven 37.5, pronghorn 46.3, rabbit 15.0, cougar 21.3, coyote 46.3, prairiedog 103.8, muledeer 236.3 |
| 10 | 600000 | 203.2 | 614 / 0.51 / 0% | 29 / 0.37 / 1% | 485 / 0.46 / 0% | 393 / 0.32 / 0% | 539 / 0.31 / 0% | 6 / 0.56 / 4% | 60 / 0.34 / 0% | 15 / 1.05 / 12% | 74 / 1.11 / 2% | bison 23.8, wolf 7.5, raven 75.0, pronghorn 18.8, rabbit 41.3, cougar 78.8, coyote 16.3, prairiedog 68.8, muledeer 170.0 |
| 11 | 600000 | 214.1 | 567 / 0.41 / 0% | 30 / 0.29 / 0% | 472 / 0.44 / 0% | 375 / 0.27 / 0% | 618 / 0.32 / 0% | 7 / 0.49 / 5% | 58 / 0.32 / 0% | 31 / 0.74 / 9% | 84 / 1.10 / 3% | bison 45.0, wolf 32.5, raven 36.3, pronghorn 10.0, rabbit 71.3, cougar 17.5, coyote 101.3, prairiedog 107.5, muledeer never |
| 12 | 600000 | 215.6 | 698 / 0.28 / 0% | 34 / 0.26 / 0% | 607 / 0.30 / 0% | 313 / 0.23 / 0% | 597 / 0.35 / 0% | 9 / 0.47 / 2% | 60 / 0.32 / 0% | 22 / 0.93 / 21% | 173 / 0.50 / 0% | bison 25.0, wolf 46.3, raven 56.3, pronghorn 56.3, rabbit 60.0, cougar 38.8, coyote 35.0, prairiedog never, muledeer 22.5 |
