# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 2400000 ticks)
- Sampled every 2400 ticks; commit 6ac54a4; real sim

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 14/20 (70%) | 1382 | 0.32 | 0.0% | 0.0 | 2.17 | 85 | 5.0 (12 seeds) |
| wolf | 14/20 (70%) | 52 | 0.16 | 0.0% | 0.0 | 1.57 | 52 | 4.0 (11 seeds) |
| raven | 14/20 (70%) | 296 | 0.02 | 0.0% | 0.0 | 1.05 | 0 | 3.0 (5 seeds) |
| pronghorn | 12/20 (60%) | 860 | 0.53 | 1.0% | 2.0 | 3.05 | 104 | 4.0 (14 seeds) |

Max bison generation depth reached: 1002.1 (median across seeds 1000.5).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | FAIL | PASS | PASS | PASS | PASS | FAIL |
| wolf | FAIL | PASS | PASS | PASS | PASS | FAIL |
| raven | FAIL | PASS | PASS | PASS | FAIL | FAIL |
| pronghorn | FAIL | PASS | PASS | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1293600 | 1001.2 | 1985 / 0.31 / 0% | 55 / 0.16 / 0% | 297 / 0.02 / 0% | 926 / 0.49 / 1% |
| 2 | 1272000 | 1001.9 | 1446 / 0.32 / 0% | 55 / 0.13 / 0% | 296 / 0.02 / 0% | 794 / 0.53 / 0% |
| 3 | 1240800 | 1001.5 | 1194 / 0.39 / 0% | 65 / 0.15 / 0% | 296 / 0.02 / 0% | 743 / 0.52 / 1% |
| 4 | 1298400 | 1000.5 | 2140 / 0.26 / 0% | 40 / 0.16 / 0% | 297 / 0.02 / 0% | 1025 / 0.42 / 0% |
| 5 | 1255200 | 1002.1 | 1738 / 0.34 / 0% | 61 / 0.16 / 0% | 296 / 0.02 / 0% | 904 / 0.55 / 1% |
| 6 | 1272000 | 1000.8 | 1005 / 0.42 / 0% | 75 / 0.16 / 0% | 296 / 0.02 / 0% | 526 / 0.73 / 10% EXTINCT@494.0yr |
| 7 | 1310400 | 1001.7 | 2176 / 0.29 / 0% | 53 / 0.15 / 0% | 297 / 0.02 / 0% | 1043 / 0.41 / 0% |
| 8 | 168000 | 14.5 | 0 / n/a / 100% EXTINCT@11.0yr | 22 / 0.35 / 3% EXTINCT@70.0yr | 0 / 7.68 / 98% EXTINCT@12.0yr | 0 / n/a / 100% EXTINCT@5.0yr |
| 9 | 2400000 | 6.2 | 0 / n/a / 100% EXTINCT@7.0yr | 0 / n/a / 100% EXTINCT@10.0yr | 152 / 0.87 / 38% EXTINCT@683.0yr | 1152 / 0.61 / 2% |
| 10 | 1272000 | 1001.1 | 1621 / 0.36 / 0% | 60 / 0.23 / 0% | 296 / 0.02 / 0% | 816 / 0.53 / 0% |
| 11 | 1243200 | 1000.4 | 1227 / 0.33 / 0% | 61 / 0.18 / 0% | 296 / 0.02 / 0% | 0 / n/a / 100% EXTINCT@9.0yr |
| 12 | 1308000 | 1000.2 | 2457 / 0.27 / 0% | 43 / 0.15 / 0% | 297 / 0.02 / 0% | 1059 / 0.46 / 0% |
| 13 | 705600 | 32.3 | 0 / n/a / 100% EXTINCT@23.0yr | 0 / n/a / 100% EXTINCT@32.0yr | 0 / n/a / 100% EXTINCT@26.0yr | 1249 / 0.96 / 16% EXTINCT@294.0yr |
| 14 | 1315200 | 1001.8 | 1828 / 0.31 / 0% | 54 / 0.15 / 0% | 297 / 0.02 / 0% | 921 / 0.47 / 0% |
| 15 | 1329600 | 1000.1 | 1805 / 0.32 / 0% | 51 / 0.16 / 0% | 296 / 0.02 / 0% | 903 / 0.47 / 0% |
| 16 | 1281600 | 1000.8 | 1596 / 0.31 / 0% | 49 / 0.18 / 0% | 297 / 0.02 / 0% | 0 / n/a / 100% EXTINCT@10.0yr |
| 17 | 122400 | 15.1 | 8 / 3.56 / 89% EXTINCT@13.0yr | 19 / 0.78 / 2% EXTINCT@51.0yr | 18 / 2.80 / 68% EXTINCT@23.0yr | 5 / 4.34 / 91% EXTINCT@12.0yr |
| 18 | 1142400 | 13.0 | 0 / n/a / 100% EXTINCT@12.0yr | 0 / n/a / 100% EXTINCT@16.0yr | 0 / n/a / 100% EXTINCT@19.0yr | 1179 / 0.71 / 3% EXTINCT@476.0yr |
| 19 | 1291200 | 1000.0 | 1318 / 0.36 / 0% | 71 / 0.15 / 0% | 297 / 0.02 / 0% | 562 / 0.51 / 0% |
| 20 | 60000 | 19.3 | 92 / 1.42 / 59% EXTINCT@14.0yr | 35 / 0.71 / 14% EXTINCT@23.0yr | 108 / 1.07 / 36% EXTINCT@25.0yr | 3 / 3.92 / 86% EXTINCT@7.0yr |
