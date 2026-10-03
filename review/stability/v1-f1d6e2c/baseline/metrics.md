# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 14 (1..20), 6 not started (--max-minutes 110 reached)
- Run length: until gen_bison >= 1000 (cap 2400000 ticks)
- Sampled every 2400 ticks; commit e0888af; real sim
- WARNING: 12 run(s) were stopped early (--max-minutes 110 reached); their statistics cover a shorter run

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 13/14 (93%) | 2356 | 0.37 | 0.0% | 0.0 | 2.29 | 64 | 5.0 (13 seeds) |
| wolf | 13/14 (93%) | 60 | 0.15 | 0.0% | 0.0 | 1.42 | 40 | 4.0 (11 seeds) |
| raven | 13/14 (93%) | 296 | 0.02 | 0.0% | 0.0 | 1.06 | 0 | 3.0 (8 seeds) |
| pronghorn | 12/14 (86%) | 1137 | 0.50 | 0.0% | 0.0 | 2.71 | 73 | 4.0 (12 seeds) |

Max bison generation depth reached: 1001.3 (median across seeds 739.3).

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
| 1 | 821800 | 613.7 | 2735 / 0.29 / 0% | 52 / 0.13 / 0% | 296 / 0.02 / 0% | 1352 / 0.39 / 0% |
| 2 | 1045500 | 856.3 | 2101 / 0.43 / 0% | 74 / 0.16 / 0% | 297 / 0.02 / 0% | 1194 / 0.54 / 0% |
| 3 | 944200 | 788.8 | 2285 / 0.37 / 0% | 60 / 0.18 / 0% | 296 / 0.02 / 0% | 1106 / 0.49 / 0% |
| 4 | 826600 | 609.9 | 2670 / 0.29 / 0% | 54 / 0.16 / 0% | 296 / 0.02 / 0% | 1344 / 0.41 / 0% |
| 5 | 902400 | 687.1 | 2654 / 0.32 / 0% | 55 / 0.14 / 0% | 296 / 0.02 / 0% | 1351 / 0.40 / 0% |
| 6 | 1423200 | 19.0 | 0 / n/a / 100% EXTINCT@14.0yr | 24 / 0.36 / 0% EXTINCT@593.0yr | 0 / n/a / 100% EXTINCT@38.0yr | 0 / n/a / 100% EXTINCT@7.0yr |
| 7 | 890650 | 690.1 | 2552 / 0.43 / 0% | 68 / 0.14 / 0% | 296 / 0.02 / 0% | 1224 / 0.55 / 0% |
| 8 | 1037550 | 788.4 | 2426 / 0.31 / 0% | 61 / 0.13 / 0% | 296 / 0.02 / 0% | 1221 / 0.40 / 0% |
| 9 | 1123200 | 1001.3 | 1631 / 0.42 / 0% | 78 / 0.14 / 0% | 296 / 0.02 / 0% | 834 / 0.56 / 1% |
| 10 | 768250 | 600.1 | 2600 / 0.33 / 0% | 45 / 0.17 / 0% | 296 / 0.02 / 0% | 1167 / 0.44 / 0% |
| 11 | 968950 | 821.1 | 1856 / 0.43 / 0% | 61 / 0.22 / 0% | 296 / 0.02 / 0% | 1060 / 0.55 / 0% |
| 12 | 1091350 | 835.0 | 2701 / 0.37 / 0% | 63 / 0.12 / 0% | 295 / 0.02 / 0% | 0 / n/a / 100% EXTINCT@8.0yr |
| 13 | 1067850 | 874.2 | 2119 / 0.46 / 0% | 74 / 0.20 / 0% | 296 / 0.02 / 0% | 978 / 0.68 / 2% |
| 14 | 203850 | 144.4 | 1701 / 0.46 / 0% | 53 / 0.13 / 0% | 295 / 0.02 / 0% | 980 / 0.52 / 0% |
