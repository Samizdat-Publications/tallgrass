# v11 candidate (v10b + shoreSpread 1, bison only): acceptance result, NOT ADOPTED

Run: 20 worlds x 1,200 valley years from frozen feaa081, stats from year 120 (tools/adoption.py --burn 0.15; scratch/v10/compare.py for the side-by-side).

Standard gates (tools/adoption.py): eligible. Bison persist 20/20, every species present >= 90% of the time in 20/20 worlds (prairie dogs 20/20, v10b 19/20), pronghorn starvation 38%, wolf CV 0.26, wolf to bison lag correlation 0.53.

Against the v10b acceptance on the same 20 seeds (years 120 to 1,200):

| | bison | wolves | pronghorn | mule deer | coyotes | ravens | prairie dogs | climate tracking |
|---|---|---|---|---|---|---|---|---|
| v10b | 552 | 33 | 367 | 71 | 78 | 514 | 17 | 0.53 |
| v11 | 572 | 34 | 369 | 43 | 77 | 515 | 19 | 0.48 |

What it buys: bison within 30 m of water fall from 53% to 42% of the herd (32-world screen), the round 25 and 28 "waterhole mob".
What it costs: mule deer -39% over 1,200 years (the 150-year screen showed only -12%), and a slightly weaker climate signal.

Decision (2026-10-10 06:05): not adopted. The mule deer recovery was one of v10b's main gains; shoreSpread stays as an off-by-default param. Next session: a deer-safe version (stagger thirst only, no walk-off, or a walk-off that avoids woody cover), screened over at least 400 years because the deer cost only shows over centuries. The shock suite ran for the record (review/stability/v11-feaa081-shocks once copied).
