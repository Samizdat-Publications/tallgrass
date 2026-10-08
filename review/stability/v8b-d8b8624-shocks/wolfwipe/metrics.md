# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit d8b8624 (frozen copy); real sim
- Params: {"snowDepth":1,"dynamicTrees":1,"treeCwRecruit":0.003,"dogRescueYears":8}
- Shocks: wolves removed at tick 252000 (year 210.0); introduce 8 wolves at tick 360000 (year 300.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 711 | 0.49 | 0.0% | 0.0 | 3.88 | 52 | 10.0 (20 seeds) | 100% | 95% | 28.8 |
| wolf | 20/20 (100%) | 61 | 0.32 | 2.7% | 13.8 | 1.88 | 51 | 10.0 (11 seeds) | 100% | 70% | 71.3 |
| raven | 20/20 (100%) | 552 | 0.17 | 0.0% | 0.0 | 1.24 | 45 | 10.0 (20 seeds) | 85% | 95% | 52.5 |
| pronghorn | 20/20 (100%) | 412 | 0.41 | 0.0% | 0.0 | 3.60 | 59 | 10.0 (18 seeds) | 100% | 100% | 54.4 |
| rabbit | 20/20 (100%) | 759 | 0.33 | 0.0% | 0.0 | 1.98 | 51 | 99.4 (10 seeds) | 100% | 100% | 50.0 |
| cougar | 20/20 (100%) | 8 | 0.47 | 3.4% | 4.4 | 2.30 | 80 | 31.3 (5 seeds) | 100% | 100% | 28.8 |
| coyote | 20/20 (100%) | 49 | 0.40 | 0.1% | 0.6 | 2.39 | 77 | 30.0 (13 seeds) | 100% | 95% | 70.0 |
| prairiedog | 19/20 (95%) | 33 | 0.60 | 0.6% | 2.5 | 3.09 | 35 | 185.0 (5 seeds) | 100% | 90% | 52.5 |
| muledeer | 20/20 (100%) | 16 | 1.21 | 2.1% | 1.3 | 10.47 | 82 | 73.8 (5 seeds) | 85% | 90% | 66.9 |

Max bison generation depth reached: 367.5 (median across seeds 349.0).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 98.2% | 2.2 | 9.4 | 0.7 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3199.7 | 7553.4 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 96.9% | 13.1 | 15.6 | 6.6 | 0.0 |
| coyote | 100.0% | 0.1 | 0.0 | 98.4 | 829.7 |
| prairiedog | 100.0% | 0.6 | 0.0 | 36.4 | 0.0 |
| muledeer | 99.5% | 4.7 | 2.5 | 337.9 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | 3.3 | 128 | 141 | 20 | 23 | 0.9 |
| 2 | 37 | 6.2 | 146 | 164 | 26 | 25 | 1.7 |
| 3 | 21 | 3.5 | 124 | 136 | 24 | 25 | 1.1 |
| 4 | 39 | 6.5 | 168 | 172 | 28 | 27 | 1.4 |
| 5 | 59 | 9.8 | 233 | 260 | 25 | 22 | 2.4 |
| 6 | 25 | 4.2 | 138 | 153 | 31 | 27 | 1.1 |
| 7 | 40 | 6.7 | 194 | 205 | 26 | 30 | 1.6 |
| 8 | 36 | 6.0 | 167 | 188 | 28 | 26 | 1.6 |
| 9 | 29 | 4.8 | 124 | 129 | 32 | 35 | 1.2 |
| 10 | 35 | 5.8 | 196 | 214 | 24 | 20 | 1.7 |
| 11 | 27 | 4.5 | 170 | 189 | 28 | 26 | 1.3 |
| 12 | 65 | 10.8 | 261 | 283 | 21 | 20 | 2.6 |
| 13 | 42 | 7.0 | 224 | 245 | 29 | 27 | 1.6 |
| 14 | 47 | 7.8 | 249 | 276 | 23 | 28 | 2.2 |
| 15 | 45 | 7.5 | 210 | 227 | 25 | 23 | 1.8 |
| 16 | 38 | 6.3 | 187 | 202 | 26 | 27 | 1.6 |
| 17 | 21 | 3.5 | 157 | 163 | 26 | 23 | 1.1 |
| 18 | 38 | 6.3 | 159 | 178 | 33 | 25 | 1.2 |
| 19 | 42 | 7.0 | 203 | 220 | 21 | 26 | 1.7 |
| 20 | 50 | 8.3 | 215 | 233 | 23 | 24 | 2.3 |

Median plagues per 100 years across seeds: 6.3 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.40. Hare CV: 0.33 (annual means 0.33).
- Best half-year-mean correlation (median): 0.23 at a lag of 1.0 years; 0% of seeds reach 0.4. Annual-mean best (median): 0.23.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.40 | 0.33 | 0.19 | 0.18 | 0.18 | 0.08 | 0.19 | 0.18 |
| 2 | 0.40 | 0.30 | 0.16 | 0.23 | 0.17 | 0.04 | 0.16 | 0.23 |
| 3 | 0.38 | 0.34 | 0.08 | 0.09 | 0.09 | -0.01 | 0.08 | 0.09 |
| 4 | 0.42 | 0.33 | 0.27 | 0.32 | 0.29 | 0.22 | 0.27 | 0.32 |
| 5 | 0.41 | 0.30 | 0.19 | 0.18 | 0.14 | 0.02 | 0.19 | 0.18 |
| 6 | 0.45 | 0.36 | 0.10 | 0.14 | 0.09 | -0.04 | 0.10 | 0.14 |
| 7 | 0.41 | 0.34 | 0.27 | 0.30 | 0.26 | 0.16 | 0.27 | 0.30 |
| 8 | 0.42 | 0.34 | 0.28 | 0.30 | 0.29 | 0.12 | 0.28 | 0.30 |
| 9 | 0.39 | 0.35 | 0.24 | 0.22 | 0.18 | 0.02 | 0.24 | 0.22 |
| 10 | 0.38 | 0.31 | -0.03 | -0.09 | -0.12 | -0.20 | -0.03 | -0.09 |
| 11 | 0.43 | 0.32 | 0.23 | 0.24 | 0.20 | 0.10 | 0.23 | 0.24 |
| 12 | 0.41 | 0.34 | 0.06 | 0.12 | 0.13 | 0.05 | 0.06 | 0.12 |
| 13 | 0.41 | 0.33 | 0.13 | 0.16 | 0.16 | 0.08 | 0.13 | 0.16 |
| 14 | 0.38 | 0.31 | 0.32 | 0.37 | 0.35 | 0.23 | 0.32 | 0.37 |
| 15 | 0.40 | 0.30 | 0.29 | 0.30 | 0.26 | 0.18 | 0.29 | 0.30 |
| 16 | 0.34 | 0.33 | 0.19 | 0.13 | 0.06 | -0.02 | 0.19 | 0.13 |
| 17 | 0.35 | 0.30 | 0.36 | 0.39 | 0.32 | 0.13 | 0.36 | 0.39 |
| 18 | 0.37 | 0.35 | 0.26 | 0.23 | 0.19 | 0.10 | 0.26 | 0.23 |
| 19 | 0.39 | 0.31 | 0.01 | -0.01 | -0.04 | -0.09 | 0.01 | -0.01 |
| 20 | 0.35 | 0.32 | 0.29 | 0.28 | 0.24 | 0.14 | 0.29 | 0.28 |

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
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |
| muledeer | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 358.3 | 711 / 0.52 / 0% | 59 / 0.28 / 0% | 553 / 0.18 / 0% | 412 / 0.41 / 0% | 736 / 0.33 / 0% | 8 / 0.47 / 1% | 52 / 0.40 / 0% | 21 / 0.56 / 1% | 14 / 0.66 / 1% | bison 52.5, wolf never, raven 91.3, pronghorn 55.0, rabbit 36.3, cougar 86.3, coyote 100.0, prairiedog 105.0, muledeer unaffected |
| 2 | 720000 | 358.4 | 728 / 0.50 / 1% | 63 / 0.36 / 5% | 550 / 0.18 / 0% | 444 / 0.49 / 0% | 775 / 0.30 / 0% | 7 / 0.57 / 8% | 52 / 0.40 / 0% | 33 / 0.60 / 0% | 14 / 1.16 / 2% | bison 35.0, wolf never, raven 183.8, pronghorn 13.8, rabbit 16.3, cougar 12.5, coyote 127.5, prairiedog never, muledeer 28.8 |
| 3 | 720000 | 348.0 | 785 / 0.51 / 0% | 59 / 0.35 / 4% | 557 / 0.18 / 0% | 411 / 0.41 / 0% | 774 / 0.34 / 0% | 10 / 0.49 / 4% | 53 / 0.38 / 0% | 39 / 1.07 / 5% | 21 / 1.76 / 2% | bison 20.0, wolf 42.5, raven 15.0, pronghorn 18.8, rabbit 18.8, cougar 18.8, coyote 81.3, prairiedog 208.8, muledeer 43.8 |
| 4 | 720000 | 318.7 | 703 / 0.45 / 0% | 56 / 0.36 / 4% | 551 / 0.17 / 0% | 414 / 0.46 / 0% | 743 / 0.33 / 0% | 9 / 0.44 / 2% | 44 / 0.42 / 1% | 29 / 0.61 / 0% | 73 / 1.24 / 10% | bison 106.3, wolf never, raven 52.5, pronghorn 108.8, rabbit 60.0, cougar 26.3, coyote 37.5, prairiedog 38.8, muledeer 7.5 |
| 5 | 720000 | 349.9 | 690 / 0.50 / 0% | 68 / 0.28 / 1% | 546 / 0.18 / 0% | 411 / 0.39 / 0% | 818 / 0.30 / 0% | 8 / 0.39 / 1% | 44 / 0.41 / 0% | 76 / 0.69 / 0% | 14 / 1.03 / 1% | bison 55.0, wolf 215.0, raven 163.8, pronghorn 62.5, rabbit 22.5, cougar 25.0, coyote 37.5, prairiedog 73.8, muledeer 108.8 |
| 6 | 720000 | 340.1 | 763 / 0.42 / 0% | 63 / 0.43 / 8% | 562 / 0.16 / 0% | 421 / 0.46 / 0% | 733 / 0.36 / 0% | 7 / 0.48 / 3% | 45 / 0.45 / 1% | 22 / 0.71 / 2% | 30 / 1.69 / 2% | bison 28.8, wolf 67.5, raven 30.0, pronghorn 28.8, rabbit 86.3, cougar 31.3, coyote 45.0, prairiedog 62.5, muledeer 8.8 |
| 7 | 720000 | 331.1 | 830 / 0.42 / 0% | 60 / 0.34 / 3% | 570 / 0.15 / 0% | 468 / 0.46 / 0% | 759 / 0.34 / 0% | 10 / 0.39 / 0% | 45 / 0.41 / 0% | 36 / 0.60 / 0% | 14 / 0.79 / 1% | bison 21.3, wolf 75.0, raven 288.8, pronghorn 61.3, rabbit 62.5, cougar 18.8, coyote 37.5, prairiedog 177.5, muledeer 218.8 |
| 8 | 720000 | 343.9 | 663 / 0.45 / 0% | 59 / 0.33 / 3% | 552 / 0.16 / 0% | 378 / 0.38 / 0% | 776 / 0.34 / 0% | 8 / 0.50 / 4% | 46 / 0.42 / 0% | 41 / 0.66 / 3% | 36 / 1.53 / 4% | bison 26.3, wolf 277.5, raven 26.3, pronghorn 23.8, rabbit 58.8, cougar 41.3, coyote 261.3, prairiedog never, muledeer never |
| 9 | 720000 | 318.4 | 643 / 0.49 / 0% | 55 / 0.40 / 4% | 519 / 0.20 / 0% | 445 / 0.43 / 0% | 657 / 0.35 / 0% | 6 / 0.57 / 5% | 54 / 0.39 / 0% | 22 / 0.86 / 7% | 27 / 1.39 / 2% | bison never, wolf never, raven never, pronghorn 16.3, rabbit 42.5, cougar 50.0, coyote 101.3, prairiedog 15.0, muledeer never |
| 10 | 720000 | 355.0 | 715 / 0.50 / 0% | 54 / 0.46 / 11% | 549 / 0.17 / 0% | 454 / 0.47 / 0% | 742 / 0.31 / 0% | 6 / 0.56 / 7% | 59 / 0.38 / 0% | 36 / 0.50 / 0% | 25 / 2.05 / 1% | bison 8.8, wolf 111.3, raven 56.3, pronghorn 256.3, rabbit 28.8, cougar 46.3, coyote 33.8, prairiedog 53.8, muledeer unaffected |
| 11 | 720000 | 358.4 | 666 / 0.48 / 0% | 62 / 0.26 / 0% | 546 / 0.18 / 0% | 452 / 0.40 / 0% | 736 / 0.32 / 0% | 7 / 0.47 / 3% | 45 / 0.43 / 1% | 27 / 0.64 / 0% | 12 / 0.58 / 3% | bison 12.5, wolf 25.0, raven 15.0, pronghorn 158.8, rabbit 13.8, cougar 20.0, coyote 8.8, prairiedog 203.8, muledeer 90.0 |
| 12 | 720000 | 333.0 | 755 / 0.53 / 0% | 63 / 0.42 / 8% | 552 / 0.18 / 0% | 437 / 0.48 / 0% | 860 / 0.34 / 0% | 8 / 0.52 / 4% | 50 / 0.41 / 0% | 50 / 0.47 / 0% | 35 / 2.18 / 7% | bison 22.5, wolf 170.0, raven 111.3, pronghorn 57.5, rabbit 92.5, cougar 26.3, coyote 242.5, prairiedog 67.5, muledeer unaffected |
| 13 | 720000 | 367.5 | 634 / 0.52 / 0% | 67 / 0.29 / 2% | 544 / 0.18 / 0% | 412 / 0.38 / 0% | 816 / 0.33 / 0% | 8 / 0.47 / 4% | 47 / 0.41 / 0% | 36 / 0.68 / 1% | 14 / 1.05 / 2% | bison 43.8, wolf 95.0, raven 81.3, pronghorn 53.8, rabbit 21.3, cougar 102.5, coyote 50.0, prairiedog 11.3, muledeer 245.0 |
| 14 | 720000 | 326.9 | 857 / 0.45 / 0% | 69 / 0.27 / 0% | 571 / 0.16 / 0% | 389 / 0.35 / 0% | 748 / 0.31 / 0% | 9 / 0.52 / 3% | 48 / 0.38 / 0% | 54 / 0.48 / 0% | 12 / 0.48 / 2% | bison 32.5, wolf 105.0, raven 61.3, pronghorn 130.0, rabbit 87.5, cougar 103.8, coyote 91.3, prairiedog 42.5, muledeer 180.0 |
| 15 | 720000 | 359.7 | 829 / 0.41 / 0% | 73 / 0.29 / 1% | 588 / 0.13 / 0% | 338 / 0.44 / 0% | 783 / 0.30 / 0% | 9 / 0.41 / 2% | 49 / 0.40 / 0% | 32 / 0.41 / 0% | 13 / 0.71 / 0% | bison 66.3, wolf never, raven unaffected, pronghorn 11.3, rabbit 96.3, cougar 48.8, coyote 70.0, prairiedog 18.8, muledeer 150.0 |
| 16 | 720000 | 354.6 | 700 / 0.40 / 0% | 59 / 0.29 / 2% | 561 / 0.16 / 0% | 374 / 0.30 / 0% | 744 / 0.33 / 0% | 10 / 0.59 / 5% | 49 / 0.34 / 0% | 33 / 0.61 / 1% EXTINCT@600.0yr | 16 / 1.19 / 1% | bison 22.5, wolf 41.3, raven unaffected, pronghorn 22.5, rabbit 26.3, cougar 26.3, coyote 78.8, prairiedog 27.5, muledeer 207.5 |
| 17 | 720000 | 359.5 | 593 / 0.53 / 0% | 62 / 0.26 / 1% | 544 / 0.18 / 0% | 367 / 0.34 / 0% | 759 / 0.30 / 0% | 9 / 0.39 / 2% | 50 / 0.35 / 0% | 20 / 0.49 / 1% | 24 / 1.61 / 2% | bison 116.3, wolf 60.0, raven unaffected, pronghorn 180.0, rabbit 57.5, cougar 52.5, coyote 48.8, prairiedog 57.5, muledeer 37.5 |
| 18 | 720000 | 331.9 | 669 / 0.49 / 0% | 60 / 0.32 / 1% | 536 / 0.19 / 0% | 435 / 0.42 / 0% | 656 / 0.35 / 0% | 8 / 0.43 / 1% | 55 / 0.37 / 0% | 28 / 0.50 / 1% | 14 / 0.60 / 0% | bison 37.5, wolf never, raven 30.0, pronghorn 36.3, rabbit 72.5, cougar 38.8, coyote 21.3, prairiedog 12.5, muledeer 93.8 |
| 19 | 720000 | 344.3 | 732 / 0.46 / 0% | 56 / 0.34 / 4% | 569 / 0.15 / 0% | 352 / 0.38 / 0% | 769 / 0.31 / 0% | 7 / 0.46 / 4% | 49 / 0.39 / 0% | 27 / 0.44 / 1% | 31 / 1.52 / 2% | bison 28.8, wolf 12.5, raven 65.0, pronghorn 41.3, rabbit 17.5, cougar 17.5, coyote never, prairiedog 36.3, muledeer 31.3 |
| 20 | 720000 | 351.9 | 710 / 0.47 / 0% | 62 / 0.28 / 1% | 565 / 0.15 / 0% | 387 / 0.43 / 0% | 826 / 0.32 / 0% | 9 / 0.39 / 1% | 55 / 0.35 / 0% | 60 / 0.47 / 0% | 17 / 1.47 / 2% | bison 25.0, wolf 22.5, raven 46.3, pronghorn 68.8, rabbit 62.5, cougar 15.0, coyote 85.0, prairiedog 51.3, muledeer 193.8 |
