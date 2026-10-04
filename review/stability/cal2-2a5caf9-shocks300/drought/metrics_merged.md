# Stability metrics: drought (merged)

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (merged: 14 from review/stability/cal2-2a5caf9-shocks300, 6 re-run in review/stability/cal2-2a5caf9-shocks300-b)
- Run length: 720000 ticks; params {"calendarScale":2}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 17/20 (85%) | 1031 | 0.31 | 0.4% | 1.9 | 2.04 | 43 | 30.0 (8 seeds) | 100% | 89% | 23.8 |
| wolf | 17/20 (85%) | 52 | 0.11 | 0.0% | 0.0 | 1.28 | 37 | 10.0 (17 seeds) | 84% | 89% | 13.8 |
| raven | 17/20 (85%) | 300 | 0.07 | 0.0% | 0.0 | 1.09 | 0 | 5.0 (16 seeds) | 63% | 89% | 13.8 |
| pronghorn | 18/20 (90%) | 742 | 0.42 | 0.0% | 0.0 | 2.86 | 65 | 8.8 (19 seeds) | 100% | 95% | 15.0 |

Max bison generation depth reached: 478.7 (median across seeds 429.4).

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
| 1 | 303000 | 147.3 | 1134 / 0.32 / 5% EXTINCT@246.3yr | 50 / 0.23 / 4% EXTINCT@248.8yr | 291 / 0.19 / 2% EXTINCT@252.5yr | 833 / 0.50 / 6% EXTINCT@246.3yr | bison never, wolf never, raven never, pronghorn never |
| 2 | 720000 | 453.5 | 1053 / 0.31 / 0% | 51 / 0.10 / 0% | 300 / 0.06 / 0% | 738 / 0.44 / 0% | bison 18.8, wolf unaffected, raven unaffected, pronghorn 62.5 |
| 3 | 720000 | 432.5 | 1030 / 0.31 / 0% | 61 / 0.10 / 0% | 301 / 0.06 / 0% | 695 / 0.40 / 0% | bison 18.8, wolf 41.3, raven unaffected, pronghorn 96.3 |
| 4 | 720000 | 390.8 | 992 / 0.33 / 3% | 64 / 0.11 / 0% | 298 / 0.10 / 0% | 490 / 0.42 / 0% | bison 25.0, wolf 30.0, raven 23.8, pronghorn 18.8 |
| 5 | 720000 | 378.1 | 1117 / 0.33 / 3% | 54 / 0.12 / 0% | 295 / 0.13 / 1% | 840 / 0.41 / 0% | bison 35.0, wolf 13.8, raven 23.8, pronghorn 16.3 |
| 6 | 720000 | 440.3 | 1020 / 0.31 / 0% | 51 / 0.10 / 0% | 300 / 0.06 / 0% | 783 / 0.42 / 0% | bison 25.0, wolf unaffected, raven 13.8, pronghorn 10.0 |
| 7 | 720000 | 444.5 | 1311 / 0.33 / 1% | 38 / 0.12 / 0% | 298 / 0.11 / 0% | 934 / 0.37 / 0% | bison 50.0, wolf 22.5, raven 18.8, pronghorn 8.8 |
| 8 | 720000 | 142.8 | 283 / 1.60 / 70% EXTINCT@247.5yr | 22 / 1.10 / 54% EXTINCT@328.8yr | 94 / 1.47 / 67% EXTINCT@262.5yr | 862 / 0.68 / 2% | bison never, wolf never, raven never, pronghorn 32.5 |
| 9 | 720000 | 426.4 | 1072 / 0.29 / 0% | 53 / 0.11 / 0% | 300 / 0.06 / 0% | 746 / 0.41 / 0% | bison 26.3, wolf 201.3, raven unaffected, pronghorn 15.0 |
| 10 | 720000 | 443.9 | 851 / 0.37 / 0% | 60 / 0.11 / 0% | 299 / 0.07 / 0% | 661 / 0.53 / 0% | bison 12.5, wolf 20.0, raven 16.3, pronghorn 27.5 |
| 11 | 136500 | 16.6 | 0 / n/a / 100% EXTINCT@38.8yr | 47 / 0.44 / 10% EXTINCT@113.8yr | 0 / n/a / 100% EXTINCT@45.0yr | 365 / 0.81 / 25% EXTINCT@113.8yr | bison n/a, wolf n/a, raven n/a, pronghorn n/a |
| 12 | 720000 | 415.3 | 1254 / 0.26 / 1% | 52 / 0.10 / 0% | 299 / 0.07 / 0% | 824 / 0.40 / 0% | bison 22.5, wolf unaffected, raven 13.8, pronghorn 8.8 |
| 13 | 720000 | 443.7 | 1023 / 0.30 / 0% | 53 / 0.11 / 0% | 300 / 0.06 / 0% | 757 / 0.40 / 0% | bison 11.3, wolf 115.0, raven unaffected, pronghorn 7.5 |
| 14 | 720000 | 426.2 | 1033 / 0.31 / 0% | 61 / 0.10 / 0% | 300 / 0.07 / 0% | 640 / 0.44 / 0% | bison 15.0, wolf 30.0, raven 13.8, pronghorn 7.5 |
| 15 | 720000 | 478.7 | 1463 / 0.31 / 1% | 40 / 0.12 / 0% | 299 / 0.09 / 0% | 907 / 0.41 / 0% | bison 22.5, wolf 8.8, raven 17.5, pronghorn 10.0 |
| 16 | 720000 | 457.6 | 982 / 0.39 / 0% | 63 / 0.10 / 0% | 301 / 0.06 / 0% | 668 / 0.45 / 0% | bison 31.3, wolf 68.8, raven unaffected, pronghorn 18.8 |
| 17 | 720000 | 425.0 | 1015 / 0.30 / 0% | 52 / 0.10 / 0% | 300 / 0.06 / 0% | 710 / 0.40 / 0% | bison 31.3, wolf 13.8, raven unaffected, pronghorn 15.0 |
| 18 | 720000 | 405.8 | 921 / 0.29 / 0% | 61 / 0.09 / 0% | 299 / 0.06 / 0% | 675 / 0.40 / 0% | bison 20.0, wolf 8.8, raven unaffected, pronghorn 10.0 |
| 19 | 720000 | 447.5 | 1099 / 0.29 / 0% | 50 / 0.11 / 0% | 300 / 0.07 / 0% | 779 / 0.42 / 0% | bison 35.0, wolf 11.3, raven 13.8, pronghorn 15.0 |
| 20 | 720000 | 434.8 | 1177 / 0.30 / 1% | 51 / 0.10 / 0% | 300 / 0.07 / 0% | 737 / 0.46 / 0% | bison 23.8, wolf 12.5, raven 15.0, pronghorn 163.8 |
