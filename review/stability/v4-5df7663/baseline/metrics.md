# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit unknown; real sim

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 1246 | 0.36 | 0.0% | 0.0 | 2.38 | 108 | 5.0 (19 seeds) |
| wolf | 20/20 (100%) | 62 | 0.20 | 0.0% | 0.0 | 1.58 | 106 | 5.0 (20 seeds) |
| raven | 20/20 (100%) | 283 | 0.12 | 0.0% | 0.0 | 1.16 | 105 | 5.0 (20 seeds) |
| pronghorn | 15/20 (75%) | 740 | 0.54 | 0.5% | 1.7 | 3.69 | 131 | 4.2 (18 seeds) |

Max bison generation depth reached: 1001.8 (median across seeds 1000.6).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | FAIL | PASS | PASS | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1516000 | 1000.8 | 1244 / 0.35 / 0% | 62 / 0.18 / 0% | 283 / 0.12 / 0% | 730 / 0.52 / 0% |
| 2 | 1568000 | 1000.2 | 1239 / 0.35 / 0% | 62 / 0.17 / 0% | 283 / 0.12 / 0% | 744 / 0.49 / 0% |
| 3 | 1610000 | 1000.9 | 1192 / 0.43 / 0% | 61 / 0.18 / 0% | 283 / 0.12 / 0% | 739 / 0.57 / 1% |
| 4 | 1542000 | 1001.4 | 1330 / 0.37 / 0% | 55 / 0.22 / 0% | 284 / 0.12 / 0% | 379 / 1.35 / 49% EXTINCT@376.7yr |
| 5 | 1444000 | 1000.5 | 1162 / 0.42 / 0% | 61 / 0.20 / 0% | 284 / 0.12 / 0% | 515 / 0.98 / 31% EXTINCT@449.2yr |
| 6 | 1506000 | 1000.2 | 1294 / 0.33 / 0% | 52 / 0.18 / 0% | 284 / 0.11 / 0% | 786 / 0.45 / 0% |
| 7 | 1574000 | 1001.8 | 1377 / 0.39 / 0% | 68 / 0.24 / 0% | 284 / 0.12 / 0% | 780 / 0.56 / 0% |
| 8 | 1590000 | 1000.5 | 1225 / 0.34 / 0% | 64 / 0.20 / 0% | 284 / 0.12 / 0% | 741 / 0.51 / 0% |
| 9 | 1506000 | 1000.6 | 1136 / 0.42 / 0% | 65 / 0.21 / 0% | 283 / 0.12 / 0% | 694 / 0.58 / 2% |
| 10 | 1498000 | 1000.1 | 1115 / 0.38 / 0% | 73 / 0.18 / 0% | 283 / 0.12 / 0% | 474 / 0.56 / 1% |
| 11 | 1508000 | 1001.3 | 1245 / 0.31 / 0% | 49 / 0.17 / 0% | 284 / 0.11 / 0% | 797 / 0.46 / 0% |
| 12 | 1544000 | 1001.2 | 1449 / 0.37 / 0% | 55 / 0.22 / 0% | 283 / 0.12 / 0% | 576 / 0.91 / 31% EXTINCT@475.0yr |
| 13 | 1538000 | 1000.2 | 945 / 0.46 / 0% | 73 / 0.19 / 0% | 283 / 0.12 / 0% | 59 / 3.75 / 91% EXTINCT@148.3yr |
| 14 | 1528000 | 1001.6 | 1324 / 0.35 / 0% | 65 / 0.20 / 0% | 283 / 0.12 / 0% | 780 / 0.51 / 1% |
| 15 | 1562000 | 1000.4 | 1652 / 0.35 / 0% | 46 / 0.26 / 0% | 283 / 0.12 / 0% | 924 / 0.54 / 0% |
| 16 | 1484000 | 1001.4 | 1390 / 0.34 / 0% | 50 / 0.19 / 0% | 283 / 0.12 / 0% | 814 / 0.52 / 0% |
| 17 | 1456000 | 1000.3 | 1247 / 0.37 / 0% | 65 / 0.22 / 0% | 284 / 0.12 / 0% | 766 / 0.56 / 1% |
| 18 | 1518000 | 1000.2 | 1001 / 0.38 / 0% | 73 / 0.17 / 0% | 283 / 0.12 / 0% | 0 / n/a / 100% EXTINCT@22.5yr |
| 19 | 1474000 | 1000.6 | 1384 / 0.31 / 0% | 52 / 0.20 / 0% | 283 / 0.12 / 0% | 848 / 0.48 / 0% |
| 20 | 1520000 | 1000.6 | 1283 / 0.34 / 0% | 63 / 0.19 / 0% | 283 / 0.12 / 0% | 557 / 0.52 / 0% |
