# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit f219729 (frozen copy); real sim
- Params: {"shoreSpread":1,"shoreOpen":2}
- Shocks: drought (2 yr) at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 10/12 (83%) | 578 | 0.35 | 0.0% | 0.0 | 2.15 | 26 | 55.0 (9 seeds) | 100% | 83% | 30.6 |
| wolf | 10/12 (83%) | 32 | 0.28 | 0.0% | 0.0 | 1.87 | 39 | 36.9 (6 seeds) | 100% | 83% | 32.5 |
| raven | 12/12 (100%) | 498 | 0.42 | 0.0% | 0.0 | 1.97 | 37 | 60.0 (9 seeds) | 100% | 83% | 33.8 |
| pronghorn | 12/12 (100%) | 381 | 0.30 | 0.0% | 0.0 | 2.32 | 41 | 25.0 (12 seeds) | 100% | 100% | 22.5 |
| rabbit | 12/12 (100%) | 569 | 0.32 | 0.0% | 0.0 | 2.22 | 46 | 60.0 (7 seeds) | 100% | 100% | 38.1 |
| cougar | 11/12 (92%) | 7 | 0.55 | 4.7% | 5.0 | 2.59 | 69 | 116.9 (8 seeds) | 100% | 100% | 48.1 |
| coyote | 12/12 (100%) | 62 | 0.34 | 0.0% | 0.0 | 2.05 | 59 | 50.0 (11 seeds) | 100% | 83% | 55.6 |
| prairiedog | 11/12 (92%) | 19 | 0.74 | 2.6% | 3.8 | 3.59 | 34 | 119.4 (4 seeds) | 100% | 92% | 25.0 |
| muledeer | 12/12 (100%) | 100 | 0.89 | 1.3% | 2.5 | 4.32 | 36 | 15.6 (2 seeds) | 100% | 83% | 15.0 |

Max bison generation depth reached: 221.7 (median across seeds 216.2).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.4 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 5.7 | 0.0 | 1.7 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2934.7 | 8555.0 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 95.3% | 32.0 | 20.0 | 13.8 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 97.3 | 1078.4 |
| prairiedog | 100.0% | 4.1 | 0.0 | 45.8 | 0.0 |
| muledeer | 100.0% | 0.2 | 0.0 | 67.5 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 18 | 3.6 | 105 | 107 | 19 | 18 | 1.1 |
| 2 | 18 | 3.6 | 88 | 95 | 25 | 24 | 0.7 |
| 3 | 6 | 1.2 | 99 | 102 | 20 | 20 | 0.6 |
| 4 | 7 | 1.4 | 104 | 117 | 28 | 22 | 0.6 |
| 5 | 31 | 6.2 | 165 | 168 | 25 | 21 | 1.6 |
| 6 | 27 | 5.4 | 95 | 97 | 21 | 21 | 1.1 |
| 7 | 15 | 3.0 | 91 | 100 | 26 | 27 | 0.8 |
| 8 | 31 | 6.2 | 127 | 142 | 23 | 23 | 1.5 |
| 9 | 34 | 6.8 | 127 | 137 | 21 | 23 | 1.7 |
| 10 | 25 | 5.0 | 115 | 133 | 19 | 22 | 1.2 |
| 11 | 32 | 6.4 | 109 | 130 | 23 | 19 | 1.2 |
| 12 | 19 | 3.8 | 102 | 111 | 23 | 26 | 0.8 |

Median plagues per 100 years across seeds: 4.4 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.34. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.31 at a lag of 0.5 years; 17% of seeds reach 0.4. Annual-mean best (median): 0.31.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.33 | 0.27 | 0.33 | 0.21 | 0.15 | 0.01 | 0.33 | 0.21 |
| 2 | 0.30 | 0.36 | 0.16 | 0.07 | -0.01 | -0.15 | 0.16 | 0.07 |
| 3 | 0.32 | 0.32 | 0.33 | 0.30 | 0.27 | 0.17 | 0.33 | 0.30 |
| 4 | 0.36 | 0.30 | 0.30 | 0.23 | 0.19 | 0.07 | 0.30 | 0.23 |
| 5 | 0.35 | 0.31 | 0.24 | 0.23 | 0.19 | 0.10 | 0.24 | 0.23 |
| 6 | 0.35 | 0.32 | 0.43 | 0.44 | 0.38 | 0.25 | 0.43 | 0.44 |
| 7 | 0.34 | 0.33 | 0.46 | 0.38 | 0.26 | 0.16 | 0.46 | 0.38 |
| 8 | 0.38 | 0.35 | 0.15 | 0.14 | 0.13 | 0.01 | 0.15 | 0.14 |
| 9 | 0.34 | 0.32 | 0.22 | 0.20 | 0.11 | -0.04 | 0.22 | 0.20 |
| 10 | 0.31 | 0.39 | -0.14 | -0.24 | -0.26 | -0.33 | -0.14 | -0.24 |
| 11 | 0.36 | 0.31 | 0.36 | 0.20 | 0.10 | 0.02 | 0.36 | 0.20 |
| 12 | 0.34 | 0.35 | 0.33 | 0.28 | 0.20 | 0.07 | 0.33 | 0.28 |

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
| 1 | 600000 | 221.7 | 632 / 0.49 / 0% | 28 / 0.42 / 7% | 519 / 0.42 / 0% | 366 / 0.30 / 0% | 561 / 0.27 / 0% | 5 / 0.61 / 8% | 64 / 0.33 / 0% | 24 / 0.63 / 0% | 164 / 0.52 / 0% | bison 57.5, wolf 55.0, raven 36.3, pronghorn 61.3, rabbit 38.8, cougar 113.8, coyote never, prairiedog 45.0, muledeer 21.3 |
| 2 | 600000 | 98.7 | 212 / 1.63 / 68% EXTINCT@215.0yr | 11 / 1.30 / 45% EXTINCT@493.8yr | 188 / 1.32 / 30% | 430 / 0.37 / 0% | 496 / 0.36 / 0% | 3 / 0.95 / 27% | 74 / 0.30 / 0% | 13 / 0.60 / 1% | 135 / 0.70 / 1% | bison never, wolf never, raven never, pronghorn 10.0, rabbit 65.0, cougar 68.8, coyote 50.0, prairiedog 13.8, muledeer 61.3 |
| 3 | 600000 | 220.3 | 577 / 0.40 / 0% | 32 / 0.29 / 0% | 502 / 0.43 / 0% | 406 / 0.30 / 0% | 581 / 0.32 / 0% | 7 / 0.47 / 2% | 55 / 0.32 / 0% | 9 / 0.77 / 5% | 67 / 1.26 / 1% | bison 27.5, wolf 37.5, raven 30.0, pronghorn 72.5, rabbit 16.3, cougar 31.3, coyote 20.0, prairiedog 23.8, muledeer never |
| 4 | 600000 | 217.7 | 579 / 0.35 / 0% | 33 / 0.25 / 0% | 504 / 0.42 / 0% | 379 / 0.29 / 0% | 512 / 0.30 / 0% | 7 / 0.52 / 4% | 66 / 0.36 / 0% | 13 / 1.20 / 8% | 96 / 0.95 / 4% | bison 27.5, wolf 118.8, raven 30.0, pronghorn 72.5, rabbit 43.8, cougar 88.8, coyote 61.3, prairiedog 46.3, muledeer 8.8 |
| 5 | 600000 | 217.8 | 608 / 0.40 / 0% | 29 / 0.32 / 0% | 494 / 0.43 / 0% | 364 / 0.26 / 0% | 594 / 0.31 / 0% | 7 / 0.53 / 4% | 64 / 0.35 / 0% | 32 / 0.83 / 8% | 162 / 0.56 / 1% | bison 92.5, wolf 21.3, raven 96.3, pronghorn 17.5, rabbit 32.5, cougar 35.0, coyote 70.0, prairiedog 15.0, muledeer 25.0 |
| 6 | 600000 | 209.9 | 544 / 0.33 / 0% | 28 / 0.26 / 0% | 443 / 0.38 / 0% | 412 / 0.27 / 0% | 588 / 0.32 / 0% | 7 / 0.55 / 5% | 54 / 0.35 / 1% | 15 / 0.47 / 0% | 46 / 1.34 / 1% | bison 38.8, wolf 41.3, raven 41.3, pronghorn 18.8, rabbit 48.8, cougar 27.5, coyote 35.0, prairiedog 23.8, muledeer 8.8 |
| 7 | 600000 | 211.9 | 613 / 0.32 / 0% | 34 / 0.26 / 0% | 521 / 0.38 / 0% | 384 / 0.30 / 0% | 519 / 0.33 / 0% | 7 / 0.55 / 5% | 59 / 0.34 / 1% | 12 / 0.65 / 1% | 160 / 0.60 / 2% | bison 10.0, wolf 91.3, raven 95.0, pronghorn 11.3, rabbit 52.5, cougar 17.5, coyote 15.0, prairiedog 13.8, muledeer 10.0 |
| 8 | 600000 | 216.7 | 634 / 0.35 / 0% | 31 / 0.30 / 0% | 544 / 0.38 / 0% | 329 / 0.30 / 0% | 599 / 0.35 / 0% | 7 / 0.51 / 4% | 60 / 0.38 / 1% | 37 / 0.83 / 3% | 104 / 0.92 / 5% | bison 20.0, wolf 23.8, raven 20.0, pronghorn 45.0, rabbit 36.3, cougar 73.8, coyote 115.0, prairiedog 41.3, muledeer 13.8 |
| 9 | 600000 | 215.1 | 511 / 0.34 / 0% | 33 / 0.22 / 0% | 464 / 0.42 / 0% | 368 / 0.30 / 0% | 627 / 0.32 / 0% | 7 / 0.57 / 4% EXTINCT@500.0yr | 60 / 0.34 / 0% | 45 / 0.46 / 0% | 57 / 1.22 / 1% | bison 27.5, wolf 22.5, raven 31.3, pronghorn 26.3, rabbit 37.5, cougar 46.3, coyote 32.5, prairiedog 45.0, muledeer never |
| 10 | 600000 | 97.4 | 173 / 1.62 / 67% EXTINCT@222.5yr | 14 / 1.03 / 34% EXTINCT@497.5yr | 167 / 1.39 / 33% | 408 / 0.32 / 0% | 523 / 0.39 / 0% | 3 / 0.91 / 22% | 73 / 0.31 / 0% | 35 / 1.14 / 24% | 96 / 0.87 / 3% | bison never, wolf never, raven never, pronghorn 10.0, rabbit 18.8, cougar 62.5, coyote never, prairiedog never, muledeer 130.0 |
| 11 | 600000 | 216.6 | 476 / 0.33 / 0% | 32 / 0.22 / 0% | 416 / 0.41 / 0% | 392 / 0.25 / 0% | 537 / 0.31 / 0% | 5 / 0.59 / 6% | 61 / 0.36 / 0% | 23 / 0.71 / 2% | 48 / 1.60 / 1% | bison 33.8, wolf 27.5, raven 36.3, pronghorn 32.5, rabbit 53.8, cougar 50.0, coyote 100.0, prairiedog 25.0, muledeer 16.3 |
| 12 | 600000 | 215.9 | 632 / 0.33 / 0% | 36 / 0.26 / 0% | 552 / 0.36 / 0% | 355 / 0.27 / 0% | 578 / 0.35 / 0% | 8 / 0.43 / 2% | 65 / 0.34 / 0% | 15 / 0.79 / 11% EXTINCT@493.8yr | 142 / 0.60 / 4% | bison 53.8, wolf 18.8, raven 13.8, pronghorn 8.8, rabbit 33.8, cougar 15.0, coyote 62.5, prairiedog 36.3, muledeer 11.3 |
