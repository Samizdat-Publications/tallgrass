# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit 44a2bfe (frozen copy); real sim
- Params: {"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 19/20 (95%) | 746 | 0.55 | 0.0% | 0.0 | 3.12 | 119 | 8.3 (20 seeds) |
| wolf | 19/20 (95%) | 84 | 0.27 | 0.0% | 0.0 | 1.86 | 115 | 8.3 (20 seeds) |
| raven | 19/20 (95%) | 306 | 0.06 | 0.0% | 0.0 | 1.07 | 2 | 5.0 (20 seeds) |
| pronghorn | 0/20 (0%) | 39 | 4.08 | 91.1% | 940.8 | 35.63 | 10 | 27.5 (8 seeds) |

Max bison generation depth reached: 1004.4 (median across seeds 1000.8).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | FAIL | FAIL | FAIL | FAIL | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1522000 | 1000.8 | 830 / 0.53 / 0% | 86 / 0.26 / 0% | 306 / 0.05 / 0% | 46 / 4.65 / 91% EXTINCT@296.7yr |
| 2 | 1254000 | 1000.7 | 746 / 0.56 / 0% | 80 / 0.27 / 0% | 305 / 0.07 / 0% | 0 / n/a / 100% EXTINCT@111.7yr |
| 3 | 1386000 | 1000.7 | 709 / 0.53 / 0% | 83 / 0.25 / 0% | 306 / 0.05 / 0% | 38 / 3.49 / 88% EXTINCT@295.0yr |
| 4 | 1438000 | 1000.1 | 723 / 0.58 / 0% | 88 / 0.26 / 0% | 306 / 0.06 / 0% | 41 / 5.06 / 92% EXTINCT@266.7yr |
| 5 | 1324000 | 1000.6 | 709 / 0.46 / 0% | 88 / 0.24 / 0% | 305 / 0.06 / 0% | 35 / 4.77 / 93% EXTINCT@238.3yr |
| 6 | 1366000 | 1001.9 | 746 / 0.57 / 0% | 80 / 0.28 / 0% | 306 / 0.06 / 0% | 94 / 2.79 / 79% EXTINCT@373.3yr |
| 7 | 1636000 | 1000.8 | 910 / 0.55 / 0% | 94 / 0.29 / 0% | 306 / 0.06 / 0% | 54 / 3.72 / 88% EXTINCT@346.7yr |
| 8 | 1400000 | 1001.0 | 769 / 0.51 / 0% | 86 / 0.27 / 0% | 306 / 0.06 / 0% | 0 / n/a / 100% EXTINCT@166.7yr |
| 9 | 1404000 | 1002.7 | 641 / 0.56 / 0% | 83 / 0.27 / 0% | 305 / 0.07 / 0% | 135 / 2.30 / 69% EXTINCT@486.7yr |
| 10 | 1476000 | 1001.2 | 734 / 0.51 / 0% | 84 / 0.26 / 0% | 306 / 0.05 / 0% | 7 / 9.24 / 98% EXTINCT@208.3yr |
| 11 | 1356000 | 1004.4 | 678 / 0.50 / 0% | 84 / 0.25 / 0% | 306 / 0.05 / 0% | 104 / 2.62 / 77% EXTINCT@395.0yr |
| 12 | 1552000 | 1000.7 | 778 / 0.59 / 0% | 84 / 0.28 / 0% | 305 / 0.06 / 0% | 0 / n/a / 100% EXTINCT@186.7yr |
| 13 | 1494000 | 1000.9 | 781 / 0.57 / 0% | 74 / 0.28 / 0% | 305 / 0.06 / 0% | 44 / 4.17 / 89% EXTINCT@306.7yr |
| 14 | 1564000 | 1001.9 | 727 / 0.57 / 0% | 91 / 0.27 / 0% | 305 / 0.06 / 0% | 21 / 5.86 / 94% EXTINCT@265.0yr |
| 15 | 1356000 | 864.8 | 896 / 0.58 / 2% EXTINCT@1125.0yr | 85 / 0.31 / 1% EXTINCT@1123.3yr | 303 / 0.10 / 0% EXTINCT@1130.0yr | 0 / n/a / 100% EXTINCT@90.0yr |
| 16 | 1412000 | 1002.9 | 703 / 0.51 / 0% | 81 / 0.25 / 0% | 307 / 0.05 / 0% | 182 / 1.78 / 60% EXTINCT@586.7yr |
| 17 | 1398000 | 1000.6 | 739 / 0.52 / 0% | 87 / 0.26 / 0% | 306 / 0.05 / 0% | 21 / 6.04 / 95% EXTINCT@226.7yr |
| 18 | 1486000 | 1000.6 | 792 / 0.57 / 0% | 78 / 0.28 / 0% | 306 / 0.06 / 0% | 96 / 3.44 / 85% EXTINCT@348.3yr |
| 19 | 1578000 | 1002.6 | 758 / 0.49 / 0% | 85 / 0.26 / 0% | 306 / 0.05 / 0% | 68 / 3.99 / 87% EXTINCT@343.3yr |
| 20 | 1520000 | 1000.4 | 809 / 0.55 / 0% | 84 / 0.26 / 0% | 306 / 0.05 / 0% | 2 / 14.33 / 99% EXTINCT@198.3yr |
