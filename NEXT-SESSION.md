# NEXT SESSION: pick up here

**Updated:** 2026-10-04 04:25 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- **Updated 06:40.** Live: https://tallgrass.stewartgregerson.workers.dev, deployed 06:30 from 02b5744 (verified: no errors, default pace "1 year every 2 min", challenges "4 min").
- **Default sim = checkpoint v5 on the 2x calendar (calendarScale 2), adopted 06:25 (8568594).** Acceptance 19/20 per species (review/stability/cal2-2a5caf9). Shock suite: first run cut at 3 h (my timeout) with 42/60 done; seeds 15 to 20 re-running into review/stability/cal2-2a5caf9-shocks300-b; a background job merges with scratch/merge_shocks.ts when it ends (writes metrics_merged.md, summary_merged.json, copies the CSVs). Then: fill SHOCKS_PENDING in MORNING.md, run tools/charts.py on the merged folder, commit. If the merged shocks are clearly worse than v5 (cull 100/100/100/95, drought 85/80/90/85, wolfwipe 100/100/100/95 persistence), revert calendarScale to 1 in params.ts and redeploy.
- Challenges pin calendarScale 1 (validated again 06:20: all fail hands-off, all won by the scripted player).
- Off-by-default options with evidence: droughtRefuge (modest drought gains, no visual), wolfPreyRef + wolfRareHalf (wolves track prey, pronghorn 24/31).
- Builders: renderer af57fcb936ce73c50 (asked at 06:30 to wrap up within 30 min: world edge, shadows, trees, sky, close ground, wet sheen), water a7556909cc4d45a61 (src/render/water.ts only), UI a1f8911043eb89066 (Field notes, brief in scratch/briefs/fieldnotes.md; its WIP is uncommitted in src/main.ts, src/ui/*).

## Next 3 steps
1. Merge the shocks (automatic), finish MORNING.md stability, charts, commit, push.
2. Land renderer, water and Field notes (check evidence, look at the real game with scratch/probe.mjs, commit only their files), deploy from scratch/wt (git -C scratch/wt checkout --detach <hash>; vite build; wrangler deploy; node scratch/live_check2.mjs).
3. Review round 7: tools/stills.mjs --set review to review/round-07, charts from cal2 acceptance and shocks, reel with tools/video.mjs, fresh blind critic + Gemini; triage; fix the top 3; final MORNING.md audit before 12:00.

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
