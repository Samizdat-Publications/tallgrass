# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit b51d880 (frozen copy); real sim
- Params: {"calendarScale":2,"smallPrey":1,"smallGameField":1,"coyote.initial":12}
- Shocks: drought (2 yr) at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 744 | 0.49 | 0.0% | 0.0 | 3.09 | 57 | 8.8 (20 seeds) | 100% | 100% | 12.5 |
| wolf | 20/20 (100%) | 77 | 0.25 | 0.0% | 0.0 | 1.71 | 57 | 8.8 (20 seeds) | 90% | 100% | 43.1 |
| raven | 20/20 (100%) | 568 | 0.17 | 0.0% | 0.0 | 1.21 | 49 | 8.8 (20 seeds) | 70% | 100% | 15.0 |
| pronghorn | 20/20 (100%) | 365 | 0.40 | 0.0% | 0.0 | 2.90 | 60 | 8.8 (20 seeds) | 100% | 100% | 41.3 |
| rabbit | 20/20 (100%) | 904 | 0.28 | 0.0% | 0.0 | 1.82 | 48 | 91.9 (12 seeds) | 100% | 100% | 31.3 |
| coyote | 20/20 (100%) | 47 | 0.39 | 0.0% | 0.0 | 2.35 | 77 | 20.0 (20 seeds) | 100% | 100% | 22.5 |
| prairiedog | 20/20 (100%) | 45 | 0.51 | 0.1% | 0.6 | 2.64 | 32 | 191.3 (13 seeds) | 100% | 95% | 28.8 |

Max bison generation depth reached: 439.9 (median across seeds 419.0).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3584.3 | 6162.7 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| coyote | 100.0% | 0.1 | 0.0 | 95.3 | 776.7 |
| prairiedog | 100.0% | 0.1 | 0.0 | 15.7 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 44 | 7.3 | 207 | 225 | 12 | 15 | 2.2 |
| 2 | 60 | 10.0 | 238 | 255 | 19 | 21 | 3.0 |
| 3 | 64 | 10.7 | 247 | 274 | 14 | 17 | 2.6 |
| 4 | 32 | 5.3 | 123 | 128 | 22 | 23 | 1.6 |
| 5 | 50 | 8.3 | 194 | 211 | 20 | 17 | 2.2 |
| 6 | 46 | 7.7 | 155 | 175 | 19 | 23 | 1.5 |
| 7 | 33 | 5.5 | 165 | 183 | 31 | 25 | 1.7 |
| 8 | 42 | 7.0 | 201 | 208 | 21 | 23 | 1.8 |
| 9 | 30 | 5.0 | 143 | 151 | 24 | 19 | 1.5 |
| 10 | 36 | 6.0 | 142 | 161 | 19 | 18 | 1.5 |
| 11 | 54 | 9.0 | 235 | 256 | 24 | 28 | 2.4 |
| 12 | 51 | 8.5 | 194 | 205 | 17 | 20 | 2.7 |
| 13 | 16 | 2.7 | 96 | 104 | 24 | 24 | 0.8 |
| 14 | 54 | 9.0 | 165 | 180 | 14 | 23 | 2.6 |
| 15 | 58 | 9.7 | 270 | 298 | 21 | 17 | 3.3 |
| 16 | 32 | 5.3 | 123 | 135 | 27 | 21 | 1.1 |
| 17 | 29 | 4.8 | 156 | 170 | 20 | 22 | 1.6 |
| 18 | 47 | 7.8 | 169 | 171 | 17 | 18 | 1.9 |
| 19 | 60 | 10.0 | 274 | 296 | 16 | 20 | 3.5 |
| 20 | 37 | 6.2 | 191 | 211 | 24 | 16 | 1.7 |

Median plagues per 100 years across seeds: 7.5 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.39. Hare CV: 0.28 (annual means 0.28).
- Best half-year-mean correlation (median): 0.27 at a lag of 1.0 years; 5% of seeds reach 0.4. Annual-mean best (median): 0.27.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.33 | 0.26 | 0.19 | 0.21 | 0.25 | 0.11 | 0.19 | 0.21 |
| 2 | 0.34 | 0.27 | 0.12 | 0.17 | 0.20 | 0.09 | 0.12 | 0.17 |
| 3 | 0.34 | 0.28 | 0.27 | 0.26 | 0.22 | 0.14 | 0.27 | 0.26 |
| 4 | 0.42 | 0.29 | 0.13 | 0.17 | 0.18 | 0.11 | 0.13 | 0.17 |
| 5 | 0.35 | 0.28 | 0.23 | 0.28 | 0.23 | 0.11 | 0.23 | 0.28 |
| 6 | 0.38 | 0.29 | 0.25 | 0.24 | 0.19 | 0.06 | 0.25 | 0.24 |
| 7 | 0.44 | 0.30 | 0.33 | 0.34 | 0.28 | 0.16 | 0.33 | 0.34 |
| 8 | 0.38 | 0.32 | 0.27 | 0.29 | 0.26 | 0.12 | 0.27 | 0.29 |
| 9 | 0.39 | 0.29 | 0.18 | 0.24 | 0.17 | 0.01 | 0.18 | 0.24 |
| 10 | 0.39 | 0.30 | 0.10 | 0.16 | 0.20 | 0.11 | 0.10 | 0.16 |
| 11 | 0.45 | 0.29 | 0.31 | 0.41 | 0.31 | 0.14 | 0.31 | 0.41 |
| 12 | 0.41 | 0.27 | 0.18 | 0.29 | 0.36 | 0.22 | 0.18 | 0.29 |
| 13 | 0.32 | 0.28 | 0.26 | 0.28 | 0.25 | 0.11 | 0.26 | 0.28 |
| 14 | 0.40 | 0.27 | 0.19 | 0.33 | 0.35 | 0.22 | 0.19 | 0.33 |
| 15 | 0.42 | 0.27 | 0.13 | 0.15 | 0.12 | 0.04 | 0.13 | 0.15 |
| 16 | 0.37 | 0.30 | 0.25 | 0.30 | 0.32 | 0.18 | 0.25 | 0.30 |
| 17 | 0.41 | 0.28 | 0.19 | 0.27 | 0.19 | 0.01 | 0.19 | 0.27 |
| 18 | 0.34 | 0.30 | 0.29 | 0.30 | 0.30 | 0.20 | 0.29 | 0.30 |
| 19 | 0.39 | 0.25 | 0.23 | 0.25 | 0.27 | 0.18 | 0.23 | 0.25 |
| 20 | 0.43 | 0.29 | 0.07 | 0.10 | 0.06 | -0.04 | 0.07 | 0.10 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 411.7 | 833 / 0.48 / 0% | 72 / 0.23 / 0% | 584 / 0.15 / 0% | 355 / 0.41 / 0% | 890 / 0.26 / 0% | 48 / 0.33 / 0% | 46 / 0.50 / 1% | bison 11.3, wolf unaffected, raven 300.0, pronghorn 47.5, rabbit 32.5, coyote 32.5, prairiedog 106.3 |
| 2 | 720000 | 389.6 | 778 / 0.50 / 0% | 71 / 0.25 / 0% | 561 / 0.17 / 0% | 459 / 0.45 / 0% | 908 / 0.27 / 0% | 45 / 0.34 / 0% | 100 / 0.48 / 0% | bison 17.5, wolf 20.0, raven 16.3, pronghorn 20.0, rabbit 15.0, coyote 93.8, prairiedog 7.5 |
| 3 | 720000 | 432.9 | 731 / 0.50 / 0% | 75 / 0.25 / 0% | 559 / 0.17 / 0% | 451 / 0.46 / 0% | 948 / 0.28 / 0% | 53 / 0.34 / 0% | 64 / 0.43 / 0% | bison 58.8, wolf 162.5, raven unaffected, pronghorn 41.3, rabbit 52.5, coyote 20.0, prairiedog 76.3 |
| 4 | 720000 | 434.4 | 720 / 0.51 / 0% | 79 / 0.26 / 0% | 562 / 0.18 / 0% | 340 / 0.43 / 0% | 941 / 0.29 / 0% | 41 / 0.42 / 0% | 56 / 0.48 / 0% | bison 11.3, wolf 110.0, raven 177.5, pronghorn 23.8, rabbit 51.3, coyote 30.0, prairiedog 28.8 |
| 5 | 720000 | 403.0 | 746 / 0.53 / 0% | 81 / 0.25 / 0% | 554 / 0.18 / 0% | 451 / 0.44 / 0% | 863 / 0.28 / 0% | 49 / 0.35 / 1% | 60 / 0.51 / 0% | bison 10.0, wolf 250.0, raven unaffected, pronghorn 25.0, rabbit 23.8, coyote 21.3, prairiedog 27.5 |
| 6 | 720000 | 419.9 | 797 / 0.49 / 0% | 77 / 0.26 / 0% | 575 / 0.15 / 0% | 330 / 0.36 / 0% | 817 / 0.29 / 0% | 49 / 0.38 / 0% | 34 / 0.91 / 2% | bison 11.3, wolf 13.8, raven 13.8, pronghorn 16.3, rabbit 15.0, coyote 41.3, prairiedog never |
| 7 | 720000 | 405.3 | 724 / 0.49 / 0% | 84 / 0.25 / 0% | 577 / 0.15 / 0% | 296 / 0.39 / 0% | 860 / 0.30 / 0% | 49 / 0.44 / 0% | 30 / 0.38 / 0% | bison 30.0, wolf 75.0, raven 15.0, pronghorn 63.8, rabbit 28.8, coyote 95.0, prairiedog 7.5 |
| 8 | 720000 | 392.1 | 793 / 0.46 / 1% | 75 / 0.31 / 0% | 569 / 0.16 / 0% | 337 / 0.37 / 0% | 830 / 0.32 / 0% | 52 / 0.38 / 0% | 43 / 0.69 / 2% | bison 27.5, wolf 36.3, raven 16.3, pronghorn 43.8, rabbit 62.5, coyote 16.3, prairiedog 198.8 |
| 9 | 720000 | 425.7 | 688 / 0.52 / 0% | 76 / 0.30 / 0% | 547 / 0.19 / 0% | 437 / 0.40 / 0% | 911 / 0.29 / 0% | 39 / 0.39 / 0% | 32 / 0.72 / 0% | bison 7.5, wolf 122.5, raven unaffected, pronghorn 110.0, rabbit 32.5, coyote 73.8, prairiedog 27.5 |
| 10 | 720000 | 439.9 | 902 / 0.41 / 0% | 73 / 0.21 / 0% | 600 / 0.12 / 0% | 329 / 0.30 / 0% | 892 / 0.30 / 0% | 41 / 0.39 / 0% | 31 / 0.72 / 5% | bison 10.0, wolf 216.3, raven unaffected, pronghorn 155.0, rabbit 15.0, coyote 12.5, prairiedog 77.5 |
| 11 | 720000 | 425.3 | 709 / 0.44 / 0% | 85 / 0.24 / 0% | 577 / 0.15 / 0% | 327 / 0.34 / 0% | 900 / 0.29 / 0% | 42 / 0.45 / 1% | 44 / 0.44 / 0% | bison 11.3, wolf 50.0, raven 140.0, pronghorn 105.0, rabbit 12.5, coyote 16.3, prairiedog 37.5 |
| 12 | 720000 | 401.6 | 927 / 0.47 / 0% | 81 / 0.25 / 0% | 588 / 0.14 / 0% | 376 / 0.43 / 0% | 1012 / 0.27 / 0% | 36 / 0.41 / 0% | 97 / 0.37 / 0% | bison 8.8, wolf 80.0, raven unaffected, pronghorn 51.3, rabbit 41.3, coyote 15.0, prairiedog 45.0 |
| 13 | 720000 | 427.2 | 705 / 0.46 / 0% | 74 / 0.23 / 0% | 568 / 0.16 / 0% | 366 / 0.39 / 0% | 897 / 0.28 / 0% | 45 / 0.32 / 0% | 18 / 0.82 / 1% | bison 20.0, wolf 85.0, raven 8.8, pronghorn 68.8, rabbit 17.5, coyote 81.3, prairiedog 25.0 |
| 14 | 720000 | 418.1 | 759 / 0.52 / 0% | 81 / 0.26 / 0% | 568 / 0.17 / 0% | 358 / 0.44 / 0% | 1015 / 0.27 / 0% | 37 / 0.40 / 1% | 85 / 0.43 / 0% | bison 10.0, wolf 10.0, raven 12.5, pronghorn 18.8, rabbit 12.5, coyote 11.3, prairiedog 8.8 |
| 15 | 720000 | 382.3 | 742 / 0.54 / 0% | 89 / 0.26 / 0% | 557 / 0.18 / 0% | 381 / 0.49 / 0% | 958 / 0.27 / 0% | 48 / 0.42 / 0% | 99 / 0.51 / 0% | bison 12.5, wolf 12.5, raven 15.0, pronghorn 30.0, rabbit 45.0, coyote 23.8, prairiedog 8.8 |
| 16 | 720000 | 428.9 | 772 / 0.50 / 1% | 69 / 0.26 / 0% | 575 / 0.16 / 0% | 365 / 0.39 / 0% | 791 / 0.30 / 0% | 56 / 0.37 / 0% | 24 / 0.63 / 2% | bison 38.8, wolf 12.5, raven 28.8, pronghorn 41.3, rabbit 33.8, coyote 56.3, prairiedog 48.8 |
| 17 | 720000 | 396.7 | 688 / 0.51 / 0% | 74 / 0.25 / 0% | 554 / 0.18 / 0% | 379 / 0.42 / 0% | 838 / 0.28 / 0% | 52 / 0.41 / 0% | 40 / 0.76 / 1% | bison 132.5, wolf 125.0, raven unaffected, pronghorn 8.8, rabbit 18.8, coyote 7.5, prairiedog 15.0 |
| 18 | 720000 | 430.0 | 642 / 0.44 / 1% | 74 / 0.23 / 0% | 563 / 0.19 / 0% | 369 / 0.38 / 0% | 913 / 0.30 / 0% | 46 / 0.34 / 0% | 60 / 0.60 / 0% | bison 16.3, wolf 26.3, raven 20.0, pronghorn 40.0, rabbit 30.0, coyote 8.8, prairiedog 111.3 |
| 19 | 720000 | 422.8 | 801 / 0.45 / 0% | 83 / 0.26 / 0% | 579 / 0.16 / 0% | 408 / 0.39 / 0% | 991 / 0.25 / 0% | 51 / 0.39 / 0% | 111 / 0.35 / 0% | bison 18.8, wolf 13.8, raven 16.3, pronghorn 30.0, rabbit 78.8, coyote 25.0, prairiedog 17.5 |
| 20 | 720000 | 390.5 | 685 / 0.52 / 0% | 81 / 0.24 / 0% | 567 / 0.17 / 0% | 340 / 0.39 / 0% | 960 / 0.29 / 0% | 44 / 0.43 / 0% | 31 / 0.46 / 0% | bison 12.5, wolf unaffected, raven 233.8, pronghorn 97.5, rabbit 36.3, coyote 17.5, prairiedog 42.5 |
