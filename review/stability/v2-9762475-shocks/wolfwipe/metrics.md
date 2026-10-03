# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 144000 ticks (60 years)
- Sampled every 1200 ticks; commit 92370a9; real sim
- Shocks: wolves removed at tick 50400 (year 21.0); introduce 8 wolves at tick 72000 (year 30.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 14/20 (70%) | 986 | 0.65 | 0.0% | 0.0 | 3.52 | 7 | 6.5 (3 seeds) | 88% | 29% | 4.5 |
| wolf | 15/20 (75%) | 36 | 0.56 | 17.5% | 9.0 | 1.99 | 6 | 21.3 (2 seeds) | 94% | 82% | 3.8 |
| raven | 15/20 (75%) | 256 | 0.17 | 0.0% | 0.0 | 1.21 | 0 | 8.5 (8 seeds) | 18% | 82% | 0.0 |
| pronghorn | 14/20 (70%) | 564 | 0.86 | 2.9% | 1.5 | 4.38 | 9 | 4.5 (15 seeds) | 71% | 82% | 3.3 |

Max bison generation depth reached: 101.6 (median across seeds 96.0).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | FAIL | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | FAIL | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| raven | FAIL | PASS | PASS | PASS | PASS | PASS | FAIL |
| pronghorn | FAIL | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 144000 | 95.8 | 1059 / 0.74 / 0% | 40 / 0.62 / 18% | 257 / 0.16 / 0% | 665 / 0.90 / 3% | bison never, wolf 8.0, raven unaffected, pronghorn 3.0 |
| 2 | 144000 | 95.0 | 1087 / 0.52 / 0% | 33 / 0.56 / 17% | 254 / 0.19 / 0% | 462 / 0.66 / 0% | bison never, wolf 3.5, raven unaffected, pronghorn unaffected |
| 3 | 144000 | 90.7 | 810 / 0.96 / 0% | 50 / 0.54 / 17% | 256 / 0.16 / 0% | 452 / 0.87 / 3% | bison never, wolf 6.5, raven unaffected, pronghorn 18.5 |
| 4 | 144000 | 97.8 | 1311 / 0.52 / 0% | 32 / 0.54 / 17% | 264 / 0.12 / 0% | 703 / 0.78 / 5% | bison never, wolf 3.5, raven unaffected, pronghorn 3.0 |
| 5 | 144000 | 97.5 | 1171 / 0.53 / 0% | 42 / 0.58 / 17% | 259 / 0.15 / 0% | 594 / 0.71 / 0% | bison never, wolf never, raven unaffected, pronghorn 3.5 |
| 6 | 144000 | 98.6 | 829 / 0.72 / 2% | 40 / 0.55 / 17% | 247 / 0.24 / 0% | 544 / 0.96 / 8% | bison never, wolf 4.0, raven unaffected, pronghorn never |
| 7 | 144000 | 98.1 | 1210 / 0.51 / 0% | 35 / 0.59 / 18% | 265 / 0.12 / 0% | 763 / 0.87 / 1% | bison 7.5, wolf 8.5, raven unaffected, pronghorn 6.0 |
| 8 | 51600 | 14.6 | 1 / 3.57 / 88% EXTINCT@10.5yr | 26 / 0.50 / 4% EXTINCT@21.5yr | 5 / 2.93 / 77% EXTINCT@12.0yr | 0 / n/a / 100% EXTINCT@5.0yr | bison n/a, wolf n/a, raven n/a, pronghorn n/a |
| 9 | 144000 | 6.3 | 0 / n/a / 100% EXTINCT@6.5yr | 0 / 7.96 / 98% EXTINCT@31.0yr | 137 / 0.61 / 0% | 924 / 0.48 / 0% | bison unaffected, wolf 3.0, raven never, pronghorn unaffected |
| 10 | 144000 | 99.1 | 1011 / 0.62 / 0% | 40 / 0.54 / 17% | 263 / 0.14 / 0% | 522 / 0.89 / 1% | bison never, wolf 3.0, raven unaffected, pronghorn 7.5 |
| 11 | 144000 | 99.3 | 862 / 0.71 / 0% | 43 / 0.55 / 17% | 237 / 0.28 / 0% | 0 / n/a / 100% EXTINCT@9.0yr | bison never, wolf 3.5, raven never, pronghorn unaffected |
| 12 | 144000 | 96.8 | 1411 / 0.43 / 0% | 38 / 0.60 / 18% | 265 / 0.12 / 0% | 647 / 0.60 / 0% | bison 6.5, wolf never, raven unaffected, pronghorn 6.5 |
| 13 | 144000 | 59.0 | 312 / 1.81 / 47% EXTINCT@40.0yr | 25 / 1.03 / 17% | 123 / 0.98 / 40% EXTINCT@44.0yr | 229 / 2.05 / 59% EXTINCT@32.5yr | bison never, wolf never, raven never, pronghorn never |
| 14 | 144000 | 91.6 | 1009 / 0.52 / 0% | 37 / 0.57 / 17% | 262 / 0.13 / 0% | 625 / 0.86 / 3% | bison 4.5, wolf 3.5, raven unaffected, pronghorn 10.5 |
| 15 | 144000 | 97.6 | 1201 / 0.55 / 0% | 42 / 0.61 / 18% | 264 / 0.13 / 0% | 633 / 0.78 / 0% | bison never, wolf 9.5, raven unaffected, pronghorn 13.5 |
| 16 | 144000 | 101.6 | 1133 / 0.49 / 0% | 35 / 0.55 / 17% | 264 / 0.12 / 0% | 0 / 10.10 / 99% EXTINCT@9.5yr | bison never, wolf 4.0, raven unaffected, pronghorn unaffected |
| 17 | 54000 | 15.1 | 11 / 1.99 / 75% EXTINCT@12.5yr | 27 / 0.56 / 11% EXTINCT@21.5yr | 30 / 1.58 / 36% EXTINCT@22.5yr | 5 / 2.77 / 82% EXTINCT@11.5yr | bison n/a, wolf n/a, raven n/a, pronghorn n/a |
| 18 | 144000 | 13.0 | 1 / 5.70 / 95% EXTINCT@11.5yr | 2 / 3.38 / 85% EXTINCT@31.0yr | 9 / 2.78 / 81% EXTINCT@19.0yr | 944 / 0.55 / 0% | bison unaffected, wolf unaffected, raven unaffected, pronghorn unaffected |
| 19 | 144000 | 96.3 | 963 / 0.65 / 0% | 39 / 0.56 / 17% | 255 / 0.17 / 0% | 585 / 0.83 / 2% | bison never, wolf 4.5, raven unaffected, pronghorn never |
| 20 | 56400 | 19.3 | 28 / 1.81 / 70% EXTINCT@14.0yr | 28 / 0.78 / 17% EXTINCT@21.5yr | 50 / 1.28 / 10% EXTINCT@23.5yr | 0 / n/a / 100% EXTINCT@6.5yr | bison n/a, wolf n/a, raven n/a, pronghorn n/a |
