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

## 2026-10-04 19:00 (Track R): screen E at 32 seeds is ELIGIBLE; acceptance and shocks running
Frozen `3bb97a5`, adoption.py from v2-sim@33989fa. Files in `review/stability/v6-screens/E32/`.

| Screen | Seeds | Years | Bison persist | Presence >= 90% | Pronghorn starve | Wolf CV | Wolf-bison corr (1-3 yr) | Eligible |
|---|---|---|---|---|---|---|---|---|
| E | 32 | 200 | 31/32 (need 30) | 32/32 (need 29) | 49% | 0.25 | 0.74 | yes |
| Db | 32 | 200 | 32/32 (need 30) | 32/32 (need 29) | 50% x | 0.26 | 0.72 | no |

Started at 19:00 from the same frozen worktree, with E's params:
- acceptance: 20 seeds x 1,000 generations (`--ticks 3600000 --sample 2000 --threads 10`) -> `review/stability/v6E-3bb97a5`, log `scratch/accept_v6E.log`
- shocks: cull70, drought, wolfwipe, 20 seeds x 720,000 ticks (`--threads 6`) -> `review/stability/v6E-3bb97a5-shocks300`
I'll post the results here when they finish (about 3 hours). The adoption flip itself is yours (sim defaults).

## 2026-10-04 22:00 (Track R): v6E ACCEPTANCE PASSES
20 seeds x 1,000 bison generations (about 1,340 valley-years), frozen `3bb97a5`, E params. `review/stability/v6E-3bb97a5/` (summary, CSVs, charts).
- Persistence: bison, wolf, raven, pronghorn 20/20 each; near-zero time 0.0% for all.
- CV: bison 0.53, wolf 0.24 (gate 0.2), raven 0.15 (gate 0.1), pronghorn 0.50.
- cycle_stats (last 80%): wolves follow bison by 1 year, median corr 0.69 (gate 0.4); half-cycles about 2.5 years; recovery to 90% of mean in 2 to 3 years.
- Shock suite (cull70, drought, wolfwipe, 20 seeds x 720,000 ticks) is still running (about 25% done); results here when it finishes.
By the S3 rule E is v6 unless the shocks fail the 80% bison recovery gate. Your call on flipping the defaults now or after the shocks; if you flip now, tell me the new golden hashes and I'll merge.

## 2026-10-04 22:40 (Track R): screen G at 32 seeds is ELIGIBLE; v6G acceptance launched
| Screen | Seeds | Years | Bison persist | Presence >= 90% | Pronghorn starve | Wolf CV | Wolf-bison corr (1-3 yr) | Eligible |
|---|---|---|---|---|---|---|---|---|
| E | 32 | 200 | 31/32 | 32/32 | 49% | 0.25 | 0.74 | yes |
| G | 32 | 200 | 31/32 | 32/32 | 33% | 0.22 | 0.59 | yes |
adoption.py (v2-sim latest) picks E on wolf CV. G fixes the round-13 seasonality complaint (spring births) and the pronghorn starvation share, at a lower wolf CV and lag correlation. v6G acceptance (20 seeds x 1,000 generations, same frozen 3bb97a5) started at 22:40 -> `review/stability/v6G-3bb97a5`, about 3 hours. v6E shocks are about 60% done.
Lead's view: if G's acceptance passes, prefer G as the default (visible spring calving and a pronghorn that isn't starving matter to a player), since its wolf numbers still clear the gates.

## 2026-10-05 01:30 (Track R): v6E shocks done; v6G acceptance FAILS
**v6E shocks** (`review/stability/v6E-3bb97a5-shocks300`, 20 seeds x 720,000 ticks each):
- cull70: all four species 20/20, recovered 100% (bison median 48 yr). PASS.
- drought: all four 20/20, recovered 100% (bison 13 yr). PASS.
- wolfwipe: all four persisted 20/20; bison recovered 100% (31 yr); wolves recovered in only 75% of worlds within the window (median 41 yr, near-zero 2.8%); the batch marks bison and pronghorn FAIL on its own stricter criterion there. The plan's gate (bison recovery >= 80% after each shock) passes.
**v6G acceptance** (`review/stability/v6G-3bb97a5`): bison persisted 17/20 (near-zero 0.2%), wolf CV 0.21, raven 20/20, pronghorn 20/20 (CV 0.30). Fails the bison 19/20 gate.
=> By the S3 rule v6E is v6. Please flip the defaults to E on v2-sim and post the new golden hashes; I'll merge, re-run the game and redeploy. Worth a look later: why birth pulses cost bison persistence (G) and wolf recolonization after a wipeout (75%).
