# NEXT SESSION: pick up here

**Updated:** 2026-10-04 afternoon, at the end of the v2 planning session. v1 is finished and live; v2 starts now. The plan is `V2-PLAN.md`.

## Day run 2026-10-09 ~15:30 to 2026-10-10 ~15:30: READ DAY-PLAN.md FIRST
- Planned Friday afternoon at extra-high effort; executes at high effort once the owner switches. The plan: `DAY-PLAN.md` (stock-take, bang-for-buck ranking, blocks, gates, quota targets).
- Start state: main 442a648 + the plan commit, v10b default and live (deploy 13:04), CPU idle, no builders, nothing running. Weekly quota 31% at 14:30.
- First steps (Block 0): write "2026-10-10 15:30" to `.claude/hooks/run_until.local.txt`; idle-machine baselines (gpubench, 100x rate, r-snow A/B); the look-set capture and `tools/look_stats.py`; Gemini `videoMetadata.fps`; start v11 screen 1 on the CPU; brief builders B1 r-look, B2 r-ground, B3 a3-spike.
- Owner plays tonight: deploy D1 about 19:30; CPU batches at 8 threads from 18:00 to 23:00 (4 if he says "playing").
- THROTTLED since 16:00 (owner: mouse lag): scratch/day/throttle_loop.sh keeps project processes at Idle priority; v11 screen at 3 threads. Touch scratch/day/fullspeed only when the owner says full speed.
- OWNER RULING 15:05: any model or asset regardless of license (he handles licensing); still record sources in CREDITS.md.
- State 15:20: deadline set. Idle bench of main (1440p): low_golden 18.78 ms (over the 16.7 gate), night 15.43, others 11.8 to 14.9 (review/wip/day/gpubench_main_baseline.json). Look-set baseline in review/wip/day/baseline (tools/stills.mjs --set look; tools/look_stats.py). Gemini now samples at 8 fps (tools/gemini_video_review.py --fps), video.mjs --set motion.
- Builders running (hand-made worktrees with node_modules junctions): B1 r-look (scratch/wt-look), B2 r-ground (wt-ground), B3 a3-spike (wt-a3, 3-hour gate), B4 r-perf (wt-perf). Briefs in scratch/day/*.md.
- CPU: v11 screen 1a (bands with today's params, 5 variants x 32 x 200 years, 10 threads) from frozen scratch/frozen/b89bb30, log scratch/v11/screen1.log, out scratch/frozen/b89bb30/scratch/v11s1/<variant>.
- In main (uncommitted until npm test passes): v11 params bandRoam, bandRoamGrass, bandRoamDist (src/sim/bands.ts roam(), sim.ts pull toward the band's goal). Screen 1b with bandRoam variants follows screen 1a.
- r-snow: main merged into it in scratch/wt-snow (3f2a02c); GPU A/B against main running (review/wip/day/gpubench_snow_ab.json).

## Night of 2026-10-09 (03:30 to 13:05): v10, then v10b, ADOPTED and live (default world is v10b since 13:00; golden 77fd982c, 2fc8dc7c, 37517a14; deploy 13:04) (read NIGHT-PLAN.md and MORNING.md's top section first)
State at 11:45:
- Last deploy 11:41 (main with v10 and r-cuts), live check clean.
- Default world is checkpoint v10: v9 + evolution2 1, climate2 0.3, wolfDenMinDist 280, wolfTerritory 130. Golden 29b70982, 00c0d105, b5760934. Live (deploy 10:36, live check clean). Data and RESULT.md: review/stability/v10-97eef97 and -shocks.
- Merged tonight on main: climate regimes + climatePrairie, s-perf (bit-identical 1.39x), director v3, r-breath (climate look, graph band, slate word, chronicle), r-lapse (damped seasons and steady light from 30x), r-trails (long exposure), r-rare (rare sightings journal), r-uifix (migrants away, fixed card order, one season vocabulary), r-closeup (selection arcs, ground grain, rim, lying poses), species glyphs at speed, r-cuts (cut dip, eye adaptation, smoother follow), s-bands (herdBands, off), climate narrator lines, The long breath scenario (= v10b params), vite ignores .claude/.
- RUNNING (started 10:22, outlives the session): v10b acceptance (20 x 1,200 yr) and shocks (12 x 500 yr) from frozen 1f3f658 (scratch/v10/accept_v10b.sh; logs scratch/v10/accept_v10b.log and shocks_v10b.log; out scratch/frozen/1f3f658/review/stability/v10b-1f3f658[-shocks]). v10b = v10 + deer.maxLitter 2, wolf.sprintCost 0.3, raven.initial 250, coyote.initial 30. NEXT SESSION FIRST: if acceptance (`.venv/Scripts/python tools/adoption.py v10b=scratch/frozen/1f3f658/review/stability/v10b-1f3f658 --burn 0.15`) and shocks (bison recovered >= 80% in each metrics.md) pass, merge branch v10b-adopt (pushed; worktree scratch/wt-adopt2; e2b15c7): defaults flipped (wolf sprint 0.3 inside evolution2's table, pronghorn maxLitter 2, raven.initial 250, coyote.initial 30), pins extended (testpins and CHALLENGE_PIN; coyotes stay 0 in challenges), golden 77fd982c, 2fc8dc7c, 37517a14, coyote and evolution tests updated, challenge suite passes. Then npm test, playtest, deploy, copy the review/stability data, update MORNING.
- Parked branches: r-snow (pushed; re-bench frame cost on an idle machine), s-bands is merged but off (costs 12 to 15% of bison).
- Reviews tonight: 21 (charts, ecosystem 6), 22 (stills 6/5/6/7/7/6), 23 (Gemini video, motion 4). Triage in REVIEWS.md. Next-cycle list is MORNING.md "Next 5".
- Builder worktrees made by hand tonight: scratch/wt-adopt, wt-lapse, wt-uifix, wt-closeup, wt-snow (node_modules junctions inside: remove a junction with `cmd //c rmdir` before any worktree removal, never rm -rf).

## State now (2026-10-09 ~01:40)
- Default world is checkpoint v9 (v8b + ravenNestFood 1, muledeerCover 0.15, bison.initial 550). Golden 55737903, 465f73d6, 27e42109. Live and checked. Everything merged, pushed, deployed; nothing running.
- Today (design calls): follow camera and readable animals, water, UI fixes, animation polish (gallop spine, splashes, snow easing), far-view readability and map glyphs, blizzard whiteout, calm UI (Tools drawer, idle fade, docked graph), v9 ecology. Reviews 19 and 20 in REVIEWS.md.
- Left for the next phase (planner): (1) dynamics read as noise rather than multi-decade boom and crash cycles, and the wolf to bison ratio is high; this is the biggest remaining design question and needs a sim redesign, not tuning; (2) mule deer settle near 13 over centuries; (3) bison herd density and shape (spacing alone does not help); (4) video critics still score motion low; try closer documentary shots of running animals in the reel and review whether the 1 fps sampling is the issue; (5) first-years drift; (6) the idle rare-events feature (MAYBE-WANTS.md); (7) parked winter-tree branches.

### 2026-10-08 ~23:15, design-call day)
- Live: v8b world plus today's render and UI work (follow camera, readable animals, water, UI fixes, animation polish, far-view readability and map glyphs, blizzard whiteout, calm UI with a Tools drawer). All merged, pushed, deployed, checked.
- v9 candidate (v8b + ravenNestFood 1, muledeerCover 0.15, bison.initial 550) PASSED its 20-seed acceptance (every species 20/20, raven CV 0.32). Shock suite running from scratch/frozen/e571d1a (log scratch/shocks_v9.log, out .../v9-e571d1a-shocks). If bison recover >= 80% after each shock, adopt like v8b: flip the three defaults, extend V7C_OFF in src/sim/testpins.ts and CHALLENGE_PIN (ravenNestFood 0, muledeerCover 0.25, bison.initial 800), re-record golden, challenge_suite, playtest --timeout 400000, deploy.
- Honest limits: over 800-year runs mule deer still settle near 13 (the cover change only helps the first two centuries); resident ravens still spend about a quarter of their time near the food-scaled maximum; bison density and the 'noise not cycles' dynamics remain planner calls; the wolf to bison ratio is high (critic: about 1:7).
- Reviews: rounds 19 (Gemini video) and 20 (blind stills, 7/4/6/5/6/6) in REVIEWS.md; video critics still score motion low (2/10) even after the gallop and readability fixes, which suggests a different capture approach (closer documentary shots of running animals) for the next video round.
- Parked: winter-tree branches (r-winter-trees, r-winter-trees2); GPU A/B for r-far-read on an idle machine.

### 2026-10-08 ~06:30, end of the extended session; weekly about 92%)
- Default world is checkpoint v8b (v7c + snowDepth 1, dynamicTrees 1, treeCwRecruit 0.003, dogRescueYears 8). Golden 2b8abd08, 810eb241, b162b93a. Live and checked.
- Everything is merged, pushed and deployed; nothing is running. No builder worktrees left (frozen worktrees under scratch/frozen are kept for reruns).
- Latest reviews: review/round-17 (blind stills, scores 6/4/5/5/6/5) and review/round-18-video (Gemini). Their top items are planner calls: bison density and herd shape (spacing alone does not help, see DECISIONS), small animals and the followed animal not readable at default/follow cameras, mule deer near 10 and ravens at a flat ceiling in long runs, dynamics that read as jitter, water that reads as asphalt, UI footprint. Quick fixes still open: follow camera framing, title card overlapping the hint pill, weather status line during a blizzard, Cottonwood pack tint.
- Branches on origin, not merged: r-winter-trees and r-winter-trees2 (living winter trees; one over budget, one looks ghostly).
- Planner inputs: this file, MORNING.md, DECISIONS.md (2026-10-07 and 2026-10-08 entries), REVIEWS.md rounds 15 to 18, MAYBE-WANTS.md.

### 2026-10-07 evening, owner allowed work up to 97% weekly; start nothing new at 95%)
- Live = main with today's review fixes (overlay, chronicle, field-note camera, canopy clearance, night, beaver model and marsh, grounding, calm UI, wide-view terrain). Default world still v7c (golden 2cabdb62, 5ad21d26, 904ebf61).
- v8 acceptance done: NOT adopted (prairie dogs 17/20 at >= 90% presence, gate 18). review/stability/v8-a009c8e/RESULT.md. Snow depth and dynamic trees both draw and pass short screens; the blocker is long-run prairie dog town fragility (planner item).
- RUNNING: v8b acceptance (v8 + dogRescueYears 8), 20 x 1,000 generations, started about 23:15 from scratch/frozen/d8b8624, 14 threads, log scratch/accept_v8b.log, out scratch/frozen/d8b8624/review/stability/v8b-d8b8624/baseline (ETA about 03:00). If it passes all gates: shocks from the same worktree (--seeds 20 --ticks 720000 --sample 1500 --scenario cull70,drought,wolfwipe --threads 14, params {"snowDepth":1,"dynamicTrees":1,"treeCwRecruit":0.003,"dogRescueYears":8}); then adopt (flip four defaults, re-record golden, extend testpins with a V8_OFF, pin snowDepth 0, dynamicTrees 0, dogRescueYears 20 in CHALLENGE_PIN, challenge_suite, playtest, deploy).
- Coyote-hare correlation already passes in v7c (0.44); hyv12 (hareYearVar 1.2) gives 0.54, optional. csg07 and gus025 screens cancelled.
- Branches on origin, not merged: r-winter-trees (living winter trees, over frame budget) and r-winter-trees2 (within budget, but crowns look like ghost blobs). Planner picks an approach.
- Screens done (scratch/frozen/a009c8e/review/stability/v8screen): control, snow, trees, hazards (fail: prairie dogs 21/32), all (fail), snowtrees (pass).
- Merged today after review: overlay, chronicle, field-note camera, canopy clearance, night, beaver model and marsh, grounding, heading follow, calm UI, wide-view terrain. All live.

### 2026-10-07 13:20, after the v7c adoption)
- Default world is checkpoint v7c (v6b + raptors, storm cells, 6 cougars, 60 mule deer, herd spacing 1.6, raptorDogPref 0.1). Golden 2cabdb62, 5ad21d26, 904ebf61. Live at https://tallgrass.stewartgregerson.workers.dev.
- Every Track S WP (S0 to S18) is merged, and every new frame field draws (snow depth, dynamic trees, dust, grasshoppers, floods, groves, beaver ponds). Off by default and each needing its own 32-seed screen plus acceptance: snowDepth, dynamicTrees (with treeCwRecruit about 0.003), dustStorms, grasshoppers, springFloods, beavers, evolution2, greenUpShift.
- Next phase: to be planned by a fresh Opus session. Inputs: this file, MORNING.md 'Next 5', TRACK-S.md Handoff items 4 and 5, MAYBE-WANTS.md (owner's later ideas).
- Known follow-ups: real beaver model with swim pose (rabbit stand-in; swimming beavers not visible); marsh tint for shallow ponds; wolves recover in only 75% of worlds after a wipeout; coyote-hare correlation 0.38 (gate 0.4);  cougar cover and director still read static trees when dynamicTrees is on.
- Session hygiene: wait loops must match a line the tool really prints (batch.ts ends with 'done in', not 'N/N seeds done'), and never wait on a clock hour.

## Earlier state (2026-10-06 session, kept for history)
### 2026-10-06 17:48
- Main is merged with v2-sim (S0 to S18), live and checked (last deploy 16:12). Added: Add prairie dogs tool, wrapping tool rail, snow depth render (S11), planted groves and floodwater render (S17). Default world is still v6b.
- v7a acceptance finished (20 seeds): FAILED the presence gate on prairie dogs (11/20 worlds at >= 90% vs 20/20 for v6b; seed 15 lost its bison in year 948). Not adopted, shocks not run. review/stability/v7a-c9c3f5a/RESULT.md.
  If the owner overrules: shock suite from scratch/frozen/c9c3f5a: npx tsx src/headless/batch.ts --seeds 20 --ticks 720000 --sample 1500 --scenario cull70,drought,wolfwipe --threads 10 --params "{\"raptors\":1,\"stormCells\":1,\"cougar.initial\":6,\"muledeer.initial\":60,\"herdSpacingGraze\":1.6}" --out review/stability/v7a-c9c3f5a-shocks
  Diagnosis done (review/stability/v7diag/RESULT.md): raptors cause it, storms do not. New param raptorDogPref (main a6b02bb). v7b = v7a + raptorDogPref 0.25 passed its 32-seed screen (review/stability/v7b/SCREEN.md).
- v7b acceptance done: FAILED by one world (prairie dogs >= 90% present in 17/20, gate 18). review/stability/v7b-a6b02bb/RESULT.md. Not adopted.
- v7c acceptance PASSED (review/stability/v7c-a6b02bb/RESULT.md): prairie dogs 18/20 at the gate, everything else 20/20.
- RUNNING (started 23:17, at 00:00 it was 12/60 runs with ETA about 01:35; outlives the session): v7c shock suite from scratch/frozen/a6b02bb, log scratch/shocks_v7c.log, out scratch/frozen/a6b02bb/review/stability/v7c-a6b02bb-shocks/{cull70,drought,wolfwipe}/metrics.md. NEXT SESSION FIRST: read the bison 'recovered' column in each metrics.md (gate >= 80%). If all three pass, adopt v7c per TRACK-S Handoff item 3: flip raptors 1, stormCells 1, cougar.initial 6, muledeer.initial 60, herdSpacingGraze 1.6, raptorDogPref 0.1 into src/sim/params.ts defaults; re-record tools/golden.json (npx tsx src/headless/hash.ts --seed N --ticks 24000 for 3, 7, 11); make tests that assumed them off pass them explicitly; add raptors 0, stormCells 0, cougar.initial 0, muledeer.initial 0, herdSpacingGraze 0, raptorDogPref 1 to CHALLENGE_PIN in src/challenges.ts; python tools/challenge_suite.py; npm test; playtest (npx tsx tools/playtest.ts); deploy; live check; record. If any shock fails, keep v6b.
- Done since: S8 stotting from F_STOT and captions (merged), god tools v2 on the rail with grouped layout (merged), 4-row population panel fix. All deployed 17:44, live check clean.
- S13 dynamic trees render merged 19:35 (deployed). S12 dust and grasshoppers render merged 20:45. S14 beaver ponds, dams, lodges, drowned trees render merged 22:05. Remaining render follow-ups: a real beaver model with swim pose (rabbit stand-in now; check why swimming beavers do not show), marsh tint for shallow flooded cells, dynamic-tree follow-ups (grove dressing, cougar cover, director), grove shade on grass, grove shade.
- Quota rule this session (owner): nothing new at 90% weekly, finish a step in progress up to 93%, never extra usage.

## State
- `main`: v1 ends at 0873cd1. The handoff commit after it adds V2-PLAN.md, these notes, TRACK-S.md, REQUESTS-R.md and a per-session Stop hook deadline. No v2 code yet.
- Branch `v2-sim` (same commit) is for a cloud Track S session (V2-PLAN.md sections 0 and 4). The owner's credit dialog says the $250 applies automatically to cloud sessions; the owner checks the meters on the first cloud run.
- Live game: https://tallgrass.stewartgregerson.workers.dev (v1, deploy of 86eb206).
- Unmerged: `wip/drink-spots` (pond-ring fix; param drinkSpots, off by default; 0.7 is roughly level with main over 16 worlds). It is WP S10.
- Nothing is running in the background.

## State at stop (Track R stopped 2026-10-05 ~10:20 at about 82% weekly, owner's 85% ruling)
- Main ca557df, all pushed, live redeployed 10:15 (live check: no errors). Nothing uncommitted. No Track R builders running.
- Done: R0-R9, R11, R12 (incl. family tree), R14, R15, M1, camera collision, rounds 13 and 14 fixes. v6 default. Track S merged through S8 + AnimalDetail fields.
- Still running on the CPU (node workers outlive the session): v6b shock suite -> review/stability/v6b-b51d880-shocks300 (log scratch/accept_v6b_shocks.log). Post its result to REQUESTS-R next session.
- Next Track R WPs: R10 (after S12), R13 (after S17), R16 (after S14), R17 performance presets (low_golden 15.5 ms; dense herd near LOD +2 ms), M2 milestone (blind critic + Gemini video round, deploy, MORNING).
- Polish backlog: grey band at the storm cloud base in drone views; blocky thickets up close; coyote slightly pale; deer ears; camera view-rate spikes near groves; aurora +0.44 ms.
- Making-of artifact: version 13 (2026-10-07) (https://claude.ai/artifact/7jPHUFvbzTv6AUz5UCA3Mu); publish new journey images at each milestone (read the url first).
- Owner rulings today: quality over shareability (engine port allowed; staying on Three.js); per-commit bullets by category; keep the making-of artifact updated; stop near 85% weekly.
- Builders' reports sometimes name the wrong branch: use `git branch --contains <commit>`. node_modules is shared via junctions: never rm -rf a junction; restore with `npm install`.

## Start here
1. Read CLAUDE.md, then V2-PLAN.md sections 0 to 6. Your kickoff prompt gives your mode (single or two tracks) and your deadline: write the deadline to `.claude/hooks/run_until.local.txt` first.
2. S0 (species registry, golden hash and `npm test`, event serial fix) comes first. In two-track mode the cloud session does S0, and the local session starts with R0 items 1, 3, 4, 5 and 6 (item 2 waits for S0 on main).
3. Local sessions: run the quota guard at every checkpoint (V2-PLAN.md section 4.4): no new work package at 85% weekly, stop at 90%.

## Gotchas
- `Rng.fork()` draws from the main stream (rng.ts:68-70): never fork in new sim code. Seed new subsystems with their own generator, for example `new Rng(hashSeed(seed + ':storms'))`.
- The worker's event cursor drops events after the sim trims its event array (worker.ts:214-215, sim.ts:1855); S0 fixes it with an event serial.
- The engine ships ACES tone mapping although DESIGN.md says AgX (engine.ts:177); R0 decides.
- GPU A/B: one run is not a result. An A/A run showed up to 1 ms of side bias. Run A, B, B, A (two worktrees: scratch/wt and scratch/wt2, both with node_modules junctions) and average the paired differences.
- Before committing a shared file (src/main.ts, ui.ts, engine.ts, sim.ts), look at its diff: builders edit them too.
- Size a batch's timeout to at least 2.5x its expected wall time under load. Run long batches from a frozen worktree (scratch/frozen/<hash>); never edit sim files while a non-frozen batch is running.
- Never `sed -i` source files from Git Bash: it turns CRLF files into LF and the whole file shows as changed. Use the Edit tool or Python with byte-level CRLF handling.
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- With 20 batch threads running, everything else (tsc, vite, Playwright) is slow.
- TaskStop on npx jobs leaves orphan node processes; kill them by command line.
- Bash heredocs collapse double backslashes to one: write files containing backslashes with the Write tool.
- Background Bash commands are cut off at 2 hours (node children keep running). Check the log and outputs directly.
- In batch CSVs a collapsed seed has a short CSV ending in zeros; "seeds done" includes completed ones.
- Since 673802a the dev server allows the node_modules junction's real path, so worktree captures get the real fonts.
- Review reels are no longer committed (review/**/*.mp4 is gitignored); the three committed v1 reels stay in history. Review stills go in as JPEG q90.
