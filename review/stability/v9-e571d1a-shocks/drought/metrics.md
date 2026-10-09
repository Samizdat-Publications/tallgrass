# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit e571d1a (frozen copy); real sim
- Params: {"ravenNestFood":1,"muledeerCover":0.15,"bison.initial":550}
- Shocks: drought (2 yr) at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 644 | 0.44 | 0.0% | 0.0 | 2.95 | 54 | 8.8 (19 seeds) | 100% | 95% | 22.5 |
| wolf | 19/20 (95%) | 63 | 0.26 | 0.0% | 0.0 | 1.80 | 52 | 8.8 (19 seeds) | 100% | 95% | 22.5 |
| raven | 20/20 (100%) | 750 | 0.30 | 0.0% | 0.0 | 1.34 | 50 | 8.8 (19 seeds) | 95% | 95% | 18.8 |
| pronghorn | 20/20 (100%) | 369 | 0.36 | 0.0% | 0.0 | 2.88 | 61 | 10.0 (20 seeds) | 100% | 95% | 25.0 |
| rabbit | 20/20 (100%) | 766 | 0.32 | 0.0% | 0.0 | 1.95 | 50 | 90.0 (11 seeds) | 100% | 100% | 46.9 |
| cougar | 20/20 (100%) | 8 | 0.46 | 3.3% | 5.6 | 2.28 | 83 | 160.0 (7 seeds) | 100% | 95% | 37.5 |
| coyote | 20/20 (100%) | 47 | 0.37 | 0.1% | 0.6 | 2.22 | 78 | 20.0 (13 seeds) | 100% | 95% | 25.0 |
| prairiedog | 19/20 (95%) | 37 | 0.57 | 0.1% | 0.6 | 3.12 | 34 | 128.8 (8 seeds) | 100% | 100% | 50.0 |
| muledeer | 20/20 (100%) | 15 | 1.30 | 1.8% | 1.3 | 9.64 | 80 | 40.0 (7 seeds) | 100% | 95% | 46.3 |

Max bison generation depth reached: 362.0 (median across seeds 339.1).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.1 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 1.6 | 0.0 | 0.5 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3494.7 | 7030.3 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 96.7% | 13.8 | 16.9 | 6.4 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 100.3 | 748.3 |
| prairiedog | 100.0% | 2.6 | 0.0 | 33.3 | 0.0 |
| muledeer | 99.5% | 5.5 | 2.5 | 337.1 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 44 | 7.3 | 216 | 231 | 18 | 17 | 1.7 |
| 2 | 39 | 6.5 | 165 | 172 | 21 | 24 | 1.4 |
| 3 | 33 | 5.5 | 156 | 169 | 28 | 20 | 1.6 |
| 4 | 68 | 11.3 | 238 | 254 | 22 | 20 | 3.3 |
| 5 | 43 | 7.2 | 220 | 244 | 28 | 31 | 2.0 |
| 6 | 26 | 4.3 | 142 | 151 | 28 | 26 | 1.2 |
| 7 | 39 | 6.5 | 179 | 190 | 26 | 26 | 1.8 |
| 8 | 44 | 7.3 | 177 | 204 | 29 | 26 | 2.1 |
| 9 | 26 | 4.3 | 168 | 177 | 31 | 33 | 0.9 |
| 10 | 38 | 6.3 | 205 | 225 | 27 | 26 | 1.5 |
| 11 | 67 | 11.2 | 286 | 303 | 27 | 24 | 2.7 |
| 12 | 51 | 8.5 | 235 | 271 | 23 | 25 | 2.5 |
| 13 | 24 | 4.0 | 147 | 153 | 27 | 30 | 1.0 |
| 14 | 43 | 7.2 | 185 | 205 | 24 | 26 | 1.7 |
| 15 | 45 | 7.5 | 182 | 203 | 31 | 26 | 1.3 |
| 16 | 66 | 11.0 | 263 | 285 | 26 | 28 | 2.4 |
| 17 | 30 | 5.0 | 191 | 196 | 23 | 27 | 1.5 |
| 18 | 45 | 7.5 | 156 | 167 | 29 | 26 | 1.8 |
| 19 | 34 | 5.7 | 204 | 217 | 24 | 29 | 2.0 |
| 20 | 16 | 2.7 | 108 | 123 | 35 | 27 | 0.8 |

Median plagues per 100 years across seeds: 6.8 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.37. Hare CV: 0.32 (annual means 0.32).
- Best half-year-mean correlation (median): 0.37 at a lag of 1.0 years; 30% of seeds reach 0.4. Annual-mean best (median): 0.35.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.35 | 0.31 | 0.21 | 0.26 | 0.31 | 0.15 | 0.21 | 0.26 |
| 2 | 0.37 | 0.30 | 0.45 | 0.43 | 0.35 | 0.16 | 0.45 | 0.43 |
| 3 | 0.39 | 0.31 | 0.33 | 0.35 | 0.37 | 0.27 | 0.33 | 0.35 |
| 4 | 0.38 | 0.31 | 0.31 | 0.36 | 0.35 | 0.27 | 0.31 | 0.36 |
| 5 | 0.36 | 0.31 | 0.32 | 0.38 | 0.33 | 0.20 | 0.32 | 0.38 |
| 6 | 0.37 | 0.31 | 0.33 | 0.36 | 0.28 | 0.12 | 0.33 | 0.36 |
| 7 | 0.39 | 0.34 | 0.47 | 0.48 | 0.38 | 0.20 | 0.47 | 0.48 |
| 8 | 0.39 | 0.33 | 0.42 | 0.43 | 0.38 | 0.21 | 0.42 | 0.43 |
| 9 | 0.37 | 0.32 | 0.42 | 0.40 | 0.29 | 0.13 | 0.42 | 0.40 |
| 10 | 0.34 | 0.32 | 0.31 | 0.34 | 0.34 | 0.24 | 0.31 | 0.34 |
| 11 | 0.37 | 0.32 | 0.37 | 0.39 | 0.37 | 0.28 | 0.37 | 0.39 |
| 12 | 0.37 | 0.32 | 0.29 | 0.31 | 0.31 | 0.19 | 0.29 | 0.31 |
| 13 | 0.39 | 0.32 | 0.40 | 0.40 | 0.35 | 0.20 | 0.40 | 0.40 |
| 14 | 0.40 | 0.33 | 0.30 | 0.34 | 0.31 | 0.22 | 0.30 | 0.34 |
| 15 | 0.35 | 0.30 | 0.31 | 0.29 | 0.22 | 0.11 | 0.31 | 0.29 |
| 16 | 0.39 | 0.33 | 0.17 | 0.21 | 0.20 | 0.09 | 0.17 | 0.21 |
| 17 | 0.37 | 0.32 | 0.25 | 0.35 | 0.37 | 0.27 | 0.25 | 0.35 |
| 18 | 0.35 | 0.33 | 0.38 | 0.40 | 0.37 | 0.27 | 0.38 | 0.40 |
| 19 | 0.38 | 0.29 | 0.29 | 0.34 | 0.29 | 0.17 | 0.29 | 0.34 |
| 20 | 0.39 | 0.41 | -0.14 | -0.22 | -0.29 | -0.34 | -0.14 | -0.22 |

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
| 1 | 720000 | 341.0 | 564 / 0.48 / 0% | 66 / 0.23 / 0% | 701 / 0.34 / 0% | 348 / 0.34 / 0% | 773 / 0.31 / 0% | 8 / 0.46 / 3% | 53 / 0.35 / 0% | 37 / 0.51 / 0% | 29 / 1.78 / 2% | bison 110.0, wolf 38.8, raven 326.3, pronghorn 103.8, rabbit 32.5, cougar 13.8, coyote 17.5, prairiedog 81.3, muledeer 43.8 |
| 2 | 720000 | 337.3 | 606 / 0.42 / 0% | 62 / 0.23 / 0% | 733 / 0.30 / 0% | 362 / 0.31 / 0% | 747 / 0.30 / 0% | 8 / 0.44 / 3% | 46 / 0.37 / 0% | 28 / 0.47 / 0% | 29 / 1.34 / 1% | bison 15.0, wolf 77.5, raven 16.3, pronghorn 17.5, rabbit 51.3, cougar 136.3, coyote 46.3, prairiedog 45.0, muledeer 32.5 |
| 3 | 720000 | 328.1 | 631 / 0.55 / 1% | 69 / 0.28 / 0% | 724 / 0.33 / 0% | 368 / 0.38 / 0% | 817 / 0.31 / 0% | 10 / 0.41 / 1% | 45 / 0.39 / 0% | 32 / 0.64 / 4% | 12 / 0.53 / 1% | bison 22.5, wolf 266.3, raven 48.8, pronghorn 16.3, rabbit 47.5, cougar 20.0, coyote 50.0, prairiedog 50.0, muledeer 50.0 |
| 4 | 720000 | 350.1 | 584 / 0.56 / 0% | 66 / 0.24 / 0% | 704 / 0.35 / 0% | 406 / 0.47 / 0% | 922 / 0.31 / 0% | 10 / 0.39 / 0% | 37 / 0.38 / 0% | 130 / 0.42 / 0% | 13 / 0.93 / 1% | bison 75.0, wolf 116.3, raven 286.3, pronghorn 76.3, rabbit 63.8, cougar 60.0, coyote 20.0, prairiedog 12.5, muledeer 73.8 |
| 5 | 720000 | 337.5 | 760 / 0.44 / 1% | 66 / 0.24 / 0% | 782 / 0.27 / 0% | 473 / 0.44 / 0% | 722 / 0.31 / 0% | 8 / 0.51 / 5% | 48 / 0.36 / 0% | 47 / 0.51 / 0% | 13 / 0.64 / 2% | bison 21.3, wolf 18.8, raven 18.8, pronghorn 25.0, rabbit 95.0, cougar 27.5, coyote 17.5, prairiedog 17.5, muledeer 17.5 |
| 6 | 720000 | 320.8 | 642 / 0.45 / 2% | 61 / 0.26 / 0% | 756 / 0.28 / 0% | 348 / 0.31 / 0% | 683 / 0.31 / 0% | 8 / 0.48 / 3% | 54 / 0.37 / 1% | 26 / 0.89 / 7% | 33 / 1.62 / 3% | bison 31.3, wolf 22.5, raven 33.8, pronghorn 21.3, rabbit 13.8, cougar 18.8, coyote 25.0, prairiedog 148.8, muledeer 7.5 |
| 7 | 720000 | 350.4 | 702 / 0.42 / 0% | 73 / 0.28 / 0% | 772 / 0.26 / 0% | 354 / 0.38 / 0% | 819 / 0.34 / 0% | 8 / 0.49 / 4% | 49 / 0.39 / 0% | 40 / 0.57 / 0% | 12 / 0.49 / 3% | bison 27.5, wolf 20.0, raven 13.8, pronghorn 10.0, rabbit 72.5, cougar 47.5, coyote 30.0, prairiedog 85.0, muledeer 46.3 |
| 8 | 720000 | 339.2 | 623 / 0.45 / 0% | 62 / 0.24 / 0% | 754 / 0.29 / 0% | 370 / 0.32 / 0% | 834 / 0.33 / 0% | 8 / 0.48 / 4% | 42 / 0.39 / 0% | 50 / 0.52 / 0% | 14 / 1.27 / 2% | bison 25.0, wolf 15.0, raven 15.0, pronghorn 16.3, rabbit 116.3, cougar 66.3, coyote 16.3, prairiedog 22.5, muledeer 18.8 |
| 9 | 720000 | 339.0 | 607 / 0.43 / 0% | 55 / 0.24 / 0% | 728 / 0.30 / 0% | 415 / 0.30 / 0% | 663 / 0.32 / 0% | 8 / 0.47 / 2% | 53 / 0.37 / 0% | 19 / 0.66 / 0% | 14 / 0.63 / 1% | bison 20.0, wolf 81.3, raven 230.0, pronghorn 20.0, rabbit 21.3, cougar 21.3, coyote 25.0, prairiedog 86.3, muledeer 143.8 |
| 10 | 720000 | 362.0 | 700 / 0.45 / 0% | 58 / 0.24 / 0% | 775 / 0.28 / 0% | 389 / 0.39 / 0% | 714 / 0.32 / 0% | 7 / 0.49 / 5% | 48 / 0.34 / 0% | 33 / 0.81 / 5% | 13 / 0.58 / 3% | bison 11.3, wolf 10.0, raven 12.5, pronghorn 53.8, rabbit 15.0, cougar 57.5, coyote 98.8, prairiedog 290.0, muledeer 33.8 |
| 11 | 720000 | 333.6 | 666 / 0.43 / 0% | 63 / 0.26 / 0% | 759 / 0.30 / 0% | 354 / 0.36 / 0% | 811 / 0.32 / 0% | 9 / 0.45 / 0% | 42 / 0.37 / 0% | 66 / 0.61 / 0% | 33 / 1.73 / 2% | bison 8.8, wolf 15.0, raven unaffected, pronghorn 57.5, rabbit 46.3, cougar 52.5, coyote 158.8, prairiedog 22.5, muledeer 62.5 |
| 12 | 720000 | 348.0 | 647 / 0.46 / 0% | 62 / 0.26 / 0% | 739 / 0.30 / 0% | 423 / 0.43 / 0% | 792 / 0.32 / 0% | 8 / 0.43 / 4% | 45 / 0.37 / 1% | 61 / 0.53 / 1% | 26 / 1.46 / 1% | bison 25.0, wolf 35.0, raven 125.0, pronghorn 90.0, rabbit 48.8, cougar 15.0, coyote 15.0, prairiedog 37.5, muledeer 27.5 |
| 13 | 720000 | 350.3 | 654 / 0.44 / 0% | 63 / 0.27 / 0% | 745 / 0.29 / 0% | 403 / 0.38 / 0% | 737 / 0.32 / 0% | 8 / 0.47 / 4% | 48 / 0.39 / 0% | 23 / 0.57 / 3% | 29 / 1.41 / 3% | bison 12.5, wolf 65.0, raven 15.0, pronghorn 16.3, rabbit 35.0, cougar 31.3, coyote 50.0, prairiedog 128.8, muledeer never |
| 14 | 720000 | 359.5 | 740 / 0.43 / 0% | 75 / 0.28 / 0% | 791 / 0.25 / 0% | 356 / 0.37 / 0% | 758 / 0.33 / 0% | 10 / 0.42 / 2% | 44 / 0.40 / 1% | 39 / 0.45 / 0% | 16 / 1.45 / 3% | bison 18.8, wolf 13.8, raven 13.8, pronghorn 182.5, rabbit 11.3, cougar 21.3, coyote 13.8, prairiedog 50.0, muledeer 268.8 |
| 15 | 720000 | 358.6 | 750 / 0.44 / 2% | 66 / 0.29 / 0% | 799 / 0.25 / 0% | 349 / 0.33 / 0% | 722 / 0.30 / 0% | 9 / 0.35 / 1% | 43 / 0.35 / 0% | 32 / 0.70 / 6% | 12 / 0.53 / 3% | bison 31.3, wolf 22.5, raven 35.0, pronghorn 36.3, rabbit 55.0, cougar 16.3, coyote 16.3, prairiedog 33.8, muledeer 73.8 |
| 16 | 720000 | 331.9 | 675 / 0.42 / 0% | 63 / 0.26 / 0% | 780 / 0.26 / 0% | 346 / 0.35 / 0% | 821 / 0.33 / 0% | 9 / 0.40 / 1% | 48 / 0.39 / 0% | 51 / 0.47 / 0% | 26 / 1.63 / 3% | bison 46.3, wolf 26.3, raven 140.0, pronghorn 42.5, rabbit 55.0, cougar 62.5, coyote 90.0, prairiedog 121.3, muledeer 62.5 |
| 17 | 720000 | 333.5 | 636 / 0.42 / 0% | 67 / 0.27 / 0% | 743 / 0.30 / 0% | 385 / 0.36 / 0% | 815 / 0.32 / 0% | 8 / 0.45 / 2% | 38 / 0.37 / 0% | 27 / 0.68 / 1% | 15 / 1.45 / 1% | bison 117.5, wolf 21.3, raven 118.8, pronghorn 106.3, rabbit 32.5, cougar 37.5, coyote 21.3, prairiedog 8.8, muledeer 133.8 |
| 18 | 720000 | 359.3 | 750 / 0.42 / 0% | 61 / 0.25 / 0% | 775 / 0.27 / 0% | 445 / 0.37 / 0% | 724 / 0.33 / 0% | 7 / 0.47 / 4% | 48 / 0.35 / 0% | 52 / 0.47 / 0% | 16 / 1.64 / 0% | bison 12.5, wolf 51.3, raven 15.0, pronghorn 21.3, rabbit 50.0, cougar 40.0, coyote 150.0, prairiedog 75.0, muledeer 15.0 |
| 19 | 720000 | 310.8 | 562 / 0.47 / 0% | 62 / 0.30 / 0% | 678 / 0.37 / 0% | 359 / 0.34 / 0% | 789 / 0.29 / 0% | 8 / 0.47 / 2% | 46 / 0.38 / 0% | 37 / 0.64 / 0% | 13 / 0.52 / 1% | bison 15.0, wolf 8.8, raven 15.0, pronghorn 10.0, rabbit 23.8, cougar 61.3, coyote 73.8, prairiedog 253.8, muledeer 90.0 |
| 20 | 720000 | 121.2 | 214 / 1.64 / 69% EXTINCT@255.0yr | 21 / 1.22 / 45% EXTINCT@600.0yr | 249 / 1.35 / 40% | 609 / 0.69 / 0% | 502 / 0.41 / 0% | 4 / 0.96 / 26% | 73 / 0.39 / 0% | 17 / 1.19 / 25% EXTINCT@600.0yr | 42 / 1.26 / 2% | bison never, wolf never, raven never, pronghorn never, rabbit 36.3, cougar never, coyote never, prairiedog 17.5, muledeer 8.8 |
