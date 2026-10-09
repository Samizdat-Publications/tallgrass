# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit e571d1a (frozen copy); real sim
- Params: {"ravenNestFood":1,"muledeerCover":0.15,"bison.initial":550}
- Shocks: wolves removed at tick 252000 (year 210.0); introduce 8 wolves at tick 360000 (year 300.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 712 | 0.46 | 0.0% | 0.0 | 3.78 | 53 | 8.8 (20 seeds) | 100% | 100% | 39.4 |
| wolf | 20/20 (100%) | 61 | 0.30 | 1.7% | 8.8 | 1.87 | 51 | 9.4 (12 seeds) | 100% | 75% | 66.3 |
| raven | 20/20 (100%) | 770 | 0.28 | 0.0% | 0.0 | 1.30 | 49 | 10.0 (20 seeds) | 70% | 100% | 48.8 |
| pronghorn | 20/20 (100%) | 385 | 0.40 | 0.0% | 0.0 | 3.71 | 62 | 10.0 (19 seeds) | 100% | 95% | 42.5 |
| rabbit | 20/20 (100%) | 752 | 0.33 | 0.0% | 0.0 | 2.05 | 50 | 100.0 (9 seeds) | 100% | 100% | 46.9 |
| cougar | 20/20 (100%) | 8 | 0.44 | 2.4% | 4.4 | 2.34 | 84 | 178.8 (4 seeds) | 100% | 100% | 40.6 |
| coyote | 20/20 (100%) | 47 | 0.39 | 0.0% | 0.0 | 2.41 | 75 | 30.0 (15 seeds) | 100% | 100% | 34.4 |
| prairiedog | 20/20 (100%) | 37 | 0.55 | 0.2% | 1.3 | 2.79 | 35 | 230.0 (5 seeds) | 100% | 100% | 38.8 |
| muledeer | 20/20 (100%) | 26 | 1.42 | 2.3% | 1.3 | 9.68 | 69 | 113.1 (8 seeds) | 85% | 80% | 43.1 |

Max bison generation depth reached: 370.2 (median across seeds 344.7).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 98.9% | 2.4 | 5.6 | 0.7 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3479.6 | 7102.7 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 97.6% | 11.2 | 12.5 | 5.8 | 0.0 |
| coyote | 100.0% | 0.2 | 0.0 | 99.1 | 773.7 |
| prairiedog | 100.0% | 1.1 | 0.0 | 31.7 | 0.0 |
| muledeer | 99.5% | 3.7 | 2.5 | 317.1 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 38 | 6.3 | 191 | 207 | 21 | 23 | 1.7 |
| 2 | 23 | 3.8 | 114 | 122 | 30 | 28 | 0.7 |
| 3 | 44 | 7.3 | 157 | 179 | 21 | 25 | 1.7 |
| 4 | 46 | 7.7 | 179 | 203 | 29 | 22 | 2.3 |
| 5 | 36 | 6.0 | 157 | 170 | 33 | 30 | 1.3 |
| 6 | 19 | 3.2 | 142 | 150 | 26 | 26 | 1.0 |
| 7 | 37 | 6.2 | 190 | 200 | 29 | 29 | 1.8 |
| 8 | 49 | 8.2 | 195 | 235 | 26 | 21 | 2.4 |
| 9 | 28 | 4.7 | 163 | 174 | 29 | 37 | 1.5 |
| 10 | 40 | 6.7 | 229 | 251 | 25 | 26 | 1.8 |
| 11 | 22 | 3.7 | 147 | 166 | 31 | 26 | 1.2 |
| 12 | 44 | 7.3 | 182 | 203 | 18 | 20 | 2.5 |
| 13 | 23 | 3.8 | 163 | 172 | 26 | 32 | 1.3 |
| 14 | 30 | 5.0 | 165 | 179 | 21 | 25 | 1.5 |
| 15 | 55 | 9.2 | 204 | 230 | 24 | 25 | 2.0 |
| 16 | 62 | 10.3 | 263 | 294 | 27 | 28 | 3.2 |
| 17 | 20 | 3.3 | 131 | 133 | 22 | 23 | 1.1 |
| 18 | 42 | 7.0 | 181 | 202 | 32 | 24 | 2.0 |
| 19 | 52 | 8.7 | 222 | 243 | 22 | 27 | 2.6 |
| 20 | 32 | 5.3 | 156 | 171 | 28 | 25 | 1.4 |

Median plagues per 100 years across seeds: 6.3 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.39. Hare CV: 0.33 (annual means 0.33).
- Best half-year-mean correlation (median): 0.25 at a lag of 1.0 years; 5% of seeds reach 0.4. Annual-mean best (median): 0.24.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.35 | 0.32 | 0.24 | 0.21 | 0.23 | 0.14 | 0.24 | 0.21 |
| 2 | 0.38 | 0.36 | 0.33 | 0.32 | 0.25 | 0.09 | 0.33 | 0.32 |
| 3 | 0.39 | 0.33 | 0.20 | 0.23 | 0.27 | 0.23 | 0.20 | 0.23 |
| 4 | 0.43 | 0.29 | 0.31 | 0.29 | 0.23 | 0.11 | 0.31 | 0.29 |
| 5 | 0.41 | 0.33 | 0.08 | 0.07 | 0.07 | -0.02 | 0.08 | 0.07 |
| 6 | 0.39 | 0.30 | 0.32 | 0.28 | 0.23 | 0.12 | 0.32 | 0.28 |
| 7 | 0.44 | 0.36 | 0.17 | 0.17 | 0.16 | 0.08 | 0.17 | 0.17 |
| 8 | 0.41 | 0.32 | 0.24 | 0.33 | 0.34 | 0.26 | 0.24 | 0.33 |
| 9 | 0.40 | 0.34 | 0.25 | 0.24 | 0.22 | 0.13 | 0.25 | 0.24 |
| 10 | 0.37 | 0.34 | 0.22 | 0.23 | 0.22 | 0.12 | 0.22 | 0.23 |
| 11 | 0.38 | 0.33 | 0.36 | 0.41 | 0.33 | 0.22 | 0.36 | 0.41 |
| 12 | 0.40 | 0.30 | 0.20 | 0.22 | 0.26 | 0.21 | 0.20 | 0.22 |
| 13 | 0.39 | 0.35 | 0.13 | 0.16 | 0.12 | 0.00 | 0.13 | 0.16 |
| 14 | 0.41 | 0.33 | 0.32 | 0.35 | 0.31 | 0.26 | 0.32 | 0.35 |
| 15 | 0.35 | 0.32 | 0.16 | 0.17 | 0.14 | 0.07 | 0.16 | 0.17 |
| 16 | 0.35 | 0.33 | 0.11 | 0.19 | 0.22 | 0.15 | 0.11 | 0.19 |
| 17 | 0.44 | 0.32 | 0.07 | 0.10 | 0.07 | -0.04 | 0.07 | 0.10 |
| 18 | 0.42 | 0.33 | 0.34 | 0.35 | 0.34 | 0.24 | 0.34 | 0.35 |
| 19 | 0.38 | 0.28 | 0.20 | 0.24 | 0.24 | 0.15 | 0.20 | 0.24 |
| 20 | 0.38 | 0.34 | 0.19 | 0.24 | 0.23 | 0.10 | 0.19 | 0.24 |

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
| prairiedog | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| muledeer | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 350.1 | 663 / 0.47 / 0% | 64 / 0.27 / 1% | 750 / 0.30 / 0% | 364 / 0.39 / 0% | 783 / 0.32 / 0% | 8 / 0.39 / 1% | 56 / 0.35 / 0% | 36 / 0.56 / 0% | 32 / 1.63 / 2% | bison 121.3, wolf 66.3, raven unaffected, pronghorn 76.3, rabbit 26.3, cougar 41.3, coyote 60.0, prairiedog 41.3, muledeer 287.5 |
| 2 | 720000 | 343.1 | 755 / 0.42 / 0% | 57 / 0.32 / 3% | 785 / 0.23 / 0% | 412 / 0.41 / 0% | 662 / 0.36 / 0% | 8 / 0.42 / 2% | 56 / 0.38 / 0% | 13 / 0.82 / 14% | 31 / 1.28 / 4% | bison 36.3, wolf 80.0, raven 200.0, pronghorn 141.3, rabbit 38.8, cougar 80.0, coyote 85.0, prairiedog 251.3, muledeer never |
| 3 | 720000 | 345.5 | 819 / 0.46 / 0% | 61 / 0.30 / 1% | 795 / 0.26 / 0% | 440 / 0.40 / 0% | 776 / 0.33 / 0% | 9 / 0.43 / 2% | 48 / 0.39 / 0% | 42 / 0.55 / 0% | 15 / 0.79 / 0% | bison 18.8, wolf 40.0, raven 51.3, pronghorn 18.8, rabbit 48.8, cougar 8.8, coyote 93.8, prairiedog 8.8, muledeer unaffected |
| 4 | 720000 | 363.2 | 675 / 0.54 / 0% | 66 / 0.28 / 1% | 758 / 0.29 / 0% | 345 / 0.39 / 0% | 802 / 0.29 / 0% | 8 / 0.43 / 3% | 44 / 0.43 / 1% | 56 / 0.60 / 0% | 13 / 0.96 / 1% | bison 25.0, wolf 51.3, raven unaffected, pronghorn 80.0, rabbit 72.5, cougar 37.5, coyote 31.3, prairiedog 23.8, muledeer unaffected |
| 5 | 720000 | 341.4 | 784 / 0.48 / 1% | 54 / 0.53 / 16% | 773 / 0.28 / 0% | 496 / 0.53 / 0% | 653 / 0.33 / 0% | 7 / 0.54 / 7% | 51 / 0.41 / 0% | 30 / 0.66 / 0% | 73 / 1.66 / 11% | bison 66.3, wolf 90.0, raven 181.3, pronghorn 33.8, rabbit 48.8, cougar 50.0, coyote 25.0, prairiedog 85.0, muledeer 57.5 |
| 6 | 720000 | 358.8 | 671 / 0.43 / 0% | 61 / 0.29 / 1% | 781 / 0.24 / 0% | 355 / 0.33 / 0% | 650 / 0.30 / 0% | 8 / 0.44 / 2% | 58 / 0.39 / 0% | 21 / 1.14 / 12% | 34 / 1.56 / 3% | bison 75.0, wolf 32.5, raven 57.5, pronghorn 60.0, rabbit 17.5, cougar 115.0, coyote 28.8, prairiedog 228.8, muledeer never |
| 7 | 720000 | 342.5 | 813 / 0.47 / 0% | 61 / 0.40 / 8% | 781 / 0.26 / 0% | 429 / 0.40 / 0% | 722 / 0.36 / 0% | 8 / 0.47 / 3% | 52 / 0.44 / 0% | 37 / 0.58 / 0% | 47 / 1.62 / 4% | bison 56.3, wolf 131.3, raven 46.3, pronghorn 33.8, rabbit 53.8, cougar 115.0, coyote 35.0, prairiedog 61.3, muledeer 55.0 |
| 8 | 720000 | 338.6 | 701 / 0.45 / 0% | 63 / 0.32 / 3% | 773 / 0.26 / 0% | 378 / 0.38 / 0% | 845 / 0.32 / 0% | 8 / 0.41 / 1% | 43 / 0.41 / 0% | 71 / 0.53 / 0% | 15 / 1.23 / 2% | bison 30.0, wolf 26.3, raven 251.3, pronghorn 122.5, rabbit 42.5, cougar 56.3, coyote 118.8, prairiedog 36.3, muledeer 42.5 |
| 9 | 720000 | 343.8 | 722 / 0.43 / 0% | 59 / 0.35 / 3% | 760 / 0.28 / 0% | 391 / 0.48 / 0% | 681 / 0.34 / 0% | 7 / 0.53 / 4% | 52 / 0.40 / 0% | 36 / 0.72 / 0% | 19 / 1.33 / 0% | bison 166.3, wolf never, raven 168.8, pronghorn 63.8, rabbit 46.3, cougar 43.8, coyote 41.3, prairiedog 30.0, muledeer unaffected |
| 10 | 720000 | 370.2 | 655 / 0.50 / 0% | 60 / 0.28 / 1% | 770 / 0.27 / 0% | 332 / 0.39 / 0% | 740 / 0.34 / 0% | 7 / 0.47 / 4% | 50 / 0.37 / 0% | 37 / 0.71 / 1% | 13 / 0.57 / 1% | bison 15.0, wolf never, raven unaffected, pronghorn 112.5, rabbit 42.5, cougar 18.8, coyote 33.8, prairiedog 36.3, muledeer 268.8 |
| 11 | 720000 | 346.1 | 651 / 0.43 / 0% | 54 / 0.26 / 1% | 770 / 0.27 / 0% | 379 / 0.38 / 0% | 737 / 0.33 / 0% | 8 / 0.48 / 1% | 44 / 0.38 / 0% | 23 / 0.54 / 0% | 33 / 1.72 / 4% | bison 160.0, wolf 155.0, raven unaffected, pronghorn never, rabbit 76.3, cougar 48.8, coyote 21.3, prairiedog 18.8, muledeer never |
| 12 | 720000 | 342.2 | 627 / 0.52 / 0% | 67 / 0.29 / 1% | 745 / 0.29 / 0% | 357 / 0.45 / 0% | 880 / 0.30 / 0% | 9 / 0.44 / 3% | 45 / 0.40 / 0% | 79 / 0.56 / 0% | 26 / 1.44 / 3% | bison 93.8, wolf never, raven 75.0, pronghorn 86.3, rabbit 47.5, cougar 47.5, coyote 12.5, prairiedog 90.0, muledeer 42.5 |
| 13 | 720000 | 333.0 | 748 / 0.49 / 0% | 65 / 0.38 / 3% | 747 / 0.30 / 0% | 460 / 0.52 / 0% | 743 / 0.35 / 0% | 8 / 0.46 / 5% | 47 / 0.39 / 1% | 34 / 0.53 / 2% | 45 / 1.20 / 5% | bison 38.8, wolf never, raven 30.0, pronghorn 37.5, rabbit 25.0, cougar 36.3, coyote 50.0, prairiedog 51.3, muledeer never |
| 14 | 720000 | 350.1 | 776 / 0.45 / 0% | 70 / 0.29 / 2% | 814 / 0.22 / 0% | 345 / 0.36 / 0% | 776 / 0.33 / 0% | 9 / 0.39 / 1% | 45 / 0.41 / 1% | 34 / 0.51 / 1% | 18 / 1.40 / 1% | bison 101.3, wolf 45.0, raven unaffected, pronghorn 42.5, rabbit 71.3, cougar 32.5, coyote 91.3, prairiedog 43.8, muledeer 43.8 |
| 15 | 720000 | 348.2 | 918 / 0.33 / 0% | 64 / 0.28 / 1% | 860 / 0.16 / 0% | 390 / 0.34 / 0% | 749 / 0.32 / 0% | 9 / 0.39 / 2% | 44 / 0.35 / 0% | 51 / 0.40 / 0% | 14 / 0.64 / 1% | bison 40.0, wolf 206.3, raven 36.3, pronghorn 37.5, rabbit 23.8, cougar 40.0, coyote 18.8, prairiedog 18.8, muledeer 73.8 |
| 16 | 720000 | 345.9 | 657 / 0.45 / 0% | 58 / 0.30 / 2% | 761 / 0.29 / 0% | 398 / 0.40 / 0% | 852 / 0.33 / 0% | 8 / 0.47 / 2% | 41 / 0.35 / 0% | 81 / 0.45 / 0% | 27 / 1.60 / 2% | bison 47.5, wolf 12.5, raven unaffected, pronghorn 51.3, rabbit 25.0, cougar 8.8, coyote 17.5, prairiedog 80.0, muledeer 42.5 |
| 17 | 720000 | 363.8 | 666 / 0.55 / 1% | 55 / 0.45 / 10% | 709 / 0.34 / 0% | 460 / 0.50 / 0% | 739 / 0.32 / 0% | 7 / 0.58 / 6% | 45 / 0.44 / 0% | 22 / 0.72 / 3% | 47 / 1.63 / 4% | bison 7.5, wolf 66.3, raven 83.8, pronghorn 11.3, rabbit 80.0, cougar 20.0, coyote 18.8, prairiedog 81.3, muledeer 40.0 |
| 18 | 720000 | 326.6 | 761 / 0.48 / 0% | 65 / 0.31 / 0% | 770 / 0.28 / 0% | 420 / 0.42 / 0% | 756 / 0.33 / 0% | 8 / 0.44 / 3% | 48 / 0.42 / 0% | 63 / 0.55 / 0% | 16 / 1.63 / 1% | bison 26.3, wolf 40.0, raven 250.0, pronghorn 23.8, rabbit 23.8, cougar 20.0, coyote 38.8, prairiedog 32.5, muledeer 131.3 |
| 19 | 720000 | 338.7 | 674 / 0.41 / 0% | 59 / 0.30 / 1% | 727 / 0.32 / 0% | 379 / 0.38 / 0% | 826 / 0.28 / 0% | 8 / 0.52 / 2% | 45 / 0.38 / 0% | 66 / 0.43 / 0% | 15 / 0.83 / 0% | bison 30.0, wolf never, raven 32.5, pronghorn 22.5, rabbit 151.3, cougar 125.0, coyote 80.0, prairiedog 11.3, muledeer 48.8 |
| 20 | 720000 | 316.1 | 726 / 0.52 / 0% | 64 / 0.36 / 4% | 763 / 0.27 / 0% | 327 / 0.35 / 0% | 757 / 0.34 / 0% | 8 / 0.44 / 2% | 54 / 0.38 / 0% | 30 / 0.53 / 1% | 43 / 1.66 / 5% | bison 31.3, wolf 222.5, raven 103.8, pronghorn 21.3, rabbit 63.8, cougar 35.0, coyote 7.5, prairiedog 26.3, muledeer 7.5 |
