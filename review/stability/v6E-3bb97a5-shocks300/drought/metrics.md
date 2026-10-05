# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}
- Shocks: drought (2 yr) at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 777 | 0.48 | 0.0% | 0.0 | 2.86 | 57 | 8.8 (20 seeds) | 100% | 100% | 13.1 |
| wolf | 20/20 (100%) | 77 | 0.25 | 0.0% | 0.0 | 1.72 | 57 | 8.8 (20 seeds) | 100% | 100% | 34.4 |
| raven | 20/20 (100%) | 571 | 0.16 | 0.0% | 0.0 | 1.20 | 47 | 8.8 (20 seeds) | 70% | 100% | 13.8 |
| pronghorn | 20/20 (100%) | 476 | 0.50 | 0.0% | 0.0 | 3.50 | 61 | 8.8 (20 seeds) | 100% | 100% | 21.3 |

Max bison generation depth reached: 487.7 (median across seeds 432.5).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2404.1 | 10866.3 |

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
| 1 | 720000 | 410.9 | 757 / 0.54 / 1% | 83 / 0.30 / 0% | 553 / 0.19 / 0% | 472 / 0.54 / 0% | bison 32.5, wolf 21.3, raven 33.8, pronghorn 27.5 |
| 2 | 720000 | 433.0 | 750 / 0.50 / 0% | 84 / 0.24 / 0% | 567 / 0.17 / 0% | 447 / 0.51 / 0% | bison 23.8, wolf 10.0, raven unaffected, pronghorn 223.8 |
| 3 | 720000 | 441.9 | 698 / 0.56 / 0% | 79 / 0.27 / 0% | 544 / 0.20 / 0% | 506 / 0.58 / 0% | bison 12.5, wolf 13.8, raven 15.0, pronghorn 20.0 |
| 4 | 720000 | 362.2 | 869 / 0.47 / 0% | 67 / 0.23 / 0% | 574 / 0.16 / 0% | 586 / 0.55 / 0% | bison 11.3, wolf 35.0, raven unaffected, pronghorn 20.0 |
| 5 | 720000 | 470.6 | 847 / 0.48 / 0% | 71 / 0.26 / 0% | 575 / 0.15 / 0% | 520 / 0.52 / 0% | bison 13.8, wolf 65.0, raven 13.8, pronghorn 52.5 |
| 6 | 720000 | 391.7 | 790 / 0.52 / 0% | 79 / 0.26 / 0% | 563 / 0.17 / 0% | 508 / 0.53 / 0% | bison 8.8, wolf 15.0, raven unaffected, pronghorn 8.8 |
| 7 | 720000 | 381.9 | 988 / 0.47 / 0% | 77 / 0.26 / 0% | 582 / 0.15 / 0% | 515 / 0.49 / 0% | bison 11.3, wolf 33.8, raven 170.0, pronghorn 38.8 |
| 8 | 720000 | 425.3 | 812 / 0.48 / 0% | 76 / 0.24 / 0% | 578 / 0.16 / 0% | 476 / 0.50 / 0% | bison 8.8, wolf 95.0, raven 140.0, pronghorn 35.0 |
| 9 | 720000 | 487.7 | 679 / 0.39 / 0% | 75 / 0.27 / 0% | 560 / 0.16 / 0% | 477 / 0.41 / 0% | bison 17.5, wolf 20.0, raven 37.5, pronghorn 287.5 |
| 10 | 720000 | 392.7 | 937 / 0.37 / 0% | 80 / 0.23 / 0% | 602 / 0.12 / 0% | 434 / 0.35 / 0% | bison 12.5, wolf 290.0, raven 15.0, pronghorn 21.3 |
| 11 | 720000 | 395.4 | 728 / 0.46 / 0% | 76 / 0.24 / 0% | 563 / 0.17 / 0% | 477 / 0.46 / 0% | bison 13.8, wolf 50.0, raven 16.3, pronghorn 15.0 |
| 12 | 720000 | 453.3 | 796 / 0.36 / 0% | 82 / 0.20 / 0% | 592 / 0.13 / 0% | 415 / 0.41 / 0% | bison 30.0, wolf 50.0, raven unaffected, pronghorn 30.0 |
| 13 | 720000 | 439.0 | 759 / 0.52 / 0% | 73 / 0.26 / 0% | 566 / 0.17 / 0% | 485 / 0.53 / 0% | bison 10.0, wolf 35.0, raven 12.5, pronghorn 18.8 |
| 14 | 720000 | 377.7 | 960 / 0.55 / 1% | 75 / 0.27 / 0% | 580 / 0.17 / 0% | 484 / 0.58 / 0% | bison 15.0, wolf 20.0, raven 16.3, pronghorn 16.3 |
| 15 | 720000 | 432.0 | 764 / 0.51 / 0% | 81 / 0.30 / 0% | 568 / 0.16 / 0% | 385 / 0.49 / 0% | bison 11.3, wolf 115.0, raven 12.5, pronghorn 8.8 |
| 16 | 720000 | 437.1 | 807 / 0.48 / 0% | 77 / 0.24 / 0% | 578 / 0.16 / 0% | 476 / 0.49 / 0% | bison 20.0, wolf 30.0, raven unaffected, pronghorn 167.5 |
| 17 | 720000 | 451.9 | 651 / 0.52 / 0% | 78 / 0.25 / 0% | 552 / 0.18 / 0% | 471 / 0.52 / 0% | bison 10.0, wolf 56.3, raven unaffected, pronghorn 68.8 |
| 18 | 720000 | 461.1 | 759 / 0.39 / 0% | 68 / 0.22 / 0% | 588 / 0.14 / 0% | 415 / 0.46 / 0% | bison 11.3, wolf 12.5, raven 13.8, pronghorn 15.0 |
| 19 | 720000 | 455.1 | 708 / 0.44 / 0% | 74 / 0.24 / 0% | 568 / 0.16 / 0% | 480 / 0.48 / 0% | bison 13.8, wolf 65.0, raven 13.8, pronghorn 15.0 |
| 20 | 720000 | 392.0 | 840 / 0.49 / 0% | 80 / 0.23 / 0% | 581 / 0.15 / 0% | 428 / 0.49 / 0% | bison 15.0, wolf 13.8, raven 15.0, pronghorn 21.3 |
