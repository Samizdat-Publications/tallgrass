# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit 4875c69 (frozen copy); real sim
- Params: {"bison.birthCooldown":1250,"bison.maxAge":8000,"deer.birthCooldown":1000,"deer.maxAge":4500,"founderDesync":1,"wolfRareHalf":150,"grassInit":0.45,"wolfSmallGame":0.5}

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 1077 | 0.36 | 0.0% | 0.0 | 2.25 | 114 | 5.0 (20 seeds) |
| wolf | 20/20 (100%) | 64 | 0.19 | 0.0% | 0.0 | 1.57 | 126 | 5.0 (20 seeds) |
| raven | 20/20 (100%) | 283 | 0.12 | 0.0% | 0.0 | 1.16 | 122 | 5.0 (20 seeds) |
| pronghorn | 18/20 (90%) | 649 | 0.56 | 0.7% | 2.5 | 3.43 | 145 | 5.0 (19 seeds) |

Max bison generation depth reached: 1002.2 (median across seeds 1000.8).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1744000 | 1000.2 | 1103 / 0.38 / 0% | 73 / 0.21 / 0% | 283 / 0.12 / 0% | 626 / 0.66 / 1% |
| 2 | 1758000 | 1000.7 | 882 / 0.35 / 0% | 67 / 0.17 / 0% | 283 / 0.12 / 0% | 490 / 0.56 / 0% |
| 3 | 1768000 | 1000.9 | 1023 / 0.38 / 0% | 70 / 0.23 / 0% | 283 / 0.12 / 0% | 598 / 0.56 / 1% |
| 4 | 1734000 | 1000.9 | 904 / 0.40 / 0% | 69 / 0.20 / 0% | 282 / 0.12 / 0% | 143 / 1.77 / 64% EXTINCT@331.7yr |
| 5 | 1834000 | 1000.0 | 1004 / 0.36 / 0% | 66 / 0.17 / 0% | 283 / 0.12 / 0% | 625 / 0.54 / 0% |
| 6 | 1784000 | 1000.5 | 1080 / 0.36 / 0% | 55 / 0.23 / 0% | 283 / 0.12 / 0% | 725 / 0.54 / 1% |
| 7 | 1756000 | 1000.7 | 1325 / 0.34 / 0% | 64 / 0.24 / 0% | 283 / 0.12 / 0% | 807 / 0.58 / 1% |
| 8 | 1806000 | 1001.2 | 1075 / 0.35 / 0% | 57 / 0.21 / 0% | 283 / 0.12 / 0% | 663 / 0.56 / 1% |
| 9 | 1760000 | 1001.1 | 1184 / 0.29 / 0% | 49 / 0.18 / 0% | 283 / 0.12 / 0% | 801 / 0.47 / 0% |
| 10 | 1798000 | 1000.3 | 1056 / 0.36 / 0% | 70 / 0.21 / 0% | 283 / 0.12 / 0% | 584 / 0.56 / 3% EXTINCT@733.3yr |
| 11 | 1640000 | 1002.0 | 936 / 0.38 / 0% | 59 / 0.18 / 0% | 283 / 0.12 / 0% | 622 / 0.58 / 1% |
| 12 | 1808000 | 1002.2 | 1306 / 0.30 / 0% | 53 / 0.18 / 0% | 283 / 0.12 / 0% | 788 / 0.49 / 0% |
| 13 | 1782000 | 1001.4 | 1180 / 0.30 / 0% | 50 / 0.19 / 0% | 283 / 0.12 / 0% | 783 / 0.48 / 0% |
| 14 | 1810000 | 1000.5 | 1193 / 0.34 / 0% | 63 / 0.17 / 0% | 283 / 0.12 / 0% | 642 / 0.57 / 1% |
| 15 | 1776000 | 1000.4 | 1295 / 0.30 / 0% | 53 / 0.18 / 0% | 283 / 0.12 / 0% | 822 / 0.47 / 0% |
| 16 | 1682000 | 1001.3 | 1071 / 0.37 / 0% | 63 / 0.17 / 0% | 283 / 0.12 / 0% | 626 / 0.55 / 0% |
| 17 | 1748000 | 1001.2 | 1035 / 0.36 / 0% | 69 / 0.20 / 0% | 283 / 0.12 / 0% | 657 / 0.56 / 1% |
| 18 | 1790000 | 1000.8 | 1117 / 0.33 / 0% | 64 / 0.18 / 0% | 283 / 0.12 / 0% | 656 / 0.55 / 1% |
| 19 | 1712000 | 1001.0 | 1026 / 0.36 / 0% | 68 / 0.28 / 0% | 283 / 0.12 / 0% | 564 / 0.55 / 0% |
| 20 | 1858000 | 1000.4 | 1125 / 0.33 / 0% | 66 / 0.18 / 0% | 283 / 0.12 / 0% | 656 / 0.56 / 1% |
