# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 144000 ticks (60 years)
- Sampled every 1200 ticks; commit 92370a9; real sim
- Shocks: drought (2 yr) at tick 57600 (year 24.0)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 13/20 (65%) | 649 | 0.68 | 0.0% | 0.0 | 3.76 | 7 | 10.0 (9 seeds) | 70% | 35% | 0.0 |
| wolf | 15/20 (75%) | 45 | 0.25 | 0.0% | 0.0 | 1.58 | 6 | 5.5 (12 seeds) | 60% | 80% | 3.0 |
| raven | 14/20 (70%) | 240 | 0.25 | 0.0% | 0.0 | 1.30 | 1 | 7.0 (7 seeds) | 55% | 90% | 2.5 |
| pronghorn | 13/20 (65%) | 401 | 0.65 | 3.9% | 2.0 | 2.96 | 9 | 7.3 (14 seeds) | 70% | 80% | 4.5 |

Max bison generation depth reached: 104.3 (median across seeds 94.4).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | FAIL | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | FAIL | PASS | PASS | PASS | PASS | PASS | FAIL |
| raven | FAIL | PASS | PASS | PASS | PASS | PASS | FAIL |
| pronghorn | FAIL | PASS | PASS | PASS | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 144000 | 97.2 | 807 / 0.57 / 0% | 48 / 0.24 / 0% | 244 / 0.24 / 0% | 535 / 0.67 / 2% | bison never, wolf unaffected, raven 8.0, pronghorn 8.5 |
| 2 | 144000 | 100.1 | 666 / 0.59 / 0% | 49 / 0.24 / 0% | 251 / 0.20 / 0% | 377 / 0.60 / 0% | bison never, wolf unaffected, raven unaffected, pronghorn unaffected |
| 3 | 144000 | 92.0 | 632 / 0.72 / 0% | 57 / 0.19 / 0% | 253 / 0.18 / 0% | 403 / 0.47 / 0% | bison never, wolf 30.5, raven 5.0, pronghorn never |
| 4 | 144000 | 99.0 | 1118 / 0.46 / 0% | 39 / 0.19 / 0% | 259 / 0.16 / 0% | 654 / 0.54 / 8% | bison never, wolf 15.0, raven 7.0, pronghorn 5.5 |
| 5 | 144000 | 104.3 | 915 / 0.51 / 0% | 47 / 0.22 / 0% | 260 / 0.14 / 0% | 399 / 0.51 / 0% | bison never, wolf unaffected, raven unaffected, pronghorn 4.0 |
| 6 | 144000 | 91.8 | 424 / 0.79 / 0% | 61 / 0.25 / 0% | 229 / 0.30 / 0% | 106 / 1.94 / 65% EXTINCT@27.5yr | bison never, wolf 6.0, raven unaffected, pronghorn never |
| 7 | 144000 | 96.2 | 954 / 0.55 / 0% | 45 / 0.32 / 0% | 260 / 0.16 / 0% | 588 / 0.55 / 0% | bison 15.0, wolf 19.0, raven 7.0, pronghorn 4.5 |
| 8 | 144000 | 14.6 | 0 / 7.31 / 97% EXTINCT@10.5yr | 21 / 0.36 / 0% | 1 / 6.07 / 94% EXTINCT@12.0yr | 0 / n/a / 100% EXTINCT@5.0yr | bison unaffected, wolf 15.0, raven unaffected, pronghorn unaffected |
| 9 | 144000 | 6.3 | 0 / n/a / 100% EXTINCT@6.5yr | 0 / 10.10 / 99% EXTINCT@9.5yr | 88 / 0.85 / 4% | 932 / 0.71 / 1% | bison unaffected, wolf unaffected, raven 13.5, pronghorn 4.5 |
| 10 | 144000 | 41.9 | 107 / 1.60 / 62% EXTINCT@30.5yr | 21 / 1.10 / 42% EXTINCT@39.5yr | 110 / 1.10 / 43% EXTINCT@46.5yr | 734 / 0.87 / 0% | bison never, wolf never, raven never, pronghorn never |
| 11 | 144000 | 97.9 | 680 / 0.68 / 0% | 49 / 0.20 / 0% | 233 / 0.29 / 0% | 0 / n/a / 100% EXTINCT@9.0yr | bison never, wolf unaffected, raven unaffected, pronghorn unaffected |
| 12 | 144000 | 98.7 | 1155 / 0.39 / 0% | 40 / 0.22 / 0% | 261 / 0.14 / 0% | 608 / 0.52 / 0% | bison never, wolf 12.0, raven 7.0, pronghorn 13.5 |
| 13 | 144000 | 32.3 | 46 / 2.14 / 75% EXTINCT@22.5yr | 34 / 0.53 / 0% | 53 / 1.81 / 72% EXTINCT@25.0yr | 136 / 1.74 / 62% EXTINCT@30.0yr | bison unaffected, wolf never, raven never, pronghorn never |
| 14 | 144000 | 92.6 | 775 / 0.50 / 0% | 45 / 0.18 / 0% | 255 / 0.17 / 0% | 580 / 0.55 / 3% | bison never, wolf 28.5, raven 9.0, pronghorn 12.5 |
| 15 | 144000 | 97.8 | 1067 / 0.45 / 0% | 47 / 0.18 / 0% | 262 / 0.13 / 0% | 529 / 0.49 / 0% | bison never, wolf 18.0, raven unaffected, pronghorn 6.0 |
| 16 | 144000 | 98.4 | 854 / 0.57 / 1% | 45 / 0.28 / 0% | 253 / 0.20 / 0% | 0 / 10.10 / 99% EXTINCT@9.5yr | bison never, wolf never, raven 10.0, pronghorn unaffected |
| 17 | 121200 | 15.1 | 4 / 3.72 / 92% EXTINCT@12.5yr | 16 / 0.72 / 1% EXTINCT@50.5yr | 10 / 3.08 / 71% EXTINCT@22.5yr | 2 / 4.99 / 94% EXTINCT@11.5yr | bison unaffected, wolf never, raven unaffected, pronghorn unaffected |
| 18 | 144000 | 13.0 | 1 / 5.70 / 95% EXTINCT@11.5yr | 2 / 3.40 / 86% EXTINCT@16.0yr | 9 / 2.78 / 81% EXTINCT@19.0yr | 914 / 0.72 / 5% | bison unaffected, wolf unaffected, raven unaffected, pronghorn 5.0 |
| 19 | 144000 | 102.0 | 571 / 0.83 / 0% | 54 / 0.22 / 0% | 235 / 0.26 / 0% | 334 / 0.65 / 6% | bison never, wolf unaffected, raven 11.0, pronghorn 12.0 |
| 20 | 60000 | 19.3 | 26 / 1.92 / 73% EXTINCT@14.0yr | 26 / 0.85 / 15% EXTINCT@23.0yr | 46 / 1.36 / 15% EXTINCT@25.0yr | 0 / n/a / 100% EXTINCT@6.5yr | bison unaffected, wolf unaffected, raven unaffected, pronghorn unaffected |
