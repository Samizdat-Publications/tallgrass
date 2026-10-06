# NEXT SESSION: pick up here

**Updated:** 2026-10-04 afternoon, at the end of the v2 planning session. v1 is finished and live; v2 starts now. The plan is `V2-PLAN.md`.

## State now (2026-10-06 15:25, single-mode lead session, weekly 85%)
- Phase 1 done: origin/v2-sim (S0 to S18) merged into main, tests and build green, GPU playtest clean (tools/playtest.ts), deployed 15:15, live check clean. Added the Add prairie dogs tool and the wrapping tool rail.
- Running: v7a acceptance, last 6 seeds (15 to 20), from frozen worktree scratch/frozen/c9c3f5a, log scratch/accept_v7a_rest6.log, output scratch/frozen/c9c3f5a/review/stability/v7a-c9c3f5a-rest6/baseline (inside the worktree). Seeds 1 to 14 are in review/stability/v7a-c9c3f5a-partial14/baseline.
- Next: copy all 20 CSVs to review/stability/v7a-c9c3f5a/baseline, run python tools/dynamics.py on it; gates: core species in at least 18 of 20, bison at least 19 of 20, wolf CV at least 0.2, ravens CV at least 0.1. If it passes, run the shock suite from the same worktree (--seeds 20 --ticks 720000 --sample 1500 --scenario cull70,drought,wolfwipe, same params, --threads 10); bison must recover at least 80% after each shock. Then adopt v7a per TRACK-S.md Handoff item 3.
- After that (quota permitting): TRACK-S Handoff item 2, render the new frame fields: S11 snow first, then S17 groves and flood, then S8 F_STOT and palette entries.
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
- Making-of artifact: version 12 (https://claude.ai/artifact/7jPHUFvbzTv6AUz5UCA3Mu); publish new journey images at each milestone (read the url first).
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
