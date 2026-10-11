# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 12 (1..12)
- Run length: 600000 ticks (500 years)
- Sampled every 1500 ticks; commit f219729 (frozen copy); real sim
- Params: {"shoreSpread":1,"shoreOpen":2}
- Shocks: wolves removed at tick 210000 (year 175.0); introduce 8 wolves at tick 300000 (year 250.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 12/12 (100%) | 610 | 0.43 | 0.0% | 0.0 | 3.33 | 27 | 26.3 (12 seeds) | 100% | 100% | 40.6 |
| wolf | 12/12 (100%) | 30 | 0.33 | 2.8% | 11.3 | 1.83 | 38 | 50.0 (7 seeds) | 92% | 100% | 25.6 |
| raven | 12/12 (100%) | 515 | 0.42 | 0.0% | 0.0 | 1.94 | 38 | 27.5 (12 seeds) | 100% | 100% | 47.5 |
| pronghorn | 12/12 (100%) | 373 | 0.29 | 0.0% | 0.0 | 2.05 | 41 | 22.5 (12 seeds) | 100% | 100% | 26.3 |
| rabbit | 12/12 (100%) | 544 | 0.32 | 0.0% | 0.0 | 2.15 | 46 | 22.5 (6 seeds) | 100% | 92% | 26.3 |
| cougar | 11/12 (92%) | 7 | 0.56 | 5.4% | 6.3 | 2.67 | 69 | 91.3 (9 seeds) | 100% | 100% | 26.9 |
| coyote | 12/12 (100%) | 62 | 0.34 | 0.0% | 0.0 | 1.98 | 56 | 25.0 (8 seeds) | 100% | 92% | 35.0 |
| prairiedog | 11/12 (92%) | 21 | 0.70 | 2.6% | 4.4 | 3.75 | 34 | 55.0 (3 seeds) | 100% | 83% | 30.6 |
| muledeer | 12/12 (100%) | 116 | 0.79 | 2.1% | 1.9 | 4.26 | 36 | 30.6 (8 seeds) | 100% | 75% | 31.3 |

Max bison generation depth reached: 231.3 (median across seeds 218.6).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 97.4% | 3.1 | 11.3 | 1.2 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3017.0 | 8398.3 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 94.6% | 23.7 | 23.1 | 10.4 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 99.9 | 1048.9 |
| prairiedog | 99.1% | 8.0 | 3.8 | 49.2 | 0.0 |
| muledeer | 100.0% | 0.0 | 0.0 | 53.6 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 16 | 3.2 | 105 | 114 | 23 | 24 | 0.9 |
| 2 | 19 | 3.8 | 68 | 78 | 22 | 22 | 0.7 |
| 3 | 5 | 1.0 | 73 | 79 | 22 | 17 | 0.4 |
| 4 | 13 | 2.6 | 108 | 121 | 28 | 17 | 0.7 |
| 5 | 28 | 5.6 | 170 | 172 | 23 | 18 | 1.6 |
| 6 | 25 | 5.0 | 80 | 86 | 22 | 20 | 0.8 |
| 7 | 30 | 6.0 | 145 | 151 | 30 | 26 | 1.5 |
| 8 | 29 | 5.8 | 125 | 143 | 21 | 26 | 1.5 |
| 9 | 20 | 4.0 | 92 | 104 | 21 | 24 | 0.8 |
| 10 | 37 | 7.4 | 123 | 140 | 20 | 16 | 1.8 |
| 11 | 23 | 4.6 | 100 | 114 | 24 | 19 | 0.8 |
| 12 | 34 | 6.8 | 139 | 149 | 23 | 21 | 1.4 |

Median plagues per 100 years across seeds: 4.8 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 12 seeds): 0.34. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.30 at a lag of 0.5 years; 0% of seeds reach 0.4. Annual-mean best (median): 0.30.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.33 | 0.32 | 0.07 | -0.00 | 0.06 | 0.04 | 0.07 | -0.00 |
| 2 | 0.31 | 0.31 | 0.32 | 0.22 | 0.16 | -0.00 | 0.32 | 0.22 |
| 3 | 0.37 | 0.30 | 0.34 | 0.25 | 0.23 | 0.12 | 0.34 | 0.25 |
| 4 | 0.38 | 0.30 | 0.27 | 0.18 | 0.09 | -0.00 | 0.27 | 0.18 |
| 5 | 0.33 | 0.31 | 0.28 | 0.22 | 0.13 | 0.04 | 0.28 | 0.22 |
| 6 | 0.34 | 0.34 | 0.34 | 0.36 | 0.33 | 0.22 | 0.34 | 0.36 |
| 7 | 0.35 | 0.33 | 0.38 | 0.30 | 0.21 | 0.11 | 0.38 | 0.30 |
| 8 | 0.38 | 0.37 | 0.27 | 0.30 | 0.28 | 0.15 | 0.27 | 0.30 |
| 9 | 0.35 | 0.36 | 0.02 | -0.06 | -0.10 | -0.20 | 0.02 | -0.06 |
| 10 | 0.28 | 0.29 | 0.22 | 0.20 | 0.13 | 0.01 | 0.22 | 0.20 |
| 11 | 0.36 | 0.33 | 0.30 | 0.29 | 0.20 | 0.10 | 0.30 | 0.29 |
| 12 | 0.30 | 0.32 | 0.39 | 0.36 | 0.29 | 0.14 | 0.39 | 0.36 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | PASS | FAIL | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 600000 | 226.7 | 626 / 0.42 / 0% | 30 / 0.34 / 2% | 542 / 0.42 / 0% | 344 / 0.29 / 0% | 546 / 0.32 / 0% | 5 / 0.58 / 9% | 63 / 0.33 / 0% | 19 / 0.71 / 6% | 179 / 0.59 / 1% | bison 158.8, wolf 40.0, raven 7.5, pronghorn 82.5, rabbit 27.5, cougar 10.0, coyote never, prairiedog 15.0, muledeer 31.3 |
| 2 | 600000 | 215.1 | 644 / 0.41 / 0% | 30 / 0.33 / 2% | 538 / 0.40 / 0% | 349 / 0.30 / 0% | 540 / 0.31 / 0% | 8 / 0.46 / 4% | 70 / 0.31 / 0% | 13 / 0.67 / 8% | 157 / 0.64 / 0% | bison 92.5, wolf unaffected, raven 85.0, pronghorn 18.8, rabbit 32.5, cougar 28.8, coyote 35.0, prairiedog 53.8, muledeer 92.5 |
| 3 | 600000 | 221.1 | 613 / 0.43 / 0% | 31 / 0.33 / 4% | 526 / 0.41 / 0% | 374 / 0.28 / 0% | 528 / 0.30 / 0% | 7 / 0.61 / 7% | 62 / 0.37 / 0% | 9 / 0.85 / 5% | 177 / 0.55 / 0% | bison 43.8, wolf 22.5, raven 47.5, pronghorn 20.0, rabbit 65.0, cougar 28.8, coyote 42.5, prairiedog 47.5, muledeer 10.0 |
| 4 | 600000 | 222.2 | 613 / 0.48 / 0% | 30 / 0.46 / 10% | 488 / 0.44 / 0% | 415 / 0.30 / 0% | 525 / 0.30 / 0% | 5 / 0.72 / 13% | 64 / 0.38 / 0% | 15 / 1.05 / 4% | 76 / 1.20 / 2% | bison 62.5, wolf 25.0, raven 65.0, pronghorn 22.5, rabbit 26.3, cougar 21.3, coyote 26.3, prairiedog 25.0, muledeer never |
| 5 | 600000 | 231.3 | 599 / 0.43 / 0% | 29 / 0.45 / 6% | 475 / 0.44 / 0% | 395 / 0.26 / 0% | 608 / 0.31 / 0% | 7 / 0.53 / 3% | 62 / 0.33 / 0% | 30 / 0.50 / 0% | 151 / 0.70 / 3% | bison 156.3, wolf 26.3, raven 90.0, pronghorn 30.0, rabbit 16.3, cougar 25.0, coyote 76.3, prairiedog 21.3, muledeer 55.0 |
| 6 | 600000 | 213.0 | 544 / 0.43 / 0% | 29 / 0.34 / 4% | 462 / 0.43 / 0% | 398 / 0.26 / 0% | 600 / 0.34 / 0% | 6 / 0.58 / 6% | 54 / 0.34 / 1% | 15 / 0.67 / 0% | 88 / 0.86 / 1% | bison 37.5, wolf 156.3, raven 13.8, pronghorn 37.5, rabbit 45.0, cougar 20.0, coyote 26.3, prairiedog 136.3, muledeer 18.8 |
| 7 | 600000 | 212.9 | 673 / 0.38 / 0% | 33 / 0.32 / 2% | 557 / 0.35 / 0% | 369 / 0.25 / 0% | 543 / 0.33 / 0% | 8 / 0.54 / 4% | 65 / 0.35 / 1% | 24 / 0.66 / 0% | 113 / 0.94 / 9% | bison 30.0, wolf 82.5, raven 47.5, pronghorn 13.8, rabbit never, cougar 76.3, coyote 71.3, prairiedog 30.0, muledeer 11.3 |
| 8 | 600000 | 213.8 | 607 / 0.45 / 0% | 31 / 0.25 / 1% | 512 / 0.37 / 0% | 372 / 0.33 / 0% | 628 / 0.37 / 0% | 8 / 0.54 / 5% | 50 / 0.38 / 0% | 38 / 0.72 / 1% | 119 / 0.73 / 6% | bison 16.3, wolf 22.5, raven 60.0, pronghorn 38.8, rabbit 21.3, cougar 42.5, coyote 92.5, prairiedog 11.3, muledeer never |
| 9 | 600000 | 217.8 | 587 / 0.37 / 0% | 28 / 0.31 / 0% | 518 / 0.42 / 0% | 356 / 0.29 / 0% | 538 / 0.36 / 0% | 7 / 0.51 / 4% | 64 / 0.35 / 0% | 23 / 1.23 / 28% | 172 / 0.53 / 1% | bison 11.3, wolf 10.0, raven 41.3, pronghorn 7.5, rabbit 15.0, cougar 10.0, coyote 25.0, prairiedog never, muledeer 18.8 |
| 10 | 600000 | 221.7 | 604 / 0.55 / 0% | 31 / 0.33 / 3% | 488 / 0.45 / 0% | 392 / 0.30 / 0% | 618 / 0.29 / 0% | 5 / 0.61 / 8% | 59 / 0.28 / 0% | 49 / 0.69 / 0% | 99 / 1.21 / 4% | bison 18.8, wolf 12.5, raven 45.0, pronghorn 7.5, rabbit 41.3, cougar 43.8, coyote 92.5, prairiedog never, muledeer 32.5 |
| 11 | 600000 | 216.5 | 592 / 0.45 / 0% | 26 / 0.42 / 7% | 460 / 0.44 / 0% | 424 / 0.32 / 0% | 495 / 0.33 / 0% | 5 / 0.64 / 8% EXTINCT@500.0yr | 61 / 0.36 / 1% | 15 / 1.14 / 14% EXTINCT@495.0yr | 94 / 1.17 / 6% | bison 52.5, wolf 42.5, raven 55.0, pronghorn 40.0, rabbit 25.0, cougar 17.5, coyote 25.0, prairiedog 160.0, muledeer 33.8 |
| 12 | 600000 | 219.3 | 638 / 0.30 / 0% | 38 / 0.25 / 0% | 549 / 0.36 / 0% | 359 / 0.27 / 0% | 659 / 0.32 / 0% | 7 / 0.47 / 4% | 64 / 0.30 / 0% | 29 / 0.56 / 0% | 66 / 1.17 / 2% | bison 37.5, wolf 37.5, raven 40.0, pronghorn 45.0, rabbit 11.3, cougar 61.3, coyote 15.0, prairiedog 31.3, muledeer never |
