# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 720000 ticks (300 years)
- Sampled every 1500 ticks; commit facdc22 (frozen copy); real sim
- Shocks: drought (2 yr) at tick 288000 (year 120.0)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 17/20 (85%) | 966 | 0.42 | 0.7% | 1.9 | 2.42 | 41 | 5.0 (16 seeds) | 100% | 80% | 9.7 |
| wolf | 16/20 (80%) | 58 | 0.18 | 0.0% | 0.0 | 1.55 | 33 | 5.0 (16 seeds) | 85% | 80% | 20.9 |
| raven | 18/20 (90%) | 282 | 0.13 | 0.0% | 0.0 | 1.16 | 2 | 5.0 (17 seeds) | 55% | 85% | 0.0 |
| pronghorn | 17/20 (85%) | 609 | 0.57 | 0.7% | 1.6 | 3.43 | 54 | 4.4 (18 seeds) | 100% | 85% | 8.1 |

Max bison generation depth reached: 412.4 (median across seeds 377.1).

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
| 1 | 720000 | 403.4 | 1089 / 0.45 / 1% | 68 / 0.24 / 0% | 281 / 0.14 / 0% | 199 / 1.86 / 70% EXTINCT@123.8yr | bison 11.3, wolf 32.5, raven 9.4, pronghorn never |
| 2 | 720000 | 386.5 | 854 / 0.43 / 0% | 65 / 0.18 / 0% | 283 / 0.12 / 0% | 416 / 0.59 / 0% | bison 50.6, wolf 15.6, raven unaffected, pronghorn 8.1 |
| 3 | 720000 | 372.6 | 1042 / 0.34 / 1% | 61 / 0.18 / 0% | 281 / 0.14 / 0% | 559 / 0.53 / 0% | bison 10.0, wolf 23.8, raven 9.4, pronghorn 5.6 |
| 4 | 720000 | 342.7 | 943 / 0.45 / 1% | 69 / 0.21 / 0% | 282 / 0.13 / 0% | 530 / 0.68 / 1% | bison 9.4, wolf 31.9, raven 8.8, pronghorn 5.6 |
| 5 | 720000 | 377.7 | 847 / 0.47 / 1% | 66 / 0.19 / 0% | 281 / 0.14 / 0% | 527 / 0.76 / 17% EXTINCT@263.8yr | bison 13.1, wolf 16.9, raven 10.0, pronghorn 23.8 |
| 6 | 720000 | 406.6 | 1133 / 0.33 / 0% | 45 / 0.20 / 0% | 285 / 0.11 / 0% | 762 / 0.54 / 0% | bison 6.9, wolf 101.9, raven unaffected, pronghorn 3.8 |
| 7 | 720000 | 144.3 | 408 / 1.61 / 70% EXTINCT@125.0yr | 14 / 1.56 / 68% EXTINCT@125.6yr | 209 / 0.48 / 3% | 1024 / 0.53 / 0% | bison never, wolf never, raven never, pronghorn 6.9 |
| 8 | 720000 | 379.5 | 984 / 0.36 / 0% | 50 / 0.18 / 0% | 282 / 0.12 / 0% | 618 / 0.60 / 1% | bison 12.5, wolf 5.6, raven 8.8, pronghorn 8.8 |
| 9 | 720000 | 412.4 | 857 / 0.37 / 0% | 54 / 0.17 / 0% | 284 / 0.12 / 0% | 684 / 0.50 / 0% | bison 6.9, wolf unaffected, raven unaffected, pronghorn 4.4 |
| 10 | 720000 | 376.4 | 1013 / 0.43 / 0% | 59 / 0.18 / 0% | 284 / 0.12 / 0% | 687 / 0.50 / 1% | bison 5.6, wolf 103.1, raven unaffected, pronghorn 10.0 |
| 11 | 720000 | 399.8 | 752 / 0.37 / 0% | 60 / 0.16 / 0% | 283 / 0.12 / 0% | 567 / 0.47 / 0% | bison 6.3, wolf unaffected, raven unaffected, pronghorn 6.9 |
| 12 | 720000 | 132.4 | 386 / 1.61 / 70% EXTINCT@123.1yr | 17 / 1.48 / 67% EXTINCT@129.4yr | 88 / 1.51 / 69% EXTINCT@126.3yr | 990 / 0.67 / 3% | bison never, wolf never, raven never, pronghorn 25.0 |
| 13 | 720000 | 351.3 | 997 / 0.36 / 0% | 53 / 0.18 / 0% | 284 / 0.12 / 0% | 648 / 0.60 / 2% | bison 8.1, wolf 20.6, raven unaffected, pronghorn 13.8 |
| 14 | 720000 | 135.7 | 345 / 1.65 / 70% EXTINCT@123.8yr | 18 / 1.52 / 68% EXTINCT@126.9yr | 111 / 1.18 / 48% EXTINCT@184.4yr | 966 / 0.62 / 1% | bison never, wolf never, raven never, pronghorn 30.6 |
| 15 | 720000 | 391.6 | 1180 / 0.32 / 1% | 53 / 0.17 / 0% | 282 / 0.13 / 0% | 238 / 1.74 / 69% EXTINCT@123.8yr | bison 9.4, wolf unaffected, raven 10.6, pronghorn never |
| 16 | 720000 | 401.5 | 988 / 0.35 / 0% | 58 / 0.17 / 0% | 284 / 0.11 / 0% | 658 / 0.51 / 0% | bison 48.1, wolf 21.3, raven unaffected, pronghorn 7.5 |
| 17 | 720000 | 374.1 | 837 / 0.41 / 0% | 60 / 0.18 / 0% | 283 / 0.12 / 0% | 545 / 0.50 / 0% | bison 11.3, wolf 76.9, raven unaffected, pronghorn 72.5 |
| 18 | 720000 | 366.0 | 957 / 0.49 / 3% | 59 / 0.19 / 0% | 280 / 0.14 / 0% | 571 / 0.55 / 1% | bison 152.5, wolf 6.3, raven 7.5, pronghorn 12.5 |
| 19 | 720000 | 394.9 | 975 / 0.39 / 0% | 63 / 0.21 / 0% | 283 / 0.12 / 0% | 599 / 0.49 / 0% | bison 7.5, wolf 137.5, raven unaffected, pronghorn 6.9 |
| 20 | 720000 | 366.7 | 1504 / 0.43 / 2% | 20 / 1.51 / 68% EXTINCT@126.3yr | 279 / 0.18 / 1% | 1024 / 0.70 / 2% | bison never, wolf never, raven 11.3, pronghorn never |
