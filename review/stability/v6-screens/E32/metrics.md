# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 32 (1..32)
- Run length: 240000 ticks (200 years)
- Sampled every 600 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 31/32 (97%) | 694 | 0.36 | 0.0% | 0.0 | 2.38 | 15 | 9.0 (31 seeds) |
| wolf | 32/32 (100%) | 58 | 0.25 | 0.0% | 0.0 | 1.76 | 16 | 9.0 (31 seeds) |
| raven | 32/32 (100%) | 496 | 0.20 | 0.0% | 0.0 | 1.37 | 13 | 9.0 (32 seeds) |
| pronghorn | 32/32 (100%) | 459 | 0.33 | 0.0% | 0.0 | 2.65 | 17 | 9.0 (32 seeds) |

Max bison generation depth reached: 125.1 (median across seeds 111.2).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 1802.7 | 11738.9 |

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
| 9 | 240000 | 111.2 | 598 / 0.28 / 0% | 50 / 0.21 / 0% | 474 / 0.20 / 0% | 438 / 0.28 / 0% |
| 10 | 240000 | 109.4 | 773 / 0.33 / 0% | 56 / 0.22 / 0% | 516 / 0.20 / 0% | 438 / 0.28 / 0% |
| 11 | 240000 | 101.9 | 619 / 0.38 / 0% | 55 / 0.29 / 0% | 477 / 0.22 / 0% | 465 / 0.33 / 0% |
| 12 | 240000 | 125.1 | 751 / 0.27 / 0% | 69 / 0.20 / 0% | 525 / 0.18 / 0% | 405 / 0.27 / 0% |
| 13 | 240000 | 112.8 | 671 / 0.42 / 0% | 56 / 0.28 / 0% | 486 / 0.22 / 0% | 441 / 0.32 / 0% |
| 14 | 240000 | 115.8 | 827 / 0.47 / 0% | 58 / 0.27 / 0% | 518 / 0.22 / 0% | 403 / 0.37 / 0% |
| 15 | 240000 | 115.3 | 667 / 0.44 / 0% | 59 / 0.25 / 0% | 488 / 0.23 / 0% | 417 / 0.36 / 0% |
| 16 | 240000 | 118.4 | 626 / 0.48 / 0% | 58 / 0.29 / 0% | 477 / 0.23 / 0% | 451 / 0.33 / 0% |
| 17 | 240000 | 119.0 | 773 / 0.34 / 0% | 60 / 0.26 / 0% | 529 / 0.18 / 0% | 438 / 0.32 / 0% |
| 18 | 240000 | 111.1 | 697 / 0.34 / 0% | 56 / 0.24 / 0% | 505 / 0.20 / 0% | 400 / 0.29 / 0% |
| 19 | 240000 | 112.1 | 665 / 0.32 / 0% | 58 / 0.22 / 0% | 499 / 0.20 / 0% | 450 / 0.27 / 0% |
| 20 | 240000 | 107.2 | 765 / 0.36 / 0% | 65 / 0.27 / 0% | 506 / 0.20 / 0% | 473 / 0.39 / 0% |
| 21 | 240000 | 108.5 | 711 / 0.37 / 0% | 60 / 0.24 / 0% | 500 / 0.19 / 0% | 525 / 0.43 / 0% |
| 22 | 240000 | 110.0 | 603 / 0.44 / 0% | 59 / 0.29 / 0% | 469 / 0.23 / 0% | 486 / 0.46 / 0% |
| 23 | 240000 | 110.8 | 743 / 0.37 / 0% | 57 / 0.28 / 0% | 502 / 0.21 / 0% | 487 / 0.33 / 0% |
| 24 | 240000 | 115.4 | 772 / 0.33 / 0% | 58 / 0.24 / 0% | 511 / 0.18 / 0% | 478 / 0.36 / 0% |
| 25 | 240000 | 110.4 | 657 / 0.31 / 0% | 57 / 0.27 / 0% | 496 / 0.20 / 0% | 484 / 0.32 / 0% |
| 26 | 240000 | 105.6 | 691 / 0.43 / 0% | 62 / 0.24 / 0% | 488 / 0.21 / 0% | 501 / 0.41 / 0% |
| 27 | 240000 | 121.5 | 581 / 0.39 / 0% | 44 / 0.25 / 0% | 464 / 0.20 / 0% | 527 / 0.40 / 0% |
| 28 | 240000 | 123.4 | 855 / 0.36 / 0% | 58 / 0.25 / 0% | 526 / 0.19 / 0% | 419 / 0.30 / 0% |
| 29 | 240000 | 114.7 | 660 / 0.34 / 0% | 54 / 0.26 / 0% | 505 / 0.21 / 0% | 456 / 0.33 / 0% |
| 30 | 240000 | 10.3 | 0 / n/a / 100% EXTINCT@27.0yr | 22 / 0.27 / 0% | 24 / 0.49 / 0% | 648 / 0.44 / 0% |
| 31 | 240000 | 102.4 | 621 / 0.36 / 0% | 61 / 0.25 / 0% | 504 / 0.24 / 0% | 364 / 0.28 / 0% |
| 32 | 240000 | 114.2 | 714 / 0.37 / 0% | 63 / 0.29 / 0% | 496 / 0.21 / 0% | 428 / 0.34 / 0% |
