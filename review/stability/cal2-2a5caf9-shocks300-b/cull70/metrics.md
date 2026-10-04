# Stability metrics: cull70

- At 40% of the run, 70% of the bison are removed.
- Seeds: 6 (15..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit 2a5caf9 (frozen copy); real sim
- Params: {"calendarScale":2}
- Shocks: cull 70% bison at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 6/6 (100%) | 1088 | 0.27 | 0.0% | 0.0 | 1.96 | 42 | 111.3 (4 seeds) | 100% | 100% | 15.6 |
| wolf | 6/6 (100%) | 51 | 0.10 | 0.0% | 0.0 | 1.27 | 31 | 7.5 (6 seeds) | 83% | 100% | 69.4 |
| raven | 6/6 (100%) | 301 | 0.06 | 0.0% | 0.0 | 1.09 | 0 | 5.0 (6 seeds) | 0% | 100% | 0.0 |
| pronghorn | 6/6 (100%) | 735 | 0.39 | 0.0% | 0.0 | 2.42 | 65 | 8.8 (5 seeds) | 100% | 100% | 54.4 |

Max bison generation depth reached: 464.4 (median across seeds 434.0).

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
| 15 | 720000 | 439.4 | 1391 / 0.26 / 0% | 41 / 0.12 / 0% | 301 / 0.06 / 0% | 928 / 0.37 / 0% | bison 11.3, wolf 282.5, raven unaffected, pronghorn 90.0 |
| 16 | 720000 | 461.6 | 1067 / 0.35 / 0% | 63 / 0.09 / 0% | 301 / 0.06 / 0% | 711 / 0.39 / 0% | bison 16.3, wolf unaffected, raven unaffected, pronghorn 13.8 |
| 17 | 720000 | 428.6 | 1011 / 0.29 / 0% | 52 / 0.10 / 0% | 300 / 0.06 / 0% | 567 / 0.39 / 0% | bison 15.0, wolf 70.0, raven unaffected, pronghorn 65.0 |
| 18 | 720000 | 410.6 | 988 / 0.27 / 0% | 62 / 0.09 / 0% | 300 / 0.06 / 0% | 717 / 0.39 / 0% | bison 13.8, wolf 66.3, raven unaffected, pronghorn 43.8 |
| 19 | 720000 | 423.6 | 1110 / 0.26 / 0% | 50 / 0.10 / 0% | 301 / 0.06 / 0% | 776 / 0.34 / 0% | bison 21.3, wolf 106.3, raven unaffected, pronghorn 71.3 |
| 20 | 720000 | 464.4 | 1293 / 0.27 / 0% | 50 / 0.10 / 0% | 301 / 0.06 / 0% | 752 / 0.45 / 0% | bison 93.8, wolf 68.8, raven unaffected, pronghorn 21.3 |
