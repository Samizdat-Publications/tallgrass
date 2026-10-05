# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 20 (1..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit b51d880 (frozen copy); real sim
- Params: {"calendarScale":2,"smallPrey":1,"smallGameField":1,"coyote.initial":12}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 20/20 (100%) | 714 | 0.51 | 0.0% | 0.0 | 3.22 | 133 | 8.3 (20 seeds) |
| wolf | 20/20 (100%) | 85 | 0.23 | 0.0% | 0.0 | 1.73 | 128 | 8.3 (20 seeds) |
| raven | 20/20 (100%) | 582 | 0.16 | 0.0% | 0.0 | 1.18 | 99 | 8.3 (20 seeds) |
| pronghorn | 20/20 (100%) | 353 | 0.40 | 0.0% | 0.0 | 3.08 | 136 | 8.3 (20 seeds) |
| rabbit | 20/20 (100%) | 874 | 0.29 | 0.0% | 0.0 | 1.89 | 101 | 95.0 (6 seeds) |
| coyote | 20/20 (100%) | 56 | 0.39 | 0.1% | 1.7 | 2.41 | 148 | 10.0 (20 seeds) |
| prairiedog | 20/20 (100%) | 47 | 0.67 | 1.1% | 5.0 | 3.33 | 63 | 308.3 (8 seeds) |

Max bison generation depth reached: 1001.6 (median across seeds 1000.7).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3713.7 | 5808.9 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 93.3 | 1071.3 |
| prairiedog | 100.0% | 0.2 | 0.0 | 17.0 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 72 | 5.1 | 364 | 396 | 39 | 45 | 1.7 |
| 2 | 113 | 7.5 | 493 | 558 | 54 | 51 | 2.2 |
| 3 | 107 | 7.7 | 404 | 453 | 31 | 38 | 1.9 |
| 4 | 78 | 6.1 | 270 | 291 | 49 | 50 | 1.4 |
| 5 | 80 | 5.6 | 333 | 357 | 57 | 56 | 1.3 |
| 6 | 90 | 6.6 | 392 | 423 | 47 | 44 | 2.0 |
| 7 | 82 | 6.4 | 363 | 401 | 54 | 44 | 1.6 |
| 8 | 108 | 7.8 | 478 | 521 | 50 | 47 | 2.1 |
| 9 | 66 | 4.8 | 302 | 323 | 53 | 47 | 1.2 |
| 10 | 117 | 8.6 | 468 | 503 | 40 | 42 | 2.4 |
| 11 | 84 | 6.6 | 364 | 400 | 54 | 53 | 1.5 |
| 12 | 106 | 7.5 | 462 | 491 | 47 | 41 | 2.2 |
| 13 | 77 | 5.6 | 338 | 359 | 51 | 53 | 1.7 |
| 14 | 91 | 7.3 | 396 | 415 | 42 | 48 | 2.4 |
| 15 | 95 | 7.0 | 485 | 541 | 49 | 49 | 2.2 |
| 16 | 53 | 4.1 | 284 | 302 | 43 | 42 | 1.4 |
| 17 | 80 | 6.1 | 363 | 386 | 45 | 38 | 1.6 |
| 18 | 83 | 7.3 | 275 | 298 | 40 | 37 | 2.0 |
| 19 | 124 | 9.1 | 488 | 560 | 49 | 52 | 2.2 |
| 20 | 108 | 8.4 | 484 | 534 | 33 | 40 | 2.3 |

Median plagues per 100 years across seeds: 6.8 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 20 seeds): 0.39. Hare CV: 0.29 (annual means 0.29).
- Best half-year-mean correlation (median): 0.38 at a lag of 0.5 years; 35% of seeds reach 0.4. Annual-mean best (median): 0.38.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.37 | 0.28 | 0.39 | 0.26 | 0.13 | 0.11 | 0.39 | 0.26 |
| 2 | 0.41 | 0.28 | 0.33 | 0.19 | 0.04 | -0.01 | 0.33 | 0.19 |
| 3 | 0.40 | 0.26 | 0.38 | 0.20 | -0.00 | 0.02 | 0.38 | 0.20 |
| 4 | 0.42 | 0.31 | 0.40 | 0.24 | 0.07 | 0.05 | 0.40 | 0.24 |
| 5 | 0.38 | 0.29 | 0.44 | 0.19 | 0.05 | 0.11 | 0.44 | 0.19 |
| 6 | 0.39 | 0.28 | 0.41 | 0.20 | 0.09 | 0.06 | 0.41 | 0.20 |
| 7 | 0.34 | 0.31 | 0.38 | 0.24 | 0.10 | 0.08 | 0.38 | 0.24 |
| 8 | 0.35 | 0.29 | 0.37 | 0.18 | 0.00 | 0.05 | 0.37 | 0.18 |
| 9 | 0.39 | 0.31 | 0.29 | 0.12 | 0.04 | 0.00 | 0.29 | 0.12 |
| 10 | 0.41 | 0.30 | 0.21 | 0.10 | 0.02 | 0.00 | 0.21 | 0.10 |
| 11 | 0.41 | 0.30 | 0.42 | 0.23 | 0.05 | -0.00 | 0.42 | 0.23 |
| 12 | 0.42 | 0.29 | 0.31 | 0.22 | 0.05 | 0.06 | 0.31 | 0.22 |
| 13 | 0.40 | 0.31 | 0.25 | 0.11 | -0.01 | 0.01 | 0.25 | 0.11 |
| 14 | 0.40 | 0.29 | 0.40 | 0.25 | 0.11 | 0.07 | 0.40 | 0.25 |
| 15 | 0.41 | 0.29 | 0.32 | 0.19 | 0.06 | 0.06 | 0.32 | 0.19 |
| 16 | 0.36 | 0.29 | 0.35 | 0.19 | 0.10 | 0.13 | 0.35 | 0.19 |
| 17 | 0.34 | 0.29 | 0.35 | 0.14 | 0.01 | 0.04 | 0.35 | 0.14 |
| 18 | 0.36 | 0.29 | 0.50 | 0.28 | 0.15 | 0.18 | 0.50 | 0.28 |
| 19 | 0.36 | 0.28 | 0.50 | 0.28 | 0.10 | 0.11 | 0.50 | 0.28 |
| 20 | 0.44 | 0.29 | 0.24 | 0.08 | -0.04 | -0.05 | 0.24 | 0.08 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | PASS | FAIL | PASS | PASS | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1678000 | 1000.0 | 723 / 0.55 / 0% | 88 / 0.26 / 0% | 582 / 0.15 / 0% | 309 / 0.42 / 0% | 867 / 0.28 / 0% | 59 / 0.37 / 0% | 35 / 0.69 / 3% |
| 2 | 1804000 | 1000.8 | 772 / 0.56 / 0% | 86 / 0.27 / 0% | 580 / 0.16 / 0% | 380 / 0.43 / 0% | 876 / 0.28 / 0% | 55 / 0.41 / 0% | 69 / 0.75 / 3% |
| 3 | 1670000 | 1001.3 | 721 / 0.58 / 0% | 88 / 0.25 / 0% | 570 / 0.18 / 0% | 394 / 0.46 / 0% | 954 / 0.26 / 0% | 57 / 0.40 / 0% | 49 / 0.72 / 2% |
| 4 | 1534000 | 1000.5 | 773 / 0.48 / 0% | 80 / 0.23 / 0% | 598 / 0.13 / 0% | 329 / 0.39 / 0% | 840 / 0.31 / 0% | 55 / 0.42 / 0% | 36 / 0.68 / 1% |
| 5 | 1726000 | 1001.1 | 619 / 0.51 / 0% | 87 / 0.23 / 0% | 570 / 0.17 / 0% | 362 / 0.41 / 0% | 855 / 0.29 / 0% | 59 / 0.38 / 0% | 28 / 0.81 / 1% |
| 6 | 1648000 | 1001.6 | 657 / 0.56 / 0% | 87 / 0.26 / 0% | 570 / 0.17 / 0% | 369 / 0.48 / 0% | 880 / 0.28 / 0% | 56 / 0.39 / 0% | 36 / 0.69 / 1% |
| 7 | 1534000 | 1000.7 | 735 / 0.49 / 0% | 81 / 0.23 / 0% | 598 / 0.14 / 0% | 288 / 0.39 / 0% | 866 / 0.31 / 0% | 62 / 0.34 / 0% | 30 / 0.58 / 0% |
| 8 | 1668000 | 1001.2 | 707 / 0.51 / 0% | 80 / 0.24 / 0% | 586 / 0.15 / 0% | 333 / 0.37 / 0% | 872 / 0.29 / 0% | 62 / 0.35 / 0% | 50 / 0.61 / 4% |
| 9 | 1638000 | 1000.7 | 599 / 0.56 / 0% | 85 / 0.24 / 0% | 557 / 0.18 / 0% | 363 / 0.38 / 0% | 809 / 0.31 / 0% | 56 / 0.39 / 0% | 25 / 0.67 / 1% |
| 10 | 1628000 | 1000.3 | 728 / 0.51 / 0% | 86 / 0.23 / 0% | 584 / 0.16 / 0% | 368 / 0.43 / 0% | 921 / 0.30 / 0% | 50 / 0.41 / 0% | 65 / 0.50 / 1% |
| 11 | 1528000 | 1000.9 | 743 / 0.47 / 0% | 84 / 0.24 / 0% | 591 / 0.14 / 0% | 337 / 0.36 / 0% | 813 / 0.30 / 0% | 58 / 0.41 / 0% | 33 / 0.82 / 2% |
| 12 | 1698000 | 1000.8 | 764 / 0.56 / 0% | 88 / 0.26 / 0% | 585 / 0.16 / 0% | 329 / 0.46 / 0% | 938 / 0.29 / 0% | 52 / 0.42 / 0% | 59 / 0.59 / 2% |
| 13 | 1640000 | 1000.3 | 704 / 0.55 / 0% | 79 / 0.23 / 0% | 577 / 0.16 / 0% | 370 / 0.47 / 0% | 867 / 0.31 / 0% | 55 / 0.40 / 0% | 38 / 0.97 / 8% |
| 14 | 1500000 | 1001.0 | 689 / 0.52 / 0% | 91 / 0.24 / 0% | 581 / 0.16 / 0% | 350 / 0.43 / 0% | 923 / 0.29 / 0% | 54 / 0.40 / 0% | 55 / 0.48 / 0% |
| 15 | 1638000 | 1000.2 | 627 / 0.55 / 0% | 92 / 0.23 / 0% | 568 / 0.17 / 0% | 349 / 0.48 / 0% | 905 / 0.29 / 0% | 55 / 0.41 / 0% | 53 / 0.70 / 1% |
| 16 | 1534000 | 1001.2 | 810 / 0.51 / 0% | 77 / 0.21 / 0% | 599 / 0.13 / 0% | 369 / 0.40 / 0% | 925 / 0.29 / 0% | 61 / 0.36 / 0% | 26 / 0.68 / 4% |
| 17 | 1580000 | 1000.5 | 673 / 0.49 / 0% | 75 / 0.22 / 0% | 576 / 0.16 / 0% | 358 / 0.39 / 0% | 868 / 0.29 / 0% | 63 / 0.34 / 0% | 45 / 0.63 / 0% |
| 18 | 1364000 | 1000.1 | 628 / 0.46 / 0% | 82 / 0.22 / 0% | 582 / 0.15 / 0% | 355 / 0.36 / 0% | 892 / 0.29 / 0% | 52 / 0.36 / 0% | 62 / 0.54 / 0% |
| 19 | 1628000 | 1000.7 | 845 / 0.48 / 0% | 79 / 0.22 / 0% | 607 / 0.12 / 0% | 344 / 0.36 / 0% | 814 / 0.28 / 0% | 60 / 0.36 / 0% | 58 / 0.52 / 0% |
| 20 | 1550000 | 1000.4 | 701 / 0.48 / 0% | 94 / 0.23 / 0% | 591 / 0.14 / 0% | 303 / 0.39 / 0% | 1013 / 0.29 / 0% | 53 / 0.44 / 0% | 58 / 0.53 / 0% |
