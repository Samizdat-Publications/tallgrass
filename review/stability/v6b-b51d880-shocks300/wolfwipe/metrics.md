# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit b51d880 (frozen copy); real sim
- Params: {"calendarScale":2,"smallPrey":1,"smallGameField":1,"coyote.initial":12}
- Shocks: wolves removed at tick 252000 (year 210.0); introduce 8 wolves at tick 360000 (year 300.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 912 | 0.48 | 0.0% | 0.0 | 3.71 | 56 | 8.8 (20 seeds) | 100% | 100% | 40.6 |
| wolf | 20/20 (100%) | 73 | 0.30 | 2.1% | 10.6 | 1.77 | 55 | 8.8 (13 seeds) | 85% | 75% | 47.5 |
| raven | 20/20 (100%) | 584 | 0.15 | 0.0% | 0.0 | 1.17 | 40 | 8.8 (20 seeds) | 30% | 95% | 0.0 |
| pronghorn | 20/20 (100%) | 420 | 0.47 | 0.0% | 0.0 | 3.94 | 58 | 8.8 (20 seeds) | 95% | 100% | 60.6 |
| rabbit | 20/20 (100%) | 869 | 0.30 | 0.0% | 0.0 | 1.86 | 48 | 133.8 (14 seeds) | 100% | 100% | 40.6 |
| coyote | 20/20 (100%) | 49 | 0.38 | 0.0% | 0.0 | 2.37 | 81 | 26.3 (13 seeds) | 100% | 100% | 28.1 |
| prairiedog | 20/20 (100%) | 38 | 0.69 | 1.2% | 3.8 | 3.49 | 33 | 117.5 (7 seeds) | 100% | 95% | 53.8 |

Max bison generation depth reached: 448.2 (median across seeds 416.4).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 98.4% | 2.0 | 8.1 | 0.8 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3194.7 | 8080.0 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 95.3 | 878.3 |
| prairiedog | 100.0% | 2.5 | 0.0 | 18.1 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 35 | 5.8 | 150 | 174 | 16 | 17 | 1.6 |
| 2 | 62 | 10.3 | 244 | 277 | 22 | 21 | 2.7 |
| 3 | 53 | 8.8 | 199 | 230 | 13 | 17 | 2.1 |
| 4 | 44 | 7.3 | 146 | 162 | 29 | 26 | 1.9 |
| 5 | 33 | 5.5 | 145 | 162 | 18 | 18 | 1.4 |
| 6 | 55 | 9.2 | 240 | 261 | 16 | 16 | 2.7 |
| 7 | 22 | 3.7 | 117 | 127 | 28 | 27 | 0.7 |
| 8 | 27 | 4.5 | 133 | 141 | 25 | 23 | 1.0 |
| 9 | 24 | 4.0 | 136 | 147 | 23 | 22 | 1.2 |
| 10 | 21 | 3.5 | 96 | 107 | 22 | 18 | 0.9 |
| 11 | 38 | 6.3 | 167 | 181 | 23 | 25 | 1.5 |
| 12 | 32 | 5.3 | 133 | 148 | 19 | 19 | 1.3 |
| 13 | 21 | 3.5 | 114 | 118 | 23 | 28 | 0.8 |
| 14 | 36 | 6.0 | 134 | 148 | 21 | 23 | 1.5 |
| 15 | 39 | 6.5 | 214 | 253 | 22 | 21 | 3.2 |
| 16 | 26 | 4.3 | 115 | 130 | 23 | 21 | 1.2 |
| 17 | 29 | 4.8 | 187 | 205 | 19 | 20 | 1.8 |
| 18 | 29 | 4.8 | 107 | 114 | 27 | 21 | 1.2 |
| 19 | 73 | 12.2 | 284 | 322 | 16 | 27 | 3.0 |
| 20 | 48 | 8.0 | 172 | 202 | 20 | 19 | 2.1 |

Median plagues per 100 years across seeds: 5.7 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.38. Hare CV: 0.30 (annual means 0.30).
- Best half-year-mean correlation (median): 0.17 at a lag of 1.0 years; 0% of seeds reach 0.4. Annual-mean best (median): 0.16.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.38 | 0.31 | -0.11 | -0.12 | -0.13 | -0.20 | -0.11 | -0.12 |
| 2 | 0.35 | 0.28 | 0.09 | 0.16 | 0.19 | 0.10 | 0.09 | 0.16 |
| 3 | 0.35 | 0.28 | 0.12 | 0.14 | 0.17 | 0.08 | 0.12 | 0.14 |
| 4 | 0.40 | 0.31 | 0.21 | 0.24 | 0.24 | 0.15 | 0.21 | 0.24 |
| 5 | 0.36 | 0.28 | 0.14 | 0.15 | 0.13 | 0.02 | 0.14 | 0.15 |
| 6 | 0.41 | 0.29 | 0.18 | 0.22 | 0.18 | 0.07 | 0.18 | 0.22 |
| 7 | 0.37 | 0.33 | 0.20 | 0.21 | 0.20 | 0.16 | 0.20 | 0.21 |
| 8 | 0.38 | 0.33 | 0.19 | 0.16 | 0.14 | 0.02 | 0.19 | 0.16 |
| 9 | 0.38 | 0.29 | 0.16 | 0.14 | 0.09 | 0.01 | 0.16 | 0.14 |
| 10 | 0.36 | 0.28 | 0.19 | 0.26 | 0.27 | 0.13 | 0.19 | 0.26 |
| 11 | 0.44 | 0.33 | 0.09 | 0.11 | 0.02 | -0.08 | 0.09 | 0.11 |
| 12 | 0.40 | 0.30 | 0.01 | 0.04 | 0.07 | -0.02 | 0.01 | 0.04 |
| 13 | 0.37 | 0.30 | 0.14 | 0.14 | 0.09 | -0.00 | 0.14 | 0.14 |
| 14 | 0.44 | 0.30 | 0.15 | 0.17 | 0.17 | 0.09 | 0.15 | 0.17 |
| 15 | 0.40 | 0.27 | 0.22 | 0.30 | 0.30 | 0.20 | 0.22 | 0.30 |
| 16 | 0.39 | 0.32 | -0.07 | -0.07 | -0.10 | -0.17 | -0.07 | -0.07 |
| 17 | 0.40 | 0.30 | -0.03 | -0.02 | -0.06 | -0.18 | -0.03 | -0.02 |
| 18 | 0.37 | 0.34 | 0.20 | 0.21 | 0.18 | 0.06 | 0.20 | 0.21 |
| 19 | 0.39 | 0.26 | 0.07 | 0.07 | 0.11 | 0.03 | 0.07 | 0.07 |
| 20 | 0.39 | 0.29 | 0.11 | 0.18 | 0.16 | 0.04 | 0.11 | 0.18 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | FAIL | PASS | PASS | FAIL | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 427.3 | 1000 / 0.50 / 0% | 66 / 0.43 / 10% | 590 / 0.15 / 0% | 479 / 0.60 / 0% | 834 / 0.31 / 0% | 52 / 0.38 / 0% | 47 / 0.89 / 10% | bison 52.5, wolf 147.5, raven 275.0, pronghorn 107.5, rabbit 8.8, coyote 13.8, prairiedog 35.0 |
| 2 | 720000 | 383.7 | 889 / 0.47 / 0% | 77 / 0.29 / 1% | 576 / 0.15 / 0% | 463 / 0.46 / 0% | 912 / 0.28 / 0% | 48 / 0.35 / 0% | 82 / 0.46 / 0% | bison 22.5, wolf never, raven unaffected, pronghorn 65.0, rabbit 40.0, coyote 63.8, prairiedog 53.8 |
| 3 | 720000 | 404.8 | 829 / 0.52 / 0% | 75 / 0.33 / 2% | 567 / 0.16 / 0% | 447 / 0.48 / 0% | 929 / 0.28 / 0% | 52 / 0.35 / 0% | 56 / 0.44 / 0% | bison 77.5, wolf never, raven unaffected, pronghorn 72.5, rabbit 106.3, coyote 43.8, prairiedog 76.3 |
| 4 | 720000 | 409.0 | 924 / 0.50 / 0% | 71 / 0.30 / 2% | 584 / 0.16 / 0% | 372 / 0.46 / 0% | 839 / 0.31 / 0% | 46 / 0.40 / 0% | 52 / 0.47 / 0% | bison 10.0, wolf 122.5, raven never, pronghorn 70.0, rabbit 47.5, coyote 11.3, prairiedog 78.8 |
| 5 | 720000 | 418.5 | 811 / 0.55 / 0% | 87 / 0.31 / 0% | 562 / 0.18 / 0% | 442 / 0.52 / 0% | 864 / 0.28 / 0% | 50 / 0.36 / 0% | 35 / 0.71 / 1% | bison 28.8, wolf 36.3, raven unaffected, pronghorn 10.0, rabbit 35.0, coyote 36.3, prairiedog 33.8 |
| 6 | 720000 | 425.6 | 779 / 0.42 / 0% | 74 / 0.25 / 1% | 585 / 0.14 / 0% | 379 / 0.36 / 0% | 896 / 0.29 / 0% | 43 / 0.41 / 0% | 66 / 0.40 / 0% | bison 38.8, wolf 50.0, raven unaffected, pronghorn 36.3, rabbit 17.5, coyote 25.0, prairiedog 31.3 |
| 7 | 720000 | 410.5 | 973 / 0.48 / 0% | 78 / 0.29 / 2% | 603 / 0.12 / 0% | 332 / 0.41 / 0% | 795 / 0.33 / 0% | 55 / 0.37 / 0% | 13 / 1.03 / 23% | bison 82.5, wolf 240.0, raven unaffected, pronghorn 88.8, rabbit 13.8, coyote 31.3, prairiedog never |
| 8 | 720000 | 374.4 | 865 / 0.46 / 0% | 70 / 0.33 / 3% | 579 / 0.15 / 0% | 400 / 0.45 / 0% | 805 / 0.33 / 0% | 51 / 0.38 / 0% | 23 / 0.90 / 24% | bison 12.5, wolf never, raven unaffected, pronghorn 17.5, rabbit 41.3, coyote 93.8, prairiedog 88.8 |
| 9 | 720000 | 425.5 | 821 / 0.45 / 0% | 76 / 0.30 / 0% | 574 / 0.16 / 0% | 448 / 0.42 / 0% | 878 / 0.29 / 0% | 43 / 0.38 / 0% | 23 / 0.61 / 0% | bison 68.8, wolf never, raven 70.0, pronghorn 128.8, rabbit 45.0, coyote 38.8, prairiedog 68.8 |
| 10 | 720000 | 448.2 | 900 / 0.46 / 0% | 77 / 0.26 / 0% | 586 / 0.15 / 0% | 373 / 0.37 / 0% | 897 / 0.28 / 0% | 43 / 0.36 / 0% | 20 / 0.92 / 16% | bison 12.5, wolf 55.0, raven unaffected, pronghorn 72.5, rabbit 26.3, coyote 20.0, prairiedog 78.8 |
| 11 | 720000 | 444.0 | 916 / 0.43 / 0% | 72 / 0.31 / 4% | 604 / 0.12 / 0% | 344 / 0.48 / 0% | 827 / 0.33 / 0% | 49 / 0.44 / 0% | 30 / 0.73 / 6% | bison 36.3, wolf unaffected, raven unaffected, pronghorn unaffected, rabbit 7.5, coyote 25.0, prairiedog 18.8 |
| 12 | 720000 | 433.4 | 1000 / 0.49 / 0% | 70 / 0.33 / 4% | 590 / 0.14 / 0% | 418 / 0.49 / 0% | 894 / 0.30 / 0% | 49 / 0.40 / 0% | 34 / 0.98 / 3% | bison 65.0, wolf 85.0, raven unaffected, pronghorn 56.3, rabbit 93.8, coyote 20.0, prairiedog 268.8 |
| 13 | 720000 | 379.1 | 939 / 0.42 / 0% | 72 / 0.28 / 2% | 586 / 0.14 / 0% | 485 / 0.46 / 0% | 810 / 0.30 / 0% | 49 / 0.37 / 0% | 18 / 0.80 / 1% | bison 42.5, wolf 43.8, raven 20.0, pronghorn 28.8, rabbit 47.5, coyote 12.5, prairiedog 285.0 |
| 14 | 720000 | 413.2 | 941 / 0.57 / 0% | 71 / 0.30 / 2% | 580 / 0.15 / 0% | 416 / 0.53 / 0% | 885 / 0.30 / 0% | 47 / 0.44 / 1% | 42 / 0.69 / 3% | bison 15.0, wolf 18.8, raven 17.5, pronghorn 33.8, rabbit 40.0, coyote 31.3, prairiedog 7.5 |
| 15 | 720000 | 380.8 | 927 / 0.57 / 0% | 80 / 0.28 / 0% | 575 / 0.16 / 0% | 393 / 0.52 / 0% | 917 / 0.27 / 0% | 48 / 0.40 / 0% | 105 / 0.41 / 0% | bison 63.8, wolf unaffected, raven unaffected, pronghorn 73.8, rabbit 70.0, coyote 45.0, prairiedog 7.5 |
| 16 | 720000 | 418.0 | 981 / 0.41 / 0% | 66 / 0.38 / 7% | 595 / 0.13 / 0% | 422 / 0.43 / 0% | 783 / 0.32 / 0% | 57 / 0.39 / 0% | 33 / 0.69 / 9% | bison 12.5, wolf 72.5, raven unaffected, pronghorn 10.0, rabbit 55.0, coyote 21.3, prairiedog 21.3 |
| 17 | 720000 | 416.4 | 909 / 0.51 / 0% | 69 / 0.37 / 6% | 576 / 0.16 / 0% | 449 / 0.57 / 0% | 817 / 0.30 / 0% | 56 / 0.40 / 0% | 41 / 0.79 / 2% | bison 46.3, wolf 47.5, raven 41.3, pronghorn 11.3, rabbit 10.0, coyote 25.0, prairiedog 147.5 |
| 18 | 720000 | 404.7 | 785 / 0.47 / 0% | 71 / 0.42 / 8% | 568 / 0.16 / 0% | 457 / 0.54 / 0% | 806 / 0.34 / 0% | 53 / 0.37 / 0% | 27 / 0.66 / 1% | bison 56.3, wolf never, raven unaffected, pronghorn 53.8, rabbit 72.5, coyote 50.0, prairiedog 12.5 |
| 19 | 720000 | 417.7 | 961 / 0.42 / 0% | 76 / 0.25 / 1% | 595 / 0.13 / 0% | 449 / 0.43 / 0% | 874 / 0.26 / 0% | 54 / 0.39 / 0% | 95 / 0.44 / 0% | bison 20.0, wolf 30.0, raven unaffected, pronghorn 91.3, rabbit 68.8, coyote 20.0, prairiedog 7.5 |
| 20 | 720000 | 416.5 | 881 / 0.56 / 0% | 76 / 0.30 / 2% | 584 / 0.15 / 0% | 374 / 0.47 / 0% | 943 / 0.29 / 0% | 41 / 0.39 / 0% | 41 / 0.40 / 0% | bison 72.5, wolf unaffected, raven unaffected, pronghorn 117.5, rabbit 28.8, coyote 68.8, prairiedog 73.8 |
