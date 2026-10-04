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
