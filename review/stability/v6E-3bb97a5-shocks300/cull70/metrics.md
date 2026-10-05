# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}
- Shocks: cull 70% bison at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 803 | 0.48 | 0.0% | 0.0 | 2.83 | 56 | 8.8 (20 seeds) | 100% | 100% | 48.1 |
| wolf | 20/20 (100%) | 77 | 0.25 | 0.0% | 0.0 | 1.75 | 56 | 8.8 (20 seeds) | 100% | 100% | 33.1 |
| raven | 20/20 (100%) | 574 | 0.16 | 0.0% | 0.0 | 1.20 | 44 | 8.8 (20 seeds) | 45% | 100% | 0.0 |
| pronghorn | 20/20 (100%) | 471 | 0.50 | 0.0% | 0.0 | 3.14 | 61 | 8.8 (20 seeds) | 100% | 100% | 55.0 |

Max bison generation depth reached: 483.3 (median across seeds 424.0).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2445.8 | 10802.7 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 410.4 | 869 / 0.54 / 0% | 83 / 0.30 / 0% | 559 / 0.17 / 0% | 504 / 0.60 / 0% | bison 95.0, wolf 20.0, raven 140.0, pronghorn 16.3 |
| 2 | 720000 | 423.3 | 781 / 0.51 / 0% | 82 / 0.25 / 0% | 565 / 0.17 / 0% | 511 / 0.49 / 0% | bison 57.5, wolf 8.8, raven unaffected, pronghorn 90.0 |
| 3 | 720000 | 420.3 | 766 / 0.49 / 0% | 83 / 0.27 / 0% | 564 / 0.17 / 0% | 419 / 0.53 / 0% | bison 96.3, wolf 37.5, raven unaffected, pronghorn 75.0 |
| 4 | 720000 | 381.3 | 849 / 0.50 / 0% | 73 / 0.26 / 0% | 568 / 0.17 / 0% | 561 / 0.51 / 0% | bison 18.8, wolf 55.0, raven unaffected, pronghorn 61.3 |
| 5 | 720000 | 421.2 | 859 / 0.46 / 0% | 67 / 0.24 / 0% | 581 / 0.15 / 0% | 585 / 0.53 / 0% | bison 42.5, wolf 28.8, raven 316.3, pronghorn 31.3 |
| 6 | 720000 | 419.9 | 778 / 0.47 / 0% | 77 / 0.24 / 0% | 573 / 0.16 / 0% | 439 / 0.41 / 0% | bison 207.5, wolf 20.0, raven unaffected, pronghorn 140.0 |
| 7 | 720000 | 403.4 | 758 / 0.44 / 0% | 78 / 0.28 / 0% | 570 / 0.16 / 0% | 460 / 0.52 / 0% | bison 7.5, wolf 20.0, raven unaffected, pronghorn 13.8 |
| 8 | 720000 | 483.3 | 806 / 0.53 / 0% | 72 / 0.26 / 0% | 570 / 0.17 / 0% | 417 / 0.54 / 0% | bison 8.8, wolf 15.0, raven 8.8, pronghorn 15.0 |
| 9 | 720000 | 460.5 | 649 / 0.46 / 0% | 70 / 0.26 / 0% | 552 / 0.17 / 0% | 452 / 0.47 / 0% | bison 21.3, wolf 21.3, raven 50.0, pronghorn 10.0 |
| 10 | 720000 | 438.1 | 969 / 0.40 / 0% | 76 / 0.24 / 0% | 595 / 0.13 / 0% | 493 / 0.40 / 0% | bison 47.5, wolf 23.8, raven 267.5, pronghorn 86.3 |
| 11 | 720000 | 414.1 | 636 / 0.48 / 0% | 78 / 0.25 / 0% | 552 / 0.18 / 0% | 465 / 0.45 / 0% | bison 10.0, wolf 90.0, raven 288.8, pronghorn 48.8 |
| 12 | 720000 | 445.1 | 852 / 0.46 / 0% | 83 / 0.23 / 0% | 588 / 0.14 / 0% | 373 / 0.47 / 0% | bison 26.3, wolf 56.3, raven 56.3, pronghorn 13.8 |
| 13 | 720000 | 433.5 | 857 / 0.45 / 0% | 74 / 0.23 / 0% | 583 / 0.15 / 0% | 478 / 0.43 / 0% | bison 115.0, wolf 107.5, raven unaffected, pronghorn 8.8 |
| 14 | 720000 | 444.7 | 956 / 0.52 / 0% | 76 / 0.26 / 0% | 582 / 0.16 / 0% | 486 / 0.55 / 0% | bison 78.8, wolf 10.0, raven 75.0, pronghorn 76.3 |
| 15 | 720000 | 457.0 | 782 / 0.46 / 0% | 77 / 0.23 / 0% | 581 / 0.15 / 0% | 433 / 0.45 / 0% | bison 31.3, wolf 131.3, raven unaffected, pronghorn 126.3 |
| 16 | 720000 | 424.8 | 800 / 0.47 / 0% | 73 / 0.22 / 0% | 585 / 0.15 / 0% | 422 / 0.43 / 0% | bison 38.8, wolf 20.0, raven unaffected, pronghorn 32.5 |
| 17 | 720000 | 462.8 | 680 / 0.48 / 0% | 79 / 0.26 / 0% | 558 / 0.18 / 0% | 493 / 0.55 / 0% | bison 232.5, wolf 160.0, raven unaffected, pronghorn 156.3 |
| 18 | 720000 | 482.6 | 790 / 0.43 / 0% | 71 / 0.24 / 0% | 584 / 0.14 / 0% | 477 / 0.50 / 0% | bison 60.0, wolf 255.0, raven unaffected, pronghorn 7.5 |
| 19 | 720000 | 421.2 | 849 / 0.50 / 0% | 85 / 0.29 / 0% | 574 / 0.16 / 0% | 489 / 0.48 / 0% | bison 57.5, wolf 51.3, raven 156.3, pronghorn 63.8 |
| 20 | 720000 | 363.5 | 872 / 0.51 / 0% | 83 / 0.25 / 0% | 581 / 0.15 / 0% | 421 / 0.51 / 0% | bison 48.8, wolf 125.0, raven unaffected, pronghorn 68.8 |
