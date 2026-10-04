# NEXT SESSION: pick up here

**Updated:** 2026-10-04 10:35 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- **Updated 10:35.** Live: 09:51 deploy from aee1c66. Committed since, not yet deployed: rain streaks fade in the map view, frozen-pond snow rim, smaller chapter cards (bc62b0f to 2d8fd02), docs.
- Riparian builder running (report due 11:05): green ribbon along the creek and ponds, lighter broken mud rims; its uncommitted edits are in src/render/terrain.ts and src/render/grass.ts.
- Round 9 critique saved and triaged (REVIEWS.md); scores 7, 5, 6, 5, 7, 6.
- Hungry wolves acceptance done (19/20 bison, wolves, ravens; pronghorn 0/20). hn2 done (herdNearest 6 holds 31/32 on cal2 but shows no visible loosening; not adopted; its acceptance was stopped at 10:16).
- Final round GPU cost: about +0.5 ms per frame at 1440p (paired, side-swapped A/B; logs scratch/gpuab_round_a.log and _b.log).

## Next 3 steps
1. Riparian report: check its sheet against the concept image, paired A/B if it claims more than 0.3 ms, commit its two files, build and probe in scratch/wt, deploy, live_check2, MORNING deploy line.
2. Morning screenshots from the deployed commit (`cd scratch/wt; node ../morning_shots.mjs ../../review/morning/final`), update the MORNING.md screenshot list, journey + making-of artifact republish (map only the new files).
3. Final adversarial audit of MORNING.md (times, numbers, links), push. Deadline 12:00.

## Gotchas
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
- scratch/wt has a node_modules junction to the project's. Its dev server still warns that fontsource files are outside the allow list (probes fall back to system fonts), but `vite build` there bundles all the fonts (84 woff/woff2 in dist/assets), so deploys are fine.
