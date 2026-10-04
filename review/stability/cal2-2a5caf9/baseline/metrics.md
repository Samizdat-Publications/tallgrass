# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit 2a5caf9 (frozen copy); real sim
- Params: {"calendarScale":2}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 1065 | 0.26 | 0.0% | 0.0 | 1.94 | 98 | 10.0 (13 seeds) |
| wolf | 19/20 (95%) | 57 | 0.11 | 0.0% | 0.0 | 1.34 | 54 | 5.0 (20 seeds) |
| raven | 19/20 (95%) | 307 | 0.05 | 0.0% | 0.0 | 1.07 | 0 | 5.0 (19 seeds) |
| pronghorn | 19/20 (95%) | 747 | 0.40 | 0.0% | 0.0 | 2.68 | 140 | 8.3 (20 seeds) |

Max bison generation depth reached: 1002.0 (median across seeds 1000.8).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | FAIL | FAIL |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1604000 | 1000.8 | 1144 / 0.26 / 0% | 58 / 0.11 / 0% | 307 / 0.05 / 0% | 809 / 0.43 / 0% |
| 2 | 1550000 | 1000.8 | 1072 / 0.28 / 0% | 54 / 0.09 / 0% | 308 / 0.05 / 0% | 745 / 0.39 / 0% |
| 3 | 1536000 | 1000.3 | 1045 / 0.29 / 0% | 68 / 0.11 / 0% | 307 / 0.04 / 0% | 643 / 0.41 / 0% |
| 4 | 1660000 | 1001.2 | 1059 / 0.27 / 0% | 64 / 0.10 / 0% | 307 / 0.05 / 0% | 708 / 0.43 / 0% |
| 5 | 1596000 | 1001.2 | 1188 / 0.25 / 0% | 59 / 0.13 / 0% | 307 / 0.05 / 0% | 815 / 0.36 / 0% |
| 6 | 1570000 | 1001.5 | 1147 / 0.25 / 0% | 54 / 0.10 / 0% | 307 / 0.05 / 0% | 785 / 0.37 / 0% |
| 7 | 1596000 | 1000.2 | 1410 / 0.26 / 0% | 39 / 0.11 / 0% | 307 / 0.05 / 0% | 911 / 0.39 / 0% |
| 8 | 1630000 | 1000.4 | 1091 / 0.25 / 0% | 53 / 0.10 / 0% | 307 / 0.05 / 0% | 763 / 0.39 / 0% |
| 9 | 1494000 | 1001.3 | 1007 / 0.26 / 0% | 54 / 0.10 / 0% | 307 / 0.05 / 0% | 691 / 0.40 / 0% |
| 10 | 1538000 | 1001.2 | 901 / 0.29 / 0% | 68 / 0.10 / 0% | 307 / 0.05 / 0% | 634 / 0.42 / 0% |
| 11 | 138000 | 16.6 | 7 / 2.25 / 80% EXTINCT@38.3yr | 51 / 0.28 / 5% EXTINCT@113.3yr | 3 / 2.00 / 73% EXTINCT@45.0yr | 425 / 0.54 / 7% EXTINCT@115.0yr |
| 12 | 1564000 | 1001.0 | 1164 / 0.28 / 0% | 57 / 0.11 / 0% | 307 / 0.05 / 0% | 778 / 0.40 / 0% |
| 13 | 1518000 | 1000.4 | 1043 / 0.27 / 0% | 58 / 0.12 / 0% | 307 / 0.05 / 0% | 718 / 0.41 / 0% |
| 14 | 1682000 | 1000.1 | 1057 / 0.26 / 0% | 65 / 0.09 / 0% | 308 / 0.04 / 0% | 657 / 0.40 / 0% |
| 15 | 1574000 | 1001.5 | 1404 / 0.26 / 0% | 42 / 0.12 / 0% | 307 / 0.05 / 0% | 911 / 0.38 / 0% |
| 16 | 1464000 | 1001.3 | 1040 / 0.27 / 0% | 70 / 0.12 / 0% | 307 / 0.05 / 0% | 606 / 0.45 / 0% |
| 17 | 1536000 | 1000.5 | 1115 / 0.26 / 0% | 54 / 0.12 / 0% | 307 / 0.05 / 0% | 749 / 0.40 / 0% |
| 18 | 1534000 | 1002.0 | 908 / 0.29 / 0% | 68 / 0.12 / 0% | 307 / 0.05 / 0% | 628 / 0.48 / 0% |
| 19 | 1526000 | 1000.7 | 1035 / 0.29 / 0% | 66 / 0.18 / 0% | 307 / 0.05 / 0% | 750 / 0.41 / 0% |
| 20 | 1552000 | 1000.6 | 1120 / 0.26 / 0% | 52 / 0.09 / 0% | 307 / 0.04 / 0% | 761 / 0.41 / 0% |
