# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 288000 ticks (120 years)
- Sampled every 1000 ticks; commit 0618dc7; real sim
- Shocks: drought (2 yr) at tick 115000 (year 47.9)

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 1056 | 0.42 | 0.4% | 0.4 | 2.52 | 19 | 7.3 (18 seeds) | 100% | 80% | 9.2 |
| wolf | 17/20 (85%) | 54 | 0.20 | 0.0% | 0.0 | 1.50 | 16 | 5.0 (15 seeds) | 90% | 85% | 7.9 |
| raven | 19/20 (95%) | 284 | 0.12 | 0.0% | 0.0 | 1.15 | 1 | 5.0 (14 seeds) | 65% | 95% | 5.8 |
| pronghorn | 18/20 (90%) | 641 | 0.58 | 0.2% | 0.2 | 3.44 | 24 | 4.6 (18 seeds) | 95% | 75% | 12.1 |

Max bison generation depth reached: 185.4 (median across seeds 163.6).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 288000 | 164.3 | 1188 / 0.43 / 2% | 60 / 0.19 / 0% | 280 / 0.16 / 0% | 697 / 0.54 / 0% | bison 9.6, wolf 7.5, raven 7.9, pronghorn 16.7 |
| 2 | 288000 | 162.0 | 1167 / 0.40 / 0% | 52 / 0.18 / 0% | 283 / 0.13 / 0% | 727 / 0.51 / 0% | bison 9.6, wolf 36.3, raven 6.7, pronghorn 10.0 |
| 3 | 288000 | 151.7 | 1012 / 0.39 / 0% | 61 / 0.18 / 0% | 284 / 0.12 / 0% | 614 / 0.47 / 0% | bison 7.1, wolf 45.4, raven unaffected, pronghorn 5.4 |
| 4 | 288000 | 170.8 | 1979 / 0.52 / 4% | 14 / 1.46 / 66% EXTINCT@54.6yr | 275 / 0.21 / 2% | 978 / 0.64 / 2% | bison never, wolf never, raven 9.6, pronghorn never |
| 5 | 159000 | 73.0 | 657 / 0.84 / 34% EXTINCT@52.1yr | 40 / 0.53 / 6% EXTINCT@66.3yr | 197 / 0.67 / 27% EXTINCT@55.0yr | 411 / 0.88 / 34% EXTINCT@51.3yr | bison never, wolf never, raven never, pronghorn never |
| 6 | 288000 | 162.9 | 1004 / 0.35 / 0% | 54 / 0.19 / 0% | 283 / 0.13 / 0% | 528 / 0.57 / 0% | bison 6.7, wolf 6.3, raven 6.7, pronghorn 13.8 |
| 7 | 288000 | 164.3 | 1337 / 0.38 / 0% | 49 / 0.22 / 0% | 285 / 0.11 / 0% | 741 / 0.63 / 0% | bison 9.2, wolf 6.7, raven unaffected, pronghorn 52.1 |
| 8 | 288000 | 170.0 | 1064 / 0.38 / 0% | 61 / 0.17 / 0% | 284 / 0.12 / 0% | 472 / 0.56 / 2% | bison 7.9, wolf 5.8, raven 5.8, pronghorn 7.1 |
| 9 | 288000 | 167.8 | 1118 / 0.41 / 1% | 58 / 0.24 / 0% | 283 / 0.13 / 0% | 686 / 0.52 / 0% | bison 5.8, wolf 16.7, raven 6.7, pronghorn never |
| 10 | 288000 | 154.5 | 783 / 0.46 / 1% | 60 / 0.19 / 0% | 282 / 0.13 / 0% | 423 / 0.65 / 4% | bison 11.3, wolf 8.8, raven 11.7, pronghorn 20.0 |
| 11 | 288000 | 171.1 | 1065 / 0.40 / 0% | 42 / 0.17 / 0% | 285 / 0.11 / 0% | 636 / 0.56 / 0% | bison 9.2, wolf unaffected, raven unaffected, pronghorn never |
| 12 | 288000 | 153.3 | 1693 / 0.47 / 5% | 15 / 1.46 / 66% EXTINCT@54.2yr | 277 / 0.19 / 1% | 984 / 0.76 / 2% | bison never, wolf never, raven 8.3, pronghorn never |
| 13 | 288000 | 173.2 | 1036 / 0.38 / 0% | 55 / 0.18 / 0% | 285 / 0.12 / 0% | 520 / 0.64 / 1% | bison 5.8, wolf unaffected, raven unaffected, pronghorn 25.4 |
| 14 | 288000 | 150.2 | 844 / 0.49 / 4% | 61 / 0.24 / 0% | 269 / 0.25 / 2% | 601 / 0.59 / 2% | bison 10.0, wolf 7.9, raven 12.5, pronghorn 10.0 |
| 15 | 288000 | 158.5 | 1379 / 0.37 / 2% | 38 / 0.20 / 0% | 285 / 0.12 / 0% | 805 / 0.54 / 0% | bison 6.3, wolf 6.3, raven 5.8, pronghorn 12.1 |
| 16 | 288000 | 174.2 | 1268 / 0.34 / 0% | 44 / 0.21 / 0% | 285 / 0.11 / 0% | 647 / 0.52 / 0% | bison 4.6, wolf 22.9, raven unaffected, pronghorn 14.2 |
| 17 | 288000 | 185.4 | 1046 / 0.45 / 1% | 54 / 0.20 / 0% | 284 / 0.12 / 0% | 681 / 0.61 / 0% | bison 10.0, wolf 6.3, raven 6.7, pronghorn 12.9 |
| 18 | 288000 | 158.1 | 565 / 0.59 / 0% | 73 / 0.18 / 0% | 264 / 0.24 / 0% | 3 / 7.75 / 96% EXTINCT@22.5yr | bison 41.3, wolf 22.1, raven unaffected, pronghorn unaffected |
| 19 | 288000 | 172.5 | 1047 / 0.44 / 0% | 50 / 0.17 / 0% | 284 / 0.12 / 0% | 700 / 0.55 / 0% | bison never, wolf 35.8, raven unaffected, pronghorn 6.7 |
| 20 | 288000 | 161.8 | 979 / 0.44 / 1% | 70 / 0.21 / 0% | 284 / 0.12 / 0% | 336 / 0.61 / 2% | bison 32.9, wolf 25.0, raven 5.8, pronghorn 9.2 |
