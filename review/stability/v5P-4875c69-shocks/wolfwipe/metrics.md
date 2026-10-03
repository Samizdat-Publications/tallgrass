# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 20 (1..20)
- Run length: 288000 ticks (120 years)
- Sampled every 1000 ticks; commit 4875c69 (frozen copy); real sim
- Params: {"bison.birthCooldown":1250,"bison.maxAge":8000,"deer.birthCooldown":1000,"deer.maxAge":4500,"founderDesync":1,"wolfRareHalf":150,"grassInit":0.45,"wolfSmallGame":0.5}
- Shocks: wolves removed at tick 101000 (year 42.1); introduce 8 wolves at tick 144000 (year 60.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 2400 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 1042 | 0.53 | 0.0% | 0.0 | 3.00 | 14 | none | 100% | 30% | 6.3 |
| wolf | 20/20 (100%) | 43 | 0.53 | 17.6% | 17.9 | 1.94 | 18 | none | 100% | 95% | 4.6 |
| raven | 20/20 (100%) | 281 | 0.14 | 0.0% | 0.0 | 1.15 | 3 | 5.0 (17 seeds) | 5% | 95% | 0.0 |
| pronghorn | 20/20 (100%) | 730 | 0.58 | 0.0% | 0.0 | 3.44 | 23 | 4.2 (20 seeds) | 100% | 65% | 10.4 |

Max bison generation depth reached: 158.0 (median across seeds 134.5).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |
| wolf | PASS | FAIL | FAIL | PASS | PASS | PASS | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 288000 | 141.5 | 1021 / 0.51 / 0% | 50 / 0.56 / 18% | 284 / 0.12 / 0% | 727 / 0.58 / 0% | bison never, wolf 4.2, raven unaffected, pronghorn 4.6 |
| 2 | 288000 | 134.2 | 999 / 0.53 / 0% | 44 / 0.53 / 18% | 282 / 0.13 / 0% | 640 / 0.54 / 0% | bison 5.4, wolf 4.6, raven unaffected, pronghorn 3.3 |
| 3 | 288000 | 137.4 | 1118 / 0.56 / 0% | 39 / 0.55 / 18% | 279 / 0.15 / 0% | 719 / 0.59 / 0% | bison never, wolf 14.6, raven unaffected, pronghorn 15.0 |
| 4 | 288000 | 123.6 | 1086 / 0.53 / 0% | 39 / 0.54 / 18% | 280 / 0.14 / 0% | 808 / 0.47 / 0% | bison never, wolf 19.6, raven unaffected, pronghorn 10.8 |
| 5 | 288000 | 133.0 | 958 / 0.53 / 0% | 50 / 0.51 / 18% | 282 / 0.12 / 0% | 804 / 0.54 / 0% | bison 7.1, wolf 4.2, raven unaffected, pronghorn never |
| 6 | 288000 | 133.7 | 1034 / 0.52 / 0% | 42 / 0.53 / 18% | 280 / 0.14 / 0% | 740 / 0.57 / 0% | bison never, wolf 2.9, raven unaffected, pronghorn 10.4 |
| 7 | 288000 | 144.0 | 1112 / 0.47 / 0% | 48 / 0.55 / 18% | 285 / 0.12 / 0% | 738 / 0.55 / 0% | bison 3.3, wolf never, raven unaffected, pronghorn 5.0 |
| 8 | 288000 | 126.6 | 1094 / 0.48 / 0% | 37 / 0.55 / 18% | 283 / 0.12 / 0% | 761 / 0.65 / 0% | bison never, wolf 4.6, raven unaffected, pronghorn never |
| 9 | 288000 | 127.9 | 843 / 0.58 / 0% | 46 / 0.53 / 18% | 282 / 0.13 / 0% | 714 / 0.61 / 0% | bison 5.0, wolf 3.8, raven unaffected, pronghorn 10.4 |
| 10 | 288000 | 131.0 | 778 / 0.61 / 0% | 49 / 0.53 / 18% | 281 / 0.13 / 0% | 628 / 0.70 / 2% | bison 41.3, wolf 8.3, raven unaffected, pronghorn 11.7 |
| 11 | 288000 | 145.1 | 995 / 0.59 / 0% | 43 / 0.52 / 18% | 265 / 0.24 / 0% | 501 / 0.76 / 0% | bison never, wolf 3.3, raven unaffected, pronghorn 5.0 |
| 12 | 288000 | 133.9 | 1375 / 0.43 / 0% | 37 / 0.53 / 18% | 285 / 0.11 / 0% | 757 / 0.58 / 0% | bison never, wolf 18.8, raven unaffected, pronghorn never |
| 13 | 288000 | 121.0 | 1050 / 0.47 / 0% | 41 / 0.55 / 18% | 278 / 0.16 / 0% | 684 / 0.58 / 0% | bison 7.5, wolf 6.3, raven unaffected, pronghorn 5.0 |
| 14 | 288000 | 146.2 | 1161 / 0.47 / 0% | 46 / 0.52 / 18% | 280 / 0.14 / 0% | 733 / 0.60 / 0% | bison never, wolf 4.6, raven unaffected, pronghorn never |
| 15 | 288000 | 134.7 | 1183 / 0.44 / 0% | 49 / 0.52 / 18% | 284 / 0.12 / 0% | 668 / 0.59 / 2% | bison never, wolf 22.5, raven unaffected, pronghorn 10.0 |
| 16 | 288000 | 158.0 | 1141 / 0.53 / 0% | 40 / 0.55 / 18% | 280 / 0.15 / 0% | 816 / 0.56 / 0% | bison never, wolf 23.3, raven unaffected, pronghorn never |
| 17 | 288000 | 139.1 | 779 / 0.57 / 0% | 51 / 0.52 / 18% | 277 / 0.16 / 0% | 627 / 0.68 / 2% | bison never, wolf 9.2, raven unaffected, pronghorn 25.4 |
| 18 | 288000 | 147.6 | 694 / 0.73 / 0% | 51 / 0.54 / 18% | 253 / 0.30 / 0% | 526 / 0.66 / 0% | bison never, wolf 4.6, raven never, pronghorn 23.3 |
| 19 | 288000 | 127.2 | 1019 / 0.57 / 0% | 37 / 0.52 / 18% | 277 / 0.16 / 0% | 741 / 0.61 / 0% | bison never, wolf 14.6, raven unaffected, pronghorn never |
| 20 | 288000 | 134.8 | 1111 / 0.51 / 0% | 43 / 0.51 / 18% | 282 / 0.13 / 0% | 738 / 0.56 / 0% | bison never, wolf 4.2, raven unaffected, pronghorn never |
