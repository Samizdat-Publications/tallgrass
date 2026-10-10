# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit feaa081 (frozen copy); real sim
- Params: {"shoreSpread":1}
- Shocks: drought (2 yr) at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 579 | 0.37 | 0.0% | 0.0 | 2.13 | 27 | 55.6 (8 seeds) | 100% | 100% | 28.1 |
| wolf | 12/12 (100%) | 32 | 0.25 | 0.0% | 0.0 | 1.74 | 41 | 36.3 (11 seeds) | 100% | 100% | 34.4 |
| raven | 12/12 (100%) | 487 | 0.42 | 0.0% | 0.0 | 2.04 | 38 | 33.8 (9 seeds) | 100% | 100% | 18.8 |
| pronghorn | 12/12 (100%) | 371 | 0.28 | 0.0% | 0.0 | 2.05 | 41 | 25.6 (12 seeds) | 100% | 100% | 18.1 |
| rabbit | 12/12 (100%) | 558 | 0.32 | 0.0% | 0.0 | 2.06 | 45 | 40.0 (7 seeds) | 100% | 100% | 41.9 |
| cougar | 12/12 (100%) | 7 | 0.54 | 4.1% | 4.4 | 2.66 | 67 | 145.6 (2 seeds) | 100% | 100% | 45.6 |
| coyote | 12/12 (100%) | 62 | 0.34 | 0.0% | 0.0 | 2.10 | 61 | 15.0 (11 seeds) | 100% | 100% | 31.9 |
| prairiedog | 12/12 (100%) | 25 | 0.72 | 1.5% | 1.9 | 3.61 | 36 | 156.3 (3 seeds) | 100% | 83% | 41.3 |
| muledeer | 12/12 (100%) | 57 | 1.16 | 1.8% | 1.3 | 6.73 | 35 | 61.9 (4 seeds) | 100% | 83% | 25.6 |

Max bison generation depth reached: 231.4 (median across seeds 221.4).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.2 | 0.0 | 0.4 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3003.8 | 7720.3 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 95.9% | 17.6 | 17.5 | 9.0 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 98.8 | 1103.0 |
| prairiedog | 99.9% | 6.7 | 0.6 | 46.0 | 0.0 |
| muledeer | 100.0% | 0.4 | 0.0 | 104.1 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 3.2 | 101 | 115 | 22 | 16 | 1.1 |
| 2 | 28 | 5.6 | 125 | 140 | 20 | 19 | 1.7 |
| 3 | 25 | 5.0 | 127 | 149 | 19 | 12 | 1.3 |
| 4 | 22 | 4.4 | 132 | 140 | 27 | 29 | 1.1 |
| 5 | 23 | 4.6 | 99 | 115 | 24 | 18 | 1.0 |
| 6 | 2 | 0.4 | 57 | 60 | 26 | 22 | 0.3 |
| 7 | 29 | 5.8 | 160 | 164 | 28 | 25 | 1.4 |
| 8 | 21 | 4.2 | 101 | 111 | 24 | 26 | 0.7 |
| 9 | 19 | 3.8 | 80 | 88 | 24 | 20 | 1.1 |
| 10 | 17 | 3.4 | 94 | 99 | 28 | 26 | 0.5 |
| 11 | 25 | 5.0 | 139 | 150 | 21 | 17 | 1.8 |
| 12 | 29 | 5.8 | 139 | 149 | 18 | 18 | 1.7 |

Median plagues per 100 years across seeds: 4.5 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.34. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.31 at a lag of 0.5 years; 8% of seeds reach 0.4. Annual-mean best (median): 0.31.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.30 | 0.28 | 0.33 | 0.28 | 0.27 | 0.11 | 0.33 | 0.28 |
| 2 | 0.31 | 0.36 | 0.14 | 0.08 | 0.03 | -0.09 | 0.14 | 0.08 |
| 3 | 0.30 | 0.28 | 0.27 | 0.25 | 0.27 | 0.10 | 0.27 | 0.25 |
| 4 | 0.38 | 0.34 | 0.26 | 0.23 | 0.19 | 0.10 | 0.26 | 0.23 |
| 5 | 0.31 | 0.29 | 0.34 | 0.27 | 0.21 | 0.08 | 0.34 | 0.27 |
| 6 | 0.33 | 0.31 | 0.46 | 0.39 | 0.26 | 0.11 | 0.46 | 0.39 |
| 7 | 0.34 | 0.34 | 0.37 | 0.33 | 0.25 | 0.12 | 0.37 | 0.33 |
| 8 | 0.34 | 0.35 | 0.30 | 0.27 | 0.17 | 0.07 | 0.30 | 0.27 |
| 9 | 0.35 | 0.33 | 0.16 | 0.07 | 0.02 | -0.08 | 0.16 | 0.07 |
| 10 | 0.36 | 0.35 | 0.21 | 0.16 | 0.08 | -0.02 | 0.21 | 0.16 |
| 11 | 0.35 | 0.29 | 0.37 | 0.35 | 0.23 | 0.08 | 0.37 | 0.35 |
| 12 | 0.31 | 0.29 | 0.32 | 0.22 | 0.18 | 0.06 | 0.32 | 0.22 |

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
| prairiedog | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| muledeer | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 215.5 | 577 / 0.38 / 0% | 35 / 0.27 / 0% | 486 / 0.43 / 0% | 413 / 0.28 / 0% | 533 / 0.28 / 0% | 5 / 0.58 / 7% | 59 / 0.30 / 0% | 19 / 0.52 / 0% | 29 / 1.04 / 1% | bison 31.3, wolf 31.3, raven 15.0, pronghorn 60.0, rabbit 17.5, cougar 18.8, coyote 21.3, prairiedog 15.0, muledeer 7.5 |
| 2 | 600000 | 229.1 | 492 / 0.48 / 10% | 31 / 0.25 / 0% | 445 / 0.48 / 0% | 343 / 0.28 / 0% | 606 / 0.36 / 0% | 8 / 0.56 / 3% | 61 / 0.31 / 0% | 37 / 0.60 / 0% | 64 / 1.13 / 2% | bison 58.8, wolf 67.5, raven 60.0, pronghorn 16.3, rabbit 100.0, cougar 42.5, coyote 56.3, prairiedog 70.0, muledeer 12.5 |
| 3 | 600000 | 212.3 | 582 / 0.33 / 0% | 35 / 0.22 / 0% | 504 / 0.40 / 0% | 362 / 0.28 / 0% | 665 / 0.28 / 0% | 7 / 0.53 / 4% | 63 / 0.30 / 0% | 38 / 0.88 / 2% | 42 / 1.54 / 0% | bison 16.3, wolf 25.0, raven 18.8, pronghorn 22.5, rabbit 52.5, cougar 63.8, coyote 85.0, prairiedog never, muledeer 90.0 |
| 4 | 600000 | 224.4 | 561 / 0.35 / 0% | 36 / 0.24 / 0% | 488 / 0.42 / 0% | 364 / 0.28 / 0% | 532 / 0.34 / 0% | 6 / 0.67 / 9% | 60 / 0.38 / 1% | 24 / 1.03 / 10% | 51 / 1.21 / 2% | bison 27.5, wolf 28.8, raven 23.8, pronghorn 18.8, rabbit 52.5, cougar 37.5, coyote 21.3, prairiedog 43.8, muledeer never |
| 5 | 600000 | 223.4 | 580 / 0.40 / 0% | 30 / 0.32 / 1% | 493 / 0.42 / 0% | 378 / 0.28 / 0% | 588 / 0.29 / 0% | 7 / 0.51 / 3% | 69 / 0.31 / 0% | 27 / 0.95 / 5% | 91 / 0.78 / 2% | bison 45.0, wolf 36.3, raven 55.0, pronghorn 22.5, rabbit 66.3, cougar 58.8, coyote 35.0, prairiedog 61.3, muledeer 11.3 |
| 6 | 600000 | 231.4 | 555 / 0.35 / 0% | 30 / 0.26 / 0% | 472 / 0.41 / 0% | 360 / 0.27 / 0% | 514 / 0.31 / 0% | 6 / 0.55 / 4% | 67 / 0.33 / 0% | 5 / 0.94 / 14% | 49 / 1.27 / 1% | bison 16.3, wolf 47.5, raven 18.8, pronghorn 12.5, rabbit 27.5, cougar 48.8, coyote 32.5, prairiedog 53.8, muledeer never |
| 7 | 600000 | 226.7 | 605 / 0.30 / 0% | 35 / 0.23 / 0% | 475 / 0.38 / 0% | 416 / 0.31 / 0% | 543 / 0.34 / 0% | 7 / 0.53 / 4% | 61 / 0.34 / 1% | 22 / 0.48 / 1% | 42 / 1.47 / 0% | bison 47.5, wolf 13.8, raven 27.5, pronghorn 71.3, rabbit 132.5, cougar 52.5, coyote 46.3, prairiedog 38.8, muledeer 18.8 |
| 8 | 600000 | 223.7 | 585 / 0.38 / 0% | 28 / 0.27 / 0% | 525 / 0.42 / 0% | 345 / 0.29 / 0% | 556 / 0.35 / 0% | 9 / 0.39 / 0% | 63 / 0.34 / 0% | 12 / 0.81 / 6% | 126 / 0.72 / 2% | bison 28.8, wolf 51.3, raven 13.8, pronghorn 17.5, rabbit 30.0, cougar 28.8, coyote 30.0, prairiedog 200.0, muledeer 27.5 |
| 9 | 600000 | 216.1 | 517 / 0.41 / 0% | 32 / 0.26 / 0% | 438 / 0.47 / 0% | 384 / 0.27 / 0% | 560 / 0.33 / 0% | 6 / 0.55 / 4% | 69 / 0.35 / 0% | 26 / 0.63 / 0% | 34 / 1.23 / 1% | bison 36.3, wolf 32.5, raven 40.0, pronghorn 12.5, rabbit 38.8, cougar 56.3, coyote 31.3, prairiedog never, muledeer 23.8 |
| 10 | 600000 | 219.5 | 616 / 0.40 / 0% | 29 / 0.32 / 0% | 495 / 0.46 / 0% | 401 / 0.26 / 0% | 508 / 0.35 / 0% | 7 / 0.55 / 4% | 59 / 0.36 / 0% | 12 / 1.31 / 20% | 114 / 1.00 / 4% | bison 15.0, wolf 181.3, raven 16.3, pronghorn 21.3, rabbit 16.3, cougar 25.0, coyote 18.8, prairiedog 11.3, muledeer 257.5 |
| 11 | 600000 | 213.4 | 534 / 0.35 / 0% | 32 / 0.24 / 0% | 455 / 0.42 / 0% | 382 / 0.26 / 0% | 633 / 0.29 / 0% | 7 / 0.51 / 4% | 60 / 0.35 / 1% | 42 / 0.49 / 0% | 70 / 1.20 / 3% | bison 11.3, wolf 42.5, raven 15.0, pronghorn 8.8, rabbit 40.0, cougar 52.5, coyote 10.0, prairiedog 25.0, muledeer 271.3 |
| 12 | 600000 | 210.7 | 725 / 0.27 / 0% | 37 / 0.25 / 0% | 612 / 0.31 / 0% | 342 / 0.26 / 0% | 634 / 0.29 / 0% | 7 / 0.48 / 4% | 65 / 0.31 / 0% | 31 / 0.56 / 0% | 187 / 0.48 / 0% | bison 15.0, wolf 32.5, raven 15.0, pronghorn 10.0, rabbit 43.8, cougar 18.8, coyote 33.8, prairiedog 16.3, muledeer 52.5 |
