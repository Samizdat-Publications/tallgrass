# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit f219729 (frozen copy); real sim
- Params: {"shoreSpread":1,"shoreOpen":2}
- Shocks: cull 70% bison at tick 240000 (year 200.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 606 | 0.35 | 0.0% | 0.0 | 2.16 | 28 | 31.3 (11 seeds) | 100% | 100% | 19.4 |
| wolf | 12/12 (100%) | 31 | 0.26 | 0.0% | 0.0 | 1.78 | 37 | 43.8 (11 seeds) | 100% | 100% | 44.4 |
| raven | 12/12 (100%) | 520 | 0.42 | 0.0% | 0.0 | 1.88 | 38 | 30.0 (11 seeds) | 100% | 100% | 31.9 |
| pronghorn | 12/12 (100%) | 371 | 0.28 | 0.0% | 0.0 | 2.15 | 41 | 25.0 (12 seeds) | 100% | 100% | 28.1 |
| rabbit | 12/12 (100%) | 584 | 0.32 | 0.0% | 0.0 | 2.17 | 45 | 50.0 (9 seeds) | 100% | 100% | 41.9 |
| cougar | 11/12 (92%) | 6 | 0.57 | 6.7% | 6.3 | 2.64 | 67 | 70.0 (7 seeds) | 100% | 100% | 28.8 |
| coyote | 12/12 (100%) | 62 | 0.35 | 0.0% | 0.0 | 2.16 | 59 | 20.0 (11 seeds) | 100% | 100% | 31.3 |
| prairiedog | 11/12 (92%) | 24 | 0.63 | 0.9% | 2.5 | 3.56 | 31 | 91.3 (3 seeds) | 100% | 92% | 65.0 |
| muledeer | 12/12 (100%) | 103 | 0.89 | 1.5% | 1.3 | 4.32 | 38 | 27.5 (6 seeds) | 100% | 100% | 21.3 |

Max bison generation depth reached: 237.8 (median across seeds 217.1).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.3 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3089.4 | 8221.6 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 93.3% | 22.2 | 28.8 | 9.4 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 98.4 | 1054.5 |
| prairiedog | 100.0% | 4.5 | 0.0 | 41.1 | 0.0 |
| muledeer | 100.0% | 0.0 | 0.0 | 59.4 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 14 | 2.8 | 117 | 123 | 20 | 17 | 1.5 |
| 2 | 22 | 4.4 | 106 | 114 | 24 | 22 | 0.8 |
| 3 | 12 | 2.4 | 95 | 99 | 24 | 18 | 0.6 |
| 4 | 6 | 1.2 | 111 | 124 | 30 | 21 | 0.5 |
| 5 | 31 | 6.2 | 160 | 163 | 21 | 19 | 1.9 |
| 6 | 20 | 4.0 | 108 | 110 | 23 | 21 | 1.1 |
| 7 | 17 | 3.4 | 87 | 93 | 30 | 26 | 0.8 |
| 8 | 38 | 7.6 | 108 | 121 | 24 | 25 | 1.8 |
| 9 | 27 | 5.4 | 96 | 104 | 23 | 22 | 1.8 |
| 10 | 29 | 5.8 | 129 | 149 | 19 | 18 | 1.6 |
| 11 | 28 | 5.6 | 106 | 122 | 24 | 17 | 1.0 |
| 12 | 30 | 6.0 | 107 | 116 | 22 | 22 | 1.4 |

Median plagues per 100 years across seeds: 4.9 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.35. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.30 at a lag of 0.5 years; 25% of seeds reach 0.4. Annual-mean best (median): 0.30.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.34 | 0.29 | 0.36 | 0.24 | 0.22 | 0.14 | 0.36 | 0.24 |
| 2 | 0.32 | 0.34 | 0.25 | 0.19 | 0.12 | -0.03 | 0.25 | 0.19 |
| 3 | 0.35 | 0.33 | 0.24 | 0.24 | 0.27 | 0.17 | 0.24 | 0.24 |
| 4 | 0.37 | 0.31 | 0.27 | 0.19 | 0.11 | -0.03 | 0.27 | 0.19 |
| 5 | 0.35 | 0.29 | 0.28 | 0.23 | 0.15 | 0.01 | 0.28 | 0.23 |
| 6 | 0.37 | 0.32 | 0.43 | 0.43 | 0.37 | 0.24 | 0.43 | 0.43 |
| 7 | 0.38 | 0.31 | 0.41 | 0.33 | 0.22 | 0.11 | 0.41 | 0.33 |
| 8 | 0.37 | 0.35 | 0.27 | 0.30 | 0.29 | 0.20 | 0.27 | 0.30 |
| 9 | 0.32 | 0.31 | 0.21 | 0.19 | 0.16 | 0.06 | 0.21 | 0.19 |
| 10 | 0.31 | 0.32 | 0.33 | 0.29 | 0.20 | 0.06 | 0.33 | 0.29 |
| 11 | 0.35 | 0.33 | 0.30 | 0.22 | 0.13 | 0.01 | 0.30 | 0.22 |
| 12 | 0.31 | 0.31 | 0.40 | 0.41 | 0.31 | 0.16 | 0.40 | 0.41 |

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
| 1 | 600000 | 212.8 | 631 / 0.45 / 0% | 30 / 0.31 / 0% | 539 / 0.42 / 0% | 337 / 0.28 / 0% | 574 / 0.29 / 0% | 6 / 0.57 / 8% | 60 / 0.34 / 0% | 31 / 0.56 / 1% | 168 / 0.62 / 0% | bison 63.8, wolf 30.0, raven 57.5, pronghorn 53.8, rabbit 55.0, cougar 16.3, coyote 20.0, prairiedog 65.0, muledeer 17.5 |
| 2 | 600000 | 237.8 | 655 / 0.42 / 0% | 27 / 0.34 / 0% | 530 / 0.44 / 0% | 369 / 0.27 / 0% | 549 / 0.34 / 0% | 6 / 0.57 / 7% | 70 / 0.32 / 0% | 14 / 0.64 / 2% | 158 / 0.64 / 0% | bison 10.0, wolf 11.3, raven 28.8, pronghorn 82.5, rabbit 46.3, cougar 90.0, coyote 86.3, prairiedog 58.8, muledeer 10.0 |
| 3 | 600000 | 214.0 | 571 / 0.35 / 0% | 33 / 0.26 / 0% | 531 / 0.40 / 0% | 371 / 0.29 / 0% | 568 / 0.33 / 0% | 7 / 0.48 / 3% | 54 / 0.35 / 0% | 14 / 1.40 / 16% | 159 / 0.60 / 1% | bison 23.8, wolf 27.5, raven 20.0, pronghorn 25.0, rabbit 47.5, cougar 15.0, coyote 45.0, prairiedog 82.5, muledeer 8.8 |
| 4 | 600000 | 218.6 | 603 / 0.35 / 0% | 31 / 0.27 / 0% | 510 / 0.42 / 0% | 408 / 0.29 / 0% | 488 / 0.31 / 0% | 7 / 0.56 / 8% | 68 / 0.37 / 0% | 11 / 1.43 / 21% | 81 / 1.05 / 4% | bison 50.0, wolf 115.0, raven 51.3, pronghorn 7.5, rabbit 45.0, cougar 63.8, coyote 136.3, prairiedog 65.0, muledeer 21.3 |
| 5 | 600000 | 215.4 | 652 / 0.41 / 0% | 30 / 0.34 / 1% | 502 / 0.42 / 0% | 369 / 0.28 / 0% | 608 / 0.29 / 0% | 6 / 0.57 / 7% | 66 / 0.35 / 0% | 40 / 0.54 / 0% | 216 / 0.56 / 1% | bison 17.5, wolf 66.3, raven 20.0, pronghorn 26.3, rabbit 32.5, cougar 67.5, coyote 86.3, prairiedog 30.0, muledeer 43.8 |
| 6 | 600000 | 208.8 | 534 / 0.37 / 0% | 29 / 0.26 / 0% | 452 / 0.43 / 0% | 436 / 0.31 / 0% | 594 / 0.32 / 0% | 6 / 0.52 / 5% | 54 / 0.37 / 1% | 14 / 0.41 / 0% | 54 / 1.20 / 2% | bison 13.8, wolf 43.8, raven 35.0, pronghorn 58.8, rabbit 50.0, cougar 21.3, coyote 11.3, prairiedog 17.5, muledeer 21.3 |
| 7 | 600000 | 220.3 | 658 / 0.29 / 0% | 33 / 0.26 / 0% | 554 / 0.33 / 0% | 384 / 0.25 / 0% | 512 / 0.31 / 0% | 7 / 0.51 / 2% | 65 / 0.38 / 1% | 11 / 0.63 / 1% | 86 / 1.15 / 2% | bison 7.5, wolf 223.8, raven 43.8, pronghorn 62.5, rabbit 198.8, cougar 36.3, coyote 15.0, prairiedog 12.5, muledeer 7.5 |
| 8 | 600000 | 220.1 | 610 / 0.33 / 0% | 30 / 0.23 / 0% | 534 / 0.36 / 0% | 356 / 0.30 / 0% | 626 / 0.35 / 0% | 6 / 0.63 / 8% | 54 / 0.37 / 1% | 42 / 0.63 / 0% | 118 / 0.74 / 4% | bison 8.8, wolf 8.8, raven 10.0, pronghorn 30.0, rabbit 36.3, cougar 18.8, coyote 15.0, prairiedog 105.0, muledeer 43.8 |
| 9 | 600000 | 215.7 | 515 / 0.32 / 0% | 33 / 0.21 / 0% | 476 / 0.40 / 0% | 335 / 0.27 / 0% | 631 / 0.31 / 0% | 8 / 0.48 / 1% | 57 / 0.32 / 0% | 43 / 0.47 / 0% | 144 / 0.60 / 1% | bison 21.3, wolf 58.8, raven 22.5, pronghorn 13.8, rabbit 38.8, cougar 96.3, coyote 10.0, prairiedog 72.5, muledeer 32.5 |
| 10 | 600000 | 219.9 | 541 / 0.36 / 0% | 33 / 0.24 / 0% | 485 / 0.42 / 0% | 371 / 0.25 / 0% | 596 / 0.32 / 0% | 7 / 0.57 / 7% | 58 / 0.31 / 0% | 39 / 0.95 / 11% EXTINCT@500.0yr | 50 / 1.29 / 1% | bison 15.0, wolf 45.0, raven 16.3, pronghorn 178.8, rabbit 17.5, cougar 51.3, coyote 48.8, prairiedog never, muledeer 245.0 |
| 11 | 600000 | 223.1 | 485 / 0.33 / 0% | 30 / 0.21 / 0% | 430 / 0.42 / 0% | 378 / 0.26 / 0% | 519 / 0.33 / 0% | 6 / 0.58 / 6% | 66 / 0.35 / 0% | 19 / 0.89 / 4% | 89 / 1.10 / 4% | bison 70.0, wolf 93.8, raven 42.5, pronghorn 7.5, rabbit 20.0, cougar 7.5, coyote 35.0, prairiedog 22.5, muledeer 23.8 |
| 12 | 600000 | 213.0 | 664 / 0.31 / 0% | 33 / 0.27 / 0% | 569 / 0.37 / 0% | 398 / 0.30 / 0% | 664 / 0.31 / 0% | 6 / 0.57 / 7% EXTINCT@500.0yr | 68 / 0.31 / 0% | 30 / 0.52 / 0% | 72 / 1.06 / 2% | bison 43.8, wolf 18.8, raven 38.8, pronghorn 12.5, rabbit 32.5, cougar 15.0, coyote 27.5, prairiedog 88.8, muledeer 16.3 |
