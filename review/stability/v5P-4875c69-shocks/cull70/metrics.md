# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 288000 ticks (120 years)
- Sampled every 1000 ticks; commit 4875c69 (frozen copy); real sim
- Params: {"bison.birthCooldown":1250,"bison.maxAge":8000,"deer.birthCooldown":1000,"deer.maxAge":4500,"founderDesync":1,"wolfRareHalf":150,"grassInit":0.45,"wolfSmallGame":0.5}
- Shocks: cull 70% bison at tick 115000 (year 47.9)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 778 | 0.44 | 0.0% | 0.0 | 2.47 | 15 | 6.7 (17 seeds) | 100% | 65% | 7.9 |
| wolf | 19/20 (95%) | 55 | 0.19 | 0.0% | 0.0 | 1.51 | 18 | 5.0 (19 seeds) | 85% | 90% | 28.1 |
| raven | 19/20 (95%) | 280 | 0.14 | 0.0% | 0.0 | 1.16 | 3 | 5.0 (20 seeds) | 15% | 95% | 0.0 |
| pronghorn | 19/20 (95%) | 554 | 0.53 | 0.0% | 0.0 | 3.14 | 22 | 5.0 (20 seeds) | 100% | 90% | 7.7 |

Max bison generation depth reached: 151.1 (median across seeds 132.9).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 288000 | 142.0 | 590 / 0.52 / 0% | 64 / 0.22 / 0% | 282 / 0.13 / 0% | 471 / 0.60 / 2% | bison 7.5, wolf 66.3, raven unaffected, pronghorn 6.7 |
| 2 | 288000 | 140.4 | 515 / 0.44 / 0% | 67 / 0.19 / 0% | 280 / 0.15 / 0% | 385 / 0.60 / 0% | bison 9.2, wolf 15.8, raven unaffected, pronghorn 8.8 |
| 3 | 288000 | 141.9 | 843 / 0.54 / 0% | 62 / 0.20 / 0% | 278 / 0.15 / 0% | 477 / 0.55 / 1% | bison never, wolf 28.8, raven unaffected, pronghorn 4.2 |
| 4 | 288000 | 120.9 | 696 / 0.59 / 0% | 62 / 0.18 / 0% | 280 / 0.14 / 0% | 657 / 0.51 / 0% | bison 7.9, wolf 15.0, raven unaffected, pronghorn 12.9 |
| 5 | 288000 | 129.4 | 749 / 0.50 / 0% | 59 / 0.17 / 0% | 281 / 0.13 / 0% | 678 / 0.43 / 0% | bison never, wolf unaffected, raven 3.8, pronghorn 5.8 |
| 6 | 288000 | 143.4 | 937 / 0.44 / 0% | 45 / 0.21 / 0% | 280 / 0.14 / 0% | 623 / 0.60 / 0% | bison 10.0, wolf unaffected, raven unaffected, pronghorn 17.9 |
| 7 | 288000 | 129.1 | 1149 / 0.31 / 0% | 48 / 0.24 / 0% | 285 / 0.12 / 0% | 813 / 0.50 / 0% | bison 2.9, wolf 32.5, raven unaffected, pronghorn 2.9 |
| 8 | 288000 | 132.9 | 928 / 0.47 / 0% | 48 / 0.18 / 0% | 281 / 0.13 / 0% | 640 / 0.46 / 0% | bison never, wolf 36.7, raven unaffected, pronghorn 6.3 |
| 9 | 288000 | 123.5 | 574 / 0.42 / 0% | 52 / 0.17 / 0% | 280 / 0.14 / 0% | 602 / 0.45 / 0% | bison 10.8, wolf 47.1, raven unaffected, pronghorn 21.7 |
| 10 | 288000 | 125.2 | 578 / 0.37 / 0% | 54 / 0.17 / 0% | 281 / 0.13 / 0% | 559 / 0.49 / 0% | bison 5.0, wolf 43.8, raven unaffected, pronghorn 27.9 |
| 11 | 288000 | 145.1 | 547 / 0.44 / 0% | 58 / 0.20 / 0% | 261 / 0.26 / 0% | 496 / 0.63 / 0% | bison 4.2, wolf 12.9, raven unaffected, pronghorn 2.5 |
| 12 | 288000 | 145.5 | 1080 / 0.37 / 0% | 53 / 0.19 / 0% | 284 / 0.12 / 0% | 548 / 0.52 / 0% | bison 18.3, wolf 8.3, raven unaffected, pronghorn 5.4 |
| 13 | 288000 | 134.0 | 824 / 0.42 / 0% | 52 / 0.19 / 0% | 277 / 0.17 / 0% | 535 / 0.53 / 0% | bison 22.1, wolf unaffected, raven unaffected, pronghorn 40.0 |
| 14 | 288000 | 133.0 | 963 / 0.44 / 0% | 59 / 0.19 / 0% | 280 / 0.14 / 0% | 627 / 0.56 / 0% | bison never, wolf 31.7, raven unaffected, pronghorn 4.2 |
| 15 | 288000 | 124.1 | 1049 / 0.37 / 0% | 51 / 0.17 / 0% | 283 / 0.12 / 0% | 729 / 0.53 / 0% | bison 10.4, wolf 42.9, raven unaffected, pronghorn 16.7 |
| 16 | 288000 | 151.1 | 892 / 0.44 / 0% | 55 / 0.19 / 0% | 279 / 0.15 / 0% | 677 / 0.55 / 0% | bison 6.3, wolf never, raven unaffected, pronghorn never |
| 17 | 214000 | 46.9 | 143 / 1.27 / 53% EXTINCT@56.7yr | 56 / 0.41 / 8% EXTINCT@84.6yr | 141 / 0.85 / 26% EXTINCT@75.4yr | 503 / 0.94 / 5% EXTINCT@89.2yr | bison never, wolf never, raven never, pronghorn never |
| 18 | 288000 | 128.7 | 334 / 0.70 / 8% | 64 / 0.18 / 0% | 228 / 0.40 / 1% | 525 / 0.52 / 0% | bison never, wolf 58.8, raven 11.7, pronghorn 50.0 |
| 19 | 288000 | 135.0 | 801 / 0.49 / 0% | 55 / 0.20 / 0% | 275 / 0.16 / 0% | 518 / 0.52 / 0% | bison never, wolf 27.5, raven unaffected, pronghorn 5.4 |
| 20 | 288000 | 120.3 | 754 / 0.44 / 0% | 61 / 0.20 / 0% | 281 / 0.13 / 0% | 543 / 0.53 / 0% | bison 3.8, wolf 9.6, raven unaffected, pronghorn 22.5 |
