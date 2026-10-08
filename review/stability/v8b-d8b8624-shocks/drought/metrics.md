# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit d8b8624 (frozen copy); real sim
- Params: {"snowDepth":1,"dynamicTrees":1,"treeCwRecruit":0.003,"dogRescueYears":8}
- Shocks: drought (2 yr) at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 640 | 0.45 | 0.0% | 0.0 | 2.70 | 52 | 8.8 (20 seeds) | 100% | 100% | 17.5 |
| wolf | 20/20 (100%) | 63 | 0.25 | 0.0% | 0.0 | 1.79 | 54 | 8.8 (20 seeds) | 100% | 95% | 55.0 |
| raven | 20/20 (100%) | 547 | 0.18 | 0.0% | 0.0 | 1.25 | 48 | 8.8 (20 seeds) | 85% | 100% | 15.0 |
| pronghorn | 20/20 (100%) | 377 | 0.37 | 0.0% | 0.0 | 3.09 | 62 | 10.0 (20 seeds) | 100% | 100% | 19.4 |
| rabbit | 20/20 (100%) | 763 | 0.31 | 0.0% | 0.0 | 1.90 | 53 | 60.0 (11 seeds) | 100% | 100% | 45.6 |
| cougar | 20/20 (100%) | 8 | 0.46 | 2.3% | 5.0 | 2.41 | 80 | 95.0 (11 seeds) | 100% | 100% | 31.3 |
| coyote | 20/20 (100%) | 49 | 0.38 | 0.2% | 1.3 | 2.28 | 75 | 25.0 (16 seeds) | 100% | 100% | 32.5 |
| prairiedog | 20/20 (100%) | 29 | 0.59 | 0.4% | 1.9 | 3.30 | 36 | 148.8 (5 seeds) | 100% | 100% | 41.3 |
| muledeer | 20/20 (100%) | 13 | 0.61 | 2.2% | 1.3 | 5.71 | 87 | 64.4 (8 seeds) | 85% | 100% | 38.8 |

Max bison generation depth reached: 375.8 (median across seeds 347.5).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3541.2 | 6250.5 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 97.7% | 9.2 | 11.9 | 5.5 | 0.0 |
| coyote | 100.0% | 0.3 | 0.0 | 98.2 | 794.8 |
| prairiedog | 100.0% | 0.9 | 0.0 | 39.7 | 0.0 |
| muledeer | 99.3% | 5.9 | 3.8 | 357.2 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 23 | 3.8 | 158 | 163 | 21 | 19 | 1.2 |
| 2 | 19 | 3.2 | 133 | 145 | 30 | 27 | 0.9 |
| 3 | 28 | 4.7 | 171 | 179 | 20 | 24 | 1.6 |
| 4 | 31 | 5.2 | 144 | 157 | 30 | 25 | 1.1 |
| 5 | 20 | 3.3 | 136 | 155 | 30 | 24 | 1.4 |
| 6 | 38 | 6.3 | 203 | 220 | 28 | 27 | 1.6 |
| 7 | 42 | 7.0 | 182 | 198 | 29 | 29 | 1.6 |
| 8 | 24 | 4.0 | 144 | 149 | 30 | 30 | 1.1 |
| 9 | 27 | 4.5 | 135 | 148 | 27 | 30 | 1.1 |
| 10 | 29 | 4.8 | 200 | 214 | 31 | 23 | 1.3 |
| 11 | 44 | 7.3 | 203 | 221 | 29 | 26 | 2.0 |
| 12 | 49 | 8.2 | 222 | 243 | 23 | 24 | 1.9 |
| 13 | 38 | 6.3 | 209 | 229 | 27 | 23 | 1.8 |
| 14 | 35 | 5.8 | 168 | 181 | 23 | 27 | 1.2 |
| 15 | 40 | 6.7 | 194 | 224 | 25 | 25 | 1.7 |
| 16 | 53 | 8.8 | 239 | 254 | 23 | 22 | 2.2 |
| 17 | 21 | 3.5 | 130 | 141 | 23 | 22 | 1.0 |
| 18 | 28 | 4.7 | 153 | 178 | 31 | 26 | 1.2 |
| 19 | 39 | 6.5 | 180 | 192 | 19 | 21 | 1.5 |
| 20 | 45 | 7.5 | 207 | 225 | 23 | 26 | 2.1 |

Median plagues per 100 years across seeds: 5.5 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.38. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.34 at a lag of 0.5 years; 25% of seeds reach 0.4. Annual-mean best (median): 0.34.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.36 | 0.28 | 0.31 | 0.26 | 0.21 | 0.10 | 0.31 | 0.26 |
| 2 | 0.39 | 0.31 | 0.31 | 0.28 | 0.20 | 0.04 | 0.31 | 0.28 |
| 3 | 0.38 | 0.31 | 0.32 | 0.34 | 0.28 | 0.13 | 0.32 | 0.34 |
| 4 | 0.36 | 0.33 | 0.40 | 0.44 | 0.36 | 0.24 | 0.40 | 0.44 |
| 5 | 0.37 | 0.31 | 0.23 | 0.22 | 0.21 | 0.14 | 0.23 | 0.22 |
| 6 | 0.39 | 0.33 | 0.29 | 0.34 | 0.30 | 0.18 | 0.29 | 0.34 |
| 7 | 0.44 | 0.33 | 0.35 | 0.35 | 0.31 | 0.14 | 0.35 | 0.35 |
| 8 | 0.42 | 0.35 | 0.40 | 0.37 | 0.33 | 0.20 | 0.40 | 0.37 |
| 9 | 0.37 | 0.31 | 0.28 | 0.23 | 0.17 | -0.02 | 0.28 | 0.23 |
| 10 | 0.34 | 0.32 | 0.33 | 0.36 | 0.35 | 0.17 | 0.33 | 0.36 |
| 11 | 0.43 | 0.31 | 0.30 | 0.30 | 0.23 | 0.12 | 0.30 | 0.30 |
| 12 | 0.39 | 0.31 | 0.40 | 0.42 | 0.39 | 0.27 | 0.40 | 0.42 |
| 13 | 0.40 | 0.31 | 0.35 | 0.35 | 0.27 | 0.16 | 0.35 | 0.35 |
| 14 | 0.39 | 0.32 | 0.41 | 0.44 | 0.40 | 0.27 | 0.41 | 0.44 |
| 15 | 0.37 | 0.32 | 0.32 | 0.32 | 0.31 | 0.27 | 0.32 | 0.32 |
| 16 | 0.35 | 0.29 | 0.26 | 0.29 | 0.30 | 0.18 | 0.26 | 0.29 |
| 17 | 0.36 | 0.31 | 0.28 | 0.29 | 0.24 | 0.07 | 0.28 | 0.29 |
| 18 | 0.38 | 0.35 | 0.45 | 0.44 | 0.35 | 0.21 | 0.45 | 0.44 |
| 19 | 0.41 | 0.28 | 0.06 | 0.03 | -0.00 | -0.10 | 0.06 | 0.03 |
| 20 | 0.33 | 0.30 | 0.34 | 0.33 | 0.29 | 0.16 | 0.34 | 0.33 |

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
| 1 | 720000 | 331.7 | 639 / 0.45 / 0% | 61 / 0.26 / 0% | 543 / 0.18 / 0% | 393 / 0.39 / 0% | 760 / 0.28 / 0% | 7 / 0.49 / 5% | 50 / 0.36 / 0% | 23 / 0.66 / 0% | 14 / 0.65 / 2% | bison 13.8, wolf 193.8, raven 13.8, pronghorn 10.0, rabbit 33.8, cougar 28.8, coyote 66.3, prairiedog 48.8, muledeer unaffected |
| 2 | 720000 | 332.6 | 602 / 0.57 / 1% | 61 / 0.25 / 0% | 533 / 0.21 / 0% | 373 / 0.43 / 0% | 713 / 0.31 / 0% | 7 / 0.50 / 4% | 53 / 0.39 / 0% | 18 / 0.62 / 0% | 14 / 1.17 / 3% | bison 41.3, wolf 18.8, raven 33.8, pronghorn 33.8, rabbit 51.3, cougar 71.3, coyote 46.3, prairiedog 132.5, muledeer 53.8 |
| 3 | 720000 | 348.6 | 672 / 0.47 / 0% | 68 / 0.27 / 0% | 552 / 0.18 / 0% | 363 / 0.36 / 0% | 834 / 0.31 / 0% | 9 / 0.55 / 5% | 46 / 0.38 / 0% | 47 / 0.82 / 1% | 13 / 0.51 / 1% | bison 12.5, wolf 20.0, raven 13.8, pronghorn 20.0, rabbit 55.0, cougar 23.8, coyote 165.0, prairiedog 101.3, muledeer 16.3 |
| 4 | 720000 | 340.8 | 621 / 0.48 / 0% | 60 / 0.29 / 0% | 534 / 0.19 / 0% | 397 / 0.34 / 0% | 738 / 0.33 / 0% | 9 / 0.49 / 4% | 45 / 0.36 / 0% | 24 / 0.49 / 0% | 36 / 1.56 / 3% | bison 17.5, wolf 182.5, raven 147.5, pronghorn 33.8, rabbit 36.3, cougar 16.3, coyote 27.5, prairiedog 92.5, muledeer 168.8 |
| 5 | 720000 | 334.4 | 642 / 0.45 / 1% | 63 / 0.26 / 0% | 537 / 0.21 / 0% | 389 / 0.39 / 0% | 713 / 0.31 / 0% | 8 / 0.50 / 4% | 48 / 0.37 / 0% | 42 / 1.03 / 12% | 15 / 1.05 / 2% | bison 16.3, wolf 18.8, raven 18.8, pronghorn 18.8, rabbit 20.0, cougar 41.3, coyote 18.8, prairiedog 162.5, muledeer 167.5 |
| 6 | 720000 | 358.6 | 712 / 0.49 / 0% | 67 / 0.27 / 0% | 549 / 0.18 / 0% | 371 / 0.38 / 0% | 766 / 0.33 / 0% | 8 / 0.40 / 2% | 43 / 0.39 / 1% | 30 / 0.55 / 0% | 12 / 0.55 / 3% | bison 21.3, wolf 21.3, raven 13.8, pronghorn 11.3, rabbit 22.5, cougar 28.8, coyote 77.5, prairiedog 88.8, muledeer 23.8 |
| 7 | 720000 | 351.8 | 775 / 0.41 / 0% | 65 / 0.29 / 0% | 571 / 0.16 / 0% | 396 / 0.38 / 0% | 720 / 0.33 / 0% | 8 / 0.45 / 3% | 46 / 0.44 / 1% | 26 / 0.75 / 4% | 12 / 0.50 / 2% | bison 11.3, wolf 72.5, raven unaffected, pronghorn 8.8, rabbit 23.8, cougar 25.0, coyote 21.3, prairiedog 7.5, muledeer 12.5 |
| 8 | 720000 | 375.8 | 670 / 0.38 / 0% | 57 / 0.26 / 0% | 553 / 0.16 / 0% | 384 / 0.36 / 0% | 712 / 0.35 / 0% | 9 / 0.47 / 1% | 51 / 0.42 / 0% | 19 / 0.90 / 0% | 32 / 1.45 / 4% | bison 38.8, wolf 211.3, raven 13.8, pronghorn 17.5, rabbit 46.3, cougar 10.0, coyote 17.5, prairiedog 67.5, muledeer 38.8 |
| 9 | 720000 | 339.5 | 562 / 0.48 / 0% | 55 / 0.30 / 0% | 510 / 0.21 / 0% | 414 / 0.38 / 0% | 675 / 0.31 / 0% | 8 / 0.55 / 2% | 51 / 0.37 / 0% | 25 / 0.75 / 8% | 24 / 1.48 / 3% | bison 53.8, wolf never, raven 145.0, pronghorn 96.3, rabbit 102.5, cougar 21.3, coyote 87.5, prairiedog 13.8, muledeer 30.0 |
| 10 | 720000 | 355.5 | 643 / 0.42 / 0% | 56 / 0.24 / 0% | 555 / 0.17 / 0% | 348 / 0.33 / 0% | 702 / 0.32 / 0% | 7 / 0.47 / 2% | 53 / 0.34 / 0% | 30 / 0.82 / 2% | 12 / 0.50 / 3% | bison 10.0, wolf 55.0, raven 11.3, pronghorn 107.5, rabbit 11.3, cougar 58.8, coyote 11.3, prairiedog 31.3, muledeer 53.8 |
| 11 | 720000 | 355.1 | 653 / 0.43 / 0% | 64 / 0.23 / 0% | 553 / 0.18 / 0% | 414 / 0.31 / 0% | 810 / 0.31 / 0% | 7 / 0.50 / 5% | 42 / 0.43 / 0% | 45 / 0.56 / 0% | 11 / 0.57 / 2% | bison 13.8, wolf 47.5, raven 15.0, pronghorn 15.0, rabbit 45.0, cougar 47.5, coyote 25.0, prairiedog 17.5, muledeer 58.8 |
| 12 | 720000 | 335.3 | 593 / 0.55 / 1% | 69 / 0.27 / 0% | 528 / 0.21 / 0% | 390 / 0.41 / 0% | 828 / 0.31 / 0% | 8 / 0.48 / 1% | 47 / 0.39 / 0% | 41 / 0.59 / 1% | 13 / 0.66 / 2% | bison 27.5, wolf 86.3, raven 113.8, pronghorn 83.8, rabbit 47.5, cougar 81.3, coyote 30.0, prairiedog 11.3, muledeer unaffected |
| 13 | 720000 | 347.8 | 579 / 0.41 / 0% | 67 / 0.21 / 0% | 536 / 0.19 / 0% | 381 / 0.31 / 0% | 776 / 0.31 / 0% | 8 / 0.42 / 4% | 48 / 0.40 / 0% | 38 / 0.59 / 1% | 12 / 0.47 / 1% | bison 108.8, wolf 278.8, raven 110.0, pronghorn 10.0, rabbit 117.5, cougar 20.0, coyote 40.0, prairiedog 33.8, muledeer 38.8 |
| 14 | 720000 | 336.3 | 697 / 0.45 / 0% | 62 / 0.24 / 0% | 553 / 0.18 / 0% | 362 / 0.38 / 0% | 711 / 0.32 / 0% | 9 / 0.45 / 2% | 49 / 0.39 / 1% | 29 / 0.58 / 0% | 12 / 0.53 / 2% | bison 12.5, wolf 20.0, raven 13.8, pronghorn 22.5, rabbit 11.3, cougar 76.3, coyote 13.8, prairiedog 16.3, muledeer 130.0 |
| 15 | 720000 | 353.2 | 686 / 0.44 / 0% | 68 / 0.25 / 0% | 567 / 0.16 / 0% | 341 / 0.38 / 0% | 765 / 0.32 / 0% | 9 / 0.39 / 2% | 49 / 0.37 / 0% | 38 / 0.40 / 0% | 12 / 0.46 / 2% | bison 23.8, wolf 81.3, raven 26.3, pronghorn 57.5, rabbit 110.0, cougar 66.3, coyote 15.0, prairiedog 10.0, muledeer 22.5 |
| 16 | 720000 | 371.8 | 568 / 0.41 / 0% | 64 / 0.25 / 0% | 543 / 0.17 / 0% | 372 / 0.32 / 0% | 820 / 0.29 / 0% | 9 / 0.44 / 2% | 46 / 0.35 / 0% | 47 / 0.46 / 0% | 12 / 0.50 / 2% | bison 21.3, wolf 22.5, raven unaffected, pronghorn 46.3, rabbit 20.0, cougar 23.8, coyote 35.0, prairiedog 80.0, muledeer 15.0 |
| 17 | 720000 | 338.4 | 562 / 0.48 / 0% | 62 / 0.23 / 0% | 545 / 0.18 / 0% | 329 / 0.30 / 0% | 798 / 0.31 / 0% | 12 / 0.35 / 0% | 48 / 0.36 / 0% | 23 / 0.76 / 5% | 22 / 1.67 / 2% | bison 277.5, wolf 97.5, raven unaffected, pronghorn 35.0, rabbit 118.8, cougar 33.8, coyote 60.0, prairiedog 17.5, muledeer 43.8 |
| 18 | 720000 | 342.8 | 573 / 0.39 / 0% | 60 / 0.25 / 0% | 532 / 0.18 / 0% | 364 / 0.31 / 0% | 640 / 0.35 / 0% | 9 / 0.42 / 1% | 56 / 0.38 / 1% | 29 / 0.49 / 0% | 15 / 0.58 / 1% | bison 13.8, wolf 55.0, raven 21.3, pronghorn 17.5, rabbit 50.0, cougar 16.3, coyote 53.8, prairiedog 48.8, muledeer 138.8 |
| 19 | 720000 | 347.2 | 555 / 0.38 / 0% | 64 / 0.23 / 0% | 550 / 0.17 / 0% | 344 / 0.31 / 0% | 825 / 0.28 / 0% | 9 / 0.45 / 2% | 49 / 0.41 / 0% | 27 / 0.55 / 1% | 21 / 1.46 / 3% | bison 15.0, wolf 51.3, raven 15.0, pronghorn 10.0, rabbit 25.0, cougar 82.5, coyote 187.5, prairiedog 96.3, muledeer 85.0 |
| 20 | 720000 | 348.4 | 710 / 0.42 / 1% | 64 / 0.25 / 0% | 557 / 0.17 / 0% | 417 / 0.39 / 0% | 830 / 0.30 / 0% | 9 / 0.39 / 1% | 56 / 0.33 / 0% | 47 / 0.44 / 0% | 17 / 1.48 / 1% | bison 17.5, wolf 75.0, raven 15.0, pronghorn 17.5, rabbit 55.0, cougar 152.5, coyote 10.0, prairiedog 23.8, muledeer unaffected |
