# NEXT SESSION: pick up here

**Updated:** 2026-10-04 11:06 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- **Updated 11:42.** Live: 11:19 deploy from 86eb206 (everything, including the riparian ribbon, all round 9 fixes and a 1.2 s takedown struggle). Working tree clean. Every doc current; MORNING.md audited (run steps verified from a clean clone at 10:34; challenge suite re-run 10:57, all five pass).
- Reviews: stills critic 7, 5, 6, 5, 7, 6 in both round 9 and round 12 (plateau); Gemini video 7, 6, 3, 8, 9, 5 (round 10) then 6, 7, 2, 5, 8, 3 (round 11) on nearly the same build (Gemini swings 2 to 3 points between runs). All triaged in REVIEWS.md. Charts: population medians now end where fewer than 5 worlds remain (11:38).
- Frame cost tonight: final quick round about +0.5 ms, riparian about +0.35 ms (+0.8 low view) at 1440p, paired A/B.
- Nothing running in the background. scratch/wt is at 359f512; scratch/wt2 is a second worktree for paired GPU A/B.

## Next 3 steps (for the next session)
1. Close-range animation, the one complaint every Gemini round repeats: the prey now struggles for 1.2 s but the wolves beside it stand still (Gemini round 11): give them lunges, bites and tugs during the takedown; check foot planting on the hunt close-ups frame by frame; vary raven flapping.
2. The research items in MORNING.md Next 5: pronghorn under prey-scaled wolves (a fawning brake), per-species evolution costs plus a bison single-calf cap, personal space while grazing (herd shape).
3. Drought ground that goes pale straw instead of mauve, and the bare apron on the shaded side of ponds (terrain.ts).

## Gotchas
- Three review reels (185 MB) and hundreds of review PNGs are committed; local .git is about 700 MB of mostly loose objects. Ask the owner before committing more reels.
- **GPU A/B: one run is not a result.** An A/A run (same code both sides) showed up to 1 ms of side bias. Run each comparison twice with the builds swapped between BASE_DIR and the cwd tree (two worktrees: scratch/wt and scratch/wt2, both with node_modules junctions) and halve the difference.
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
- scratch/wt and scratch/wt2 have node_modules junctions to the project's. Since 673802a the dev server allows the junction's real path, so worktree captures get the real fonts (before that, some weights fell back to system fonts; `vite build` always bundled them).
