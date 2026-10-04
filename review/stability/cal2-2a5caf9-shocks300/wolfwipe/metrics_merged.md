# Stability metrics: wolfwipe (merged)

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (merged: 20 from review/stability/cal2-2a5caf9-shocks300, 0 re-run in review/stability/cal2-2a5caf9-shocks300-b)
- Run length: 720000 ticks; params {"calendarScale":2}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 1287 | 0.31 | 0.0% | 0.0 | 2.30 | 44 | 10.0 (9 seeds) | 100% | 68% | 112.5 |
| wolf | 19/20 (95%) | 43 | 0.49 | 17.6% | 90.0 | 1.59 | 39 | none | 100% | 58% | 10.0 |
| raven | 19/20 (95%) | 301 | 0.06 | 0.0% | 0.0 | 1.09 | 0 | 5.0 (19 seeds) | 0% | 100% | 0.0 |
| pronghorn | 17/20 (85%) | 845 | 0.53 | 0.2% | 1.3 | 3.73 | 68 | 6.3 (17 seeds) | 89% | 74% | 32.5 |

Max bison generation depth reached: 530.1 (median across seeds 441.7).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | PASS | FAIL | FAIL | PASS | PASS | FAIL | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 407.7 | 1270 / 0.24 / 0% | 48 / 0.49 / 18% | 300 / 0.06 / 0% | 929 / 0.42 / 0% | bison 12.5, wolf never, raven unaffected, pronghorn unaffected |
| 2 | 720000 | 492.9 | 1291 / 0.36 / 0% | 41 / 0.48 / 18% | 301 / 0.06 / 0% | 866 / 0.53 / 0% | bison 183.8, wolf 10.0, raven unaffected, pronghorn 81.3 |
| 3 | 720000 | 479.4 | 1152 / 0.37 / 0% | 50 / 0.48 / 18% | 301 / 0.06 / 0% | 799 / 0.54 / 0% | bison 181.3, wolf 11.3, raven unaffected, pronghorn 35.0 |
| 4 | 720000 | 443.7 | 1303 / 0.29 / 0% | 37 / 0.54 / 18% | 301 / 0.06 / 0% | 833 / 0.55 / 0% | bison never, wolf never, raven unaffected, pronghorn never |
| 5 | 720000 | 437.0 | 1330 / 0.27 / 0% | 42 / 0.48 / 18% | 301 / 0.06 / 0% | 923 / 0.49 / 0% | bison 222.5, wolf 8.8, raven unaffected, pronghorn 35.0 |
| 6 | 720000 | 439.7 | 1311 / 0.31 / 0% | 42 / 0.48 / 18% | 301 / 0.06 / 0% | 933 / 0.55 / 1% | bison never, wolf 10.0, raven unaffected, pronghorn unaffected |
| 7 | 720000 | 458.8 | 1541 / 0.28 / 0% | 32 / 0.49 / 18% | 301 / 0.06 / 0% | 982 / 0.50 / 0% | bison 11.3, wolf 8.8, raven unaffected, pronghorn 42.5 |
| 8 | 720000 | 410.8 | 1243 / 0.29 / 0% | 41 / 0.48 / 18% | 300 / 0.06 / 0% | 856 / 0.49 / 0% | bison never, wolf 10.0, raven unaffected, pronghorn 30.0 |
| 9 | 720000 | 530.1 | 1252 / 0.32 / 0% | 47 / 0.49 / 18% | 301 / 0.06 / 0% | 784 / 0.50 / 0% | bison 112.5, wolf never, raven unaffected, pronghorn 7.5 |
| 10 | 720000 | 429.4 | 1282 / 0.35 / 0% | 44 / 0.49 / 18% | 300 / 0.06 / 0% | 849 / 0.51 / 0% | bison never, wolf never, raven unaffected, pronghorn 133.8 |
| 11 | 136500 | 16.6 | 0 / n/a / 100% EXTINCT@38.8yr | 47 / 0.44 / 10% EXTINCT@113.8yr | 0 / n/a / 100% EXTINCT@45.0yr | 365 / 0.81 / 25% EXTINCT@113.8yr | bison n/a, wolf n/a, raven n/a, pronghorn n/a |
| 12 | 720000 | 446.2 | 1406 / 0.32 / 0% | 47 / 0.49 / 18% | 300 / 0.06 / 0% | 869 / 0.53 / 0% | bison 10.0, wolf 81.3, raven unaffected, pronghorn 10.0 |
| 13 | 720000 | 457.8 | 1356 / 0.37 / 0% | 43 / 0.48 / 18% | 300 / 0.06 / 0% | 786 / 0.63 / 0% | bison never, wolf 8.8, raven unaffected, pronghorn 8.8 |
| 14 | 720000 | 439.4 | 1411 / 0.30 / 0% | 37 / 0.52 / 18% | 300 / 0.06 / 0% | 900 / 0.57 / 0% | bison never, wolf never, raven unaffected, pronghorn never |
| 15 | 720000 | 449.3 | 1494 / 0.28 / 0% | 39 / 0.50 / 18% | 301 / 0.06 / 0% | 434 / 1.49 / 58% EXTINCT@303.8yr | bison 61.3, wolf never, raven unaffected, pronghorn never |
| 16 | 720000 | 508.8 | 1309 / 0.46 / 0% | 42 / 0.51 / 18% | 301 / 0.06 / 0% | 837 / 0.55 / 1% | bison 235.0, wolf never, raven unaffected, pronghorn 73.8 |
| 17 | 720000 | 408.1 | 1197 / 0.38 / 0% | 47 / 0.49 / 18% | 300 / 0.06 / 0% | 813 / 0.51 / 0% | bison 215.0, wolf 115.0, raven unaffected, pronghorn 8.8 |
| 18 | 720000 | 411.5 | 1168 / 0.32 / 0% | 49 / 0.48 / 18% | 301 / 0.06 / 0% | 846 / 0.51 / 0% | bison 122.5, wolf 11.3, raven unaffected, pronghorn 197.5 |
| 19 | 720000 | 415.1 | 1215 / 0.29 / 0% | 46 / 0.49 / 18% | 300 / 0.06 / 0% | 237 / 1.85 / 69% EXTINCT@248.8yr | bison 18.8, wolf never, raven unaffected, pronghorn never |
| 20 | 720000 | 452.6 | 1269 / 0.30 / 0% | 41 / 0.49 / 18% | 301 / 0.06 / 0% | 845 / 0.52 / 0% | bison 40.0, wolf 15.0, raven unaffected, pronghorn never |
