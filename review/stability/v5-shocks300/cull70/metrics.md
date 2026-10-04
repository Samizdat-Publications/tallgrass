# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (300 years)
- Sampled every 1500 ticks; commit facdc22 (frozen copy); real sim
- Shocks: cull 70% bison at tick 288000 (year 120.0)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 988 | 0.39 | 0.0% | 0.0 | 2.30 | 42 | 5.0 (17 seeds) | 100% | 100% | 24.4 |
| wolf | 20/20 (100%) | 62 | 0.19 | 0.0% | 0.0 | 1.52 | 36 | 5.0 (20 seeds) | 90% | 100% | 49.4 |
| raven | 20/20 (100%) | 284 | 0.12 | 0.0% | 0.0 | 1.15 | 1 | 5.0 (20 seeds) | 5% | 100% | 0.0 |
| pronghorn | 19/20 (95%) | 659 | 0.54 | 0.0% | 0.0 | 3.46 | 55 | 5.0 (20 seeds) | 95% | 100% | 21.6 |

Max bison generation depth reached: 422.0 (median across seeds 391.0).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 389.1 | 1003 / 0.48 / 0% | 64 / 0.22 / 0% | 284 / 0.11 / 0% | 701 / 0.61 / 1% | bison 51.9, wolf 46.9, raven unaffected, pronghorn 8.8 |
| 2 | 720000 | 393.8 | 866 / 0.40 / 0% | 65 / 0.18 / 0% | 284 / 0.12 / 0% | 454 / 0.54 / 1% | bison 61.9, wolf 9.4, raven unaffected, pronghorn 13.1 |
| 3 | 720000 | 399.7 | 1118 / 0.34 / 0% | 58 / 0.17 / 0% | 284 / 0.11 / 0% | 603 / 0.51 / 0% | bison 40.0, wolf 70.0, raven unaffected, pronghorn 128.8 |
| 4 | 720000 | 339.8 | 875 / 0.41 / 0% | 66 / 0.19 / 0% | 283 / 0.12 / 0% | 585 / 0.66 / 2% | bison 26.9, wolf unaffected, raven unaffected, pronghorn 41.3 |
| 5 | 720000 | 366.2 | 977 / 0.42 / 0% | 65 / 0.19 / 0% | 284 / 0.12 / 0% | 720 / 0.57 / 0% | bison 31.3, wolf 23.8, raven unaffected, pronghorn 18.1 |
| 6 | 720000 | 390.1 | 1171 / 0.33 / 0% | 44 / 0.20 / 0% | 285 / 0.11 / 0% | 781 / 0.52 / 0% | bison 5.6, wolf unaffected, raven unaffected, pronghorn 60.6 |
| 7 | 720000 | 392.6 | 1449 / 0.27 / 0% | 52 / 0.22 / 0% | 285 / 0.12 / 0% | 936 / 0.46 / 0% | bison 27.5, wolf 16.3, raven unaffected, pronghorn unaffected |
| 8 | 720000 | 397.0 | 1114 / 0.31 / 0% | 49 / 0.18 / 0% | 284 / 0.12 / 0% | 763 / 0.45 / 0% | bison 5.6, wolf 85.6, raven unaffected, pronghorn 45.6 |
| 9 | 720000 | 384.9 | 931 / 0.48 / 1% | 62 / 0.22 / 0% | 282 / 0.13 / 0% | 705 / 0.57 / 1% | bison 7.5, wolf 20.0, raven 25.6, pronghorn 25.6 |
| 10 | 720000 | 401.5 | 946 / 0.39 / 0% | 62 / 0.18 / 0% | 284 / 0.12 / 0% | 651 / 0.52 / 0% | bison 21.3, wolf 88.8, raven unaffected, pronghorn 97.5 |
| 11 | 720000 | 364.1 | 887 / 0.41 / 0% | 65 / 0.19 / 0% | 283 / 0.12 / 0% | 620 / 0.52 / 0% | bison 14.4, wolf 51.9, raven unaffected, pronghorn 113.8 |
| 12 | 720000 | 377.9 | 1227 / 0.29 / 0% | 56 / 0.19 / 0% | 285 / 0.11 / 0% | 769 / 0.47 / 0% | bison 91.9, wolf 113.1, raven unaffected, pronghorn 22.5 |
| 13 | 720000 | 392.0 | 1137 / 0.34 / 0% | 51 / 0.19 / 0% | 284 / 0.12 / 0% | 535 / 0.56 / 1% | bison 5.6, wolf 145.6, raven unaffected, pronghorn 8.1 |
| 14 | 720000 | 358.5 | 1222 / 0.31 / 0% | 60 / 0.18 / 0% | 285 / 0.12 / 0% | 753 / 0.46 / 0% | bison 55.0, wolf 136.9, raven unaffected, pronghorn 20.6 |
| 15 | 720000 | 367.6 | 1254 / 0.34 / 0% | 53 / 0.19 / 0% | 284 / 0.12 / 0% | 849 / 0.50 / 0% | bison 5.0, wolf 44.4, raven unaffected, pronghorn 5.6 |
| 16 | 720000 | 405.4 | 923 / 0.39 / 0% | 65 / 0.18 / 0% | 285 / 0.11 / 0% | 586 / 0.56 / 0% | bison 56.9, wolf 86.3, raven unaffected, pronghorn 13.8 |
| 17 | 720000 | 422.0 | 723 / 0.43 / 0% | 66 / 0.18 / 0% | 282 / 0.13 / 0% | 539 / 0.58 / 0% | bison 12.5, wolf 153.1, raven unaffected, pronghorn 16.9 |
| 18 | 720000 | 404.5 | 966 / 0.45 / 2% | 64 / 0.19 / 0% | 281 / 0.13 / 0% | 606 / 0.61 / 0% | bison 55.6, wolf 138.8, raven unaffected, pronghorn 100.6 |
| 19 | 720000 | 408.0 | 973 / 0.38 / 1% | 61 / 0.24 / 0% | 284 / 0.12 / 0% | 538 / 0.68 / 9% EXTINCT@279.4yr | bison 5.0, wolf 36.9, raven unaffected, pronghorn 38.1 |
| 20 | 720000 | 357.8 | 1000 / 0.39 / 0% | 70 / 0.19 / 0% | 283 / 0.12 / 0% | 667 / 0.53 / 0% | bison 21.9, wolf 20.0, raven unaffected, pronghorn 11.3 |
