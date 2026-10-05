# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit 3bb97a5 (frozen copy); real sim
- Params: {"calendarScale":2,"openPrairie":1,"ravenVagrants":1,"cdvRate":0.3,"mangeRate":0.06,"wolfPreyRef":1000,"wolfRareHalf":400,"leanLitter":0.8}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 745 | 0.53 | 0.0% | 0.0 | 3.35 | 132 | 8.3 (20 seeds) |
| wolf | 20/20 (100%) | 86 | 0.24 | 0.0% | 0.0 | 1.75 | 126 | 8.3 (20 seeds) |
| raven | 20/20 (100%) | 584 | 0.15 | 0.0% | 0.0 | 1.18 | 98 | 8.3 (20 seeds) |
| pronghorn | 20/20 (100%) | 422 | 0.50 | 0.0% | 0.0 | 3.65 | 134 | 8.3 (20 seeds) |

Max bison generation depth reached: 1005.7 (median across seeds 1000.8).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 2822.0 | 9878.1 |

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
| 1 | 1620000 | 1001.4 | 708 / 0.52 / 0% | 94 / 0.25 / 0% | 585 / 0.15 / 0% | 357 / 0.55 / 0% |
| 2 | 1432000 | 1005.7 | 753 / 0.54 / 0% | 83 / 0.23 / 0% | 583 / 0.15 / 0% | 410 / 0.48 / 0% |
| 3 | 1662000 | 1000.6 | 719 / 0.60 / 0% | 93 / 0.26 / 0% | 564 / 0.18 / 0% | 445 / 0.56 / 0% |
| 4 | 1740000 | 1001.2 | 764 / 0.52 / 0% | 85 / 0.23 / 0% | 586 / 0.15 / 0% | 440 / 0.50 / 0% |
| 5 | 1530000 | 1000.3 | 717 / 0.56 / 0% | 86 / 0.26 / 0% | 576 / 0.16 / 0% | 466 / 0.54 / 0% |
| 6 | 1608000 | 1000.3 | 736 / 0.55 / 0% | 94 / 0.24 / 0% | 582 / 0.15 / 0% | 396 / 0.46 / 0% |
| 7 | 1532000 | 1000.9 | 877 / 0.52 / 0% | 84 / 0.25 / 0% | 597 / 0.14 / 0% | 421 / 0.52 / 0% |
| 8 | 1674000 | 1001.1 | 672 / 0.58 / 0% | 88 / 0.24 / 0% | 570 / 0.17 / 0% | 423 / 0.54 / 0% |
| 9 | 1576000 | 1002.1 | 693 / 0.50 / 0% | 85 / 0.24 / 0% | 585 / 0.15 / 0% | 395 / 0.45 / 0% |
| 10 | 1620000 | 1000.8 | 852 / 0.52 / 0% | 85 / 0.25 / 0% | 597 / 0.14 / 0% | 401 / 0.48 / 0% |
| 11 | 1592000 | 1000.8 | 666 / 0.50 / 0% | 85 / 0.22 / 0% | 582 / 0.15 / 0% | 385 / 0.50 / 0% |
| 12 | 1566000 | 1000.0 | 716 / 0.57 / 0% | 92 / 0.27 / 0% | 578 / 0.16 / 0% | 398 / 0.53 / 0% |
| 13 | 1628000 | 1001.0 | 780 / 0.54 / 0% | 86 / 0.24 / 0% | 581 / 0.16 / 0% | 447 / 0.50 / 0% |
| 14 | 1626000 | 1001.0 | 895 / 0.56 / 0% | 85 / 0.23 / 0% | 592 / 0.14 / 0% | 478 / 0.56 / 0% |
| 15 | 1672000 | 1001.8 | 852 / 0.56 / 0% | 91 / 0.26 / 0% | 582 / 0.16 / 0% | 428 / 0.58 / 0% |
| 16 | 1586000 | 1000.5 | 753 / 0.51 / 0% | 84 / 0.21 / 0% | 594 / 0.15 / 0% | 423 / 0.49 / 0% |
| 17 | 1600000 | 1000.1 | 858 / 0.52 / 0% | 88 / 0.24 / 0% | 595 / 0.14 / 0% | 429 / 0.50 / 0% |
| 18 | 1410000 | 1000.4 | 710 / 0.50 / 0% | 79 / 0.23 / 0% | 595 / 0.14 / 0% | 420 / 0.51 / 0% |
| 19 | 1588000 | 1000.0 | 664 / 0.52 / 0% | 87 / 0.23 / 0% | 580 / 0.16 / 0% | 441 / 0.50 / 0% |
| 20 | 1618000 | 1000.6 | 759 / 0.56 / 0% | 89 / 0.23 / 0% | 586 / 0.15 / 0% | 393 / 0.49 / 0% |
