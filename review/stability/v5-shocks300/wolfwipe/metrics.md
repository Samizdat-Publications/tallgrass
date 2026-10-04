# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (300 years)
- Sampled every 1500 ticks; commit facdc22 (frozen copy); real sim
- Shocks: wolves removed at tick 252000 (year 105.0); introduce 8 wolves at tick 360000 (year 150.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 1183 | 0.39 | 0.0% | 0.0 | 2.72 | 42 | 5.0 (8 seeds) | 100% | 90% | 23.1 |
| wolf | 20/20 (100%) | 49 | 0.52 | 17.6% | 45.0 | 1.92 | 35 | none | 100% | 95% | 5.6 |
| raven | 20/20 (100%) | 284 | 0.12 | 0.0% | 0.0 | 1.15 | 1 | 5.0 (20 seeds) | 0% | 100% | 0.0 |
| pronghorn | 19/20 (95%) | 810 | 0.63 | 0.2% | 0.6 | 4.23 | 59 | 3.8 (19 seeds) | 90% | 100% | 15.6 |

Max bison generation depth reached: 422.6 (median across seeds 382.4).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 422.6 | 1210 / 0.47 / 0% | 46 / 0.52 / 18% | 284 / 0.11 / 0% | 842 / 0.66 / 0% | bison 50.6, wolf 11.9, raven unaffected, pronghorn 10.6 |
| 2 | 720000 | 386.3 | 1014 / 0.47 / 0% | 56 / 0.52 / 18% | 284 / 0.12 / 0% | 585 / 0.69 / 0% | bison 68.1, wolf 5.6, raven unaffected, pronghorn 82.5 |
| 3 | 720000 | 384.5 | 1253 / 0.34 / 0% | 45 / 0.51 / 18% | 284 / 0.12 / 0% | 820 / 0.58 / 0% | bison 25.0, wolf 5.6, raven unaffected, pronghorn 23.1 |
| 4 | 720000 | 362.1 | 1131 / 0.43 / 0% | 49 / 0.52 / 18% | 284 / 0.12 / 0% | 829 / 0.58 / 1% | bison 72.5, wolf 5.0, raven unaffected, pronghorn 19.4 |
| 5 | 720000 | 364.8 | 1252 / 0.38 / 0% | 44 / 0.52 / 18% | 284 / 0.11 / 0% | 910 / 0.53 / 0% | bison 21.3, wolf 5.0, raven unaffected, pronghorn 6.3 |
| 6 | 720000 | 382.8 | 1240 / 0.34 / 0% | 41 / 0.52 / 18% | 285 / 0.12 / 0% | 876 / 0.55 / 0% | bison 8.1, wolf 3.8, raven unaffected, pronghorn unaffected |
| 7 | 720000 | 403.0 | 1459 / 0.32 / 0% | 46 / 0.53 / 18% | 284 / 0.12 / 0% | 910 / 0.64 / 0% | bison 6.3, wolf 6.3, raven unaffected, pronghorn unaffected |
| 8 | 720000 | 380.9 | 1249 / 0.35 / 0% | 42 / 0.52 / 18% | 284 / 0.12 / 0% | 758 / 0.67 / 0% | bison never, wolf 5.6, raven unaffected, pronghorn 11.9 |
| 9 | 720000 | 368.0 | 954 / 0.48 / 0% | 56 / 0.54 / 18% | 284 / 0.12 / 0% | 684 / 0.62 / 1% | bison 28.1, wolf never, raven unaffected, pronghorn 78.1 |
| 10 | 720000 | 387.0 | 1111 / 0.44 / 0% | 50 / 0.51 / 18% | 284 / 0.12 / 0% | 803 / 0.63 / 0% | bison never, wolf 3.8, raven unaffected, pronghorn 9.4 |
| 11 | 720000 | 376.3 | 999 / 0.45 / 0% | 50 / 0.52 / 18% | 283 / 0.12 / 0% | 742 / 0.63 / 0% | bison 11.3, wolf 4.4, raven unaffected, pronghorn 46.3 |
| 12 | 720000 | 376.3 | 1393 / 0.32 / 0% | 49 / 0.52 / 18% | 285 / 0.11 / 0% | 854 / 0.62 / 0% | bison 8.8, wolf 36.9, raven unaffected, pronghorn 5.6 |
| 13 | 720000 | 392.1 | 1147 / 0.39 / 0% | 50 / 0.52 / 18% | 284 / 0.12 / 0% | 710 / 0.65 / 2% | bison 4.4, wolf 8.8, raven unaffected, pronghorn 75.6 |
| 14 | 720000 | 382.3 | 1397 / 0.31 / 0% | 40 / 0.54 / 18% | 285 / 0.11 / 0% | 910 / 0.60 / 0% | bison 54.4, wolf 19.4, raven unaffected, pronghorn 6.3 |
| 15 | 720000 | 358.5 | 1388 / 0.37 / 0% | 45 / 0.52 / 18% | 284 / 0.12 / 0% | 904 / 0.54 / 0% | bison 106.3, wolf 3.8, raven unaffected, pronghorn 33.8 |
| 16 | 720000 | 399.9 | 1096 / 0.42 / 0% | 51 / 0.51 / 18% | 285 / 0.11 / 0% | 783 / 0.64 / 0% | bison 4.4, wolf 5.0, raven unaffected, pronghorn 4.4 |
| 17 | 720000 | 382.4 | 1018 / 0.50 / 0% | 54 / 0.52 / 18% | 283 / 0.12 / 0% | 517 / 1.05 / 23% EXTINCT@243.1yr | bison 121.9, wolf 6.3, raven unaffected, pronghorn 5.6 |
| 18 | 720000 | 381.4 | 988 / 0.53 / 2% | 50 / 0.52 / 18% | 282 / 0.13 / 0% | 679 / 0.75 / 0% | bison 52.5, wolf 5.0, raven unaffected, pronghorn 38.1 |
| 19 | 720000 | 390.5 | 1181 / 0.36 / 0% | 48 / 0.51 / 18% | 284 / 0.12 / 0% | 785 / 0.68 / 0% | bison 3.8, wolf 21.3, raven unaffected, pronghorn 58.1 |
| 20 | 720000 | 367.3 | 1184 / 0.38 / 0% | 52 / 0.50 / 18% | 284 / 0.12 / 0% | 816 / 0.58 / 0% | bison 4.4, wolf 4.4, raven unaffected, pronghorn 41.3 |
