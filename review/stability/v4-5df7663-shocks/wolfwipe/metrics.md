# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 288000 ticks (120 years)
- Sampled every 1000 ticks; commit 0618dc7; real sim
- Shocks: wolves removed at tick 101000 (year 42.1); introduce 8 wolves at tick 144000 (year 60.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 1362 | 0.47 | 0.0% | 0.0 | 3.17 | 19 | 4.6 (13 seeds) | 100% | 65% | 8.8 |
| wolf | 17/20 (85%) | 43 | 0.53 | 17.6% | 17.9 | 1.92 | 17 | none | 100% | 60% | 4.2 |
| raven | 20/20 (100%) | 285 | 0.11 | 0.0% | 0.0 | 1.13 | 0 | 5.0 (19 seeds) | 0% | 100% | 0.0 |
| pronghorn | 19/20 (95%) | 761 | 0.69 | 0.2% | 0.2 | 4.21 | 25 | 3.3 (19 seeds) | 95% | 70% | 7.9 |

Max bison generation depth reached: 184.5 (median across seeds 166.7).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | PASS | FAIL | FAIL | PASS | PASS | FAIL | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | FAIL | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 288000 | 168.5 | 1210 / 0.53 / 0% | 50 / 0.51 / 18% | 285 / 0.11 / 0% | 754 / 0.71 / 0% | bison 8.8, wolf 3.3, raven unaffected, pronghorn 45.8 |
| 2 | 288000 | 161.6 | 1178 / 0.48 / 0% | 50 / 0.51 / 18% | 285 / 0.12 / 0% | 660 / 0.62 / 3% | bison 6.3, wolf 3.3, raven unaffected, pronghorn 20.0 |
| 3 | 288000 | 166.2 | 1350 / 0.42 / 0% | 44 / 0.54 / 18% | 286 / 0.11 / 0% | 867 / 0.54 / 0% | bison never, wolf 37.5, raven unaffected, pronghorn 35.8 |
| 4 | 288000 | 165.6 | 1375 / 0.38 / 0% | 45 / 0.56 / 18% | 285 / 0.11 / 0% | 851 / 0.59 / 0% | bison 7.5, wolf never, raven unaffected, pronghorn 4.6 |
| 5 | 288000 | 167.6 | 1498 / 0.48 / 0% | 41 / 0.52 / 18% | 286 / 0.11 / 0% | 883 / 0.68 / 2% | bison 8.3, wolf 5.0, raven unaffected, pronghorn never |
| 6 | 288000 | 172.7 | 1058 / 0.49 / 0% | 49 / 0.52 / 18% | 285 / 0.11 / 0% | 511 / 0.91 / 5% | bison 15.0, wolf 7.1, raven unaffected, pronghorn 9.2 |
| 7 | 288000 | 159.1 | 1587 / 0.36 / 0% | 35 / 0.51 / 18% | 286 / 0.11 / 0% | 888 / 0.60 / 0% | bison 28.8, wolf 3.8, raven unaffected, pronghorn 2.5 |
| 8 | 288000 | 167.2 | 1641 / 0.45 / 0% | 15 / 1.80 / 72% EXTINCT@65.0yr | 285 / 0.11 / 0% | 931 / 0.80 / 4% | bison never, wolf never, raven unaffected, pronghorn never |
| 9 | 288000 | 160.2 | 1491 / 0.51 / 0% | 14 / 1.83 / 76% EXTINCT@60.8yr | 286 / 0.11 / 0% | 944 / 0.78 / 1% | bison never, wolf never, raven unaffected, pronghorn never |
| 10 | 288000 | 171.8 | 1006 / 0.53 / 0% | 48 / 0.52 / 18% | 286 / 0.11 / 0% | 621 / 0.69 / 0% | bison 3.3, wolf 4.2, raven unaffected, pronghorn 8.8 |
| 11 | 288000 | 170.8 | 1184 / 0.48 / 0% | 46 / 0.56 / 18% | 285 / 0.11 / 0% | 703 / 0.64 / 0% | bison 8.8, wolf never, raven unaffected, pronghorn 3.8 |
| 12 | 288000 | 157.8 | 1333 / 0.52 / 0% | 46 / 0.54 / 18% | 285 / 0.12 / 0% | 704 / 0.65 / 0% | bison 9.2, wolf never, raven unaffected, pronghorn 2.5 |
| 13 | 288000 | 179.0 | 1374 / 0.40 / 0% | 44 / 0.52 / 18% | 286 / 0.11 / 0% | 710 / 0.72 / 0% | bison 15.8, wolf 4.2, raven unaffected, pronghorn 5.0 |
| 14 | 288000 | 159.9 | 1762 / 0.39 / 0% | 12 / 1.86 / 76% EXTINCT@61.7yr | 286 / 0.11 / 0% | 986 / 0.69 / 0% | bison never, wolf never, raven unaffected, pronghorn never |
| 15 | 288000 | 158.5 | 1595 / 0.33 / 0% | 33 / 0.52 / 18% | 286 / 0.11 / 0% | 776 / 0.69 / 0% | bison 22.1, wolf 3.8, raven unaffected, pronghorn 9.2 |
| 16 | 288000 | 184.5 | 1535 / 0.36 / 0% | 40 / 0.53 / 18% | 286 / 0.11 / 0% | 776 / 0.55 / 0% | bison 13.3, wolf 10.0, raven unaffected, pronghorn never |
| 17 | 288000 | 172.1 | 1158 / 0.43 / 0% | 46 / 0.51 / 18% | 285 / 0.11 / 0% | 728 / 0.75 / 0% | bison 6.7, wolf 7.5, raven unaffected, pronghorn 8.3 |
| 18 | 288000 | 157.5 | 1069 / 0.58 / 3% | 42 / 0.56 / 18% | 267 / 0.24 / 0% | 3 / 7.75 / 96% EXTINCT@22.5yr | bison never, wolf never, raven unaffected, pronghorn unaffected |
| 19 | 288000 | 175.2 | 1317 / 0.51 / 0% | 43 / 0.52 / 18% | 284 / 0.12 / 0% | 764 / 0.71 / 0% | bison never, wolf 3.8, raven unaffected, pronghorn 7.5 |
| 20 | 288000 | 160.1 | 1432 / 0.37 / 0% | 38 / 0.56 / 18% | 285 / 0.11 / 0% | 758 / 0.57 / 0% | bison never, wolf never, raven unaffected, pronghorn never |
