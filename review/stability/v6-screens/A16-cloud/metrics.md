# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 16 (1..16)
- Run length: 240000 ticks (200 years)
- Sampled every 600 ticks; commit 61455f2 (frozen copy); real sim

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 15/16 (94%) | 783 | 0.33 | 0.0% | 0.0 | 1.92 | 11 | 17.0 (15 seeds) |
| wolf | 15/16 (94%) | 50 | 0.11 | 0.0% | 0.0 | 1.28 | 9 | 8.0 (14 seeds) |
| raven | 15/16 (94%) | 289 | 0.08 | 0.0% | 0.0 | 1.11 | 0 | 11.0 (11 seeds) |
| pronghorn | 15/16 (94%) | 597 | 0.45 | 0.0% | 0.0 | 2.64 | 20 | 9.3 (16 seeds) |

Max bison generation depth reached: 130.1 (median across seeds 113.5).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 240000 | 112.2 | 908 / 0.35 / 0% | 51 / 0.10 / 0% | 289 / 0.08 / 0% | 658 / 0.45 / 0% |
| 2 | 240000 | 128.6 | 875 / 0.31 / 0% | 48 / 0.11 / 0% | 290 / 0.08 / 0% | 614 / 0.43 / 0% |
| 3 | 240000 | 122.1 | 724 / 0.37 / 0% | 58 / 0.10 / 0% | 288 / 0.09 / 0% | 532 / 0.49 / 0% |
| 4 | 240000 | 105.8 | 720 / 0.42 / 0% | 58 / 0.10 / 0% | 288 / 0.09 / 0% | 421 / 0.41 / 0% |
| 5 | 240000 | 112.6 | 984 / 0.24 / 0% | 50 / 0.12 / 0% | 291 / 0.07 / 0% | 716 / 0.40 / 0% |
| 6 | 240000 | 105.8 | 734 / 0.26 / 0% | 49 / 0.11 / 0% | 290 / 0.08 / 0% | 757 / 0.53 / 0% |
| 7 | 240000 | 110.9 | 1019 / 0.31 / 0% | 38 / 0.14 / 0% | 291 / 0.07 / 0% | 742 / 0.47 / 0% |
| 8 | 240000 | 114.3 | 783 / 0.31 / 0% | 48 / 0.10 / 0% | 289 / 0.08 / 0% | 549 / 0.43 / 0% |
| 9 | 240000 | 124.0 | 784 / 0.36 / 0% | 50 / 0.10 / 0% | 290 / 0.08 / 0% | 600 / 0.43 / 0% |
| 10 | 240000 | 114.8 | 588 / 0.52 / 0% | 58 / 0.10 / 0% | 285 / 0.11 / 0% | 594 / 0.47 / 0% |
| 11 | 136800 | 17.0 | 1 / 3.65 / 90% EXTINCT@38.5yr | 48 / 0.27 / 4% EXTINCT@113.5yr | 1 / 2.61 / 83% EXTINCT@44.0yr | 434 / 0.48 / 7% EXTINCT@114.0yr |
| 12 | 240000 | 108.5 | 1015 / 0.30 / 0% | 49 / 0.11 / 0% | 290 / 0.08 / 0% | 669 / 0.38 / 0% |
| 13 | 240000 | 106.5 | 782 / 0.30 / 0% | 51 / 0.11 / 0% | 288 / 0.08 / 0% | 570 / 0.37 / 0% |
| 14 | 240000 | 124.9 | 850 / 0.38 / 0% | 57 / 0.09 / 0% | 285 / 0.11 / 0% | 484 / 0.52 / 0% |
| 15 | 240000 | 130.1 | 1244 / 0.28 / 0% | 37 / 0.13 / 0% | 291 / 0.07 / 0% | 797 / 0.44 / 0% |
| 16 | 240000 | 122.4 | 443 / 0.69 / 0% | 58 / 0.11 / 0% | 262 / 0.23 / 0% | 524 / 0.46 / 0% |
