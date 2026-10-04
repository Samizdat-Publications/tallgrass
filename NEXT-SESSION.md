# NEXT SESSION: pick up here

**Updated:** 2026-10-04 09:58 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- **Updated 09:58.** Live: deployed 09:51 from aee1c66 (final quick round: animals, UI, water, renderer). Working tree clean apart from the riparian builder (below).
- Riparian builder running (report due 11:05): green ribbon along the creek and ponds, lighter broken mud rims; files src/render/terrain.ts and src/render/grass.ts only, nothing committed by it.
- GPU A/B of the final round (scratch/gpuab_final.log, base 132a078 vs aee1c66, 1440p): +1.1 to +1.5 ms in most views, +3.6 ms in low_golden. A/A bias run in progress (scratch/gpuab_aa.log, both sides aee1c66) to see how much of that is the bench's side bias.
- Hungry wolves acceptance (scratch/accept_hw.log, review/stability/hungrywolves-44a2bfe) at 17/20; hn2 (herdNearest 6 on cal2, scratch/hn2, compare with cal2 30/31/30/31 of 32 at 240,000 ticks) finishing.

## Next 3 steps
1. A/A result: if the final round really costs more than about 1 ms, bisect (b441795 animals, be5dc0c UI, aee1c66 water) with BASE_DIR=scratch/wt and fix or revert the culprit before the last deploy.
2. Riparian report: review the sheet against the concept image, A/B, commit, build and probe in scratch/wt, deploy by 11:30, live_check2.
3. Final: Hungry wolves and hn2 numbers into MORNING.md and DECISIONS.md; morning screenshots from the worktree (`cd scratch/wt; node ../morning_shots.mjs ../../review/morning/sunday2`), MORNING.md screenshot list, journey + artifact republish, final adversarial audit, push. Deadline 12:00.

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
- scratch/wt has a node_modules junction to the project's. Its dev server still warns that fontsource files are outside the allow list (probes fall back to system fonts), but `vite build` there bundles all the fonts (84 woff/woff2 in dist/assets), so deploys are fine.
