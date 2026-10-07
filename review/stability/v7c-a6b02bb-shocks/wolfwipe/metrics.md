# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit a6b02bb (frozen copy); real sim
- Params: {"raptors":1,"stormCells":1,"cougar.initial":6,"muledeer.initial":60,"herdSpacingGraze":1.6,"raptorDogPref":0.1}
- Shocks: wolves removed at tick 252000 (year 210.0); introduce 8 wolves at tick 360000 (year 300.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 779 | 0.47 | 0.0% | 0.0 | 3.93 | 54 | 8.8 (20 seeds) | 100% | 100% | 35.6 |
| wolf | 20/20 (100%) | 70 | 0.32 | 3.7% | 18.8 | 1.86 | 53 | 15.0 (11 seeds) | 100% | 75% | 60.0 |
| raven | 20/20 (100%) | 574 | 0.15 | 0.0% | 0.0 | 1.20 | 46 | 8.8 (20 seeds) | 50% | 100% | 6.3 |
| pronghorn | 20/20 (100%) | 416 | 0.46 | 0.0% | 0.0 | 3.98 | 59 | 8.8 (20 seeds) | 100% | 100% | 38.8 |
| rabbit | 20/20 (100%) | 774 | 0.34 | 0.0% | 0.0 | 2.06 | 49 | 72.5 (10 seeds) | 100% | 100% | 26.3 |
| cougar | 20/20 (100%) | 6 | 0.47 | 3.9% | 6.3 | 2.33 | 88 | 108.8 (9 seeds) | 100% | 100% | 41.3 |
| coyote | 20/20 (100%) | 48 | 0.40 | 0.2% | 1.3 | 2.46 | 80 | 20.0 (9 seeds) | 100% | 100% | 46.3 |
| prairiedog | 19/20 (95%) | 26 | 0.79 | 5.6% | 15.0 | 3.62 | 33 | 206.3 (7 seeds) | 95% | 90% | 55.0 |
| muledeer | 20/20 (100%) | 14 | 0.95 | 3.2% | 1.3 | 8.83 | 83 | 10.0 (6 seeds) | 100% | 100% | 66.3 |

Max bison generation depth reached: 405.3 (median across seeds 349.9).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 97.1% | 2.1 | 15.0 | 0.8 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3199.4 | 8329.6 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 96.1% | 14.5 | 20.0 | 6.6 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 97.6 | 812.4 |
| prairiedog | 99.6% | 2.9 | 1.9 | 21.2 | 0.0 |
| muledeer | 98.8% | 10.3 | 6.3 | 378.8 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 13 | 2.2 | 97 | 107 | 23 | 26 | 0.7 |
| 2 | 36 | 6.0 | 134 | 150 | 24 | 25 | 1.2 |
| 3 | 32 | 5.3 | 124 | 133 | 22 | 26 | 1.0 |
| 4 | 38 | 6.3 | 143 | 147 | 27 | 30 | 1.5 |
| 5 | 30 | 5.0 | 154 | 161 | 23 | 31 | 1.8 |
| 6 | 34 | 5.7 | 135 | 149 | 24 | 24 | 1.7 |
| 7 | 23 | 3.8 | 107 | 112 | 30 | 29 | 0.7 |
| 8 | 29 | 4.8 | 181 | 206 | 26 | 25 | 1.7 |
| 9 | 27 | 4.5 | 150 | 166 | 26 | 27 | 1.7 |
| 10 | 28 | 4.7 | 168 | 184 | 24 | 21 | 1.6 |
| 11 | 16 | 2.7 | 83 | 90 | 28 | 26 | 0.4 |
| 12 | 41 | 6.8 | 170 | 187 | 24 | 22 | 1.6 |
| 13 | 29 | 4.8 | 112 | 121 | 25 | 28 | 0.9 |
| 14 | 24 | 4.0 | 120 | 120 | 26 | 24 | 1.2 |
| 15 | 17 | 2.8 | 109 | 124 | 29 | 26 | 1.1 |
| 16 | 24 | 4.0 | 116 | 119 | 25 | 28 | 1.1 |
| 17 | 14 | 2.3 | 81 | 96 | 25 | 25 | 1.0 |
| 18 | 34 | 5.7 | 123 | 132 | 26 | 25 | 1.0 |
| 19 | 32 | 5.3 | 133 | 146 | 19 | 27 | 1.2 |
| 20 | 40 | 6.7 | 170 | 195 | 28 | 23 | 1.6 |

Median plagues per 100 years across seeds: 4.8 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.40. Hare CV: 0.34 (annual means 0.34).
- Best half-year-mean correlation (median): 0.12 at a lag of 1.0 years; 0% of seeds reach 0.4. Annual-mean best (median): 0.12.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.38 | 0.32 | 0.07 | 0.08 | 0.10 | 0.01 | 0.07 | 0.08 |
| 2 | 0.43 | 0.35 | -0.09 | -0.09 | -0.14 | -0.24 | -0.09 | -0.09 |
| 3 | 0.35 | 0.34 | 0.09 | 0.12 | 0.14 | 0.07 | 0.09 | 0.12 |
| 4 | 0.43 | 0.36 | 0.11 | 0.12 | 0.08 | 0.01 | 0.11 | 0.12 |
| 5 | 0.37 | 0.30 | 0.12 | 0.10 | 0.05 | -0.02 | 0.12 | 0.10 |
| 6 | 0.42 | 0.34 | 0.05 | 0.15 | 0.16 | 0.06 | 0.05 | 0.15 |
| 7 | 0.41 | 0.37 | 0.24 | 0.24 | 0.20 | 0.11 | 0.24 | 0.24 |
| 8 | 0.42 | 0.33 | 0.11 | 0.09 | 0.05 | -0.05 | 0.11 | 0.09 |
| 9 | 0.41 | 0.32 | 0.07 | 0.14 | 0.11 | -0.01 | 0.07 | 0.14 |
| 10 | 0.39 | 0.33 | 0.11 | 0.17 | 0.21 | 0.12 | 0.11 | 0.17 |
| 11 | 0.40 | 0.34 | 0.20 | 0.20 | 0.14 | 0.03 | 0.20 | 0.20 |
| 12 | 0.48 | 0.34 | -0.09 | -0.08 | -0.02 | -0.05 | -0.09 | -0.08 |
| 13 | 0.38 | 0.35 | 0.09 | 0.06 | 0.01 | -0.09 | 0.09 | 0.06 |
| 14 | 0.43 | 0.38 | 0.01 | 0.09 | 0.09 | 0.04 | 0.01 | 0.09 |
| 15 | 0.41 | 0.33 | 0.08 | 0.09 | 0.07 | -0.01 | 0.08 | 0.09 |
| 16 | 0.38 | 0.31 | 0.18 | 0.19 | 0.20 | 0.10 | 0.18 | 0.19 |
| 17 | 0.42 | 0.33 | 0.03 | 0.02 | 0.00 | -0.07 | 0.03 | 0.02 |
| 18 | 0.40 | 0.35 | 0.23 | 0.29 | 0.27 | 0.15 | 0.23 | 0.29 |
| 19 | 0.39 | 0.31 | 0.01 | -0.03 | -0.05 | -0.04 | 0.01 | -0.03 |
| 20 | 0.39 | 0.30 | 0.34 | 0.37 | 0.32 | 0.18 | 0.34 | 0.37 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | FAIL | PASS | PASS | FAIL | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 356.0 | 874 / 0.46 / 0% | 68 / 0.33 / 3% | 583 / 0.14 / 0% | 483 / 0.46 / 0% | 758 / 0.32 / 0% | 6 / 0.50 / 5% | 51 / 0.38 / 0% | 17 / 0.90 / 7% | 14 / 0.65 / 3% | bison 90.0, wolf 280.0, raven unaffected, pronghorn 41.3, rabbit 36.3, cougar 273.8, coyote 48.8, prairiedog 52.5, muledeer 58.8 |
| 2 | 720000 | 341.2 | 777 / 0.54 / 0% | 70 / 0.42 / 8% | 562 / 0.17 / 0% | 438 / 0.54 / 0% | 768 / 0.35 / 0% | 6 / 0.50 / 7% | 51 / 0.43 / 0% | 26 / 0.87 / 16% | 32 / 1.46 / 7% | bison 11.3, wolf 156.3, raven 12.5, pronghorn 110.0, rabbit 22.5, cougar 30.0, coyote 87.5, prairiedog 61.3, muledeer 43.8 |
| 3 | 720000 | 342.5 | 781 / 0.50 / 0% | 73 / 0.29 / 1% | 566 / 0.16 / 0% | 418 / 0.39 / 0% | 816 / 0.34 / 0% | 7 / 0.42 / 1% | 48 / 0.35 / 0% | 21 / 0.94 / 8% EXTINCT@592.5yr | 13 / 0.67 / 1% | bison 63.8, wolf 45.0, raven 243.8, pronghorn 62.5, rabbit 33.8, cougar 75.0, coyote 41.3, prairiedog 128.8, muledeer 13.8 |
| 4 | 720000 | 379.3 | 794 / 0.44 / 0% | 70 / 0.32 / 3% | 576 / 0.16 / 0% | 405 / 0.43 / 0% | 771 / 0.36 / 0% | 8 / 0.45 / 2% | 43 / 0.43 / 0% | 33 / 0.61 / 5% | 15 / 1.20 / 3% | bison 110.0, wolf 20.0, raven unaffected, pronghorn 70.0, rabbit 33.8, cougar 7.5, coyote 28.8, prairiedog 21.3, muledeer 111.3 |
| 5 | 720000 | 342.4 | 886 / 0.42 / 0% | 68 / 0.34 / 4% | 576 / 0.15 / 0% | 523 / 0.49 / 0% | 752 / 0.30 / 0% | 7 / 0.43 / 4% | 50 / 0.37 / 0% | 54 / 0.63 / 0% | 12 / 0.52 / 2% | bison 52.5, wolf never, raven 178.8, pronghorn 21.3, rabbit 23.8, cougar 10.0, coyote 12.5, prairiedog 23.8, muledeer 73.8 |
| 6 | 720000 | 355.1 | 745 / 0.46 / 0% | 72 / 0.32 / 4% | 576 / 0.15 / 0% | 377 / 0.52 / 0% | 808 / 0.34 / 0% | 6 / 0.44 / 3% | 45 / 0.42 / 0% | 34 / 0.80 / 0% | 11 / 0.78 / 5% | bison 66.3, wolf 26.3, raven 90.0, pronghorn 28.8, rabbit 18.8, cougar 40.0, coyote 28.8, prairiedog never, muledeer 143.8 |
| 7 | 720000 | 337.3 | 939 / 0.41 / 0% | 75 / 0.31 / 0% | 599 / 0.12 / 0% | 321 / 0.41 / 0% | 786 / 0.37 / 0% | 8 / 0.38 / 2% | 45 / 0.41 / 0% | 10 / 0.85 / 6% | 17 / 1.48 / 3% | bison 56.3, wolf never, raven unaffected, pronghorn 50.0, rabbit 63.8, cougar 10.0, coyote 38.8, prairiedog unaffected, muledeer 105.0 |
| 8 | 720000 | 351.0 | 718 / 0.50 / 0% | 69 / 0.38 / 6% | 556 / 0.18 / 0% | 432 / 0.46 / 0% | 777 / 0.33 / 0% | 6 / 0.55 / 7% | 51 / 0.42 / 0% | 34 / 0.54 / 3% | 14 / 1.12 / 4% | bison 11.3, wolf never, raven 65.0, pronghorn 132.5, rabbit 60.0, cougar 115.0, coyote 51.3, prairiedog 67.5, muledeer 38.8 |
| 9 | 720000 | 348.7 | 799 / 0.41 / 0% | 64 / 0.31 / 4% | 584 / 0.14 / 0% | 396 / 0.28 / 0% | 762 / 0.32 / 0% | 6 / 0.55 / 6% | 46 / 0.41 / 0% | 34 / 0.60 / 1% | 14 / 0.69 / 2% | bison 37.5, wolf 40.0, raven unaffected, pronghorn 7.5, rabbit 10.0, cougar 106.3, coyote 70.0, prairiedog 60.0, muledeer 21.3 |
| 10 | 720000 | 353.0 | 744 / 0.50 / 0% | 71 / 0.31 / 2% | 559 / 0.17 / 0% | 466 / 0.49 / 0% | 809 / 0.33 / 0% | 6 / 0.41 / 2% | 42 / 0.39 / 0% | 39 / 0.92 / 4% | 11 / 0.55 / 5% | bison 22.5, wolf 127.5, raven 257.5, pronghorn 15.0, rabbit 25.0, cougar 68.8, coyote 40.0, prairiedog never, muledeer 90.0 |
| 11 | 720000 | 354.9 | 708 / 0.48 / 0% | 69 / 0.33 / 3% | 557 / 0.18 / 0% | 402 / 0.41 / 0% | 719 / 0.34 / 0% | 5 / 0.51 / 7% | 47 / 0.40 / 0% | 6 / 0.95 / 19% | 14 / 1.22 / 5% | bison 33.8, wolf 142.5, raven 135.0, pronghorn 233.8, rabbit 52.5, cougar 42.5, coyote 43.8, prairiedog 57.5, muledeer 143.8 |
| 12 | 720000 | 345.1 | 974 / 0.44 / 0% | 83 / 0.35 / 5% | 591 / 0.13 / 0% | 431 / 0.48 / 0% | 846 / 0.34 / 0% | 8 / 0.43 / 3% | 47 / 0.48 / 0% | 39 / 0.56 / 1% | 12 / 0.55 / 3% | bison 48.8, wolf 141.3, raven 188.8, pronghorn 51.3, rabbit 92.5, cougar 7.5, coyote 98.8, prairiedog 130.0, muledeer 12.5 |
| 13 | 720000 | 343.4 | 747 / 0.56 / 0% | 70 / 0.40 / 5% | 548 / 0.18 / 0% | 411 / 0.51 / 0% | 786 / 0.35 / 0% | 6 / 0.48 / 5% | 47 / 0.38 / 0% | 19 / 0.93 / 18% | 25 / 1.63 / 5% | bison 26.3, wolf never, raven 180.0, pronghorn 33.8, rabbit 23.8, cougar 66.3, coyote 8.8, prairiedog 22.5, muledeer 73.8 |
| 14 | 720000 | 347.4 | 907 / 0.45 / 0% | 66 / 0.41 / 10% | 586 / 0.14 / 0% | 464 / 0.52 / 0% | 744 / 0.38 / 0% | 6 / 0.49 / 5% | 48 / 0.43 / 0% | 25 / 0.78 / 10% | 13 / 0.77 / 2% | bison 16.3, wolf 56.3, raven unaffected, pronghorn 36.3, rabbit 190.0, cougar 62.5, coyote 72.5, prairiedog 13.8, muledeer 38.8 |
| 15 | 720000 | 371.8 | 857 / 0.53 / 0% | 73 / 0.36 / 5% | 575 / 0.16 / 0% | 429 / 0.51 / 0% | 747 / 0.33 / 0% | 9 / 0.43 / 2% | 48 / 0.41 / 0% | 25 / 0.63 / 5% | 18 / 1.68 / 4% | bison 7.5, wolf 60.0, raven unaffected, pronghorn 31.3, rabbit 18.8, cougar 63.8, coyote 266.3, prairiedog 78.8, muledeer 23.8 |
| 16 | 720000 | 405.3 | 707 / 0.47 / 0% | 67 / 0.26 / 2% | 580 / 0.15 / 0% | 346 / 0.36 / 0% | 805 / 0.31 / 0% | 6 / 0.48 / 3% | 49 / 0.38 / 0% | 35 / 0.88 / 6% | 11 / 0.52 / 3% | bison 72.5, wolf 80.0, raven unaffected, pronghorn 163.8, rabbit 27.5, cougar 50.0, coyote 201.3, prairiedog 172.5, muledeer 53.8 |
| 17 | 720000 | 327.9 | 711 / 0.46 / 0% | 70 / 0.33 / 2% | 556 / 0.17 / 0% | 415 / 0.45 / 0% | 751 / 0.33 / 0% | 7 / 0.51 / 7% | 50 / 0.42 / 1% | 18 / 0.88 / 7% | 28 / 1.52 / 3% | bison 23.8, wolf never, raven 276.3, pronghorn 26.3, rabbit 86.3, cougar 20.0, coyote 42.5, prairiedog 36.3, muledeer 102.5 |
| 18 | 720000 | 334.2 | 729 / 0.44 / 0% | 75 / 0.28 / 0% | 558 / 0.17 / 0% | 437 / 0.41 / 0% | 723 / 0.35 / 0% | 7 / 0.40 / 2% | 46 / 0.40 / 0% | 20 / 0.68 / 0% | 19 / 1.80 / 2% | bison 13.8, wolf 16.3, raven unaffected, pronghorn 193.8, rabbit 25.0, cougar 40.0, coyote 31.3, prairiedog 95.0, muledeer 233.8 |
| 19 | 720000 | 366.4 | 740 / 0.47 / 0% | 69 / 0.32 / 4% | 572 / 0.15 / 0% | 405 / 0.47 / 0% | 805 / 0.31 / 0% | 7 / 0.50 / 4% | 52 / 0.39 / 0% | 26 / 0.66 / 7% | 12 / 0.59 / 3% | bison 41.3, wolf 21.3, raven unaffected, pronghorn 17.5, rabbit 20.0, cougar 32.5, coyote 170.0, prairiedog 8.8, muledeer 198.8 |
| 20 | 720000 | 363.9 | 783 / 0.51 / 0% | 74 / 0.29 / 1% | 573 / 0.15 / 0% | 345 / 0.41 / 0% | 849 / 0.30 / 0% | 6 / 0.46 / 4% | 51 / 0.39 / 0% | 37 / 0.60 / 1% | 15 / 1.17 / 2% | bison 32.5, wolf 195.0, raven unaffected, pronghorn 18.8, rabbit 11.3, cougar 28.8, coyote 67.5, prairiedog 18.8, muledeer 33.8 |
