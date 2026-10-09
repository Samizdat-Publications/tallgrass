# Night plan: 2026-10-09, 03:30 to 13:00 ("The long breath")

The owner went to bed at about 03:20 and asked for a plan made in plan mode and then straight execution, without anything that needs his approval. Plan mode's exit step asks for approval, so this file is the plan instead (logged in DECISIONS.md). The next planning session (with the owner, in real plan mode) starts from this file, MORNING.md and NEXT-SESSION.md.

## The owner's brief, in one line
Fix wolves and bison (my call), aim for an ecosystem that lasts without petering out, and make super fast-forward look like a world breathing: the whole valley growing, dying back and rebalancing over decades. Beauty first, emergent behaviour second, the sim underneath it.

## Diagnosis (measured on the v9 acceptance runs, 20 worlds x 1,400 valley years)
1. **Bison live too fast for the calendar.** A calf is grown at half a valley year and a cow calves every 1.2 years, so a herd of 1,000 has 500 to 1,000 births and as many deaths every 1.7 years. Starvation is the biggest killer. The herd overshoots and crashes every 8 years or so (300 to 1,500 and back). Wolves cannot follow a cycle that fast, so the chart reads as noise and the peaks are the "bison carpet" the critics see.
2. **Wolves are set by den sites, not by prey.** About 10 packs fit the 512 m valley, so wolves sit near 73 against 579 bison (1:8; real ranges are 1:30 to 1:100 of all ungulates).
3. **Grass growth barely matters to the bison** (a 20% cut left them unchanged): they are limited by standing grass, winter and wolves. So a climate signal must move the land's carrying capacity, not just the regrowth rate.
4. **The sim runs about 750 ticks a second** on one core, so the 100x button (1,000 ticks a second) runs below 100x, and there is no faster speed for watching centuries.

## The design call: three levers, one checkpoint (v10)
- **A. Climate regimes (built, commit a48bf72, param climate2).** A seeded index of wet and dry decades (three slow swells around climatePeriod, red noise, a megadrought of 3 to 6 years now and then). It moves grass capacity and regrowth, summer dry-spell odds, lightning fires and cottonwood recruitment. This is the breath: wet decades green the valley, herds swell, groves spread; dry decades brown it, fires run, herds thin, packs shrink; then it comes back.
- **B. Bison on a slower clock (params).** Older at first calf, longer between calves, longer lives. Slower swings, smaller peaks, and fewer kills needed to hold the herd.
- **C. Fewer, bigger wolf packs (params).** Dens further apart and larger territories: 4 to 6 named packs instead of about 10, a ratio near 1:15 to 1:20 bison. Packs become characters you can follow on the territory map.
- Considered and not taken tonight: a bigger valley (touches every render system; too risky for one night), elk as a new staple prey (a new species), cutting grass growth (measured: no effect).

## Stages and timing
| Time | CPU (batch runs) | Lead | Builders (GPU and code) |
|---|---|---|---|
| 03:30 to 04:30 | Screen 1: bison clock and wolf spacing variants (14 worlds x 150 years each) | climate mechanism (done), this plan | s-perf: faster sim, bit-identical |
| 04:30 to 05:45 | Screen 2: climate on top of the best of screen 1 (amplitude and period variants) | read screens, choose | r-breath: the breathing valley at speed (climate look, graph band, chronicle) ; s-bands: bison herd bands (off by default) |
| 05:45 to 06:30 | Confirm screen: 32 worlds x 200 years for the v10 candidate | merge s-perf if clean | review captures of the candidate |
| 06:30 to 10:30 | Acceptance: 20 worlds x 1,400 valley years (same span as v9) | merges, reviews, MORNING | r-breath merge; graphics fixes from the review |
| 10:30 to 12:45 | Shocks (cull, drought, wolf wipeout) | | |
| 12:45 to 13:00 | Adopt if every gate passes, deploy, MORNING, NEXT-SESSION | | |

Gates (same as v9): every species present >= 90% of the time in >= 18 of 20 worlds, bison persist in >= 19 of 20, wolf CV >= 0.2, wolf to prey correlation >= 0.4 at 1 to 3 years, raven CV >= 0.1, bison recover in >= 80% after each shock. New for v10, reported but not gates: wolf to bison ratio, bison peak over mean, share of variance at periods over 20 years (the breath), and how the herd and the grass follow the climate index.

Acceptance length: the v9 runs used 1,000 bison generations, about 1,400 valley years. With bison on a slower clock, 1,000 generations would take twice as long (7 hours), so v10 runs the same 1,400 valley years and reports how many generations that is. (The brief asks for 1,000 herbivore generations; pronghorn and the small prey still pass that easily.)

## Fallbacks
- If no screen-1 variant holds every species, v10 is climate only (lever A) on the v9 world.
- If the acceptance finishes but the shocks do not by 13:00, v10 is not the default yet: it ships as a named scenario ("The long breath", in the menu) and adoption is the first step of the next session.
- If the 5-hour usage window gets close to its limit, builders pause; the CPU runs need no tokens.

## What the owner should be able to do at 13:00
- Open the live game, pick The long breath (or the default, if adopted), set 100x, and watch wet and dry decades roll over the valley, with the graph showing the climate band under the populations and the chronicle naming the wet years, the dry years and the megadroughts.
- Read the result in MORNING.md: what changed, the numbers, the charts, what failed.

## Out of scope tonight (for the next plan)
Bison herd bands land as an off-by-default param with a first screen, not adopted. The idle rare-events journal (MAYBE-WANTS.md), winter-tree branches, a bigger valley and new species wait for the next planning session.
