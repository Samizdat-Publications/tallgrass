# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit a6b02bb (frozen copy); real sim
- Params: {"raptors":1,"stormCells":1,"cougar.initial":6,"muledeer.initial":60,"herdSpacingGraze":1.6,"raptorDogPref":0.1}
- Shocks: drought (2 yr) at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 701 | 0.46 | 0.0% | 0.0 | 2.81 | 57 | 8.8 (20 seeds) | 100% | 100% | 21.3 |
| wolf | 20/20 (100%) | 73 | 0.25 | 0.0% | 0.0 | 1.77 | 56 | 8.8 (20 seeds) | 100% | 90% | 55.0 |
| raven | 20/20 (100%) | 561 | 0.17 | 0.0% | 0.0 | 1.22 | 48 | 8.8 (20 seeds) | 80% | 100% | 16.3 |
| pronghorn | 20/20 (100%) | 371 | 0.38 | 0.0% | 0.0 | 2.85 | 61 | 8.8 (20 seeds) | 95% | 100% | 23.8 |
| rabbit | 20/20 (100%) | 781 | 0.30 | 0.0% | 0.0 | 1.92 | 50 | 105.0 (11 seeds) | 100% | 100% | 33.8 |
| cougar | 19/20 (95%) | 7 | 0.43 | 2.3% | 5.0 | 2.27 | 86 | 76.9 (8 seeds) | 100% | 100% | 19.4 |
| coyote | 20/20 (100%) | 48 | 0.38 | 0.2% | 1.3 | 2.30 | 78 | 38.1 (16 seeds) | 100% | 100% | 47.5 |
| prairiedog | 20/20 (100%) | 35 | 0.67 | 0.2% | 1.3 | 3.20 | 34 | 93.1 (10 seeds) | 100% | 90% | 40.6 |
| muledeer | 20/20 (100%) | 12 | 0.55 | 2.9% | 1.3 | 4.29 | 92 | 10.0 (11 seeds) | 100% | 100% | 80.6 |

Max bison generation depth reached: 423.7 (median across seeds 354.8).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3635.9 | 6359.4 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 97.7% | 9.5 | 11.9 | 5.6 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 98.1 | 797.6 |
| prairiedog | 100.0% | 2.0 | 0.0 | 18.8 | 0.0 |
| muledeer | 98.9% | 10.6 | 5.6 | 396.6 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 17 | 2.8 | 127 | 132 | 20 | 17 | 1.1 |
| 2 | 36 | 6.0 | 144 | 155 | 23 | 23 | 1.6 |
| 3 | 50 | 8.3 | 189 | 207 | 18 | 22 | 1.6 |
| 4 | 53 | 8.8 | 186 | 199 | 27 | 25 | 2.2 |
| 5 | 28 | 4.7 | 176 | 189 | 28 | 30 | 1.4 |
| 6 | 40 | 6.7 | 135 | 154 | 22 | 25 | 1.6 |
| 7 | 38 | 6.3 | 160 | 177 | 25 | 29 | 1.6 |
| 8 | 23 | 3.8 | 143 | 158 | 26 | 28 | 0.8 |
| 9 | 48 | 8.0 | 190 | 219 | 24 | 22 | 2.0 |
| 10 | 29 | 4.8 | 194 | 214 | 25 | 24 | 2.1 |
| 11 | 18 | 3.0 | 122 | 139 | 29 | 28 | 1.1 |
| 12 | 31 | 5.2 | 161 | 168 | 22 | 26 | 1.5 |
| 13 | 15 | 2.5 | 72 | 76 | 29 | 32 | 0.4 |
| 14 | 31 | 5.2 | 127 | 143 | 22 | 25 | 1.6 |
| 15 | 17 | 2.8 | 106 | 119 | 23 | 23 | 0.8 |
| 16 | 23 | 3.8 | 128 | 131 | 24 | 29 | 0.9 |
| 17 | 31 | 5.2 | 132 | 142 | 29 | 26 | 1.7 |
| 18 | 35 | 5.8 | 105 | 120 | 23 | 23 | 1.3 |
| 19 | 32 | 5.3 | 154 | 167 | 22 | 27 | 1.4 |
| 20 | 48 | 8.0 | 238 | 251 | 23 | 19 | 2.4 |

Median plagues per 100 years across seeds: 5.2 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.38. Hare CV: 0.30 (annual means 0.30).
- Best half-year-mean correlation (median): 0.34 at a lag of 1.0 years; 10% of seeds reach 0.4. Annual-mean best (median): 0.34.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.37 | 0.28 | 0.31 | 0.25 | 0.26 | 0.21 | 0.31 | 0.25 |
| 2 | 0.38 | 0.28 | 0.30 | 0.32 | 0.25 | 0.06 | 0.30 | 0.32 |
| 3 | 0.38 | 0.30 | 0.24 | 0.27 | 0.24 | 0.15 | 0.24 | 0.27 |
| 4 | 0.39 | 0.33 | 0.18 | 0.27 | 0.32 | 0.21 | 0.18 | 0.27 |
| 5 | 0.38 | 0.31 | 0.27 | 0.24 | 0.20 | 0.11 | 0.27 | 0.24 |
| 6 | 0.39 | 0.32 | 0.27 | 0.32 | 0.34 | 0.20 | 0.27 | 0.32 |
| 7 | 0.38 | 0.34 | 0.16 | 0.19 | 0.19 | 0.15 | 0.16 | 0.19 |
| 8 | 0.35 | 0.32 | 0.39 | 0.36 | 0.28 | 0.16 | 0.39 | 0.36 |
| 9 | 0.35 | 0.27 | 0.29 | 0.33 | 0.29 | 0.14 | 0.29 | 0.33 |
| 10 | 0.37 | 0.29 | 0.31 | 0.36 | 0.31 | 0.14 | 0.31 | 0.36 |
| 11 | 0.37 | 0.32 | 0.40 | 0.40 | 0.33 | 0.25 | 0.40 | 0.40 |
| 12 | 0.41 | 0.32 | 0.20 | 0.27 | 0.30 | 0.19 | 0.20 | 0.27 |
| 13 | 0.37 | 0.31 | 0.45 | 0.43 | 0.34 | 0.18 | 0.45 | 0.43 |
| 14 | 0.40 | 0.32 | 0.35 | 0.40 | 0.38 | 0.25 | 0.35 | 0.40 |
| 15 | 0.41 | 0.29 | 0.33 | 0.35 | 0.30 | 0.21 | 0.33 | 0.35 |
| 16 | 0.41 | 0.30 | 0.37 | 0.38 | 0.30 | 0.08 | 0.37 | 0.38 |
| 17 | 0.36 | 0.30 | 0.39 | 0.39 | 0.32 | 0.18 | 0.39 | 0.39 |
| 18 | 0.40 | 0.33 | 0.33 | 0.38 | 0.34 | 0.23 | 0.33 | 0.38 |
| 19 | 0.36 | 0.29 | 0.20 | 0.26 | 0.23 | 0.05 | 0.20 | 0.26 |
| 20 | 0.32 | 0.29 | 0.34 | 0.35 | 0.32 | 0.18 | 0.34 | 0.35 |

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
| 1 | 720000 | 369.9 | 686 / 0.45 / 0% | 76 / 0.26 / 0% | 564 / 0.17 / 0% | 388 / 0.41 / 0% | 794 / 0.28 / 0% | 6 / 0.44 / 2% | 52 / 0.37 / 0% | 17 / 0.64 / 0% | 12 / 0.50 / 2% | bison 20.0, wolf never, raven 17.5, pronghorn 18.8, rabbit 8.8, cougar 17.5, coyote 45.0, prairiedog 35.0, muledeer 93.8 |
| 2 | 720000 | 362.5 | 718 / 0.50 / 0% | 72 / 0.25 / 0% | 561 / 0.17 / 0% | 342 / 0.34 / 0% | 773 / 0.28 / 0% | 8 / 0.37 / 1% | 48 / 0.38 / 0% | 37 / 0.63 / 0% | 27 / 1.59 / 6% | bison 63.8, wolf 110.0, raven 171.3, pronghorn 31.3, rabbit 13.8, cougar 122.5, coyote 53.8, prairiedog 102.5, muledeer 35.0 |
| 3 | 720000 | 355.4 | 753 / 0.51 / 0% | 79 / 0.27 / 0% | 561 / 0.17 / 0% | 368 / 0.35 / 0% | 893 / 0.30 / 0% | 7 / 0.43 / 2% | 44 / 0.38 / 0% | 52 / 0.53 / 0% | 11 / 0.51 / 4% | bison 53.8, wolf 55.0, raven 337.5, pronghorn 138.8, rabbit 106.3, cougar 8.8, coyote 42.5, prairiedog 10.0, muledeer 140.0 |
| 4 | 720000 | 359.0 | 805 / 0.44 / 0% | 78 / 0.25 / 0% | 578 / 0.16 / 0% | 379 / 0.38 / 0% | 848 / 0.33 / 0% | 7 / 0.45 / 2% | 36 / 0.39 / 0% | 49 / 0.50 / 0% | 12 / 0.54 / 2% | bison 7.5, wolf 200.0, raven 8.8, pronghorn 120.0, rabbit 36.3, cougar 12.5, coyote 77.5, prairiedog 56.3, muledeer 253.8 |
| 5 | 720000 | 337.5 | 735 / 0.47 / 0% | 69 / 0.24 / 0% | 560 / 0.18 / 0% | 421 / 0.41 / 0% | 738 / 0.31 / 0% | 7 / 0.43 / 3% | 53 / 0.38 / 0% | 36 / 0.75 / 0% | 12 / 0.52 / 2% | bison 11.3, wolf 130.0, raven 12.5, pronghorn 13.8, rabbit 13.8, cougar 12.5, coyote 25.0, prairiedog 113.8, muledeer 13.8 |
| 6 | 720000 | 336.7 | 667 / 0.46 / 0% | 72 / 0.23 / 0% | 561 / 0.16 / 0% | 350 / 0.36 / 0% | 795 / 0.32 / 0% | 7 / 0.42 / 1% | 43 / 0.39 / 1% | 30 / 0.92 / 0% | 10 / 0.60 / 4% | bison 43.8, wolf 130.0, raven unaffected, pronghorn 13.8, rabbit 13.8, cougar 27.5, coyote 10.0, prairiedog never, muledeer 47.5 |
| 7 | 720000 | 355.0 | 985 / 0.39 / 0% | 76 / 0.27 / 0% | 604 / 0.12 / 0% | 349 / 0.34 / 0% | 794 / 0.34 / 0% | 8 / 0.38 / 2% | 43 / 0.38 / 0% | 39 / 0.87 / 7% | 17 / 1.52 / 3% | bison 10.0, wolf never, raven 107.5, pronghorn 47.5, rabbit 83.8, cougar 13.8, coyote 103.8, prairiedog never, muledeer 53.8 |
| 8 | 720000 | 346.4 | 684 / 0.44 / 0% | 68 / 0.27 / 0% | 557 / 0.17 / 0% | 368 / 0.38 / 0% | 759 / 0.32 / 0% | 7 / 0.41 / 1% | 50 / 0.35 / 0% | 13 / 1.05 / 10% | 13 / 1.00 / 2% | bison 108.8, wolf 35.0, raven unaffected, pronghorn 92.5, rabbit 57.5, cougar 17.5, coyote 156.3, prairiedog 176.3, muledeer 28.8 |
| 9 | 720000 | 334.0 | 667 / 0.48 / 0% | 76 / 0.25 / 0% | 557 / 0.17 / 0% | 381 / 0.38 / 0% | 931 / 0.27 / 0% | 6 / 0.43 / 2% | 37 / 0.35 / 0% | 81 / 0.44 / 0% | 11 / 0.53 / 3% | bison 258.8, wolf 30.0, raven 260.0, pronghorn 7.5, rabbit 32.5, cougar 13.8, coyote 132.5, prairiedog 33.8, muledeer 67.5 |
| 10 | 720000 | 360.3 | 632 / 0.46 / 0% | 78 / 0.28 / 0% | 552 / 0.18 / 0% | 379 / 0.42 / 0% | 805 / 0.29 / 0% | 6 / 0.54 / 7% EXTINCT@598.8yr | 45 / 0.37 / 0% | 52 / 0.78 / 10% | 10 / 0.53 / 3% | bison 13.8, wolf 55.0, raven 15.0, pronghorn 8.8, rabbit 15.0, cougar 101.3, coyote 50.0, prairiedog 12.5, muledeer 53.8 |
| 11 | 720000 | 354.6 | 707 / 0.46 / 0% | 71 / 0.27 / 0% | 557 / 0.18 / 0% | 320 / 0.38 / 0% | 727 / 0.32 / 0% | 6 / 0.51 / 4% | 51 / 0.37 / 0% | 23 / 0.86 / 4% | 10 / 0.56 / 5% | bison 58.8, wolf 60.0, raven unaffected, pronghorn 152.5, rabbit 46.3, cougar 46.3, coyote 36.3, prairiedog 12.5, muledeer 188.8 |
| 12 | 720000 | 355.0 | 957 / 0.39 / 0% | 81 / 0.23 / 0% | 596 / 0.13 / 0% | 366 / 0.33 / 0% | 810 / 0.32 / 0% | 8 / 0.37 / 0% | 52 / 0.41 / 1% | 45 / 0.48 / 0% | 11 / 0.49 / 2% | bison 15.0, wolf 182.5, raven 16.3, pronghorn 31.3, rabbit 21.3, cougar 53.8, coyote 45.0, prairiedog 15.0, muledeer 232.5 |
| 13 | 720000 | 353.2 | 693 / 0.47 / 1% | 60 / 0.24 / 0% | 549 / 0.18 / 0% | 405 / 0.40 / 0% | 701 / 0.31 / 0% | 6 / 0.48 / 4% | 45 / 0.37 / 1% | 8 / 0.84 / 8% | 23 / 1.72 / 6% | bison 16.3, wolf 15.0, raven 18.8, pronghorn 8.8, rabbit 35.0, cougar 21.3, coyote 58.8, prairiedog 50.0, muledeer 132.5 |
| 14 | 720000 | 327.7 | 833 / 0.45 / 0% | 78 / 0.24 / 0% | 577 / 0.16 / 0% | 385 / 0.40 / 0% | 789 / 0.32 / 0% | 7 / 0.46 / 4% | 44 / 0.40 / 1% | 38 / 0.64 / 1% | 11 / 0.50 / 2% | bison 31.3, wolf 13.8, raven 16.3, pronghorn 28.8, rabbit 11.3, cougar 35.0, coyote 17.5, prairiedog 33.8, muledeer 207.5 |
| 15 | 720000 | 365.6 | 740 / 0.46 / 0% | 75 / 0.24 / 0% | 572 / 0.16 / 0% | 386 / 0.41 / 0% | 764 / 0.29 / 0% | 8 / 0.39 / 1% | 49 / 0.41 / 0% | 17 / 0.79 / 10% | 18 / 1.69 / 6% | bison 10.0, wolf 115.0, raven 326.3, pronghorn 8.8, rabbit 41.3, cougar 71.3, coyote 23.8, prairiedog 15.0, muledeer 107.5 |
| 16 | 720000 | 423.7 | 641 / 0.39 / 0% | 71 / 0.22 / 0% | 568 / 0.16 / 0% | 360 / 0.30 / 0% | 742 / 0.30 / 0% | 7 / 0.46 / 3% | 51 / 0.41 / 0% | 16 / 0.67 / 1% | 11 / 0.48 / 3% | bison 15.0, wolf 13.8, raven 15.0, pronghorn 206.3, rabbit 30.0, cougar 67.5, coyote 86.3, prairiedog 32.5, muledeer 15.0 |
| 17 | 720000 | 341.4 | 709 / 0.46 / 0% | 62 / 0.25 / 0% | 554 / 0.18 / 0% | 409 / 0.35 / 0% | 720 / 0.30 / 0% | 7 / 0.45 / 3% | 57 / 0.36 / 0% | 34 / 0.52 / 0% | 27 / 1.54 / 3% | bison 22.5, wolf 91.3, raven 17.5, pronghorn 18.8, rabbit 36.3, cougar 15.0, coyote 127.5, prairiedog 133.8, muledeer 35.0 |
| 18 | 720000 | 341.1 | 562 / 0.47 / 0% | 73 / 0.22 / 0% | 543 / 0.19 / 0% | 374 / 0.37 / 0% | 764 / 0.33 / 0% | 7 / 0.37 / 1% | 42 / 0.40 / 1% | 28 / 0.67 / 2% | 17 / 1.97 / 3% | bison 61.3, wolf 55.0, raven unaffected, pronghorn 102.5, rabbit 85.0, cougar 63.8, coyote 42.5, prairiedog 46.3, muledeer 148.8 |
| 19 | 720000 | 370.3 | 696 / 0.43 / 0% | 72 / 0.24 / 0% | 568 / 0.16 / 0% | 357 / 0.35 / 0% | 745 / 0.29 / 0% | 8 / 0.43 / 3% | 55 / 0.36 / 0% | 23 / 0.70 / 0% | 11 / 0.54 / 5% | bison 11.3, wolf 10.0, raven 12.5, pronghorn 8.8, rabbit 7.5, cougar 15.0, coyote 41.3, prairiedog 282.5, muledeer 163.8 |
| 20 | 720000 | 349.6 | 615 / 0.43 / 0% | 73 / 0.23 / 0% | 562 / 0.16 / 0% | 327 / 0.32 / 0% | 870 / 0.29 / 0% | 6 / 0.44 / 2% | 48 / 0.32 / 0% | 49 / 0.49 / 0% | 12 / 0.61 / 3% | bison 53.8, wolf 8.8, raven 283.8, pronghorn unaffected, rabbit 57.5, cougar 8.8, coyote 181.3, prairiedog 86.3, muledeer 35.0 |
