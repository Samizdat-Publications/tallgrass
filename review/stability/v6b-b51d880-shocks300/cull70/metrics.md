# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit b51d880 (frozen copy); real sim
- Params: {"calendarScale":2,"smallPrey":1,"smallGameField":1,"coyote.initial":12}
- Shocks: cull 70% bison at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 766 | 0.46 | 0.0% | 0.0 | 2.76 | 57 | 8.8 (20 seeds) | 100% | 100% | 44.4 |
| wolf | 20/20 (100%) | 77 | 0.25 | 0.0% | 0.0 | 1.72 | 58 | 8.8 (20 seeds) | 100% | 100% | 65.6 |
| raven | 20/20 (100%) | 571 | 0.16 | 0.0% | 0.0 | 1.21 | 46 | 8.8 (20 seeds) | 40% | 95% | 0.0 |
| pronghorn | 20/20 (100%) | 373 | 0.40 | 0.0% | 0.0 | 2.65 | 59 | 8.8 (20 seeds) | 95% | 100% | 21.3 |
| rabbit | 20/20 (100%) | 899 | 0.28 | 0.0% | 0.0 | 1.84 | 48 | 61.9 (8 seeds) | 100% | 100% | 32.5 |
| coyote | 20/20 (100%) | 48 | 0.37 | 0.0% | 0.0 | 2.25 | 79 | 25.0 (17 seeds) | 100% | 100% | 40.0 |
| prairiedog | 20/20 (100%) | 53 | 0.57 | 0.0% | 0.0 | 2.79 | 29 | 168.8 (4 seeds) | 100% | 95% | 27.5 |

Max bison generation depth reached: 449.5 (median across seeds 403.1).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3502.5 | 6456.9 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| coyote | 100.0% | 0.1 | 0.0 | 95.4 | 801.5 |
| prairiedog | 100.0% | 0.3 | 0.0 | 14.8 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 45 | 7.5 | 187 | 213 | 12 | 12 | 2.1 |
| 2 | 68 | 11.3 | 220 | 254 | 16 | 16 | 3.2 |
| 3 | 64 | 10.7 | 223 | 259 | 15 | 15 | 2.4 |
| 4 | 45 | 7.5 | 136 | 153 | 17 | 21 | 2.1 |
| 5 | 51 | 8.5 | 247 | 274 | 19 | 19 | 2.3 |
| 6 | 34 | 5.7 | 122 | 140 | 21 | 22 | 1.3 |
| 7 | 43 | 7.2 | 218 | 240 | 26 | 24 | 1.9 |
| 8 | 36 | 6.0 | 166 | 181 | 24 | 23 | 1.1 |
| 9 | 24 | 4.0 | 105 | 115 | 22 | 23 | 1.0 |
| 10 | 31 | 5.2 | 151 | 163 | 17 | 16 | 1.3 |
| 11 | 61 | 10.2 | 253 | 279 | 22 | 24 | 2.5 |
| 12 | 53 | 8.8 | 213 | 244 | 18 | 18 | 2.8 |
| 13 | 30 | 5.0 | 155 | 167 | 22 | 25 | 1.6 |
| 14 | 56 | 9.3 | 191 | 198 | 16 | 24 | 2.7 |
| 15 | 66 | 11.0 | 256 | 305 | 19 | 19 | 3.9 |
| 16 | 40 | 6.7 | 168 | 183 | 25 | 22 | 1.8 |
| 17 | 43 | 7.2 | 180 | 190 | 17 | 19 | 1.7 |
| 18 | 35 | 5.8 | 121 | 133 | 21 | 18 | 1.7 |
| 19 | 72 | 12.0 | 268 | 299 | 13 | 24 | 3.2 |
| 20 | 54 | 9.0 | 235 | 256 | 12 | 15 | 2.6 |

Median plagues per 100 years across seeds: 7.5 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.37. Hare CV: 0.28 (annual means 0.28).
- Best half-year-mean correlation (median): 0.22 at a lag of 1.0 years; 5% of seeds reach 0.4. Annual-mean best (median): 0.22.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.33 | 0.26 | 0.22 | 0.21 | 0.22 | 0.13 | 0.22 | 0.21 |
| 2 | 0.33 | 0.25 | 0.18 | 0.22 | 0.18 | 0.06 | 0.18 | 0.22 |
| 3 | 0.31 | 0.26 | 0.29 | 0.30 | 0.30 | 0.22 | 0.29 | 0.30 |
| 4 | 0.45 | 0.28 | 0.13 | 0.16 | 0.18 | 0.10 | 0.13 | 0.16 |
| 5 | 0.33 | 0.29 | 0.19 | 0.21 | 0.20 | 0.03 | 0.19 | 0.21 |
| 6 | 0.39 | 0.30 | 0.20 | 0.20 | 0.17 | 0.04 | 0.20 | 0.20 |
| 7 | 0.35 | 0.33 | 0.33 | 0.36 | 0.30 | 0.18 | 0.33 | 0.36 |
| 8 | 0.34 | 0.32 | 0.33 | 0.34 | 0.32 | 0.15 | 0.33 | 0.34 |
| 9 | 0.38 | 0.28 | 0.15 | 0.19 | 0.11 | -0.01 | 0.15 | 0.19 |
| 10 | 0.41 | 0.29 | 0.13 | 0.16 | 0.18 | 0.13 | 0.13 | 0.16 |
| 11 | 0.43 | 0.29 | 0.28 | 0.31 | 0.23 | 0.08 | 0.28 | 0.31 |
| 12 | 0.44 | 0.30 | 0.21 | 0.28 | 0.28 | 0.16 | 0.21 | 0.28 |
| 13 | 0.33 | 0.28 | 0.18 | 0.23 | 0.22 | 0.15 | 0.18 | 0.23 |
| 14 | 0.40 | 0.27 | 0.15 | 0.22 | 0.20 | 0.11 | 0.15 | 0.22 |
| 15 | 0.39 | 0.25 | 0.35 | 0.37 | 0.32 | 0.25 | 0.35 | 0.37 |
| 16 | 0.37 | 0.30 | 0.22 | 0.25 | 0.24 | 0.14 | 0.22 | 0.25 |
| 17 | 0.39 | 0.27 | 0.14 | 0.20 | 0.14 | 0.03 | 0.14 | 0.20 |
| 18 | 0.36 | 0.28 | 0.39 | 0.40 | 0.33 | 0.22 | 0.39 | 0.40 |
| 19 | 0.34 | 0.26 | 0.17 | 0.17 | 0.18 | 0.08 | 0.17 | 0.17 |
| 20 | 0.47 | 0.25 | 0.23 | 0.31 | 0.34 | 0.21 | 0.23 | 0.31 |

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
| 1 | 720000 | 438.4 | 807 / 0.45 / 0% | 79 / 0.24 / 0% | 587 / 0.14 / 0% | 330 / 0.36 / 0% | 937 / 0.26 / 0% | 48 / 0.33 / 0% | 50 / 0.78 / 1% | bison 18.8, wolf 62.5, raven unaffected, pronghorn 192.5, rabbit 33.8, coyote 10.0, prairiedog 168.8 |
| 2 | 720000 | 392.9 | 816 / 0.46 / 0% | 70 / 0.22 / 0% | 569 / 0.15 / 0% | 471 / 0.44 / 0% | 907 / 0.25 / 0% | 50 / 0.33 / 0% | 90 / 0.44 / 0% | bison 41.3, wolf 195.0, raven 295.0, pronghorn 23.8, rabbit 42.5, coyote 21.3, prairiedog 7.5 |
| 3 | 720000 | 400.0 | 745 / 0.48 / 0% | 76 / 0.27 / 0% | 560 / 0.17 / 0% | 436 / 0.42 / 0% | 1006 / 0.26 / 0% | 52 / 0.31 / 0% | 77 / 0.57 / 0% | bison 253.8, wolf 92.5, raven unaffected, pronghorn unaffected, rabbit 55.0, coyote 25.0, prairiedog 18.8 |
| 4 | 720000 | 386.1 | 658 / 0.54 / 0% | 81 / 0.27 / 0% | 552 / 0.19 / 0% | 357 / 0.47 / 0% | 1025 / 0.28 / 0% | 39 / 0.45 / 0% | 80 / 0.58 / 0% | bison 42.5, wolf 66.3, raven 151.3, pronghorn 17.5, rabbit 12.5, coyote 61.3, prairiedog 16.3 |
| 5 | 720000 | 375.9 | 878 / 0.44 / 0% | 84 / 0.25 / 0% | 574 / 0.16 / 0% | 511 / 0.43 / 0% | 811 / 0.29 / 0% | 51 / 0.33 / 0% | 74 / 0.50 / 0% | bison 12.5, wolf 8.8, raven unaffected, pronghorn 11.3, rabbit 98.8, coyote 191.3, prairiedog 36.3 |
| 6 | 720000 | 423.9 | 706 / 0.49 / 0% | 75 / 0.24 / 0% | 562 / 0.16 / 0% | 386 / 0.42 / 0% | 829 / 0.30 / 0% | 48 / 0.39 / 0% | 32 / 1.01 / 16% | bison 73.8, wolf 71.3, raven 7.5, pronghorn 8.8, rabbit 33.8, coyote 51.3, prairiedog never |
| 7 | 720000 | 412.9 | 775 / 0.46 / 0% | 83 / 0.25 / 0% | 589 / 0.13 / 0% | 295 / 0.37 / 0% | 843 / 0.33 / 0% | 51 / 0.35 / 0% | 35 / 0.34 / 0% | bison 88.8, wolf 57.5, raven unaffected, pronghorn 93.8, rabbit 22.5, coyote 93.8, prairiedog 40.0 |
| 8 | 720000 | 374.0 | 733 / 0.45 / 0% | 73 / 0.29 / 0% | 567 / 0.16 / 0% | 334 / 0.37 / 0% | 837 / 0.32 / 0% | 51 / 0.34 / 0% | 22 / 0.79 / 0% | bison 57.5, wolf 20.0, raven unaffected, pronghorn 12.5, rabbit 103.8, coyote 35.0, prairiedog 27.5 |
| 9 | 720000 | 416.9 | 755 / 0.53 / 0% | 73 / 0.29 / 0% | 556 / 0.18 / 0% | 412 / 0.40 / 0% | 862 / 0.28 / 0% | 44 / 0.38 / 0% | 21 / 0.61 / 2% | bison 8.8, wolf 56.3, raven 10.0, pronghorn 57.5, rabbit 31.3, coyote 96.3, prairiedog 47.5 |
| 10 | 720000 | 391.2 | 754 / 0.45 / 0% | 80 / 0.25 / 0% | 573 / 0.16 / 0% | 345 / 0.34 / 0% | 934 / 0.29 / 0% | 40 / 0.41 / 1% | 28 / 0.65 / 1% | bison 11.3, wolf 65.0, raven unaffected, pronghorn 338.8, rabbit 12.5, coyote 15.0, prairiedog 93.8 |
| 11 | 720000 | 406.0 | 742 / 0.49 / 0% | 87 / 0.27 / 0% | 576 / 0.15 / 0% | 315 / 0.35 / 0% | 859 / 0.29 / 0% | 48 / 0.43 / 0% | 42 / 0.40 / 0% | bison 10.0, wolf 160.0, raven 11.3, pronghorn 18.8, rabbit 11.3, coyote 13.8, prairiedog 88.8 |
| 12 | 720000 | 407.8 | 908 / 0.56 / 0% | 74 / 0.25 / 0% | 578 / 0.16 / 0% | 400 / 0.50 / 0% | 948 / 0.30 / 0% | 41 / 0.44 / 0% | 82 / 0.45 / 0% | bison 11.3, wolf 58.8, raven 60.0, pronghorn 15.0, rabbit 65.0, coyote 100.0, prairiedog 11.3 |
| 13 | 720000 | 396.2 | 714 / 0.52 / 0% | 74 / 0.24 / 0% | 554 / 0.18 / 0% | 404 / 0.46 / 0% | 921 / 0.28 / 0% | 43 / 0.33 / 0% | 38 / 0.78 / 4% | bison 7.5, wolf 201.3, raven 8.8, pronghorn 10.0, rabbit 37.5, coyote 35.0, prairiedog 11.3 |
| 14 | 720000 | 439.5 | 766 / 0.43 / 0% | 78 / 0.21 / 0% | 589 / 0.14 / 0% | 330 / 0.39 / 0% | 1012 / 0.27 / 0% | 46 / 0.40 / 1% | 62 / 0.44 / 0% | bison 117.5, wolf 261.3, raven unaffected, pronghorn 178.8, rabbit 12.5, coyote 13.8, prairiedog 27.5 |
| 15 | 720000 | 449.3 | 808 / 0.56 / 0% | 87 / 0.28 / 0% | 559 / 0.18 / 0% | 393 / 0.52 / 0% | 969 / 0.25 / 0% | 48 / 0.39 / 0% | 113 / 0.41 / 0% | bison 26.3, wolf 238.8, raven unaffected, pronghorn 80.0, rabbit 15.0, coyote 80.0, prairiedog 16.3 |
| 16 | 720000 | 388.3 | 956 / 0.41 / 0% | 71 / 0.24 / 0% | 598 / 0.13 / 0% | 360 / 0.31 / 0% | 803 / 0.30 / 0% | 54 / 0.37 / 0% | 41 / 0.57 / 0% | bison 87.5, wolf 75.0, raven unaffected, pronghorn 7.5, rabbit 30.0, coyote 32.5, prairiedog 8.8 |
| 17 | 720000 | 400.2 | 783 / 0.50 / 0% | 71 / 0.24 / 0% | 565 / 0.17 / 0% | 355 / 0.40 / 0% | 867 / 0.27 / 0% | 50 / 0.39 / 0% | 44 / 0.70 / 0% | bison 46.3, wolf 111.3, raven unaffected, pronghorn 15.0, rabbit 20.0, coyote 8.8, prairiedog 56.3 |
| 18 | 720000 | 449.5 | 694 / 0.44 / 0% | 74 / 0.23 / 0% | 567 / 0.16 / 0% | 409 / 0.38 / 0% | 890 / 0.28 / 0% | 44 / 0.36 / 0% | 65 / 0.66 / 1% | bison 63.8, wolf 48.8, raven never, pronghorn 53.8, rabbit 31.3, coyote 45.0, prairiedog 18.8 |
| 19 | 720000 | 392.9 | 920 / 0.41 / 0% | 79 / 0.24 / 0% | 591 / 0.14 / 0% | 426 / 0.36 / 0% | 888 / 0.26 / 0% | 54 / 0.34 / 0% | 101 / 0.38 / 0% | bison 95.0, wolf 20.0, raven unaffected, pronghorn 36.3, rabbit 226.3, coyote 45.0, prairiedog 21.3 |
| 20 | 720000 | 411.6 | 766 / 0.45 / 0% | 91 / 0.25 / 0% | 585 / 0.14 / 0% | 306 / 0.40 / 0% | 1079 / 0.25 / 0% | 39 / 0.47 / 0% | 56 / 0.39 / 0% | bison 68.8, wolf 20.0, raven unaffected, pronghorn 97.5, rabbit 66.3, coyote 52.5, prairiedog 81.3 |
