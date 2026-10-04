# Stability metrics: cull70 (merged)

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (merged: 20 from review/stability/cal2-2a5caf9-shocks300, 0 re-run in review/stability/cal2-2a5caf9-shocks300-b)
- Run length: 720000 ticks; params {"calendarScale":2}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 1074 | 0.27 | 0.0% | 0.0 | 1.91 | 41 | 29.4 (16 seeds) | 100% | 100% | 21.3 |
| wolf | 19/20 (95%) | 53 | 0.10 | 0.0% | 0.0 | 1.30 | 34 | 10.0 (19 seeds) | 84% | 100% | 68.8 |
| raven | 19/20 (95%) | 300 | 0.06 | 0.0% | 0.0 | 1.09 | 0 | 5.0 (19 seeds) | 0% | 100% | 0.0 |
| pronghorn | 19/20 (95%) | 747 | 0.39 | 0.0% | 0.0 | 2.50 | 64 | 8.8 (18 seeds) | 100% | 100% | 71.3 |

Max bison generation depth reached: 477.9 (median across seeds 436.8).

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
| 1 | 720000 | 446.0 | 1173 / 0.25 / 0% | 56 / 0.12 / 0% | 301 / 0.06 / 0% | 828 / 0.40 / 0% | bison 75.0, wolf 65.0, raven unaffected, pronghorn 75.0 |
| 2 | 720000 | 477.9 | 1052 / 0.29 / 0% | 53 / 0.11 / 0% | 301 / 0.06 / 0% | 744 / 0.39 / 0% | bison 31.3, wolf 180.0, raven unaffected, pronghorn 16.3 |
| 3 | 720000 | 443.8 | 1017 / 0.28 / 0% | 61 / 0.09 / 0% | 300 / 0.06 / 0% | 677 / 0.38 / 0% | bison 31.3, wolf 200.0, raven unaffected, pronghorn 287.5 |
| 4 | 720000 | 383.2 | 1081 / 0.27 / 0% | 61 / 0.10 / 0% | 300 / 0.06 / 0% | 676 / 0.48 / 0% | bison 60.0, wolf 195.0, raven unaffected, pronghorn 20.0 |
| 5 | 720000 | 416.6 | 1241 / 0.26 / 0% | 54 / 0.12 / 0% | 300 / 0.06 / 0% | 866 / 0.38 / 0% | bison 12.5, wolf unaffected, raven unaffected, pronghorn 257.5 |
| 6 | 720000 | 442.8 | 1057 / 0.26 / 0% | 53 / 0.10 / 0% | 301 / 0.06 / 0% | 798 / 0.39 / 0% | bison 56.3, wolf unaffected, raven unaffected, pronghorn 30.0 |
| 7 | 720000 | 424.6 | 1310 / 0.27 / 0% | 39 / 0.11 / 0% | 300 / 0.06 / 0% | 940 / 0.37 / 0% | bison 12.5, wolf 77.5, raven unaffected, pronghorn 187.5 |
| 8 | 720000 | 429.5 | 1057 / 0.27 / 0% | 48 / 0.09 / 0% | 301 / 0.06 / 0% | 751 / 0.35 / 0% | bison 33.8, wolf 12.5, raven unaffected, pronghorn 61.3 |
| 9 | 720000 | 467.5 | 1016 / 0.28 / 0% | 53 / 0.10 / 0% | 300 / 0.06 / 0% | 708 / 0.41 / 0% | bison 13.8, wolf 15.0, raven unaffected, pronghorn 205.0 |
| 10 | 720000 | 463.0 | 937 / 0.33 / 0% | 62 / 0.11 / 0% | 300 / 0.06 / 0% | 702 / 0.45 / 0% | bison 73.8, wolf 31.3, raven unaffected, pronghorn 73.8 |
| 11 | 136500 | 16.6 | 0 / n/a / 100% EXTINCT@38.8yr | 47 / 0.44 / 10% EXTINCT@113.8yr | 0 / n/a / 100% EXTINCT@45.0yr | 365 / 0.81 / 25% EXTINCT@113.8yr | bison n/a, wolf n/a, raven n/a, pronghorn n/a |
| 12 | 720000 | 407.4 | 1255 / 0.24 / 0% | 53 / 0.12 / 0% | 300 / 0.06 / 0% | 820 / 0.36 / 0% | bison 82.5, wolf 145.0, raven unaffected, pronghorn 146.3 |
| 13 | 720000 | 440.8 | 1129 / 0.31 / 0% | 53 / 0.11 / 0% | 300 / 0.07 / 0% | 774 / 0.44 / 0% | bison 13.8, wolf 238.8, raven unaffected, pronghorn 48.8 |
| 14 | 720000 | 434.2 | 1103 / 0.28 / 0% | 60 / 0.10 / 0% | 301 / 0.06 / 0% | 682 / 0.41 / 0% | bison 8.8, wolf 55.0, raven unaffected, pronghorn 177.5 |
| 15 | 720000 | 439.4 | 1391 / 0.26 / 0% | 41 / 0.12 / 0% | 301 / 0.06 / 0% | 928 / 0.37 / 0% | bison 11.3, wolf 282.5, raven unaffected, pronghorn 90.0 |
| 16 | 720000 | 461.6 | 1067 / 0.35 / 0% | 63 / 0.09 / 0% | 301 / 0.06 / 0% | 711 / 0.39 / 0% | bison 16.3, wolf unaffected, raven unaffected, pronghorn 13.8 |
| 17 | 720000 | 428.6 | 1011 / 0.29 / 0% | 52 / 0.10 / 0% | 300 / 0.06 / 0% | 567 / 0.39 / 0% | bison 15.0, wolf 70.0, raven unaffected, pronghorn 65.0 |
| 18 | 720000 | 410.6 | 988 / 0.27 / 0% | 62 / 0.09 / 0% | 300 / 0.06 / 0% | 717 / 0.39 / 0% | bison 13.8, wolf 66.3, raven unaffected, pronghorn 43.8 |
| 19 | 720000 | 423.6 | 1110 / 0.26 / 0% | 50 / 0.10 / 0% | 301 / 0.06 / 0% | 776 / 0.34 / 0% | bison 21.3, wolf 106.3, raven unaffected, pronghorn 71.3 |
| 20 | 720000 | 464.4 | 1293 / 0.27 / 0% | 50 / 0.10 / 0% | 301 / 0.06 / 0% | 752 / 0.45 / 0% | bison 93.8, wolf 68.8, raven unaffected, pronghorn 21.3 |
