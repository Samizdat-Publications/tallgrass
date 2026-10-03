# NEXT SESSION: pick up here

**Updated:** 2026-10-03 04:15

## State
- Game runs: `npm run dev` -> http://localhost:5199/. Entry `src/main.ts` (worker + Engine + GrassField + AnimalLayer + GameUI + Director). Hooks for capture: `__engine, __cam, __speed, __step, __ui, __select, __followId, __find, __timeOfDay, __focusHerd, __snap, __director`.
- `tools/stills.mjs --out <dir>` shoots the scripted review set (10 stills) from the real game. `tools/capture.mjs` for single shots/video.
- **Stability checkpoint v1 = commit f1d6e2c.** 16 seeds x 40 yr: wolves 16/16, bison 15/16, ravens 15/16, pronghorn 14/16 (`scratch/long12`).
- **Acceptance run in progress** from a frozen copy (`scratch/frozen/f1d6e2c/src`): 20 seeds to 1000 bison generations, out `review/stability/v1-f1d6e2c`, log `scratch/accept_v1.log`, capped at 110 min (started 03:40). The shock run (cull70, drought, wolfwipe) was stopped because of CPU contention; rerun it after the baseline finishes with more threads:
  `npx tsx scratch/frozen/f1d6e2c/src/headless/batch.ts --seeds 20 --ticks 144000 --sample 1200 --threads 14 --out review/stability/v1-f1d6e2c-shocks --scenario cull70,drought,wolfwipe`
- Live code has since diverged from f1d6e2c: perf changes (herbivore think every 6 ticks, herd scan cap 40, vegetation STRIDE 16) and the director. Re-verify balance with a 16-seed 40-year batch before the next acceptance run.
- Builders working on round-1 fixes (resumable via SendMessage): renderer af57fcb936ce73c50 (night, haze, trees, terrain seasons, water, occlusion), grass a7043abcf9209d6f5 (stripes, flowers, seasons), animals a9e03f187914c14b8 (readability, markers, carcass sites, dust, sick tint), audio adc64e8b7f6128445 (ElevenLabs SFX + AudioDirector). UI builder a1f8911043eb89066 is done.
- KNOWN: at 04:05 the scene rendered black even without the director: a builder file mid-edit. Re-test `cin` director capture after the builders report.

## Next 3 steps
1. When builders report: review their shots, run `tools/stills.mjs`, verify the scene renders and the director cuts between shots (cinematic: press C), commit.
2. Wire the AudioDirector into main.ts (the audio builder's report says how).
3. After the baseline acceptance run: rerun the shocks, make charts (`tools/charts.py`), write the stability section of MORNING.md, then review round 2 (fresh critic) and a Gemini video round.

## Gotchas
- `TaskStop` on a background npx job leaves orphan node children: check `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` for command lines containing ecosystem-sim and stop them.
- CPU contention: 12 sim threads plus 4 builders capturing makes everything slow; capture.mjs needs `--timeout 240000` under load.
- Fog is post-process; NaN anywhere blacks the frame via bloom.
- Don't edit the frozen copy; don't change sim files while a non-frozen batch runs.
