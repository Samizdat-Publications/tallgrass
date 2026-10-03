# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 288000 ticks (120 years)
- Sampled every 1000 ticks; commit 4875c69 (frozen copy); real sim
- Params: {"bison.birthCooldown":1250,"bison.maxAge":8000,"deer.birthCooldown":1000,"deer.maxAge":4500,"founderDesync":1,"wolfRareHalf":150,"grassInit":0.45,"wolfSmallGame":0.5}
- Shocks: drought (2 yr) at tick 115000 (year 47.9)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 18/20 (90%) | 723 | 0.46 | 0.0% | 0.0 | 2.58 | 15 | 5.6 (16 seeds) | 100% | 65% | 9.6 |
| wolf | 19/20 (95%) | 58 | 0.19 | 0.0% | 0.0 | 1.47 | 18 | 5.0 (18 seeds) | 95% | 100% | 16.5 |
| raven | 18/20 (90%) | 278 | 0.15 | 0.0% | 0.0 | 1.16 | 5 | 5.0 (15 seeds) | 45% | 85% | 0.0 |
| pronghorn | 19/20 (95%) | 527 | 0.55 | 0.2% | 0.2 | 3.21 | 21 | 5.4 (19 seeds) | 95% | 95% | 9.2 |

Max bison generation depth reached: 154.9 (median across seeds 131.8).

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
| 1 | 288000 | 131.0 | 687 / 0.51 / 0% | 57 / 0.19 / 0% | 280 / 0.14 / 0% | 547 / 0.59 / 1% | bison 6.7, wolf 22.9, raven 7.5, pronghorn 10.4 |
| 2 | 288000 | 142.1 | 637 / 0.46 / 0% | 63 / 0.16 / 0% | 281 / 0.14 / 0% | 342 / 0.62 / 2% | bison 11.3, wolf 32.9, raven unaffected, pronghorn 10.8 |
| 3 | 288000 | 133.9 | 704 / 0.44 / 0% | 64 / 0.21 / 0% | 273 / 0.18 / 0% | 404 / 0.52 / 0% | bison 7.1, wolf 6.7, raven 7.9, pronghorn 8.3 |
| 4 | 288000 | 118.8 | 578 / 0.51 / 0% | 63 / 0.19 / 0% | 278 / 0.15 / 0% | 512 / 0.50 / 2% | bison 22.1, wolf 15.8, raven unaffected, pronghorn 16.7 |
| 5 | 288000 | 130.0 | 781 / 0.54 / 0% | 60 / 0.19 / 0% | 280 / 0.14 / 0% | 686 / 0.53 / 0% | bison never, wolf 30.0, raven 6.7, pronghorn 12.1 |
| 6 | 288000 | 141.8 | 943 / 0.46 / 0% | 43 / 0.24 / 0% | 280 / 0.14 / 0% | 748 / 0.54 / 0% | bison 15.8, wolf 41.7, raven unaffected, pronghorn 3.3 |
| 7 | 288000 | 129.8 | 1106 / 0.41 / 0% | 44 / 0.20 / 0% | 284 / 0.12 / 0% | 833 / 0.56 / 0% | bison 13.8, wolf 22.1, raven unaffected, pronghorn 7.9 |
| 8 | 288000 | 135.7 | 842 / 0.45 / 0% | 52 / 0.18 / 0% | 273 / 0.19 / 0% | 148 / 1.63 / 68% EXTINCT@52.1yr | bison never, wolf 20.0, raven 10.0, pronghorn never |
| 9 | 288000 | 130.6 | 604 / 0.46 / 0% | 52 / 0.17 / 0% | 280 / 0.13 / 0% | 550 / 0.53 / 0% | bison 7.5, wolf 54.2, raven unaffected, pronghorn 11.7 |
| 10 | 288000 | 49.3 | 153 / 1.50 / 61% EXTINCT@59.6yr | 32 / 0.88 / 40% EXTINCT@79.6yr | 118 / 1.05 / 37% EXTINCT@84.6yr | 708 / 0.87 / 3% | bison never, wolf 6.7, raven never, pronghorn 9.2 |
| 11 | 288000 | 141.7 | 599 / 0.42 / 0% | 59 / 0.20 / 0% | 263 / 0.24 / 0% | 431 / 0.56 / 0% | bison 15.0, wolf 2.5, raven unaffected, pronghorn 3.8 |
| 12 | 288000 | 133.1 | 1030 / 0.44 / 2% | 54 / 0.18 / 0% | 278 / 0.16 / 0% | 513 / 0.56 / 4% | bison 9.2, wolf 9.2, raven 10.8, pronghorn 20.0 |
| 13 | 288000 | 126.9 | 700 / 0.36 / 0% | 53 / 0.19 / 0% | 278 / 0.16 / 0% | 477 / 0.51 / 0% | bison 9.2, wolf unaffected, raven unaffected, pronghorn unaffected |
| 14 | 288000 | 146.4 | 950 / 0.43 / 0% | 60 / 0.17 / 0% | 280 / 0.14 / 0% | 579 / 0.54 / 0% | bison never, wolf 50.4, raven unaffected, pronghorn 20.8 |
| 15 | 288000 | 130.9 | 830 / 0.33 / 0% | 54 / 0.17 / 0% | 280 / 0.14 / 0% | 674 / 0.61 / 0% | bison 9.6, wolf 12.1, raven 6.3, pronghorn 7.1 |
| 16 | 288000 | 154.9 | 743 / 0.48 / 0% | 61 / 0.20 / 0% | 276 / 0.16 / 0% | 542 / 0.60 / 1% | bison 16.3, wolf 17.1, raven unaffected, pronghorn 9.2 |
| 17 | 288000 | 47.5 | 104 / 1.59 / 65% EXTINCT@55.0yr | 61 / 0.33 / 0% | 111 / 1.07 / 33% EXTINCT@89.6yr | 501 / 0.85 / 4% | bison never, wolf 15.8, raven never, pronghorn 4.6 |
| 18 | 288000 | 132.6 | 350 / 0.64 / 0% | 64 / 0.19 / 0% | 242 / 0.33 / 0% | 491 / 0.55 / 0% | bison never, wolf 38.3, raven never, pronghorn 7.5 |
| 19 | 288000 | 133.7 | 756 / 0.47 / 0% | 58 / 0.19 / 0% | 274 / 0.16 / 0% | 547 / 0.49 / 0% | bison never, wolf 12.5, raven unaffected, pronghorn 15.8 |
| 20 | 288000 | 125.5 | 759 / 0.43 / 0% | 58 / 0.16 / 0% | 280 / 0.13 / 0% | 510 / 0.48 / 0% | bison 7.5, wolf 7.9, raven unaffected, pronghorn 7.5 |
