# NEXT SESSION: pick up here

**Updated:** 2026-10-04 04:25 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- Live: https://tallgrass.stewartgregerson.workers.dev, deployed about 01:40 from b679901.
- Committed since the deploy: snow ease fix (e82a67b), documentary camera cuts (94182a0), calendarScale param off by default (2a5caf9), challenges and scenario blurbs follow the calendar (c34836e, 88b5ae3), animal layer round 6 (ac1a420), challenge tools --params (5aea7d7).
- Uncommitted in the tree: the renderer builder round (in progress: src/render/terrain.ts and maybe more). The real game runs with it as of 03:45 (scratch/probe.png); probe again with `node scratch/probe.mjs` before committing its work.
- UI round 6 committed (948ffb6). Narrator voice lines committed (71e5aaa, public/audio/narration, tools/narration.py); the UI builder a1f8911043eb89066 is wiring them in (brief sent 04:00: event-to-line map, documentary/cinematic only, 1x/10x, 40 s spacing, ducking, menu toggle, caption in cinematic).
- Wolf-tracking screens queued to start when acceptance ends (scratch/wA, wB: calendarScale 2 + wolfPreyRef 1000 + wolfRareHalf 400 / 800, 32 seeds x 240,000 ticks). Compare with the cal2 screen (30/31/30/31; wolves CV 0.10, corr 0.16) and v6X100 (wolfPreyRef alone on v5: wolves track bison at corr 0.68 but pronghorn 20/32). Evidence for the morning report only; no time for its own acceptance before noon.
- Calendar re-scale candidate cal2 = `calendarScale: 2` (a valley year of 1,200 ticks). 100-year screen: persistence within noise of v5; bison recover in 8 years instead of 5.5; births 0.42 per bison per year. Running from frozen 2a5caf9 (started 02:45):
  - acceptance: `review/stability/cal2-2a5caf9`, log `scratch/accept_cal2.log` (seed 11 collapses completely at about year 115; that is 1 of 20 so far)
  - 300-year shocks: `review/stability/cal2-2a5caf9-shocks300`, log `scratch/shocks_cal2.log`
  - Compare with v5: acceptance bison/wolves/ravens 20/20, pronghorn 18/20; shocks recover (cull 100%, drought 80 to 85%, wolf wipeout 90 to 100%).

## Next 3 steps
1. When acceptance and shocks finish: if both hold at v5's level, adopt cal2 as the default (`calendarScale: 2` in params.ts), then re-run `tools/challenge_suite.py` (hands-off fails, scripted player wins), re-mine named seeds (`tools/mine_seeds.py`, check it passes params) and rewrite seeds.ts blurbs, update MORNING.md (time scale line, stability section), DESIGN.md/ECOLOGY.md, charts for the morning report (`tools/charts.py` reads yearTicks from each scenario's summary.json).
2. When the renderer builder reports: check stills and bench, commit. When the UI builder reports the narrator: check its Playwright evidence, commit.
3. Deploy from a clean worktree (`git worktree add --detach scratch/wt HEAD` exists; update it with `git -C scratch/wt checkout --detach <hash>`), vite build, `npx wrangler deploy --name tallgrass --assets ./dist --compatibility-date 2026-10-01`, `node scratch/live_check2.mjs`; then review round 7 (stills + video), republish the journey artifact.

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
