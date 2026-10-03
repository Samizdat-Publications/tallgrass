# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 144000 ticks (60 years)
- Sampled every 1200 ticks; commit 92370a9; real sim
- Shocks: cull 70% bison at tick 57600 (year 24.0)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 13/20 (65%) | 629 | 0.65 | 0.0% | 0.0 | 3.01 | 7 | 7.3 (10 seeds) | 70% | 50% | 0.0 |
| wolf | 13/20 (65%) | 43 | 0.24 | 0.0% | 0.0 | 1.59 | 6 | 11.0 (11 seeds) | 75% | 65% | 5.0 |
| raven | 14/20 (70%) | 247 | 0.21 | 0.0% | 0.0 | 1.24 | 1 | 6.5 (9 seeds) | 30% | 85% | 0.0 |
| pronghorn | 13/20 (65%) | 468 | 0.63 | 2.4% | 1.0 | 2.93 | 10 | 5.8 (14 seeds) | 55% | 75% | 0.0 |

Max bison generation depth reached: 107.5 (median across seeds 92.3).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | FAIL | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | FAIL | PASS | PASS | PASS | PASS | FAIL | FAIL |
| raven | FAIL | PASS | PASS | PASS | PASS | PASS | FAIL |
| pronghorn | FAIL | PASS | PASS | PASS | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 144000 | 99.5 | 694 / 0.53 / 0% | 49 / 0.25 / 0% | 256 / 0.17 / 0% | 542 / 0.63 / 4% | bison never, wolf 10.5, raven unaffected, pronghorn 4.5 |
| 2 | 122400 | 48.0 | 145 / 1.45 / 47% EXTINCT@33.0yr | 29 / 0.67 / 9% EXTINCT@51.0yr | 108 / 1.07 / 41% EXTINCT@35.0yr | 197 / 1.48 / 47% EXTINCT@32.5yr | bison never, wolf never, raven never, pronghorn never |
| 3 | 144000 | 89.2 | 588 / 0.52 / 0% | 58 / 0.21 / 0% | 256 / 0.16 / 0% | 463 / 0.44 / 0% | bison 26.5, wolf never, raven unaffected, pronghorn 15.5 |
| 4 | 144000 | 107.5 | 1019 / 0.54 / 0% | 47 / 0.25 / 0% | 263 / 0.13 / 0% | 559 / 0.56 / 2% | bison never, wolf never, raven unaffected, pronghorn unaffected |
| 5 | 144000 | 101.2 | 940 / 0.47 / 0% | 48 / 0.24 / 0% | 258 / 0.16 / 0% | 447 / 0.53 / 0% | bison never, wolf never, raven unaffected, pronghorn 5.5 |
| 6 | 144000 | 90.1 | 246 / 0.76 / 0% | 58 / 0.23 / 0% | 204 / 0.40 / 1% | 164 / 1.53 / 54% EXTINCT@33.0yr | bison 4.0, wolf 9.5, raven 6.0, pronghorn never |
| 7 | 144000 | 92.9 | 941 / 0.40 / 0% | 44 / 0.19 / 0% | 261 / 0.15 / 0% | 626 / 0.48 / 0% | bison 5.5, wolf 5.0, raven 5.0, pronghorn unaffected |
| 8 | 144000 | 14.6 | 0 / 7.31 / 97% EXTINCT@10.5yr | 21 / 0.36 / 0% | 1 / 6.07 / 94% EXTINCT@12.0yr | 0 / n/a / 100% EXTINCT@5.0yr | bison unaffected, wolf 15.0, raven unaffected, pronghorn unaffected |
| 9 | 144000 | 6.3 | 0 / n/a / 100% EXTINCT@6.5yr | 0 / 10.10 / 99% EXTINCT@9.5yr | 159 / 0.52 / 1% | 933 / 0.43 / 0% | bison unaffected, wolf unaffected, raven never, pronghorn unaffected |
| 10 | 144000 | 95.5 | 1098 / 0.73 / 8% | 16 / 1.49 / 64% EXTINCT@29.0yr | 262 / 0.15 / 0% | 844 / 0.64 / 0% | bison never, wolf never, raven unaffected, pronghorn never |
| 11 | 144000 | 98.5 | 583 / 0.65 / 0% | 49 / 0.22 / 0% | 231 / 0.29 / 0% | 0 / n/a / 100% EXTINCT@9.0yr | bison never, wolf unaffected, raven unaffected, pronghorn unaffected |
| 12 | 144000 | 95.4 | 1203 / 0.45 / 0% | 39 / 0.24 / 0% | 264 / 0.13 / 0% | 584 / 0.57 / 0% | bison never, wolf 4.0, raven unaffected, pronghorn 4.5 |
| 13 | 144000 | 32.3 | 46 / 2.14 / 75% EXTINCT@22.5yr | 19 / 1.37 / 55% EXTINCT@32.0yr | 53 / 1.81 / 72% EXTINCT@25.5yr | 649 / 1.01 / 5% | bison unaffected, wolf never, raven never, pronghorn never |
| 14 | 144000 | 91.6 | 678 / 0.49 / 0% | 45 / 0.23 / 0% | 250 / 0.21 / 0% | 510 / 0.66 / 3% | bison 8.0, wolf 20.0, raven 7.0, pronghorn 7.5 |
| 15 | 144000 | 94.1 | 1076 / 0.47 / 0% | 48 / 0.18 / 0% | 263 / 0.14 / 0% | 472 / 0.53 / 0% | bison never, wolf 7.5, raven unaffected, pronghorn 11.0 |
| 16 | 144000 | 101.5 | 1103 / 0.51 / 0% | 41 / 0.23 / 0% | 263 / 0.13 / 0% | 0 / 10.10 / 99% EXTINCT@9.5yr | bison never, wolf 14.5, raven unaffected, pronghorn unaffected |
| 17 | 121200 | 15.1 | 4 / 3.72 / 92% EXTINCT@12.5yr | 16 / 0.72 / 1% EXTINCT@50.5yr | 10 / 3.08 / 71% EXTINCT@22.5yr | 2 / 4.99 / 94% EXTINCT@11.5yr | bison unaffected, wolf never, raven unaffected, pronghorn unaffected |
| 18 | 144000 | 13.0 | 1 / 5.70 / 95% EXTINCT@11.5yr | 2 / 3.40 / 86% EXTINCT@16.0yr | 9 / 2.78 / 81% EXTINCT@19.0yr | 985 / 0.66 / 0% | bison unaffected, wolf unaffected, raven unaffected, pronghorn unaffected |
| 19 | 144000 | 97.4 | 669 / 0.79 / 0% | 57 / 0.22 / 0% | 244 / 0.21 / 0% | 450 / 0.58 / 0% | bison never, wolf unaffected, raven unaffected, pronghorn never |
| 20 | 60000 | 19.3 | 26 / 1.92 / 73% EXTINCT@14.0yr | 26 / 0.85 / 15% EXTINCT@23.0yr | 46 / 1.36 / 15% EXTINCT@25.0yr | 0 / n/a / 100% EXTINCT@6.5yr | bison unaffected, wolf unaffected, raven unaffected, pronghorn unaffected |
