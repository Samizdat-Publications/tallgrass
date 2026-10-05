# NEXT SESSION: pick up here

**Updated:** 2026-10-04 afternoon, at the end of the v2 planning session. v1 is finished and live; v2 starts now. The plan is `V2-PLAN.md`.

## State
- `main`: v1 ends at 0873cd1. The handoff commit after it adds V2-PLAN.md, these notes, TRACK-S.md, REQUESTS-R.md and a per-session Stop hook deadline. No v2 code yet.
- Branch `v2-sim` (same commit) is for a cloud Track S session (V2-PLAN.md sections 0 and 4). The owner's credit dialog says the $250 applies automatically to cloud sessions; the owner checks the meters on the first cloud run.
- Live game: https://tallgrass.stewartgregerson.workers.dev (v1, deploy of 86eb206).
- Unmerged: `wip/drink-spots` (pond-ring fix; param drinkSpots, off by default; 0.7 is roughly level with main over 16 worlds). It is WP S10.
- Nothing is running in the background.

## In flight (Track R session started 2026-10-04 ~16:30 local, deadline 2026-10-08 12:00; OWNER: wrap up and stop near 85% weekly)
- Done on main (bbab3ab): R0, R1 (all 9), R2 (all 10), R3 items 2, 3, 6, 7, 8, R4, R12 (minus family tree), R14 + crane render, round 13 fixes (water, snow, stubble, snow-buried grass, idle panels), S18 wiring, thunder wired to storms. v2-sim merged through d4f956d.
- v6E acceptance PASSES (review/stability/v6E-3bb97a5): 20/20 all species, wolf CV 0.24, raven CV 0.15, lag corr 0.69. Shocks run (review/stability/v6E-3bb97a5-shocks300, log scratch/accept_v6E_shocks.log) still going; then post results to REQUESTS-R. Screen G32 running (scratch/screens/G32); post adoption table to REQUESTS-R when done.
- M1 in progress: round 14 Gemini video done (life and motion 4). Builders: time-lapse gait + hover + night rim (animals.ts); 100x shadow strobe + rain depth + black shadow slab (engine/sunshadow/post). Then: merge, blind-critic stills round, `npm run deploy` and verify live, MORNING v2 alpha section with self-audit, publish making-of artifact (see note below), journey images.
- Waiting on Track S: S5 coyotes (then R3 items 1, 4, 5, 9, 10), v6 default flip (merge it and re-run the game).
- Owner request: keep the making-of artifact https://claude.ai/artifact/7jPHUFvbzTv6AUz5UCA3Mu updated from journey/ (tools/journey.py, then tools/journey_page.py --artifact --out scratch/artifact_journey/making-of.html, publish with files = only new images {basename: journey/basename}; read the url first and read the saved file fully before republishing).
- Builders' reports sometimes name the wrong branch: use `git branch --contains <commit>`. node_modules is shared via junctions: never rm -rf a junction; restore with `npm install` (not npm ci).
- Quota at 22:15: weekly 73%.

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
