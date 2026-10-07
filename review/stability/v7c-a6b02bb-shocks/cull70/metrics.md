# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit a6b02bb (frozen copy); real sim
- Params: {"raptors":1,"stormCells":1,"cougar.initial":6,"muledeer.initial":60,"herdSpacingGraze":1.6,"raptorDogPref":0.1}
- Shocks: cull 70% bison at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 694 | 0.45 | 0.0% | 0.0 | 2.77 | 56 | 8.8 (20 seeds) | 100% | 100% | 30.6 |
| wolf | 20/20 (100%) | 74 | 0.24 | 0.0% | 0.0 | 1.74 | 56 | 8.8 (20 seeds) | 95% | 95% | 51.3 |
| raven | 20/20 (100%) | 558 | 0.18 | 0.0% | 0.0 | 1.23 | 48 | 8.8 (20 seeds) | 65% | 95% | 8.8 |
| pronghorn | 20/20 (100%) | 385 | 0.38 | 0.0% | 0.0 | 2.88 | 60 | 8.8 (20 seeds) | 100% | 100% | 31.3 |
| rabbit | 20/20 (100%) | 774 | 0.32 | 0.0% | 0.0 | 1.93 | 51 | 56.3 (13 seeds) | 100% | 100% | 36.9 |
| cougar | 20/20 (100%) | 7 | 0.47 | 3.1% | 5.0 | 2.29 | 88 | 82.5 (8 seeds) | 100% | 100% | 43.1 |
| coyote | 20/20 (100%) | 49 | 0.37 | 0.0% | 0.0 | 2.24 | 78 | 25.0 (16 seeds) | 100% | 100% | 27.5 |
| prairiedog | 19/20 (95%) | 33 | 0.63 | 1.1% | 4.4 | 3.34 | 35 | 171.3 (9 seeds) | 100% | 100% | 64.4 |
| muledeer | 20/20 (100%) | 12 | 0.59 | 3.4% | 1.3 | 4.40 | 89 | 15.0 (13 seeds) | 95% | 100% | 69.4 |

Max bison generation depth reached: 404.6 (median across seeds 347.7).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.2 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3442.4 | 6836.3 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 96.9% | 11.0 | 15.6 | 5.9 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 96.0 | 831.7 |
| prairiedog | 100.0% | 3.7 | 0.0 | 20.8 | 0.0 |
| muledeer | 98.5% | 11.6 | 7.5 | 393.5 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 19 | 3.2 | 133 | 144 | 25 | 19 | 1.3 |
| 2 | 48 | 8.0 | 208 | 220 | 22 | 25 | 2.3 |
| 3 | 45 | 7.5 | 176 | 182 | 20 | 20 | 1.7 |
| 4 | 33 | 5.5 | 125 | 131 | 27 | 25 | 1.5 |
| 5 | 44 | 7.3 | 207 | 223 | 28 | 28 | 1.9 |
| 6 | 31 | 5.2 | 138 | 149 | 24 | 27 | 1.6 |
| 7 | 17 | 2.8 | 90 | 95 | 27 | 31 | 0.6 |
| 8 | 19 | 3.2 | 123 | 137 | 25 | 28 | 0.7 |
| 9 | 35 | 5.8 | 202 | 230 | 28 | 27 | 1.9 |
| 10 | 45 | 7.5 | 276 | 294 | 22 | 20 | 2.8 |
| 11 | 25 | 4.2 | 105 | 117 | 32 | 26 | 0.7 |
| 12 | 25 | 4.2 | 133 | 153 | 22 | 26 | 1.4 |
| 13 | 13 | 2.2 | 57 | 62 | 29 | 25 | 0.3 |
| 14 | 25 | 4.2 | 126 | 138 | 22 | 20 | 1.3 |
| 15 | 16 | 2.7 | 91 | 102 | 27 | 27 | 0.7 |
| 16 | 21 | 3.5 | 126 | 136 | 26 | 27 | 1.3 |
| 17 | 13 | 2.2 | 83 | 94 | 29 | 26 | 0.8 |
| 18 | 49 | 8.2 | 144 | 159 | 22 | 22 | 1.6 |
| 19 | 30 | 5.0 | 126 | 137 | 24 | 25 | 1.1 |
| 20 | 47 | 7.8 | 197 | 214 | 23 | 22 | 1.8 |

Median plagues per 100 years across seeds: 4.6 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.37. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.29 at a lag of 1.0 years; 15% of seeds reach 0.4. Annual-mean best (median): 0.29.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.34 | 0.28 | 0.29 | 0.32 | 0.37 | 0.25 | 0.29 | 0.32 |
| 2 | 0.37 | 0.29 | 0.24 | 0.29 | 0.22 | 0.05 | 0.24 | 0.29 |
| 3 | 0.37 | 0.30 | 0.25 | 0.28 | 0.30 | 0.23 | 0.25 | 0.28 |
| 4 | 0.42 | 0.32 | 0.22 | 0.26 | 0.22 | 0.11 | 0.22 | 0.26 |
| 5 | 0.35 | 0.29 | 0.28 | 0.21 | 0.14 | 0.04 | 0.28 | 0.21 |
| 6 | 0.35 | 0.32 | 0.26 | 0.32 | 0.28 | 0.12 | 0.26 | 0.32 |
| 7 | 0.35 | 0.34 | 0.27 | 0.27 | 0.18 | 0.08 | 0.27 | 0.27 |
| 8 | 0.33 | 0.32 | 0.36 | 0.34 | 0.31 | 0.20 | 0.36 | 0.34 |
| 9 | 0.41 | 0.32 | 0.13 | 0.22 | 0.22 | 0.09 | 0.13 | 0.22 |
| 10 | 0.40 | 0.29 | 0.14 | 0.15 | 0.20 | 0.10 | 0.14 | 0.15 |
| 11 | 0.36 | 0.32 | 0.46 | 0.44 | 0.34 | 0.21 | 0.46 | 0.44 |
| 12 | 0.38 | 0.32 | 0.19 | 0.19 | 0.20 | 0.14 | 0.19 | 0.19 |
| 13 | 0.36 | 0.32 | 0.48 | 0.40 | 0.30 | 0.19 | 0.48 | 0.40 |
| 14 | 0.39 | 0.34 | 0.23 | 0.23 | 0.22 | 0.15 | 0.23 | 0.23 |
| 15 | 0.36 | 0.30 | 0.37 | 0.34 | 0.25 | 0.13 | 0.37 | 0.34 |
| 16 | 0.37 | 0.32 | 0.24 | 0.25 | 0.24 | 0.15 | 0.24 | 0.25 |
| 17 | 0.36 | 0.30 | 0.35 | 0.36 | 0.27 | 0.13 | 0.35 | 0.36 |
| 18 | 0.37 | 0.33 | 0.31 | 0.35 | 0.34 | 0.23 | 0.31 | 0.35 |
| 19 | 0.36 | 0.30 | 0.23 | 0.27 | 0.23 | 0.12 | 0.23 | 0.27 |
| 20 | 0.38 | 0.29 | 0.40 | 0.41 | 0.33 | 0.18 | 0.40 | 0.41 |

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
| 1 | 720000 | 340.5 | 718 / 0.43 / 0% | 68 / 0.23 / 0% | 576 / 0.15 / 0% | 363 / 0.43 / 0% | 801 / 0.28 / 0% | 6 / 0.47 / 5% | 49 / 0.34 / 0% | 22 / 0.44 / 0% | 12 / 0.53 / 3% | bison 52.5, wolf 80.0, raven unaffected, pronghorn 10.0, rabbit 38.8, cougar 77.5, coyote 25.0, prairiedog 66.3, muledeer 90.0 |
| 2 | 720000 | 349.1 | 751 / 0.54 / 0% | 77 / 0.28 / 0% | 551 / 0.19 / 0% | 377 / 0.42 / 0% | 820 / 0.29 / 0% | 7 / 0.38 / 1% | 45 / 0.37 / 0% | 56 / 0.56 / 0% | 26 / 1.60 / 6% | bison 30.0, wolf 41.3, raven 236.3, pronghorn 46.3, rabbit 50.0, cougar 78.8, coyote 8.8, prairiedog 62.5, muledeer 103.8 |
| 3 | 720000 | 365.1 | 691 / 0.51 / 0% | 73 / 0.24 / 0% | 556 / 0.18 / 0% | 367 / 0.38 / 0% | 936 / 0.30 / 0% | 7 / 0.47 / 2% | 42 / 0.37 / 0% | 52 / 0.54 / 0% | 12 / 0.60 / 4% | bison 88.8, wolf 30.0, raven 7.5, pronghorn 13.8, rabbit 41.3, cougar 50.0, coyote 21.3, prairiedog 12.5, muledeer 22.5 |
| 4 | 720000 | 340.5 | 798 / 0.47 / 1% | 80 / 0.27 / 0% | 567 / 0.18 / 0% | 397 / 0.38 / 0% | 798 / 0.32 / 0% | 7 / 0.46 / 3% | 43 / 0.42 / 0% | 35 / 0.56 / 0% | 12 / 0.60 / 3% | bison 17.5, wolf 10.0, raven 11.3, pronghorn 11.3, rabbit 25.0, cougar 11.3, coyote 36.3, prairiedog 28.8, muledeer 11.3 |
| 5 | 720000 | 327.9 | 802 / 0.43 / 0% | 68 / 0.23 / 0% | 573 / 0.16 / 0% | 424 / 0.34 / 0% | 754 / 0.29 / 0% | 8 / 0.43 / 1% | 51 / 0.35 / 0% | 48 / 0.54 / 0% | 12 / 0.53 / 2% | bison 7.5, wolf 15.0, raven 8.8, pronghorn 10.0, rabbit 16.3, cougar 17.5, coyote 60.0, prairiedog 155.0, muledeer 101.3 |
| 6 | 720000 | 384.1 | 674 / 0.51 / 0% | 73 / 0.26 / 0% | 553 / 0.18 / 0% | 395 / 0.40 / 0% | 783 / 0.32 / 0% | 6 / 0.46 / 1% | 44 / 0.35 / 0% | 33 / 0.87 / 2% | 11 / 0.60 / 3% | bison 97.5, wolf 140.0, raven unaffected, pronghorn 102.5, rabbit 76.3, cougar 76.3, coyote 25.0, prairiedog 66.3, muledeer 95.0 |
| 7 | 720000 | 338.3 | 978 / 0.34 / 0% | 76 / 0.26 / 0% | 606 / 0.11 / 0% | 351 / 0.29 / 0% | 742 / 0.34 / 0% | 8 / 0.40 / 2% | 48 / 0.35 / 0% | 11 / 0.97 / 17% | 16 / 1.54 / 3% | bison 12.5, wolf never, raven 8.8, pronghorn 21.3, rabbit 72.5, cougar 17.5, coyote 50.0, prairiedog 161.3, muledeer 223.8 |
| 8 | 720000 | 347.0 | 749 / 0.46 / 0% | 65 / 0.25 / 0% | 560 / 0.18 / 0% | 395 / 0.38 / 0% | 695 / 0.32 / 0% | 7 / 0.40 / 1% | 53 / 0.33 / 0% | 13 / 1.13 / 18% | 14 / 0.97 / 2% | bison 31.3, wolf 16.3, raven unaffected, pronghorn 85.0, rabbit 137.5, cougar 57.5, coyote 176.3, prairiedog 185.0, muledeer 40.0 |
| 9 | 720000 | 329.3 | 663 / 0.51 / 0% | 74 / 0.25 / 0% | 551 / 0.18 / 0% | 414 / 0.41 / 0% | 861 / 0.32 / 0% | 5 / 0.51 / 5% | 42 / 0.41 / 0% | 52 / 0.69 / 5% | 12 / 0.54 / 3% | bison 123.8, wolf 46.3, raven unaffected, pronghorn 66.3, rabbit 35.0, cougar 72.5, coyote 28.8, prairiedog 32.5, muledeer 26.3 |
| 10 | 720000 | 338.2 | 638 / 0.51 / 0% | 75 / 0.27 / 0% | 543 / 0.19 / 0% | 426 / 0.40 / 0% | 838 / 0.29 / 0% | 6 / 0.50 / 5% | 44 / 0.40 / 0% | 71 / 0.52 / 1% | 10 / 0.52 / 5% | bison 43.8, wolf 221.3, raven never, pronghorn 46.3, rabbit 15.0, cougar 22.5, coyote 52.5, prairiedog 22.5, muledeer 122.5 |
| 11 | 720000 | 359.0 | 650 / 0.43 / 0% | 66 / 0.23 / 0% | 557 / 0.17 / 0% | 335 / 0.35 / 0% | 679 / 0.32 / 0% | 5 / 0.52 / 6% | 52 / 0.36 / 0% | 11 / 0.65 / 3% | 10 / 0.55 / 4% | bison 170.0, wolf 166.3, raven 186.3, pronghorn 108.8, rabbit 27.5, cougar 20.0, coyote 118.8, prairiedog 12.5, muledeer unaffected |
| 12 | 720000 | 359.0 | 935 / 0.39 / 0% | 82 / 0.23 / 0% | 594 / 0.13 / 0% | 384 / 0.34 / 0% | 827 / 0.32 / 0% | 8 / 0.39 / 1% | 53 / 0.38 / 0% | 47 / 0.50 / 0% | 11 / 0.49 / 2% | bison 20.0, wolf 75.0, raven 337.5, pronghorn 13.8, rabbit 41.3, cougar 53.8, coyote 95.0, prairiedog 20.0, muledeer 18.8 |
| 13 | 720000 | 352.3 | 660 / 0.44 / 0% | 64 / 0.26 / 0% | 550 / 0.17 / 0% | 386 / 0.42 / 0% | 709 / 0.32 / 0% | 7 / 0.48 / 4% | 47 / 0.36 / 0% | 8 / 1.30 / 19% | 23 / 1.73 / 6% | bison 15.0, wolf 48.8, raven unaffected, pronghorn 146.3, rabbit 25.0, cougar 30.0, coyote 25.0, prairiedog 266.3, muledeer 168.8 |
| 14 | 720000 | 334.1 | 937 / 0.40 / 0% | 77 / 0.20 / 0% | 594 / 0.13 / 0% | 451 / 0.37 / 0% | 741 / 0.34 / 0% | 6 / 0.49 / 3% | 49 / 0.39 / 0% | 27 / 0.69 / 1% | 11 / 0.45 / 2% | bison 322.5, wolf 11.3, raven unaffected, pronghorn 17.5, rabbit 11.3, cougar 38.8, coyote 26.3, prairiedog 76.3, muledeer 127.5 |
| 15 | 720000 | 377.9 | 765 / 0.46 / 0% | 74 / 0.24 / 0% | 574 / 0.16 / 0% | 414 / 0.50 / 0% | 742 / 0.30 / 0% | 8 / 0.43 / 1% | 52 / 0.36 / 0% | 14 / 0.88 / 13% | 18 / 1.69 / 4% | bison 25.0, wolf unaffected, raven 26.3, pronghorn 33.8, rabbit 95.0, cougar 33.8, coyote 16.3, prairiedog 305.0, muledeer 32.5 |
| 16 | 720000 | 404.6 | 649 / 0.42 / 0% | 71 / 0.23 / 0% | 568 / 0.16 / 0% | 337 / 0.32 / 0% | 752 / 0.32 / 0% | 6 / 0.49 / 5% | 49 / 0.37 / 0% | 34 / 0.61 / 0% | 11 / 0.50 / 3% | bison 50.0, wolf 126.3, raven unaffected, pronghorn 28.8, rabbit 31.3, cougar 87.5, coyote 137.5, prairiedog 26.3, muledeer 123.8 |
| 17 | 720000 | 348.5 | 697 / 0.44 / 0% | 64 / 0.25 / 0% | 552 / 0.18 / 0% | 405 / 0.35 / 0% | 691 / 0.30 / 0% | 8 / 0.35 / 0% | 55 / 0.36 / 0% | 13 / 1.25 / 31% EXTINCT@596.3yr | 26 / 1.59 / 4% | bison 23.8, wolf 51.3, raven 58.8, pronghorn 8.8, rabbit 33.8, cougar 36.3, coyote 7.5, prairiedog 122.5, muledeer 33.8 |
| 18 | 720000 | 328.9 | 588 / 0.45 / 0% | 74 / 0.22 / 0% | 549 / 0.18 / 0% | 384 / 0.37 / 0% | 764 / 0.33 / 0% | 7 / 0.45 / 3% | 44 / 0.37 / 0% | 35 / 0.48 / 0% | 17 / 1.96 / 4% | bison 7.5, wolf 100.0, raven 8.8, pronghorn 7.5, rabbit 51.3, cougar 47.5, coyote 11.3, prairiedog 50.0, muledeer 213.8 |
| 19 | 720000 | 337.9 | 643 / 0.43 / 0% | 77 / 0.24 / 0% | 563 / 0.17 / 0% | 363 / 0.36 / 0% | 798 / 0.30 / 0% | 8 / 0.48 / 4% | 51 / 0.36 / 0% | 19 / 0.88 / 8% | 11 / 0.58 / 4% | bison 58.8, wolf 56.3, raven 181.3, pronghorn 40.0, rabbit 131.3, cougar 47.5, coyote 97.5, prairiedog 338.8, muledeer 48.8 |
| 20 | 720000 | 378.0 | 651 / 0.48 / 0% | 71 / 0.24 / 0% | 554 / 0.18 / 0% | 351 / 0.38 / 0% | 878 / 0.29 / 0% | 6 / 0.47 / 3% | 52 / 0.38 / 0% | 39 / 0.58 / 0% | 12 / 0.56 / 3% | bison 10.0, wolf 51.3, raven 10.0, pronghorn 72.5, rabbit 22.5, cougar 12.5, coyote 10.0, prairiedog 42.5, muledeer 18.8 |
