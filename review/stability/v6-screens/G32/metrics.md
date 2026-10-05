# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 32 (1..32)
- Run length: 240000 ticks (200 years)
- Sampled every 600 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8,"matingWindow":0.8,"bison.birthCooldown":900,"deer.birthCooldown":800}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 31/32 (97%) | 599 | 0.37 | 0.0% | 0.0 | 2.40 | 14 | 20.0 (30 seeds) |
| wolf | 32/32 (100%) | 50 | 0.23 | 0.0% | 0.0 | 1.74 | 15 | 19.5 (29 seeds) |
| raven | 32/32 (100%) | 474 | 0.20 | 0.0% | 0.0 | 1.42 | 13 | 13.5 (31 seeds) |
| pronghorn | 32/32 (100%) | 285 | 0.22 | 0.0% | 0.0 | 1.76 | 11 | 15.0 (27 seeds) |

Max bison generation depth reached: 94.8 (median across seeds 84.8).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.2 | 0.0 | 0.3 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2117.6 | 2069.5 |

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
| 9 | 240000 | 87.2 | 552 / 0.49 / 0% | 45 / 0.29 / 0% | 459 / 0.23 / 0% | 294 / 0.23 / 0% |
| 10 | 240000 | 87.5 | 520 / 0.42 / 0% | 48 / 0.23 / 0% | 474 / 0.22 / 0% | 276 / 0.20 / 0% |
| 11 | 240000 | 86.0 | 538 / 0.35 / 0% | 49 / 0.23 / 0% | 484 / 0.19 / 0% | 244 / 0.23 / 0% |
| 12 | 240000 | 79.8 | 609 / 0.29 / 0% | 52 / 0.19 / 0% | 473 / 0.18 / 0% | 300 / 0.22 / 0% |
| 13 | 240000 | 77.7 | 611 / 0.25 / 0% | 47 / 0.19 / 0% | 468 / 0.15 / 0% | 273 / 0.20 / 0% |
| 14 | 240000 | 84.8 | 657 / 0.41 / 0% | 50 / 0.24 / 0% | 492 / 0.22 / 0% | 280 / 0.22 / 0% |
| 15 | 240000 | 86.0 | 677 / 0.38 / 0% | 52 / 0.28 / 0% | 499 / 0.21 / 0% | 259 / 0.24 / 0% |
| 16 | 240000 | 87.7 | 627 / 0.37 / 0% | 53 / 0.26 / 0% | 492 / 0.19 / 0% | 285 / 0.21 / 0% |
| 17 | 240000 | 88.0 | 604 / 0.42 / 0% | 45 / 0.25 / 0% | 475 / 0.23 / 0% | 323 / 0.26 / 0% |
| 18 | 240000 | 90.9 | 577 / 0.38 / 0% | 48 / 0.22 / 0% | 462 / 0.22 / 0% | 303 / 0.26 / 0% |
| 19 | 240000 | 7.0 | 0 / n/a / 100% EXTINCT@27.0yr | 22 / 0.37 / 1% | 16 / 0.23 / 0% | 355 / 0.26 / 0% |
| 20 | 240000 | 79.1 | 526 / 0.37 / 0% | 50 / 0.21 / 0% | 440 / 0.21 / 0% | 283 / 0.24 / 0% |
| 21 | 240000 | 84.0 | 581 / 0.35 / 0% | 53 / 0.22 / 0% | 474 / 0.22 / 0% | 293 / 0.24 / 0% |
| 22 | 240000 | 79.9 | 567 / 0.27 / 0% | 46 / 0.18 / 0% | 458 / 0.15 / 0% | 335 / 0.28 / 0% |
| 23 | 240000 | 94.8 | 482 / 0.48 / 0% | 50 / 0.27 / 0% | 439 / 0.27 / 0% | 286 / 0.20 / 0% |
| 24 | 240000 | 79.6 | 515 / 0.41 / 0% | 42 / 0.22 / 0% | 439 / 0.22 / 0% | 298 / 0.19 / 0% |
| 25 | 240000 | 91.5 | 687 / 0.37 / 0% | 49 / 0.28 / 0% | 511 / 0.20 / 0% | 278 / 0.21 / 0% |
| 26 | 240000 | 81.1 | 609 / 0.36 / 0% | 51 / 0.25 / 0% | 473 / 0.20 / 0% | 314 / 0.23 / 0% |
| 27 | 240000 | 86.6 | 528 / 0.36 / 0% | 42 / 0.23 / 0% | 484 / 0.20 / 0% | 268 / 0.19 / 0% |
| 28 | 240000 | 87.8 | 660 / 0.52 / 0% | 48 / 0.32 / 0% | 483 / 0.26 / 0% | 285 / 0.24 / 0% |
| 29 | 240000 | 82.7 | 594 / 0.28 / 0% | 49 / 0.17 / 0% | 485 / 0.19 / 0% | 290 / 0.20 / 0% |
| 30 | 240000 | 85.9 | 584 / 0.39 / 0% | 46 / 0.23 / 0% | 465 / 0.20 / 0% | 354 / 0.33 / 0% |
| 31 | 240000 | 83.4 | 562 / 0.40 / 0% | 50 / 0.21 / 0% | 449 / 0.19 / 0% | 273 / 0.20 / 0% |
| 32 | 240000 | 80.6 | 643 / 0.30 / 0% | 49 / 0.20 / 0% | 487 / 0.18 / 0% | 256 / 0.20 / 0% |
