# Stability metrics: baseline

- No shocks: the long-run stability test.
- Seeds: 6 (15..20)
- Run length: until gen_bison >= 1000 (cap 3600000 ticks)
- Sampled every 2000 ticks; commit c9c3f5a (frozen copy); real sim
- Params: {"raptors":1,"stormCells":1,"cougar.initial":6,"muledeer.initial":60,"herdSpacingGraze":1.6}

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 5/6 (83%) | 689 | 0.51 | 0.0% | 0.0 | 3.19 | 145 | 8.3 (5 seeds) |
| wolf | 6/6 (100%) | 78 | 0.24 | 0.0% | 0.0 | 1.80 | 148 | 8.3 (5 seeds) |
| raven | 6/6 (100%) | 579 | 0.16 | 0.0% | 0.0 | 1.19 | 114 | 8.3 (5 seeds) |
| pronghorn | 6/6 (100%) | 372 | 0.40 | 0.0% | 0.0 | 3.06 | 160 | 10.0 (6 seeds) |
| rabbit | 6/6 (100%) | 782 | 0.31 | 0.0% | 0.0 | 1.97 | 125 | none |
| cougar | 6/6 (100%) | 7 | 0.46 | 2.7% | 6.7 | 2.63 | 173 | none |
| coyote | 6/6 (100%) | 59 | 0.37 | 0.3% | 1.7 | 2.34 | 181 | 20.0 (6 seeds) |
| prairiedog | 5/6 (83%) | 13 | 1.04 | 15.7% | 34.2 | 5.80 | 85 | 500.0 (2 seeds) |
| muledeer | 6/6 (100%) | 11 | 0.48 | 1.8% | 1.7 | 3.95 | 205 | 9.2 (4 seeds) |

Max bison generation depth reached: 1002.8 (median across seeds 1000.9).

## Presence and flow

Presence = share of post-burn-in samples with the species alive. Local extinctions are present-to-absent steps between samples, per 1,000 valley years. Years absent = time at zero after burn-in. Immigrants and emigrants are per 100 valley years over the whole run (0 with the open prairie off).

| species | presence | local extinctions / 1000 yr | years absent (median) | immigrants / century | emigrants / century |
| --- | ---: | ---: | ---: | ---: | ---: |
| bison | 100.0% | 0.1 | 0.0 | 0.0 | 0.0 |
| wolf | 100.0% | 0.0 | 0.0 | 0.1 | 0.0 |
| raven | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| pronghorn | 100.0% | 0.0 | 0.0 | 3148.7 | 8826.6 |
| rabbit | 100.0% | 0.0 | 0.0 | 0.0 | 0.0 |
| cougar | 97.3% | 13.6 | 36.7 | 7.5 | 0.0 |
| coyote | 100.0% | 0.0 | 0.0 | 92.2 | 1251.4 |
| prairiedog | 86.5% | 15.0 | 173.3 | 22.8 | 0.0 |
| muledeer | 99.5% | 3.2 | 6.7 | 416.4 | 0.0 |

## Small-prey web

Plague outbreaks are sylvaticPlague events (an outbreak that has faded) per 100 valley years. Jackrabbit and prairie dog presence and CV are in the species tables above (rabbit, prairiedog).

| seed | plagues | plagues / 100 yr | towns founded | towns lost | hare booms | hare crashes | mean towns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 15 | 31 | 1.0 | 224 | 237 | 178 | 137 | 0.3 |
| 16 | 36 | 2.4 | 195 | 206 | 61 | 64 | 0.5 |
| 17 | 84 | 5.2 | 412 | 455 | 58 | 60 | 1.5 |
| 18 | 83 | 5.1 | 424 | 450 | 60 | 55 | 1.7 |
| 19 | 53 | 3.5 | 244 | 257 | 62 | 52 | 0.9 |
| 20 | 51 | 3.1 | 219 | 231 | 72 | 78 | 0.5 |

Median plagues per 100 years across seeds: 3.3 (target 1 or more).

## Coyotes and hares

Correlation of hares at t with coyotes at t + lag (the coyotes follow the hares), on half-year means at lags of 0.5 to 2 years; the best lag per seed. The annual column uses annual means (the seasonal pulse removed) at 1 and 2 years. The plan's gate is a best correlation of at least 0.4 and a coyote CV of at least 0.25.

- Coyote CV (median over 6 seeds): 0.37. Hare CV: 0.31 (annual means 0.31).
- Best half-year-mean correlation (median): 0.39 at a lag of 0.5 years; 50% of seeds reach 0.4. Annual-mean best (median): 0.39.

| seed | coyote CV | hare CV | r @0.5y | r @1y | r @1.5y | r @2y | annual r @1y | annual r @2y |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 15 | 0.39 | 0.46 | 0.07 | -0.14 | -0.21 | -0.19 | 0.07 | -0.14 |
| 16 | 0.39 | 0.31 | 0.41 | 0.26 | 0.10 | 0.04 | 0.41 | 0.26 |
| 17 | 0.37 | 0.30 | 0.37 | 0.22 | 0.13 | 0.12 | 0.37 | 0.22 |
| 18 | 0.35 | 0.31 | 0.41 | 0.18 | 0.09 | 0.13 | 0.41 | 0.18 |
| 19 | 0.37 | 0.29 | 0.37 | 0.20 | 0.09 | 0.08 | 0.37 | 0.20 |
| 20 | 0.38 | 0.33 | 0.47 | 0.28 | 0.14 | 0.12 | 0.47 | 0.28 |

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | PASS | PASS | PASS | PASS | PASS |
| raven | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | PASS | PASS | PASS | PASS | PASS | PASS |
| rabbit | PASS | PASS | PASS | PASS | PASS | PASS |
| cougar | PASS | PASS | FAIL | PASS | PASS | FAIL |
| coyote | PASS | PASS | PASS | PASS | PASS | PASS |
| prairiedog | PASS | FAIL | FAIL | FAIL | PASS | FAIL |
| muledeer | PASS | PASS | PASS | PASS | PASS | PASS |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | rabbit: mean / CV / near-zero | cougar: mean / CV / near-zero | coyote: mean / CV / near-zero | prairiedog: mean / CV / near-zero | muledeer: mean / CV / near-zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 15 | 3600000 | 569.0 | 127 / 2.40 / 81% EXTINCT@948.3yr | 44 / 0.52 / 0% | 135 / 1.62 / 5% | 579 / 0.44 / 0% | 504 / 0.46 / 0% | 5 / 0.82 / 13% | 78 / 0.39 / 0% | 5 / 1.52 / 39% EXTINCT@2993.3yr | 15 / 0.47 / 1% |
| 16 | 1816000 | 1000.8 | 698 / 0.54 / 0% | 78 / 0.26 / 0% | 578 / 0.16 / 0% | 386 / 0.45 / 0% | 770 / 0.31 / 0% | 6 / 0.48 / 2% | 57 / 0.39 / 0% | 8 / 1.04 / 18% | 12 / 0.48 / 2% |
| 17 | 1944000 | 1002.8 | 668 / 0.54 / 0% | 77 / 0.24 / 0% | 567 / 0.17 / 0% | 392 / 0.42 / 0% | 850 / 0.30 / 0% | 7 / 0.43 / 4% | 58 / 0.37 / 0% | 33 / 0.70 / 9% | 12 / 0.46 / 2% |
| 18 | 1942000 | 1001.9 | 681 / 0.49 / 0% | 81 / 0.23 / 0% | 580 / 0.15 / 0% | 349 / 0.35 / 0% | 850 / 0.31 / 0% | 7 / 0.38 / 2% | 61 / 0.35 / 0% | 70 / 0.68 / 1% | 11 / 0.49 / 2% |
| 19 | 1802000 | 1000.2 | 714 / 0.44 / 0% | 77 / 0.21 / 0% | 592 / 0.14 / 0% | 359 / 0.30 / 0% | 744 / 0.29 / 0% | 7 / 0.46 / 2% | 56 / 0.37 / 0% | 18 / 1.03 / 13% | 11 / 0.48 / 1% |
| 20 | 1952000 | 1001.0 | 719 / 0.48 / 0% | 83 / 0.24 / 0% | 586 / 0.15 / 0% | 326 / 0.38 / 0% | 793 / 0.33 / 0% | 7 / 0.46 / 3% | 59 / 0.38 / 0% | 9 / 1.22 / 21% | 11 / 0.50 / 2% |
