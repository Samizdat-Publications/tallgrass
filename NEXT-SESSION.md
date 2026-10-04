# NEXT SESSION: pick up here

**Updated:** 2026-10-04 04:25 (deadline in .claude/hooks/run_until.txt: 2026-10-04 12:00)

## State
- **Updated 07:50.** Live: deployed 07:22 from eaa58ab (water, dust, renderer round 7, Field notes, narrator, 2x calendar). Working tree clean except builder WIP.
- Default sim = v5 on the 2x calendar (calendarScale 2): acceptance 19/20 per species, shocks merged (MORNING.md Stability). Challenges pin calendarScale 1.
- Review round 7 done (review/round-07, critique.md, REVIEWS.md triage). Video reel + Gemini running (background; review/round-07-video). Add Gemini scores to REVIEWS.md and MORNING.md when it lands.
- Builders briefed 07:45, report by 10:15: renderer af57fcb936ce73c50 (winter snowpack, foliage season bug, rain visible, night readability, far blur, lawn edge), water a7556909cc4d45a61 (distant river reads as pavement, rain pond blotches, dusk lavender), UI a1f8911043eb89066 (season lines in the chronicle from population history, pack break-up phrasing, founder panel, label overlap), animals a524942be7b6fd979 (near-camera wolf glitch in still 03, species-readable top view).
- Research screens (all logged in DECISIONS.md): wA, pA, pB, evo2, rf0/rf7, L2, L3 done. L1 (prey-scaled wolves + leanLitter 0.8) finishing; L4 (bison maxLitter 1 + leanLitter 0.8) and L5 (herdEyes 1.5 + sprintCost 0.1, 16 seeds) start after L1. Landing page draft published 08:05 (https://claude.ai/artifact/JHgLkaPPUGvWmeZU5FJ3YM, source landing/). Gemini round 7 triaged; addenda sent to the animals and UI builders.
- Running: 'Hungry wolves' acceptance (review/stability/hungrywolves-44a2bfe, scratch/accept_hw.log, ETA about 12:00 to 12:40). At 11:30 report what has finished (per-seed CSVs; tools/cycle_stats.py works on partial folders) in MORNING.md, labelled partial.

## Next 3 steps
1. Gemini round 7 result -> REVIEWS.md, MORNING.md table. L1/L3 results -> DECISIONS.md, MORNING.md Next 5 things.
2. As builders report (by 10:15): check evidence, normalize line endings to HEAD, commit only their files, deploy, live check.
3. Final 10:30 to 11:45: morning screenshots (`node scratch/morning_shots.mjs review/morning/sunday`), MORNING.md screenshot list and final audit (claims vs evidence, times, numbers), journey + artifact republish, push.

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
