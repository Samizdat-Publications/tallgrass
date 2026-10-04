# Stability metrics: wolfwipe

- At 35% of the run all wolves are removed; at 50% eight wolves are reintroduced.
- Seeds: 6 (15..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit 2a5caf9 (frozen copy); real sim
- Params: {"calendarScale":2}
- Shocks: wolves removed at tick 252000 (year 210.0); introduce 8 wolves at tick 360000 (year 300.0)
- Wolf near-zero stats can include the deliberate wolf-free stretch between removal and reintroduction.

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 6/6 (100%) | 1242 | 0.31 | 0.0% | 0.0 | 2.44 | 44 | 15.0 (2 seeds) | 100% | 100% | 91.9 |
| wolf | 6/6 (100%) | 44 | 0.49 | 17.6% | 90.0 | 1.58 | 40 | none | 100% | 50% | 15.0 |
| raven | 6/6 (100%) | 301 | 0.06 | 0.0% | 0.0 | 1.09 | 0 | 5.0 (6 seeds) | 0% | 100% | 0.0 |
| pronghorn | 4/6 (67%) | 825 | 0.53 | 0.6% | 3.1 | 4.40 | 67 | 6.3 (4 seeds) | 100% | 50% | 73.8 |

Max bison generation depth reached: 508.8 (median across seeds 432.2).

## Proposed acceptance (thresholds live in metrics.ts ACCEPT)

| species | persist >= 80% | near-zero <= 5% | stretch <= 2 yr | max/mean <= 4 | CV >= 0.05 | recovered >= 80% | overall |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| bison | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| wolf | PASS | FAIL | FAIL | PASS | PASS | FAIL | FAIL |
| raven | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| pronghorn | FAIL | PASS | FAIL | FAIL | PASS | FAIL | FAIL |

## Per seed

| seed | end tick | gen | bison: mean / CV / near-zero | wolf: mean / CV / near-zero | raven: mean / CV / near-zero | pronghorn: mean / CV / near-zero | shock recovery (yr) by species |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 15 | 720000 | 449.3 | 1494 / 0.28 / 0% | 39 / 0.50 / 18% | 301 / 0.06 / 0% | 434 / 1.49 / 58% EXTINCT@303.8yr | bison 61.3, wolf never, raven unaffected, pronghorn never |
| 16 | 720000 | 508.8 | 1309 / 0.46 / 0% | 42 / 0.51 / 18% | 301 / 0.06 / 0% | 837 / 0.55 / 1% | bison 235.0, wolf never, raven unaffected, pronghorn 73.8 |
| 17 | 720000 | 408.1 | 1197 / 0.38 / 0% | 47 / 0.49 / 18% | 300 / 0.06 / 0% | 813 / 0.51 / 0% | bison 215.0, wolf 115.0, raven unaffected, pronghorn 8.8 |
| 18 | 720000 | 411.5 | 1168 / 0.32 / 0% | 49 / 0.48 / 18% | 301 / 0.06 / 0% | 846 / 0.51 / 0% | bison 122.5, wolf 11.3, raven unaffected, pronghorn 197.5 |
| 19 | 720000 | 415.1 | 1215 / 0.29 / 0% | 46 / 0.49 / 18% | 300 / 0.06 / 0% | 237 / 1.85 / 69% EXTINCT@248.8yr | bison 18.8, wolf never, raven unaffected, pronghorn never |
| 20 | 720000 | 452.6 | 1269 / 0.30 / 0% | 41 / 0.49 / 18% | 301 / 0.06 / 0% | 845 / 0.52 / 0% | bison 40.0, wolf 15.0, raven unaffected, pronghorn never |
