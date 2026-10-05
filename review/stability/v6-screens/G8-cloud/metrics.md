# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 8 (1..8)
- Run length: 240000 ticks (200 years)
- Sampled every 600 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8,"matingWindow":0.8,"bison.birthCooldown":900,"deer.birthCooldown":800}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 8/8 (100%) | 633 | 0.38 | 0.0% | 0.0 | 2.44 | 14 | 23.5 (8 seeds) |
| wolf | 8/8 (100%) | 52 | 0.22 | 0.0% | 0.0 | 1.77 | 15 | 10.8 (8 seeds) |
| raven | 8/8 (100%) | 479 | 0.20 | 0.0% | 0.0 | 1.41 | 14 | 10.8 (8 seeds) |
| pronghorn | 8/8 (100%) | 276 | 0.23 | 0.0% | 0.0 | 1.73 | 12 | 12.0 (7 seeds) |

Max bison generation depth reached: 89.8 (median across seeds 84.6).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.3 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2386.3 | 1565.1 |

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
| 1 | 240000 | 88.2 | 652 / 0.37 / 0% | 51 / 0.22 / 0% | 487 / 0.23 / 0% | 265 / 0.24 / 0% |
| 2 | 240000 | 89.8 | 617 / 0.42 / 0% | 56 / 0.29 / 0% | 464 / 0.24 / 0% | 292 / 0.22 / 0% |
| 3 | 240000 | 84.1 | 684 / 0.35 / 0% | 54 / 0.26 / 0% | 502 / 0.20 / 0% | 297 / 0.25 / 0% |
| 4 | 240000 | 84.4 | 666 / 0.38 / 0% | 53 / 0.22 / 0% | 503 / 0.21 / 0% | 237 / 0.25 / 0% |
| 5 | 240000 | 87.0 | 559 / 0.39 / 0% | 52 / 0.23 / 0% | 459 / 0.19 / 0% | 328 / 0.27 / 0% |
| 6 | 240000 | 84.0 | 554 / 0.32 / 0% | 54 / 0.22 / 0% | 470 / 0.19 / 0% | 265 / 0.20 / 0% |
| 7 | 240000 | 84.7 | 650 / 0.43 / 0% | 50 / 0.26 / 0% | 479 / 0.22 / 0% | 272 / 0.21 / 0% |
| 8 | 240000 | 81.8 | 610 / 0.34 / 0% | 50 / 0.22 / 0% | 478 / 0.20 / 0% | 281 / 0.19 / 0% |
