# Stability metrics: drought

- At 40% of the run, a two-year drought (4800 ticks, severity 0.8).
- Seeds: 6 (15..20)
- Run length: 720000 ticks (600 years)
- Sampled every 1500 ticks; commit 2a5caf9 (frozen copy); real sim
- Params: {"calendarScale":2}
- Shocks: drought (2 yr) at tick 288000 (year 240.0)

Years are 1 year = 1200 ticks. Statistics exclude the first 15% of each run (burn-in).
Near-zero = below 10% of that seed's post-burn-in mean. Peaks and period use a one-year smoothed series.

## Per species, across seeds

| species | persisted | mean pop (median) | CV | near-zero | longest near-zero (yr) | max/mean | peaks | period (yr) | left range | recovered | recovery median (yr) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bison | 6/6 (100%) | 1057 | 0.30 | 0.1% | 0.6 | 2.17 | 43 | 30.0 (4 seeds) | 100% | 100% | 27.5 |
| wolf | 6/6 (100%) | 51 | 0.10 | 0.0% | 0.0 | 1.26 | 37 | 10.0 (6 seeds) | 100% | 100% | 11.9 |
| raven | 6/6 (100%) | 300 | 0.07 | 0.0% | 0.0 | 1.09 | 0 | 5.0 (6 seeds) | 50% | 100% | 6.9 |
| pronghorn | 6/6 (100%) | 723 | 0.42 | 0.0% | 0.0 | 3.00 | 64 | 8.1 (6 seeds) | 100% | 100% | 15.0 |

Max bison generation depth reached: 478.7 (median across seeds 441.1).

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
| 15 | 720000 | 478.7 | 1463 / 0.31 / 1% | 40 / 0.12 / 0% | 299 / 0.09 / 0% | 907 / 0.41 / 0% | bison 22.5, wolf 8.8, raven 17.5, pronghorn 10.0 |
| 16 | 720000 | 457.6 | 982 / 0.39 / 0% | 63 / 0.10 / 0% | 301 / 0.06 / 0% | 668 / 0.45 / 0% | bison 31.3, wolf 68.8, raven unaffected, pronghorn 18.8 |
| 17 | 720000 | 425.0 | 1015 / 0.30 / 0% | 52 / 0.10 / 0% | 300 / 0.06 / 0% | 710 / 0.40 / 0% | bison 31.3, wolf 13.8, raven unaffected, pronghorn 15.0 |
| 18 | 720000 | 405.8 | 921 / 0.29 / 0% | 61 / 0.09 / 0% | 299 / 0.06 / 0% | 675 / 0.40 / 0% | bison 20.0, wolf 8.8, raven unaffected, pronghorn 10.0 |
| 19 | 720000 | 447.5 | 1099 / 0.29 / 0% | 50 / 0.11 / 0% | 300 / 0.07 / 0% | 779 / 0.42 / 0% | bison 35.0, wolf 11.3, raven 13.8, pronghorn 15.0 |
| 20 | 720000 | 434.8 | 1177 / 0.30 / 1% | 51 / 0.10 / 0% | 300 / 0.07 / 0% | 737 / 0.46 / 0% | bison 23.8, wolf 12.5, raven 15.0, pronghorn 163.8 |
