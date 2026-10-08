# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit d8b8624 (frozen copy); real sim
- Params: {"snowDepth":1,"dynamicTrees":1,"treeCwRecruit":0.003,"dogRescueYears":8}
- Shocks: cull 70% bison at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 651 | 0.43 | 0.0% | 0.0 | 2.78 | 53 | 8.8 (20 seeds) | 100% | 100% | 36.3 |
| wolf | 20/20 (100%) | 65 | 0.25 | 0.0% | 0.0 | 1.79 | 53 | 10.0 (19 seeds) | 100% | 90% | 65.0 |
| raven | 20/20 (100%) | 547 | 0.17 | 0.0% | 0.0 | 1.24 | 47 | 9.4 (20 seeds) | 75% | 95% | 86.3 |
| pronghorn | 20/20 (100%) | 378 | 0.34 | 0.0% | 0.0 | 2.74 | 62 | 10.0 (20 seeds) | 100% | 100% | 35.6 |
| rabbit | 20/20 (100%) | 770 | 0.31 | 0.0% | 0.0 | 1.97 | 52 | 74.4 (12 seeds) | 100% | 100% | 35.0 |
| cougar | 19/20 (95%) | 8 | 0.47 | 2.4% | 5.0 | 2.30 | 83 | 73.1 (10 seeds) | 100% | 100% | 48.8 |
| coyote | 20/20 (100%) | 49 | 0.38 | 0.0% | 0.0 | 2.22 | 78 | 20.0 (14 seeds) | 100% | 100% | 45.6 |
| prairiedog | 20/20 (100%) | 35 | 0.54 | 0.1% | 0.6 | 2.98 | 34 | 150.0 (7 seeds) | 100% | 100% | 29.4 |
| muledeer | 20/20 (100%) | 13 | 0.60 | 2.3% | 1.3 | 5.76 | 89 | 20.0 (9 seeds) | 75% | 95% | 43.8 |

Max bison generation depth reached: 373.0 (median across seeds 341.0).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3507.8 | 6294.9 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 97.6% | 10.3 | 12.5 | 5.3 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 98.4 | 800.5 |
| prairiedog | 100.0% | 0.7 | 0.0 | 33.5 | 0.0 |
| muledeer | 99.3% | 6.4 | 3.8 | 359.9 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 23 | 3.8 | 121 | 135 | 23 | 23 | 0.9 |
| 2 | 41 | 6.8 | 208 | 213 | 26 | 26 | 1.9 |
| 3 | 37 | 6.2 | 200 | 218 | 22 | 22 | 1.8 |
| 4 | 46 | 7.7 | 179 | 195 | 28 | 22 | 1.8 |
| 5 | 28 | 4.7 | 155 | 176 | 28 | 22 | 2.3 |
| 6 | 25 | 4.2 | 165 | 179 | 29 | 27 | 1.4 |
| 7 | 44 | 7.3 | 205 | 222 | 29 | 27 | 2.0 |
| 8 | 20 | 3.3 | 140 | 150 | 25 | 30 | 1.0 |
| 9 | 25 | 4.2 | 159 | 166 | 27 | 32 | 1.1 |
| 10 | 28 | 4.7 | 174 | 192 | 27 | 21 | 1.1 |
| 11 | 35 | 5.8 | 208 | 230 | 26 | 27 | 2.2 |
| 12 | 54 | 9.0 | 250 | 265 | 21 | 20 | 2.0 |
| 13 | 49 | 8.2 | 203 | 231 | 24 | 29 | 1.8 |
| 14 | 26 | 4.3 | 142 | 159 | 26 | 26 | 1.3 |
| 15 | 32 | 5.3 | 176 | 192 | 28 | 26 | 1.2 |
| 16 | 40 | 6.7 | 180 | 191 | 23 | 25 | 2.1 |
| 17 | 24 | 4.0 | 124 | 147 | 26 | 22 | 1.2 |
| 18 | 30 | 5.0 | 165 | 185 | 29 | 25 | 1.4 |
| 19 | 33 | 5.5 | 245 | 256 | 18 | 24 | 1.8 |
| 20 | 36 | 6.0 | 188 | 216 | 20 | 24 | 2.0 |

Median plagues per 100 years across seeds: 5.4 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.38. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.34 at a lag of 1.0 years; 30% of seeds reach 0.4. Annual-mean best (median): 0.34.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.35 | 0.30 | 0.29 | 0.30 | 0.31 | 0.21 | 0.29 | 0.30 |
| 2 | 0.40 | 0.29 | 0.29 | 0.35 | 0.31 | 0.16 | 0.29 | 0.35 |
| 3 | 0.37 | 0.30 | 0.28 | 0.26 | 0.25 | 0.12 | 0.28 | 0.26 |
| 4 | 0.39 | 0.32 | 0.37 | 0.39 | 0.37 | 0.28 | 0.37 | 0.39 |
| 5 | 0.38 | 0.31 | 0.24 | 0.22 | 0.19 | 0.12 | 0.24 | 0.22 |
| 6 | 0.42 | 0.35 | 0.28 | 0.31 | 0.27 | 0.16 | 0.28 | 0.31 |
| 7 | 0.45 | 0.36 | 0.22 | 0.29 | 0.28 | 0.18 | 0.22 | 0.29 |
| 8 | 0.40 | 0.32 | 0.41 | 0.39 | 0.29 | 0.14 | 0.41 | 0.39 |
| 9 | 0.37 | 0.34 | 0.32 | 0.31 | 0.29 | 0.17 | 0.32 | 0.31 |
| 10 | 0.32 | 0.31 | 0.37 | 0.29 | 0.24 | 0.13 | 0.37 | 0.29 |
| 11 | 0.41 | 0.32 | 0.21 | 0.23 | 0.17 | 0.10 | 0.21 | 0.23 |
| 12 | 0.35 | 0.32 | 0.34 | 0.43 | 0.42 | 0.25 | 0.34 | 0.43 |
| 13 | 0.40 | 0.31 | 0.36 | 0.40 | 0.37 | 0.27 | 0.36 | 0.40 |
| 14 | 0.44 | 0.33 | 0.41 | 0.43 | 0.39 | 0.33 | 0.41 | 0.43 |
| 15 | 0.39 | 0.29 | 0.41 | 0.36 | 0.29 | 0.21 | 0.41 | 0.36 |
| 16 | 0.33 | 0.31 | 0.34 | 0.34 | 0.32 | 0.23 | 0.34 | 0.34 |
| 17 | 0.36 | 0.30 | 0.25 | 0.27 | 0.21 | 0.02 | 0.25 | 0.27 |
| 18 | 0.34 | 0.34 | 0.44 | 0.40 | 0.34 | 0.21 | 0.44 | 0.40 |
| 19 | 0.38 | 0.28 | 0.06 | 0.08 | 0.05 | -0.02 | 0.06 | 0.08 |
| 20 | 0.34 | 0.30 | 0.38 | 0.36 | 0.30 | 0.22 | 0.38 | 0.36 |

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
| 1 | 720000 | 339.4 | 634 / 0.52 / 0% | 61 / 0.27 / 0% | 532 / 0.19 / 0% | 406 / 0.36 / 0% | 731 / 0.30 / 0% | 7 / 0.52 / 3% | 51 / 0.35 / 0% | 20 / 0.50 / 1% | 14 / 0.64 / 3% | bison 7.5, wolf 235.0, raven 180.0, pronghorn 108.8, rabbit 30.0, cougar 255.0, coyote 31.3, prairiedog 45.0, muledeer unaffected |
| 2 | 720000 | 347.5 | 769 / 0.44 / 0% | 69 / 0.27 / 0% | 564 / 0.16 / 0% | 403 / 0.38 / 0% | 776 / 0.29 / 0% | 8 / 0.43 / 4% | 50 / 0.40 / 1% | 39 / 0.66 / 0% | 13 / 1.22 / 2% | bison 268.8, wolf 85.0, raven unaffected, pronghorn 11.3, rabbit 76.3, cougar 33.8, coyote 47.5, prairiedog 337.5, muledeer unaffected |
| 3 | 720000 | 355.6 | 654 / 0.50 / 0% | 68 / 0.28 / 0% | 547 / 0.19 / 0% | 356 / 0.34 / 0% | 820 / 0.30 / 0% | 8 / 0.56 / 6% | 47 / 0.37 / 0% | 51 / 0.72 / 0% | 13 / 0.45 / 1% | bison 36.3, wolf 216.3, raven 222.5, pronghorn 35.0, rabbit 47.5, cougar 30.0, coyote 56.3, prairiedog 23.8, muledeer 103.8 |
| 4 | 720000 | 345.4 | 693 / 0.42 / 0% | 62 / 0.27 / 0% | 558 / 0.17 / 0% | 394 / 0.34 / 0% | 795 / 0.32 / 0% | 10 / 0.46 / 2% | 42 / 0.39 / 1% | 36 / 0.45 / 0% | 35 / 1.60 / 5% | bison 22.5, wolf never, raven 8.8, pronghorn 15.0, rabbit 63.8, cougar 142.5, coyote 21.3, prairiedog 142.5, muledeer never |
| 5 | 720000 | 325.4 | 587 / 0.47 / 0% | 68 / 0.24 / 0% | 528 / 0.20 / 0% | 381 / 0.36 / 0% | 782 / 0.31 / 0% | 8 / 0.49 / 4% | 46 / 0.38 / 0% | 67 / 0.74 / 0% | 14 / 1.04 / 1% | bison 88.8, wolf 20.0, raven 91.3, pronghorn 92.5, rabbit 16.3, cougar 37.5, coyote 81.3, prairiedog 35.0, muledeer unaffected |
| 6 | 720000 | 338.4 | 593 / 0.42 / 0% | 65 / 0.26 / 0% | 546 / 0.18 / 0% | 372 / 0.32 / 0% | 755 / 0.35 / 0% | 10 / 0.47 / 2% | 45 / 0.42 / 1% | 27 / 0.88 / 7% | 11 / 0.55 / 2% | bison 11.3, wolf 15.0, raven 303.8, pronghorn 141.3, rabbit 22.5, cougar 55.0, coyote 52.5, prairiedog 11.3, muledeer 38.8 |
| 7 | 720000 | 322.7 | 718 / 0.41 / 0% | 69 / 0.32 / 0% | 562 / 0.16 / 0% | 387 / 0.37 / 0% | 847 / 0.36 / 0% | 9 / 0.41 / 2% | 39 / 0.45 / 0% | 37 / 0.52 / 0% | 11 / 0.45 / 2% | bison 26.3, wolf 67.5, raven unaffected, pronghorn 13.8, rabbit 15.0, cougar 37.5, coyote 35.0, prairiedog 66.3, muledeer 43.8 |
| 8 | 720000 | 350.8 | 657 / 0.39 / 0% | 62 / 0.27 / 0% | 555 / 0.17 / 0% | 346 / 0.32 / 0% | 723 / 0.32 / 0% | 10 / 0.47 / 1% | 50 / 0.40 / 0% | 17 / 0.49 / 0% | 31 / 1.49 / 6% | bison 37.5, wolf 36.3, raven 86.3, pronghorn 32.5, rabbit 290.0, cougar 56.3, coyote 10.0, prairiedog 82.5, muledeer 43.8 |
| 9 | 720000 | 335.2 | 610 / 0.51 / 0% | 55 / 0.30 / 0% | 517 / 0.21 / 0% | 414 / 0.34 / 0% | 712 / 0.34 / 0% | 7 / 0.49 / 2% | 53 / 0.37 / 0% | 24 / 0.78 / 10% | 24 / 1.45 / 2% | bison 125.0, wolf never, raven never, pronghorn 27.5, rabbit 32.5, cougar 151.3, coyote 100.0, prairiedog 13.8, muledeer 16.3 |
| 10 | 720000 | 339.4 | 571 / 0.37 / 0% | 58 / 0.23 / 0% | 546 / 0.17 / 0% | 354 / 0.32 / 0% | 694 / 0.31 / 0% | 8 / 0.40 / 1% | 56 / 0.32 / 0% | 22 / 0.82 / 4% | 12 / 0.48 / 2% | bison 57.5, wolf 65.0, raven 205.0, pronghorn 97.5, rabbit 11.3, cougar 78.8, coyote 13.8, prairiedog 16.3, muledeer 143.8 |
| 11 | 720000 | 341.0 | 650 / 0.43 / 0% | 66 / 0.25 / 0% | 547 / 0.17 / 0% | 422 / 0.33 / 0% | 798 / 0.32 / 0% | 7 / 0.54 / 4% | 47 / 0.41 / 1% | 53 / 0.51 / 3% | 12 / 0.56 / 2% | bison 68.8, wolf 15.0, raven 320.0, pronghorn 78.8, rabbit 35.0, cougar 45.0, coyote 80.0, prairiedog 15.0, muledeer 17.5 |
| 12 | 720000 | 339.1 | 655 / 0.43 / 0% | 64 / 0.25 / 0% | 558 / 0.18 / 0% | 337 / 0.38 / 0% | 870 / 0.32 / 0% | 8 / 0.48 / 3% | 49 / 0.35 / 0% | 40 / 0.56 / 0% | 13 / 0.70 / 2% | bison 36.3, wolf 290.0, raven unaffected, pronghorn 185.0, rabbit 41.3, cougar 52.5, coyote 125.0, prairiedog 20.0, muledeer unaffected |
| 13 | 720000 | 348.2 | 539 / 0.51 / 0% | 70 / 0.24 / 0% | 523 / 0.20 / 0% | 391 / 0.39 / 0% | 872 / 0.31 / 0% | 11 / 0.52 / 4% | 50 / 0.40 / 0% | 53 / 0.58 / 0% | 12 / 0.50 / 3% | bison 145.0, wolf 165.0, raven unaffected, pronghorn 36.3, rabbit 35.0, cougar 42.5, coyote 40.0, prairiedog 35.0, muledeer 141.3 |
| 14 | 720000 | 347.7 | 663 / 0.50 / 1% | 68 / 0.27 / 0% | 538 / 0.20 / 0% | 376 / 0.41 / 0% | 730 / 0.33 / 0% | 10 / 0.47 / 2% | 50 / 0.44 / 2% | 34 / 0.61 / 1% | 12 / 0.50 / 3% | bison 20.0, wolf 75.0, raven 307.5, pronghorn 21.3, rabbit 11.3, cougar 33.8, coyote 12.5, prairiedog 87.5, muledeer 173.8 |
| 15 | 720000 | 346.7 | 857 / 0.41 / 0% | 67 / 0.25 / 0% | 580 / 0.15 / 0% | 406 / 0.47 / 0% | 717 / 0.29 / 0% | 9 / 0.42 / 3% | 49 / 0.39 / 0% | 25 / 0.67 / 0% | 12 / 0.47 / 2% | bison 117.5, wolf 20.0, raven 96.3, pronghorn 173.8, rabbit 12.5, cougar 68.8, coyote 76.3, prairiedog 23.8, muledeer 18.8 |
| 16 | 720000 | 373.0 | 651 / 0.41 / 0% | 61 / 0.23 / 0% | 559 / 0.17 / 0% | 358 / 0.31 / 0% | 765 / 0.31 / 0% | 8 / 0.51 / 4% | 46 / 0.33 / 0% | 35 / 0.50 / 0% | 13 / 0.51 / 1% | bison 7.5, wolf 65.0, raven 8.8, pronghorn 78.8, rabbit 56.3, cougar 73.8, coyote 13.8, prairiedog 73.8, muledeer 80.0 |
| 17 | 720000 | 337.7 | 547 / 0.49 / 0% | 62 / 0.25 / 0% | 532 / 0.19 / 0% | 372 / 0.34 / 0% | 741 / 0.30 / 0% | 11 / 0.33 / 0% | 48 / 0.36 / 0% | 23 / 0.50 / 0% | 22 / 1.63 / 2% | bison 17.5, wolf 42.5, raven 8.8, pronghorn 22.5, rabbit 55.0, cougar 32.5, coyote 61.3, prairiedog 15.0, muledeer 62.5 |
| 18 | 720000 | 327.7 | 582 / 0.40 / 0% | 58 / 0.24 / 0% | 534 / 0.18 / 0% | 356 / 0.27 / 0% | 681 / 0.34 / 0% | 8 / 0.48 / 3% | 57 / 0.34 / 0% | 33 / 0.49 / 0% | 14 / 0.57 / 1% | bison 7.5, wolf 56.3, raven 8.8, pronghorn 8.8, rabbit 38.8, cougar 40.0, coyote 43.8, prairiedog 43.8, muledeer 118.8 |
| 19 | 720000 | 341.0 | 573 / 0.38 / 0% | 63 / 0.21 / 0% | 556 / 0.16 / 0% | 331 / 0.34 / 0% | 841 / 0.28 / 0% | 8 / 0.47 / 2% EXTINCT@600.0yr | 47 / 0.38 / 0% | 31 / 0.44 / 0% | 23 / 1.39 / 4% | bison 15.0, wolf 63.8, raven unaffected, pronghorn 13.8, rabbit 40.0, cougar 45.0, coyote 48.8, prairiedog 10.0, muledeer 63.8 |
| 20 | 720000 | 352.2 | 753 / 0.42 / 0% | 66 / 0.23 / 0% | 566 / 0.15 / 0% | 418 / 0.36 / 0% | 850 / 0.30 / 0% | 8 / 0.41 / 2% | 52 / 0.34 / 0% | 53 / 0.44 / 0% | 17 / 1.48 / 2% | bison 85.0, wolf 120.0, raven 87.5, pronghorn 87.5, rabbit 23.8, cougar 65.0, coyote 13.8, prairiedog 16.3, muledeer unaffected |
