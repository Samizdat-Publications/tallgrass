# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit e571d1a (frozen copy); real sim
- Params: {"ravenNestFood":1,"muledeerCover":0.15,"bison.initial":550}
- Shocks: cull 70% bison at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 643 | 0.43 | 0.0% | 0.0 | 2.73 | 54 | 8.8 (20 seeds) | 100% | 100% | 25.0 |
| wolf | 20/20 (100%) | 64 | 0.25 | 0.0% | 0.0 | 1.75 | 53 | 9.4 (20 seeds) | 100% | 90% | 33.1 |
| raven | 20/20 (100%) | 751 | 0.29 | 0.0% | 0.0 | 1.34 | 51 | 8.8 (20 seeds) | 85% | 100% | 26.3 |
| pronghorn | 20/20 (100%) | 365 | 0.35 | 0.0% | 0.0 | 2.69 | 62 | 10.0 (20 seeds) | 100% | 100% | 30.0 |
| rabbit | 20/20 (100%) | 779 | 0.31 | 0.0% | 0.0 | 2.00 | 49 | 107.5 (12 seeds) | 100% | 100% | 33.8 |
| cougar | 20/20 (100%) | 9 | 0.43 | 1.7% | 3.1 | 2.28 | 79 | 85.0 (9 seeds) | 100% | 100% | 33.1 |
| coyote | 20/20 (100%) | 46 | 0.39 | 0.2% | 1.3 | 2.36 | 77 | 25.0 (15 seeds) | 100% | 100% | 25.0 |
| prairiedog | 20/20 (100%) | 44 | 0.55 | 0.0% | 0.0 | 2.97 | 34 | 172.5 (4 seeds) | 100% | 100% | 52.5 |
| muledeer | 20/20 (100%) | 15 | 1.36 | 1.7% | 1.3 | 9.67 | 79 | 26.3 (5 seeds) | 95% | 100% | 65.0 |

Max bison generation depth reached: 389.4 (median across seeds 343.1).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3682.3 | 6065.6 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 98.3% | 8.0 | 8.8 | 4.5 | 0.0 |
| coyote | 100.0% | 0.1 | 0.0 | 99.0 | 756.4 |
| prairiedog | 100.0% | 0.4 | 0.0 | 26.8 | 0.0 |
| muledeer | 99.6% | 4.5 | 1.9 | 342.0 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 36 | 6.0 | 194 | 215 | 18 | 18 | 2.2 |
| 2 | 40 | 6.7 | 145 | 161 | 25 | 23 | 1.3 |
| 3 | 30 | 5.0 | 169 | 182 | 22 | 24 | 1.8 |
| 4 | 45 | 7.5 | 172 | 195 | 25 | 21 | 2.4 |
| 5 | 45 | 7.5 | 212 | 233 | 29 | 28 | 1.9 |
| 6 | 31 | 5.2 | 164 | 173 | 23 | 23 | 1.5 |
| 7 | 37 | 6.2 | 164 | 187 | 26 | 30 | 1.7 |
| 8 | 46 | 7.7 | 235 | 262 | 27 | 26 | 2.3 |
| 9 | 41 | 6.8 | 205 | 216 | 29 | 31 | 1.5 |
| 10 | 47 | 7.8 | 230 | 249 | 27 | 25 | 1.6 |
| 11 | 47 | 7.8 | 223 | 238 | 27 | 24 | 2.0 |
| 12 | 58 | 9.7 | 251 | 276 | 25 | 25 | 2.3 |
| 13 | 31 | 5.2 | 165 | 181 | 26 | 28 | 1.3 |
| 14 | 35 | 5.8 | 158 | 168 | 24 | 25 | 1.8 |
| 15 | 52 | 8.7 | 204 | 232 | 25 | 26 | 2.1 |
| 16 | 86 | 14.3 | 302 | 324 | 29 | 25 | 3.4 |
| 17 | 23 | 3.8 | 140 | 158 | 19 | 25 | 1.3 |
| 18 | 28 | 4.7 | 128 | 133 | 28 | 23 | 1.7 |
| 19 | 42 | 7.0 | 209 | 224 | 22 | 23 | 2.3 |
| 20 | 25 | 4.2 | 147 | 161 | 30 | 28 | 1.1 |

Median plagues per 100 years across seeds: 6.8 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.39. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.35 at a lag of 1.0 years; 25% of seeds reach 0.4. Annual-mean best (median): 0.35.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.34 | 0.30 | 0.33 | 0.34 | 0.34 | 0.24 | 0.33 | 0.34 |
| 2 | 0.38 | 0.30 | 0.41 | 0.43 | 0.38 | 0.19 | 0.41 | 0.43 |
| 3 | 0.41 | 0.30 | 0.39 | 0.43 | 0.43 | 0.33 | 0.39 | 0.43 |
| 4 | 0.43 | 0.31 | 0.22 | 0.26 | 0.26 | 0.14 | 0.22 | 0.26 |
| 5 | 0.39 | 0.31 | 0.26 | 0.28 | 0.26 | 0.16 | 0.26 | 0.28 |
| 6 | 0.34 | 0.31 | 0.41 | 0.32 | 0.25 | 0.10 | 0.41 | 0.32 |
| 7 | 0.40 | 0.36 | 0.38 | 0.42 | 0.38 | 0.28 | 0.38 | 0.42 |
| 8 | 0.42 | 0.34 | 0.24 | 0.25 | 0.18 | 0.09 | 0.24 | 0.25 |
| 9 | 0.41 | 0.32 | 0.38 | 0.42 | 0.33 | 0.13 | 0.38 | 0.42 |
| 10 | 0.35 | 0.31 | 0.33 | 0.31 | 0.30 | 0.18 | 0.33 | 0.31 |
| 11 | 0.39 | 0.32 | 0.35 | 0.37 | 0.30 | 0.19 | 0.35 | 0.37 |
| 12 | 0.37 | 0.31 | 0.34 | 0.37 | 0.36 | 0.27 | 0.34 | 0.37 |
| 13 | 0.40 | 0.32 | 0.32 | 0.31 | 0.28 | 0.15 | 0.32 | 0.31 |
| 14 | 0.41 | 0.35 | 0.29 | 0.37 | 0.35 | 0.29 | 0.29 | 0.37 |
| 15 | 0.38 | 0.29 | 0.28 | 0.26 | 0.24 | 0.16 | 0.28 | 0.26 |
| 16 | 0.38 | 0.31 | 0.21 | 0.26 | 0.27 | 0.19 | 0.21 | 0.26 |
| 17 | 0.44 | 0.33 | 0.14 | 0.23 | 0.30 | 0.22 | 0.14 | 0.23 |
| 18 | 0.36 | 0.35 | 0.33 | 0.36 | 0.33 | 0.22 | 0.33 | 0.36 |
| 19 | 0.38 | 0.28 | 0.21 | 0.28 | 0.25 | 0.11 | 0.21 | 0.28 |
| 20 | 0.39 | 0.32 | 0.38 | 0.35 | 0.31 | 0.21 | 0.38 | 0.35 |

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
| 1 | 720000 | 348.1 | 638 / 0.49 / 0% | 66 / 0.26 / 0% | 731 / 0.32 / 0% | 339 / 0.38 / 0% | 763 / 0.30 / 0% | 9 / 0.42 / 2% | 55 / 0.34 / 0% | 53 / 0.63 / 0% | 28 / 1.80 / 2% | bison 226.3, wolf 8.8, raven 8.8, pronghorn 11.3, rabbit 12.5, cougar 73.8, coyote 10.0, prairiedog 176.3, muledeer 33.8 |
| 2 | 720000 | 362.1 | 648 / 0.48 / 0% | 62 / 0.25 / 0% | 730 / 0.31 / 0% | 367 / 0.32 / 0% | 729 / 0.30 / 0% | 7 / 0.42 / 2% | 48 / 0.38 / 0% | 26 / 0.43 / 0% | 29 / 1.32 / 1% | bison 26.3, wolf 67.5, raven 27.5, pronghorn 28.8, rabbit 42.5, cougar 42.5, coyote 17.5, prairiedog 111.3, muledeer 40.0 |
| 3 | 720000 | 338.7 | 622 / 0.48 / 0% | 67 / 0.25 / 0% | 727 / 0.31 / 0% | 365 / 0.34 / 0% | 824 / 0.30 / 0% | 9 / 0.49 / 4% | 45 / 0.41 / 0% | 45 / 0.54 / 0% | 13 / 0.54 / 1% | bison 76.3, wolf 30.0, raven 77.5, pronghorn 97.5, rabbit 22.5, cougar 21.3, coyote 66.3, prairiedog 53.8, muledeer 96.3 |
| 4 | 720000 | 356.1 | 586 / 0.45 / 0% | 66 / 0.22 / 0% | 735 / 0.32 / 0% | 330 / 0.32 / 0% | 810 / 0.31 / 0% | 9 / 0.39 / 0% | 43 / 0.43 / 0% | 67 / 0.64 / 1% | 13 / 0.89 / 0% | bison 193.8, wolf 8.8, raven 8.8, pronghorn 10.0, rabbit 107.5, cougar 58.8, coyote 97.5, prairiedog 10.0, muledeer 10.0 |
| 5 | 720000 | 354.6 | 700 / 0.44 / 0% | 64 / 0.25 / 0% | 771 / 0.27 / 0% | 457 / 0.37 / 0% | 755 / 0.31 / 0% | 8 / 0.43 / 2% | 45 / 0.39 / 0% | 44 / 0.43 / 0% | 13 / 0.55 / 2% | bison 10.0, wolf 53.8, raven 281.3, pronghorn 38.8, rabbit 95.0, cougar 81.3, coyote 46.3, prairiedog 23.8, muledeer 281.3 |
| 6 | 720000 | 357.2 | 661 / 0.36 / 0% | 61 / 0.24 / 0% | 802 / 0.22 / 0% | 305 / 0.28 / 0% | 707 / 0.31 / 0% | 9 / 0.42 / 1% | 56 / 0.34 / 0% | 27 / 0.82 / 0% | 33 / 1.61 / 5% | bison 30.0, wolf 52.5, raven unaffected, pronghorn 38.8, rabbit 26.3, cougar 98.8, coyote 36.3, prairiedog 45.0, muledeer 27.5 |
| 7 | 720000 | 346.7 | 664 / 0.43 / 0% | 72 / 0.27 / 0% | 761 / 0.28 / 0% | 378 / 0.39 / 0% | 816 / 0.36 / 0% | 9 / 0.33 / 0% | 49 / 0.40 / 0% | 38 / 0.54 / 0% | 12 / 0.50 / 3% | bison 21.3, wolf 10.0, raven 17.5, pronghorn 18.8, rabbit 28.8, cougar 26.3, coyote 17.5, prairiedog 191.3, muledeer 23.8 |
| 8 | 720000 | 344.7 | 597 / 0.42 / 0% | 60 / 0.23 / 0% | 747 / 0.29 / 0% | 354 / 0.33 / 0% | 793 / 0.34 / 0% | 8 / 0.41 / 1% | 47 / 0.42 / 0% | 51 / 0.55 / 0% | 14 / 1.21 / 1% | bison 10.0, wolf 97.5, raven 12.5, pronghorn 26.3, rabbit 61.3, cougar 25.0, coyote 45.0, prairiedog 56.3, muledeer 283.8 |
| 9 | 720000 | 336.0 | 637 / 0.38 / 0% | 56 / 0.24 / 0% | 748 / 0.29 / 0% | 410 / 0.32 / 0% | 720 / 0.32 / 0% | 9 / 0.48 / 2% | 47 / 0.41 / 1% | 27 / 0.50 / 0% | 14 / 0.55 / 1% | bison 151.3, wolf 70.0, raven unaffected, pronghorn 10.0, rabbit 32.5, cougar 22.5, coyote 23.8, prairiedog 15.0, muledeer 165.0 |
| 10 | 720000 | 389.4 | 631 / 0.44 / 0% | 64 / 0.25 / 0% | 772 / 0.27 / 0% | 316 / 0.30 / 0% | 746 / 0.31 / 0% | 8 / 0.40 / 2% | 52 / 0.35 / 0% | 32 / 0.79 / 5% | 12 / 0.61 / 1% | bison 16.3, wolf 31.3, raven 60.0, pronghorn 61.3, rabbit 15.0, cougar 71.3, coyote 12.5, prairiedog 208.8, muledeer 265.0 |
| 11 | 720000 | 362.3 | 613 / 0.42 / 0% | 63 / 0.27 / 0% | 741 / 0.30 / 0% | 327 / 0.34 / 0% | 788 / 0.32 / 0% | 9 / 0.44 / 1% | 45 / 0.39 / 0% | 40 / 0.55 / 0% | 32 / 1.74 / 4% | bison 7.5, wolf 35.0, raven unaffected, pronghorn 32.5, rabbit 57.5, cougar 51.3, coyote 37.5, prairiedog 75.0, muledeer 325.0 |
| 12 | 720000 | 336.3 | 627 / 0.40 / 0% | 65 / 0.24 / 0% | 762 / 0.27 / 0% | 379 / 0.35 / 0% | 816 / 0.31 / 0% | 8 / 0.47 / 4% | 44 / 0.37 / 0% | 57 / 0.48 / 0% | 25 / 1.50 / 2% | bison 12.5, wolf 72.5, raven 191.3, pronghorn 31.3, rabbit 41.3, cougar 30.0, coyote 10.0, prairiedog 18.8, muledeer 72.5 |
| 13 | 720000 | 336.8 | 668 / 0.38 / 0% | 61 / 0.24 / 0% | 769 / 0.27 / 0% | 442 / 0.38 / 0% | 760 / 0.32 / 0% | 9 / 0.44 / 3% | 51 / 0.40 / 0% | 34 / 0.62 / 0% | 29 / 1.40 / 2% | bison 30.0, wolf 105.0, raven 25.0, pronghorn 52.5, rabbit 27.5, cougar 32.5, coyote 17.5, prairiedog 40.0, muledeer 56.3 |
| 14 | 720000 | 341.4 | 720 / 0.47 / 0% | 68 / 0.25 / 0% | 777 / 0.26 / 0% | 348 / 0.35 / 0% | 806 / 0.35 / 0% | 10 / 0.42 / 1% | 41 / 0.41 / 2% | 54 / 0.63 / 0% | 17 / 1.40 / 2% | bison 23.8, wolf 185.0, raven 188.8, pronghorn 22.5, rabbit 11.3, cougar 13.8, coyote 22.5, prairiedog 33.8, muledeer 268.8 |
| 15 | 720000 | 335.7 | 897 / 0.36 / 0% | 69 / 0.28 / 0% | 844 / 0.18 / 0% | 366 / 0.32 / 0% | 771 / 0.29 / 0% | 10 / 0.44 / 1% | 41 / 0.38 / 0% | 47 / 0.43 / 0% | 12 / 0.52 / 2% | bison 11.3, wolf never, raven 120.0, pronghorn 37.5, rabbit 11.3, cougar 8.8, coyote 15.0, prairiedog 21.3, muledeer 135.0 |
| 16 | 720000 | 348.7 | 676 / 0.48 / 0% | 62 / 0.29 / 0% | 754 / 0.30 / 0% | 355 / 0.39 / 0% | 870 / 0.31 / 0% | 7 / 0.53 / 6% | 44 / 0.38 / 0% | 73 / 0.42 / 0% | 26 / 1.60 / 3% | bison 7.5, wolf 25.0, raven 8.8, pronghorn 8.8, rabbit 46.3, cougar 33.8, coyote 35.0, prairiedog 125.0, muledeer 18.8 |
| 17 | 720000 | 317.8 | 622 / 0.41 / 0% | 68 / 0.26 / 0% | 740 / 0.30 / 0% | 393 / 0.35 / 0% | 826 / 0.33 / 0% | 8 / 0.50 / 3% | 43 / 0.44 / 0% | 24 / 0.80 / 1% | 15 / 1.42 / 1% | bison 55.0, wolf 21.3, raven 332.5, pronghorn 10.0, rabbit 7.5, cougar 31.3, coyote 26.3, prairiedog 51.3, muledeer 57.5 |
| 18 | 720000 | 333.5 | 719 / 0.42 / 0% | 61 / 0.24 / 0% | 776 / 0.27 / 0% | 405 / 0.37 / 0% | 729 / 0.35 / 0% | 8 / 0.47 / 3% | 51 / 0.36 / 1% | 54 / 0.68 / 1% | 15 / 1.72 / 1% | bison 65.0, wolf 17.5, raven 153.8, pronghorn 52.5, rabbit 51.3, cougar 13.8, coyote 46.3, prairiedog 58.8, muledeer unaffected |
| 19 | 720000 | 322.1 | 560 / 0.49 / 0% | 57 / 0.28 / 0% | 663 / 0.39 / 0% | 412 / 0.40 / 0% | 823 / 0.28 / 0% | 9 / 0.40 / 0% | 46 / 0.38 / 0% | 51 / 0.44 / 0% | 13 / 0.53 / 1% | bison 46.3, wolf never, raven 7.5, pronghorn 13.8, rabbit 78.8, cougar 83.8, coyote 16.3, prairiedog 40.0, muledeer 101.3 |
| 20 | 720000 | 336.0 | 650 / 0.47 / 0% | 61 / 0.26 / 0% | 746 / 0.30 / 0% | 353 / 0.39 / 0% | 703 / 0.32 / 0% | 9 / 0.34 / 0% | 57 / 0.39 / 0% | 23 / 0.71 / 6% | 33 / 1.65 / 3% | bison 23.8, wolf 20.0, raven 43.8, pronghorn 131.3, rabbit 35.0, cougar 43.8, coyote 52.5, prairiedog 257.5, muledeer 20.0 |
