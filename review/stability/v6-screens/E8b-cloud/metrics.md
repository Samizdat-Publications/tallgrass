# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 8 (1..8)
- Run length: 240000 ticks (200 years)
- Sampled every 600 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 8/8 (100%) | 702 | 0.35 | 0.0% | 0.0 | 2.39 | 16 | 9.3 (8 seeds) |
| wolf | 8/8 (100%) | 56 | 0.25 | 0.0% | 0.0 | 1.85 | 15 | 9.0 (8 seeds) |
| raven | 8/8 (100%) | 488 | 0.20 | 0.0% | 0.0 | 1.39 | 13 | 9.3 (8 seeds) |
| pronghorn | 8/8 (100%) | 488 | 0.39 | 0.0% | 0.0 | 2.92 | 19 | 9.0 (8 seeds) |

Max bison generation depth reached: 123.5 (median across seeds 110.0).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.3 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 1528.6 | 12613.7 |

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
| 1 | 240000 | 110.7 | 703 / 0.30 / 0% | 58 / 0.27 / 0% | 489 / 0.19 / 0% | 461 / 0.31 / 0% |
| 2 | 240000 | 123.5 | 747 / 0.38 / 0% | 64 / 0.27 / 0% | 510 / 0.20 / 0% | 504 / 0.40 / 0% |
| 3 | 240000 | 107.4 | 678 / 0.38 / 0% | 61 / 0.27 / 0% | 481 / 0.22 / 0% | 475 / 0.39 / 0% |
| 4 | 240000 | 97.2 | 686 / 0.32 / 0% | 55 / 0.23 / 0% | 484 / 0.20 / 0% | 500 / 0.31 / 0% |
| 5 | 240000 | 109.3 | 787 / 0.34 / 0% | 55 / 0.20 / 0% | 506 / 0.19 / 0% | 528 / 0.39 / 0% |
| 6 | 240000 | 115.7 | 642 / 0.35 / 0% | 57 / 0.25 / 0% | 486 / 0.22 / 0% | 441 / 0.31 / 0% |
| 7 | 240000 | 109.0 | 750 / 0.35 / 0% | 53 / 0.26 / 0% | 487 / 0.19 / 0% | 534 / 0.41 / 0% |
| 8 | 240000 | 121.4 | 700 / 0.47 / 0% | 56 / 0.24 / 0% | 491 / 0.19 / 0% | 456 / 0.40 / 0% |
