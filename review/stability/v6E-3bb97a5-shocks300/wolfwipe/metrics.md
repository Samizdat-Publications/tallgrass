# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}
- Shocks: wolves removed at tick 252000 (year 210.0); introduce 8 wolves at tick 360000 (year 300.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 900 | 0.49 | 0.0% | 0.0 | 4.10 | 55 | 8.8 (20 seeds) | 100% | 100% | 30.6 |
| wolf | 20/20 (100%) | 72 | 0.31 | 2.8% | 14.4 | 1.82 | 54 | 10.0 (11 seeds) | 100% | 75% | 41.3 |
| raven | 20/20 (100%) | 585 | 0.15 | 0.0% | 0.0 | 1.17 | 41 | 8.8 (20 seeds) | 45% | 100% | 0.0 |
| pronghorn | 20/20 (100%) | 508 | 0.56 | 0.0% | 0.0 | 4.55 | 58 | 8.8 (20 seeds) | 100% | 100% | 63.1 |

Max bison generation depth reached: 469.4 (median across seeds 409.2).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 97.8% | 2.8 | 11.3 | 0.9 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2200.1 | 12086.5 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |
| wolf | PASS | PASS | FAIL | PASS | PASS | FAIL | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 720000 | 449.0 | 930 / 0.53 / 0% | 74 / 0.30 / 2% | 580 / 0.14 / 0% | 476 / 0.63 / 0% | bison 148.8, wolf 47.5, raven 63.8, pronghorn 136.3 |
| 2 | 720000 | 409.0 | 898 / 0.53 / 0% | 80 / 0.30 / 2% | 574 / 0.16 / 0% | 565 / 0.56 / 0% | bison 28.8, wolf 11.3, raven 218.8, pronghorn 67.5 |
| 3 | 720000 | 403.2 | 775 / 0.59 / 0% | 70 / 0.34 / 5% | 556 / 0.18 / 0% | 542 / 0.59 / 0% | bison 11.3, wolf 251.3, raven unaffected, pronghorn 277.5 |
| 4 | 720000 | 428.2 | 968 / 0.44 / 0% | 69 / 0.33 / 4% | 589 / 0.14 / 0% | 541 / 0.52 / 0% | bison 27.5, wolf 62.5, raven unaffected, pronghorn 47.5 |
| 5 | 720000 | 402.9 | 901 / 0.46 / 0% | 76 / 0.28 / 1% | 582 / 0.14 / 0% | 539 / 0.54 / 0% | bison 45.0, wolf never, raven 111.3, pronghorn 55.0 |
| 6 | 720000 | 409.4 | 814 / 0.51 / 0% | 72 / 0.29 / 2% | 577 / 0.16 / 0% | 449 / 0.56 / 0% | bison 95.0, wolf 10.0, raven unaffected, pronghorn 78.8 |
| 7 | 720000 | 415.2 | 844 / 0.54 / 0% | 76 / 0.32 / 0% | 565 / 0.16 / 0% | 539 / 0.57 / 0% | bison 51.3, wolf never, raven 25.0, pronghorn 10.0 |
| 8 | 720000 | 404.2 | 944 / 0.48 / 0% | 72 / 0.35 / 5% | 585 / 0.14 / 0% | 486 / 0.47 / 0% | bison 53.8, wolf 20.0, raven unaffected, pronghorn 175.0 |
| 9 | 720000 | 418.5 | 853 / 0.42 / 0% | 69 / 0.27 / 1% | 585 / 0.14 / 0% | 415 / 0.43 / 0% | bison 272.5, wolf never, raven 33.8, pronghorn 27.5 |
| 10 | 720000 | 428.2 | 1060 / 0.40 / 0% | 66 / 0.42 / 9% | 596 / 0.13 / 0% | 552 / 0.58 / 0% | bison 20.0, wolf 30.0, raven 16.3, pronghorn 38.8 |
| 11 | 720000 | 402.9 | 883 / 0.47 / 0% | 68 / 0.31 / 3% | 586 / 0.15 / 0% | 510 / 0.57 / 0% | bison 46.3, wolf 36.3, raven 35.0, pronghorn 48.8 |
| 12 | 720000 | 425.4 | 965 / 0.42 / 0% | 71 / 0.31 / 4% | 605 / 0.12 / 0% | 467 / 0.55 / 0% | bison 181.3, wolf 52.5, raven unaffected, pronghorn 7.5 |
| 13 | 720000 | 419.5 | 901 / 0.51 / 0% | 70 / 0.40 / 7% | 574 / 0.16 / 0% | 556 / 0.62 / 0% | bison 7.5, wolf 46.3, raven unaffected, pronghorn 157.5 |
| 14 | 720000 | 400.9 | 1047 / 0.52 / 0% | 67 / 0.43 / 9% | 584 / 0.15 / 0% | 552 / 0.62 / 0% | bison 60.0, wolf 41.3, raven unaffected, pronghorn 58.8 |
| 15 | 720000 | 368.3 | 894 / 0.60 / 0% | 82 / 0.32 / 1% | 573 / 0.16 / 0% | 396 / 0.49 / 0% | bison 21.3, wolf never, raven unaffected, pronghorn 93.8 |
| 16 | 720000 | 469.4 | 881 / 0.44 / 0% | 74 / 0.27 / 1% | 593 / 0.14 / 0% | 485 / 0.48 / 0% | bison 13.8, wolf 30.0, raven unaffected, pronghorn 243.8 |
| 17 | 720000 | 446.5 | 947 / 0.51 / 0% | 72 / 0.30 / 2% | 587 / 0.15 / 0% | 460 / 0.54 / 0% | bison 15.0, wolf 93.8, raven unaffected, pronghorn 93.8 |
| 18 | 720000 | 395.6 | 909 / 0.46 / 0% | 63 / 0.42 / 9% | 588 / 0.14 / 0% | 506 / 0.60 / 0% | bison 16.3, wolf 10.0, raven unaffected, pronghorn 16.3 |
| 19 | 720000 | 402.7 | 900 / 0.47 / 0% | 77 / 0.42 / 8% | 589 / 0.14 / 0% | 525 / 0.58 / 0% | bison 10.0, wolf never, raven 251.3, pronghorn 47.5 |
| 20 | 720000 | 391.7 | 830 / 0.51 / 0% | 78 / 0.28 / 2% | 580 / 0.15 / 0% | 484 / 0.49 / 0% | bison 32.5, wolf 65.0, raven 172.5, pronghorn 270.0 |
