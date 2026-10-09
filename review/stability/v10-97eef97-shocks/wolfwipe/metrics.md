# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit 97eef97 (frozen copy); real sim
- Params: {"evolution2":1,"climate2":0.3,"wolfDenMinDist":280,"wolfTerritory":130}
- Shocks: wolves removed at tick 210000 (year 175.0); introduce 8 wolves at tick 300000 (year 250.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 578 | 0.39 | 0.0% | 0.0 | 2.88 | 24 | 28.8 (11 seeds) | 100% | 100% | 26.9 |
| wolf | 12/12 (100%) | 31 | 0.33 | 3.1% | 13.1 | 1.83 | 38 | 44.4 (6 seeds) | 100% | 100% | 31.9 |
| raven | 12/12 (100%) | 480 | 0.40 | 0.0% | 0.0 | 2.06 | 37 | 28.8 (11 seeds) | 100% | 100% | 30.0 |
| pronghorn | 12/12 (100%) | 608 | 0.47 | 0.0% | 0.0 | 3.09 | 47 | 10.0 (12 seeds) | 100% | 58% | 36.3 |
| rabbit | 12/12 (100%) | 563 | 0.32 | 0.0% | 0.0 | 2.03 | 46 | 60.0 (7 seeds) | 100% | 100% | 54.4 |
| cougar | 12/12 (100%) | 6 | 0.60 | 7.5% | 7.5 | 2.75 | 69 | 101.3 (3 seeds) | 100% | 100% | 23.1 |
| coyote | 12/12 (100%) | 62 | 0.34 | 0.0% | 0.0 | 2.15 | 61 | 15.0 (8 seeds) | 100% | 100% | 35.0 |
| prairiedog | 11/12 (92%) | 19 | 0.70 | 1.2% | 3.8 | 3.52 | 37 | 96.9 (6 seeds) | 100% | 83% | 60.0 |
| muledeer | 12/12 (100%) | 49 | 1.18 | 1.8% | 1.3 | 6.44 | 36 | 53.1 (8 seeds) | 100% | 67% | 39.4 |

Max bison generation depth reached: 233.1 (median across seeds 221.8).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 97.1% | 3.5 | 12.5 | 1.2 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 1621.0 | 16558.8 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 92.5% | 24.9 | 31.9 | 11.0 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 99.8 | 1120.1 |
| prairiedog | 100.0% | 2.7 | 0.0 | 50.8 | 0.0 |
| muledeer | 100.0% | 0.4 | 0.0 | 174.4 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 29 | 5.8 | 125 | 133 | 21 | 19 | 1.2 |
| 2 | 15 | 3.0 | 88 | 97 | 27 | 23 | 0.6 |
| 3 | 10 | 2.0 | 100 | 108 | 21 | 21 | 0.7 |
| 4 | 22 | 4.4 | 96 | 105 | 29 | 22 | 1.0 |
| 5 | 29 | 5.8 | 152 | 162 | 25 | 20 | 1.4 |
| 6 | 17 | 3.4 | 131 | 138 | 24 | 23 | 0.9 |
| 7 | 20 | 4.0 | 146 | 160 | 27 | 27 | 1.5 |
| 8 | 17 | 3.4 | 98 | 104 | 22 | 22 | 0.8 |
| 9 | 10 | 2.0 | 91 | 99 | 27 | 24 | 0.9 |
| 10 | 30 | 6.0 | 145 | 157 | 17 | 23 | 1.4 |
| 11 | 14 | 2.8 | 92 | 97 | 25 | 22 | 0.8 |
| 12 | 26 | 5.2 | 132 | 140 | 24 | 27 | 1.1 |

Median plagues per 100 years across seeds: 3.7 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.34. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.31 at a lag of 0.5 years; 25% of seeds reach 0.4. Annual-mean best (median): 0.31.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.37 | 0.29 | -0.01 | -0.03 | 0.00 | -0.07 | -0.01 | -0.03 |
| 2 | 0.32 | 0.32 | 0.30 | 0.13 | 0.01 | -0.08 | 0.30 | 0.13 |
| 3 | 0.35 | 0.31 | 0.22 | 0.19 | 0.15 | 0.03 | 0.22 | 0.19 |
| 4 | 0.34 | 0.30 | 0.36 | 0.28 | 0.16 | 0.05 | 0.36 | 0.28 |
| 5 | 0.34 | 0.33 | 0.15 | 0.16 | 0.14 | 0.03 | 0.15 | 0.16 |
| 6 | 0.33 | 0.31 | 0.46 | 0.40 | 0.30 | 0.17 | 0.46 | 0.40 |
| 7 | 0.35 | 0.34 | 0.29 | 0.22 | 0.14 | 0.06 | 0.29 | 0.22 |
| 8 | 0.31 | 0.33 | 0.42 | 0.25 | 0.14 | 0.02 | 0.42 | 0.25 |
| 9 | 0.30 | 0.30 | 0.45 | 0.41 | 0.34 | 0.14 | 0.45 | 0.41 |
| 10 | 0.31 | 0.29 | 0.38 | 0.26 | 0.20 | 0.07 | 0.38 | 0.26 |
| 11 | 0.35 | 0.34 | 0.32 | 0.30 | 0.21 | 0.09 | 0.32 | 0.30 |
| 12 | 0.35 | 0.33 | 0.30 | 0.28 | 0.23 | 0.14 | 0.30 | 0.28 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | PASS | FAIL | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 227.3 | 610 / 0.36 / 0% | 33 / 0.33 / 3% | 524 / 0.39 / 0% | 497 / 0.46 / 0% | 592 / 0.29 / 0% | 6 / 0.53 / 6% | 60 / 0.37 / 0% | 23 / 0.48 / 1% | 120 / 1.08 / 16% | bison 48.8, wolf 30.0, raven 35.0, pronghorn 33.8, rabbit 56.3, cougar 36.3, coyote 18.8, prairiedog 15.0, muledeer 23.8 |
| 2 | 600000 | 221.8 | 561 / 0.34 / 0% | 34 / 0.25 / 1% | 476 / 0.39 / 0% | 545 / 0.48 / 0% | 552 / 0.32 / 0% | 7 / 0.49 / 3% | 66 / 0.32 / 0% | 12 / 0.82 / 6% | 19 / 0.80 / 0% | bison 17.5, wolf 11.3, raven 20.0, pronghorn never, rabbit 15.0, cougar 7.5, coyote 25.0, prairiedog 35.0, muledeer 37.5 |
| 3 | 600000 | 221.9 | 619 / 0.56 / 0% | 30 / 0.52 / 13% | 483 / 0.43 / 0% | 610 / 0.53 / 0% | 584 / 0.31 / 0% | 6 / 0.69 / 14% | 62 / 0.35 / 0% | 16 / 0.68 / 4% | 58 / 1.39 / 2% | bison 12.5, wolf 183.8, raven 13.8, pronghorn 221.3, rabbit 32.5, cougar 21.3, coyote 45.0, prairiedog 220.0, muledeer 41.3 |
| 4 | 600000 | 230.7 | 604 / 0.52 / 0% | 30 / 0.49 / 11% | 494 / 0.43 / 0% | 646 / 0.50 / 0% | 562 / 0.30 / 0% | 6 / 0.58 / 8% | 68 / 0.34 / 0% | 20 / 0.69 / 0% | 61 / 1.39 / 2% | bison 16.3, wolf 65.0, raven 46.3, pronghorn never, rabbit 27.5, cougar 26.3, coyote 110.0, prairiedog 87.5, muledeer never |
| 5 | 600000 | 223.6 | 615 / 0.41 / 0% | 29 / 0.42 / 8% | 478 / 0.40 / 0% | 655 / 0.49 / 0% | 599 / 0.33 / 0% | 5 / 0.59 / 7% | 58 / 0.34 / 0% | 36 / 0.78 / 0% | 43 / 1.20 / 2% | bison 28.8, wolf 33.8, raven 55.0, pronghorn 11.3, rabbit 55.0, cougar 35.0, coyote 80.0, prairiedog 12.5, muledeer 57.5 |
| 6 | 600000 | 221.5 | 528 / 0.32 / 0% | 30 / 0.30 / 1% | 459 / 0.36 / 0% | 609 / 0.47 / 0% | 561 / 0.31 / 0% | 6 / 0.49 / 3% | 57 / 0.33 / 0% | 16 / 0.48 / 1% | 49 / 1.14 / 1% | bison 20.0, wolf 7.5, raven 16.3, pronghorn never, rabbit 66.3, cougar 42.5, coyote 12.5, prairiedog 31.3, muledeer never |
| 7 | 600000 | 221.2 | 580 / 0.34 / 0% | 37 / 0.27 / 2% | 498 / 0.33 / 0% | 530 / 0.44 / 0% | 564 / 0.34 / 0% | 8 / 0.49 / 3% | 65 / 0.35 / 1% | 30 / 0.71 / 0% | 48 / 1.44 / 1% | bison 17.5, wolf 7.5, raven 18.8, pronghorn 47.5, rabbit 83.8, cougar 72.5, coyote 73.8, prairiedog never, muledeer never |
| 8 | 600000 | 233.1 | 582 / 0.45 / 0% | 33 / 0.35 / 4% | 455 / 0.42 / 0% | 606 / 0.50 / 0% | 520 / 0.33 / 0% | 6 / 0.68 / 11% | 69 / 0.31 / 0% | 13 / 0.62 / 6% | 26 / 1.15 / 0% | bison 30.0, wolf 30.0, raven 8.8, pronghorn 26.3, rabbit 83.8, cougar 25.0, coyote 52.5, prairiedog 38.8, muledeer 8.8 |
| 9 | 600000 | 222.4 | 552 / 0.36 / 0% | 29 / 0.33 / 1% | 485 / 0.39 / 0% | 528 / 0.46 / 0% | 562 / 0.30 / 0% | 6 / 0.61 / 10% | 62 / 0.30 / 0% | 18 / 0.50 / 0% | 134 / 0.97 / 13% | bison 41.3, wolf 151.3, raven 85.0, pronghorn never, rabbit 22.5, cougar 16.3, coyote 13.8, prairiedog 142.5, muledeer 27.5 |
| 10 | 600000 | 199.0 | 493 / 0.60 / 0% | 35 / 0.35 / 4% | 402 / 0.46 / 0% | 635 / 0.46 / 0% | 585 / 0.29 / 0% | 5 / 0.64 / 7% | 61 / 0.31 / 0% | 30 / 0.71 / 2% | 26 / 1.25 / 0% | bison 37.5, wolf 7.5, raven 41.3, pronghorn 36.3, rabbit 52.5, cougar 10.0, coyote 95.0, prairiedog 81.3, muledeer 187.5 |
| 11 | 600000 | 218.9 | 557 / 0.44 / 0% | 28 / 0.33 / 3% | 433 / 0.41 / 0% | 614 / 0.43 / 0% | 514 / 0.34 / 0% | 6 / 0.61 / 8% | 62 / 0.35 / 0% | 14 / 1.03 / 13% EXTINCT@500.0yr | 28 / 1.20 / 0% | bison 35.0, wolf 40.0, raven 36.3, pronghorn 47.5, rabbit 55.0, cougar 13.8, coyote 17.5, prairiedog never, muledeer 45.0 |
| 12 | 600000 | 213.0 | 576 / 0.33 / 0% | 37 / 0.28 / 0% | 513 / 0.37 / 0% | 539 / 0.47 / 0% | 578 / 0.33 / 0% | 7 / 0.61 / 11% | 66 / 0.35 / 0% | 21 / 0.73 / 1% | 74 / 1.10 / 4% | bison 25.0, wolf 46.3, raven 25.0, pronghorn never, rabbit 53.8, cougar 17.5, coyote 16.3, prairiedog 123.8, muledeer never |
