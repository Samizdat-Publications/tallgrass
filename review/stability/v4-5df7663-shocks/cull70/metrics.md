# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 288000 ticks (120 years)
- Sampled every 1000 ticks; commit 5df7663 (frozen copy); real sim
- Shocks: cull 70% bison at tick 115000 (year 47.9)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 1126 | 0.37 | 0.0% | 0.0 | 2.31 | 19 | 5.4 (19 seeds) | 100% | 80% | 6.3 |
| wolf | 19/20 (95%) | 54 | 0.19 | 0.0% | 0.0 | 1.49 | 18 | 5.0 (19 seeds) | 80% | 90% | 14.8 |
| raven | 19/20 (95%) | 285 | 0.11 | 0.0% | 0.0 | 1.13 | 0 | 5.0 (19 seeds) | 5% | 95% | 0.0 |
| pronghorn | 19/20 (95%) | 693 | 0.56 | 0.0% | 0.0 | 3.26 | 25 | 4.8 (18 seeds) | 95% | 80% | 4.6 |

Max bison generation depth reached: 182.0 (median across seeds 168.0).

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
| 1 | 288000 | 176.7 | 1121 / 0.37 / 0% | 60 / 0.17 / 0% | 286 / 0.11 / 0% | 702 / 0.47 / 0% | bison 6.3, wolf unaffected, raven unaffected, pronghorn 2.5 |
| 2 | 288000 | 162.5 | 1148 / 0.43 / 0% | 53 / 0.21 / 0% | 285 / 0.11 / 0% | 727 / 0.61 / 0% | bison 5.0, wolf 11.7, raven unaffected, pronghorn 2.9 |
| 3 | 288000 | 154.0 | 1084 / 0.54 / 0% | 63 / 0.19 / 0% | 285 / 0.12 / 0% | 764 / 0.68 / 0% | bison never, wolf 19.6, raven unaffected, pronghorn 57.9 |
| 4 | 288000 | 172.5 | 1279 / 0.33 / 0% | 51 / 0.26 / 0% | 285 / 0.11 / 0% | 748 / 0.47 / 0% | bison 32.1, wolf never, raven unaffected, pronghorn 21.3 |
| 5 | 288000 | 160.9 | 1174 / 0.39 / 0% | 54 / 0.20 / 0% | 286 / 0.11 / 0% | 745 / 0.53 / 0% | bison 6.3, wolf 18.3, raven unaffected, pronghorn never |
| 6 | 288000 | 166.0 | 1041 / 0.33 / 0% | 53 / 0.20 / 0% | 285 / 0.11 / 0% | 612 / 0.66 / 0% | bison 5.4, wolf 8.3, raven unaffected, pronghorn 4.6 |
| 7 | 288000 | 168.5 | 1393 / 0.36 / 0% | 47 / 0.20 / 0% | 285 / 0.11 / 0% | 741 / 0.56 / 0% | bison 9.6, wolf 2.9, raven unaffected, pronghorn 10.4 |
| 8 | 288000 | 165.1 | 1109 / 0.36 / 0% | 66 / 0.17 / 0% | 285 / 0.12 / 0% | 517 / 0.57 / 2% | bison 6.3, wolf 53.8, raven unaffected, pronghorn never |
| 9 | 288000 | 182.0 | 1114 / 0.44 / 0% | 56 / 0.20 / 0% | 286 / 0.11 / 0% | 630 / 0.65 / 2% | bison 5.0, wolf 3.8, raven unaffected, pronghorn never |
| 10 | 288000 | 162.8 | 734 / 0.42 / 0% | 65 / 0.23 / 0% | 285 / 0.12 / 0% | 417 / 0.57 / 1% | bison 11.7, wolf 30.8, raven unaffected, pronghorn 2.9 |
| 11 | 288000 | 177.6 | 1035 / 0.36 / 0% | 41 / 0.19 / 0% | 285 / 0.11 / 0% | 663 / 0.59 / 0% | bison 6.3, wolf unaffected, raven unaffected, pronghorn never |
| 12 | 288000 | 152.4 | 1390 / 0.36 / 0% | 39 / 0.23 / 0% | 285 / 0.11 / 0% | 793 / 0.50 / 0% | bison 22.1, wolf 45.0, raven unaffected, pronghorn 20.0 |
| 13 | 288000 | 175.0 | 1126 / 0.38 / 0% | 56 / 0.18 / 0% | 286 / 0.11 / 0% | 548 / 0.70 / 2% | bison 4.6, wolf unaffected, raven unaffected, pronghorn 3.8 |
| 14 | 288000 | 167.5 | 1255 / 0.45 / 0% | 55 / 0.20 / 0% | 285 / 0.11 / 0% | 774 / 0.55 / 0% | bison 5.0, wolf 17.5, raven unaffected, pronghorn 7.5 |
| 15 | 288000 | 159.4 | 1443 / 0.29 / 0% | 41 / 0.19 / 0% | 286 / 0.11 / 0% | 804 / 0.48 / 0% | bison 2.5, wolf 12.1, raven unaffected, pronghorn 8.8 |
| 16 | 288000 | 176.1 | 1301 / 0.34 / 0% | 44 / 0.19 / 0% | 285 / 0.11 / 0% | 667 / 0.57 / 0% | bison 19.6, wolf unaffected, raven unaffected, pronghorn 3.3 |
| 17 | 288000 | 173.3 | 1125 / 0.33 / 0% | 58 / 0.17 / 0% | 285 / 0.11 / 0% | 684 / 0.53 / 0% | bison 2.5, wolf 53.8, raven unaffected, pronghorn 2.5 |
| 18 | 156000 | 57.3 | 285 / 1.02 / 28% EXTINCT@54.2yr | 55 / 0.42 / 4% EXTINCT@65.0yr | 159 / 0.78 / 24% EXTINCT@55.4yr | 6 / 5.22 / 91% EXTINCT@22.5yr | bison never, wolf never, raven never, pronghorn unaffected |
| 19 | 288000 | 173.1 | 1105 / 0.43 / 0% | 51 / 0.17 / 0% | 284 / 0.12 / 0% | 742 / 0.52 / 0% | bison never, wolf 25.4, raven unaffected, pronghorn 4.6 |
| 20 | 288000 | 169.3 | 1218 / 0.35 / 0% | 62 / 0.17 / 0% | 285 / 0.11 / 0% | 487 / 0.51 / 0% | bison never, wolf 27.1, raven unaffected, pronghorn 16.7 |
