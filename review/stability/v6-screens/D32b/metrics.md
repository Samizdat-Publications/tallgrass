# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 32 (1..32)
- Run length: 240000 ticks (200 years)
- Sampled every 600 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.15,"mangeRate":0.03,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 32/32 (100%) | 664 | 0.39 | 0.0% | 0.0 | 2.59 | 16 | 9.0 (31 seeds) |
| wolf | 32/32 (100%) | 59 | 0.27 | 0.0% | 0.0 | 1.80 | 17 | 8.5 (32 seeds) |
| raven | 32/32 (100%) | 483 | 0.21 | 0.0% | 0.0 | 1.40 | 15 | 9.0 (31 seeds) |
| pronghorn | 32/32 (100%) | 459 | 0.38 | 0.0% | 0.0 | 2.88 | 17 | 9.0 (32 seeds) |

Max bison generation depth reached: 124.7 (median across seeds 110.5).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 1896.4 | 11722.0 |

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
| 1 | 240000 | 108.5 | 764 / 0.33 / 0% | 55 / 0.33 / 0% | 490 / 0.19 / 0% | 453 / 0.34 / 0% |
| 2 | 240000 | 111.4 | 623 / 0.41 / 0% | 62 / 0.28 / 0% | 459 / 0.24 / 0% | 435 / 0.36 / 0% |
| 3 | 240000 | 104.3 | 704 / 0.36 / 0% | 61 / 0.28 / 0% | 485 / 0.20 / 0% | 513 / 0.44 / 0% |
| 4 | 240000 | 116.2 | 812 / 0.29 / 0% | 62 / 0.24 / 0% | 519 / 0.18 / 0% | 397 / 0.24 / 0% |
| 5 | 240000 | 108.8 | 675 / 0.47 / 0% | 62 / 0.26 / 0% | 478 / 0.23 / 0% | 558 / 0.41 / 0% |
| 6 | 240000 | 110.5 | 596 / 0.43 / 0% | 62 / 0.27 / 0% | 476 / 0.24 / 0% | 456 / 0.34 / 0% |
| 7 | 240000 | 115.8 | 691 / 0.37 / 0% | 57 / 0.31 / 0% | 481 / 0.20 / 0% | 524 / 0.48 / 0% |
| 8 | 240000 | 120.3 | 734 / 0.34 / 0% | 58 / 0.23 / 0% | 523 / 0.19 / 0% | 416 / 0.33 / 0% |
| 9 | 240000 | 115.0 | 572 / 0.39 / 0% | 58 / 0.23 / 0% | 490 / 0.21 / 0% | 405 / 0.26 / 0% |
| 10 | 240000 | 101.3 | 637 / 0.32 / 0% | 47 / 0.24 / 0% | 459 / 0.19 / 0% | 479 / 0.34 / 0% |
| 11 | 240000 | 105.9 | 545 / 0.35 / 0% | 53 / 0.25 / 0% | 467 / 0.23 / 0% | 459 / 0.37 / 0% |
| 12 | 240000 | 110.5 | 928 / 0.43 / 0% | 69 / 0.30 / 0% | 526 / 0.19 / 0% | 418 / 0.43 / 0% |
| 13 | 240000 | 120.7 | 607 / 0.47 / 0% | 56 / 0.26 / 0% | 454 / 0.28 / 0% | 486 / 0.49 / 0% |
| 14 | 240000 | 96.1 | 659 / 0.39 / 0% | 54 / 0.22 / 0% | 453 / 0.19 / 0% | 504 / 0.42 / 0% |
| 15 | 240000 | 115.7 | 742 / 0.45 / 0% | 65 / 0.26 / 0% | 511 / 0.21 / 0% | 397 / 0.41 / 0% |
| 16 | 240000 | 124.7 | 542 / 0.39 / 0% | 54 / 0.28 / 0% | 457 / 0.22 / 0% | 460 / 0.33 / 0% |
| 17 | 240000 | 111.6 | 649 / 0.39 / 0% | 56 / 0.22 / 0% | 493 / 0.20 / 0% | 480 / 0.39 / 0% |
| 18 | 240000 | 124.5 | 664 / 0.42 / 0% | 59 / 0.28 / 0% | 488 / 0.21 / 0% | 548 / 0.44 / 0% |
| 19 | 240000 | 107.3 | 651 / 0.37 / 0% | 56 / 0.26 / 0% | 480 / 0.21 / 0% | 443 / 0.30 / 0% |
| 20 | 240000 | 104.1 | 720 / 0.31 / 0% | 62 / 0.24 / 0% | 495 / 0.20 / 0% | 512 / 0.40 / 0% |
| 21 | 240000 | 113.4 | 787 / 0.38 / 0% | 69 / 0.28 / 0% | 529 / 0.20 / 0% | 409 / 0.34 / 0% |
| 22 | 240000 | 106.7 | 627 / 0.44 / 0% | 57 / 0.24 / 0% | 470 / 0.21 / 0% | 512 / 0.46 / 0% |
| 23 | 240000 | 107.0 | 695 / 0.34 / 0% | 53 / 0.21 / 0% | 494 / 0.20 / 0% | 455 / 0.32 / 0% |
| 24 | 240000 | 109.9 | 608 / 0.42 / 0% | 59 / 0.33 / 0% | 478 / 0.21 / 0% | 413 / 0.32 / 0% |
| 25 | 240000 | 120.4 | 754 / 0.35 / 0% | 64 / 0.33 / 0% | 503 / 0.20 / 0% | 472 / 0.39 / 0% |
| 26 | 240000 | 106.0 | 736 / 0.41 / 0% | 63 / 0.23 / 0% | 499 / 0.21 / 0% | 512 / 0.50 / 0% |
| 27 | 240000 | 115.5 | 611 / 0.40 / 0% | 53 / 0.27 / 0% | 476 / 0.21 / 0% | 515 / 0.37 / 0% |
| 28 | 240000 | 115.6 | 722 / 0.40 / 0% | 62 / 0.35 / 0% | 498 / 0.20 / 0% | 456 / 0.40 / 0% |
| 29 | 240000 | 123.6 | 607 / 0.46 / 0% | 63 / 0.32 / 0% | 488 / 0.22 / 0% | 456 / 0.43 / 0% |
| 30 | 240000 | 102.2 | 520 / 0.40 / 1% | 46 / 0.30 / 0% | 422 / 0.35 / 0% | 510 / 0.36 / 0% |
| 31 | 240000 | 106.1 | 663 / 0.40 / 0% | 61 / 0.28 / 0% | 471 / 0.22 / 0% | 431 / 0.36 / 0% |
| 32 | 240000 | 109.8 | 703 / 0.41 / 0% | 58 / 0.26 / 0% | 482 / 0.23 / 0% | 489 / 0.38 / 0% |
