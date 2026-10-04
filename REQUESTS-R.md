# Requests from Track R to Track S

Only Track R writes this file (V2-PLAN.md section 4.3). Track S reads it with `git show origin/main:REQUESTS-R.md`.

## 2026-10-04 (Track R, after merging v2-sim@52003ea into main as 4893296)
- Merged: S0, S16 sim side, v2 chronicle text. `npm test` green on Windows (golden e6b99005, 19759373, 7bc34541), build ok, two minutes of the live game on the GPU with no page errors.
- Confirmed: a local `npm run batch` runs on Windows with `batchWorkerBoot.mjs` (2 seeds x 4,800 ticks, 1.2 ms/tick per worker).
- `tools/smoke.ts` fails locally: it forces `--use-angle=swiftshader`, so `page.screenshot` times out on this machine too. Please add a GPU mode (for example `--gpu` or auto when not in the cloud) that launches with `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11 --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`, and keep SwiftShader as the cloud default.
- R0 item 2 (registry-safe render and UI) is now in progress on main; S4 can start once it lands (watch this file).
- 32-seed screens and the acceptance run: ask here (TRACK-S.md "Requests for Track R") with the frozen hash and exact command; Track R will launch them on the local CPU.

## 2026-10-04 15:30 (Track R)
- R0 item 2 (registry-safe render and UI) is on main. S4 can start.
- Gap found: `?p=rabbit.initial:20` spawns no rabbits; the founder spawn in sim.ts only handles bison, pronghorn, wolf, cougar and raven. Please make founders registry-driven (any species with `<key>.initial`), with the hash unchanged. Rabbits introduced via `apply` draw with the rabbit model and get a graph row.
- Introducing a species id that has no params entry crashes in the sim (`matureAge` of undefined). New species need params entries before ids 6 to 11 can be spawned.

## 2026-10-04 ~18:00 (Track R)
- Merged v2-sim@4583935 (S1, S2, S18) into main; `npm test` green, golden unchanged.
- S3 32-seed screens A32, B32, C32, D32 are running on the local CPU from frozen `scratch/frozen/bc62e1e` (12 threads, one after another), exactly the commands in TRACK-S.md. Output `scratch/screens/<name>32`; the adoption table lands here and the summaries under `review/stability/v6-screens/` when done.
- `story.ts` `causePhrase` now has 6 ("Left the valley for the open prairie") and 7 ("Died of distemper").
- S18 `DecadeLines` wiring in `ui.ts` comes after the R12 play-UI merge (a builder has ui.ts open).
- S18 is wired (2fb40fc): decade lines go in the chronicle as major entries, arcs as normal ones, both reset with the season lines. Seen live at year 10: "Years 1 to 10, the Raven Years: the ravens gathered, 30 to 208, and wolves rose from 30 to 42."
- Text nit: "The drought of years 5 to 6, one year long; the grass came back the same year." reads oddly (two year numbers but "one year long"). Suggest "The drought that began in year 5 lasted a year; the grass came back the same season." or name the span in seasons.
- R12 play UI is on main: the valley setup uses `<prefix>.initial`, `grassGrowth`, `droughtGrowth`, `winterDieback`, `calendarScale` and `openPrairie` (the toggle is live now that S1 is merged). Climate and winter strengths are untested guesses (grassGrowth x0.85/x1.15, winterDieback x0.5/x1.6); if you have numbers for sane ranges, say so here.

## 2026-10-04 17:25 (Track R): S3 32-seed screens done
Frozen `v2-sim@bc62e1e`, 32 seeds x 240,000 ticks, the exact commands in TRACK-S.md. `metrics.md`, `meta.json` and the table are in `review/stability/v6-screens/` (CSVs stay in `scratch/screens/<name>32/baseline/` on this machine).

| Screen | Seeds | Years | Bison persist | Presence >= 90% | Pronghorn starve | Wolf CV | Wolf-bison corr (1-3 yr) | Eligible |
|---|---|---|---|---|---|---|---|---|
| A | 32 | 200 | 30/32 (need 30) | 30/32 (need 29) | 71% x | 0.09 | 0.19 x | no |
| B | 32 | 200 | 32/32 (need 30) | 32/32 (need 29) | 64% x | 0.10 | 0.23 x | no |
| C | 32 | 200 | 32/32 (need 30) | 32/32 (need 29) | 65% x | 0.10 | 0.17 x | no |
| D | 32 | 200 | 32/32 (need 30) | 32/32 (need 29) | 58% x | 0.26 | 0.72 | no |

Lead's read: D does everything the wolves need (CV 0.26, correlation 0.72, 32/32 everywhere) and fails only the pronghorn-starvation share. A pronghorn brake (density-dependent fawning or the S5 coyote fawn predation) on top of D looks like the path to v6. Happy to run the next 32-seed screen (D + pronghorn fix) the moment you post its params and a frozen hash.

## 2026-10-04 18:00 (Track R): D re-run at 3bb97a5 (with old_/killed_ columns)
Same D params, frozen `scratch/frozen/3bb97a5`, 32 seeds x 240,000 ticks. Files in `review/stability/v6-screens/D32b/`.

| Screen | Seeds | Years | Bison persist | Presence >= 90% | Pronghorn starve | Wolf CV | Wolf-bison corr (1-3 yr) | Eligible |
|---|---|---|---|---|---|---|---|---|
| D (bc62e1e) | 32 | 200 | 32/32 | 32/32 | 58% x | 0.26 | 0.72 | no |
| Db (3bb97a5) | 32 | 200 | 32/32 | 32/32 | 50% x | 0.26 | 0.72 | no |

With the proper columns, starvation is still half of pronghorn deaths. The CPU is free: post the next screen (D + a pronghorn brake) with a frozen hash and I'll run it at 32 seeds straight away.

## 2026-10-04 18:15 (Track R): round 13 blind critic, ecology items for Track S
Full triage in REVIEWS.md round 13. For you:
- No legible boom-bust in the first hour of play (about 30 valley-years at the default calendar): the critic sees noise around a rising trend. Screen D fixes the wolf side; the first-decade shape matters for the player.
- Year 1 default world: bison 800 to 903 and pronghorn 350 to 463 across autumn ("come through autumn stronger"). Births should be spring-only and winter should cost animals; please check the birth timing on the default calendar.
- Wolves only change at denning: adult wolf deaths seem to cluster, so the line is a staircase.
- Ravens sit at a hard ceiling (~680) in screen D from year 110: worth checking against the vagrant model.
- Herd rings around ponds (S10).
