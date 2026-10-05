# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8,"matingWindow":0.8,"bison.birthCooldown":900,"deer.birthCooldown":800}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 17/20 (85%) | 621 | 0.54 | 0.2% | 3.3 | 3.62 | 190 | 10.0 (19 seeds) |
| wolf | 20/20 (100%) | 72 | 0.21 | 0.0% | 0.0 | 1.83 | 169 | 10.0 (17 seeds) |
| raven | 20/20 (100%) | 564 | 0.17 | 0.0% | 0.0 | 1.22 | 148 | 10.0 (18 seeds) |
| pronghorn | 20/20 (100%) | 330 | 0.30 | 0.0% | 0.0 | 2.25 | 258 | 10.0 (20 seeds) |

Max bison generation depth reached: 1002.0 (median across seeds 1000.2).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 1.1 | 0.0 | 0.4 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2001.1 | 3284.4 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | FAIL | PASS | PASS | FAIL |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2562000 | 1000.2 | 562 / 0.55 / 1% | 75 / 0.19 / 0% | 551 / 0.19 / 0% | 307 / 0.30 / 0% |
| 2 | 3600000 | 986.4 | 372 / 1.05 / 36% EXTINCT@2101.7yr | 53 / 0.55 / 11% | 361 / 0.74 / 33% | 392 / 0.36 / 0% |
| 3 | 3600000 | 908.5 | 345 / 1.15 / 41% EXTINCT@1978.3yr | 60 / 0.47 / 0% | 339 / 0.78 / 34% | 355 / 0.30 / 0% |
| 4 | 2562000 | 1000.8 | 645 / 0.54 / 0% | 74 / 0.21 / 0% | 566 / 0.17 / 0% | 295 / 0.32 / 0% |
| 5 | 2680000 | 1000.1 | 605 / 0.51 / 0% | 72 / 0.20 / 0% | 558 / 0.17 / 0% | 347 / 0.30 / 0% |
| 6 | 2528000 | 1001.2 | 546 / 0.54 / 1% | 68 / 0.20 / 0% | 549 / 0.19 / 0% | 341 / 0.30 / 0% |
| 7 | 2636000 | 1000.7 | 765 / 0.54 / 0% | 74 / 0.23 / 0% | 585 / 0.15 / 0% | 299 / 0.33 / 0% |
| 8 | 2582000 | 1000.1 | 630 / 0.53 / 0% | 76 / 0.21 / 0% | 564 / 0.17 / 0% | 316 / 0.29 / 0% |
| 9 | 2580000 | 1000.2 | 634 / 0.56 / 0% | 62 / 0.21 / 0% | 559 / 0.18 / 0% | 342 / 0.29 / 0% |
| 10 | 2548000 | 1000.2 | 602 / 0.53 / 1% | 67 / 0.20 / 0% | 563 / 0.18 / 0% | 322 / 0.29 / 0% |
| 11 | 2580000 | 1002.0 | 579 / 0.51 / 0% | 68 / 0.19 / 0% | 557 / 0.17 / 0% | 282 / 0.34 / 0% |
| 12 | 2624000 | 1000.3 | 715 / 0.50 / 0% | 71 / 0.20 / 0% | 585 / 0.15 / 0% | 301 / 0.32 / 0% |
| 13 | 2586000 | 1000.4 | 628 / 0.49 / 0% | 70 / 0.20 / 0% | 565 / 0.16 / 0% | 358 / 0.30 / 0% |
| 14 | 2558000 | 1000.1 | 739 / 0.51 / 0% | 77 / 0.21 / 0% | 582 / 0.15 / 0% | 303 / 0.31 / 0% |
| 15 | 2564000 | 1001.7 | 627 / 0.48 / 0% | 73 / 0.20 / 0% | 575 / 0.16 / 0% | 292 / 0.32 / 0% |
| 16 | 2502000 | 1000.2 | 613 / 0.54 / 0% | 75 / 0.22 / 0% | 563 / 0.17 / 0% | 320 / 0.31 / 0% |
| 17 | 2540000 | 1000.7 | 693 / 0.55 / 1% | 68 / 0.22 / 0% | 564 / 0.19 / 0% | 348 / 0.30 / 0% |
| 18 | 2474000 | 1000.8 | 615 / 0.49 / 0% | 76 / 0.20 / 0% | 565 / 0.16 / 0% | 358 / 0.30 / 0% |
| 19 | 3600000 | 6.8 | 0 / n/a / 100% EXTINCT@28.3yr | 19 / 0.60 / 19% | 16 / 0.27 / 0% | 525 / 0.28 / 0% |
| 20 | 2532000 | 1000.1 | 703 / 0.54 / 0% | 77 / 0.21 / 0% | 576 / 0.16 / 0% | 338 / 0.33 / 0% |
