# NEXT SESSION: pick up here

**Updated:** 2026-10-04 04:25 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- **Updated 09:15.** Live: deployed 09:01 from dcf4809 (all builder rounds through round 8 / animals round 7 / water round 2 / UI round 8). Working tree clean. Worktree scratch/wt has a node_modules junction now, so fonts work there.
- Default sim = v5 on the 2x calendar; evidence in MORNING.md Stability. Opt-in scenario 'Hungry wolves' (L1 settings): its 1,000-generation acceptance is running (scratch/accept_hw.log, ETA about 10:00); first 6 finished worlds lost pronghorn (years 112 to 373); blurb already says so.
- Review round 8 running: blind critic on review/round-08 (stills + charts), Gemini on review/round-08-video/reel.mp4 (recording). All builders idle (their rounds are committed).

## Next 3 steps
1. Round 8 critiques: save critique.md and Gemini md, triage in REVIEWS.md, add to the MORNING.md table; brief builders on quick fixes only if they fit before 11:15 (deploy by 11:30).
2. Hungry wolves acceptance: when done, charts + summary in MORNING.md and DECISIONS.md.
3. Final: morning screenshots from the worktree (`cd scratch/wt; node ../morning_shots.mjs ../../review/morning/sunday2`), update the MORNING.md screenshot list, journey + artifact republish (making-of and landing page hero), final adversarial audit of MORNING.md, push. Deadline 12:00.

## Gotchas
- **Before committing a shared file (src/main.ts, ui.ts, engine.ts), look at its diff: builders edit them too.** At 05:50 a commit swept in half-finished Field notes wiring; fixed by rebuilding the index entry from the previous blob.
- **Size a batch's `timeout` to at least 2.5x its expected wall time under load.** The cal2 shock suite was cut at 3 h with 42/60 seeds done; seeds 15 to 20 re-run into `review/stability/cal2-2a5caf9-shocks300-b`, merged with `npx tsx scratch/merge_shocks.ts <first> <rerun> 2`.
- **Never `sed -i` source files from Git Bash: it turns CRLF files into LF and the whole file shows as changed.** Use the Edit tool or Python with byte-level CRLF handling.
- 16-seed comparisons have about +/-10% noise; use 32 seeds for decisions.
- Never edit sim files while a non-frozen batch is running (the cal2 runs use scratch/frozen/2a5caf9, so live src is safe).
- With 20 batch threads running, everything else (tsc, vite, Playwright) is slow: probes take minutes.
- TaskStop on npx jobs leaves orphan node processes; kill by command line.
- Bash heredocs here collapse double backslashes to one: write files containing backslashes with the Write tool.
- Background Bash commands are cut off at 2 hours (node children keep running). Check the log/outputs directly.
- In batch CSVs a collapsed seed has a short CSV ending in zeros; "seeds done" includes completed ones.
- The clean worktree at scratch/wt has no node_modules of its own (resolves from the project root) and Vite there refuses the fontsource files (fonts fall back): fine for previews and builds? Check fonts in the built dist before deploying from it.
