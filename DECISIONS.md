# Decisions

One line each: decision | why | alternative rejected.

## Owner rulings
- 2026-10-03 01:00: "Start with Phase 0 right away while I'm still awake. After the sweep, don't ask me anything: decide, log it in DECISIONS.md, and keep going until the stop hook lets you finish."

- 2026-10-03 01:35: "When generating an image during development, save it to a folder so we have a record of where we started and where we ended" (for a future progression video, presentation, or landing page). Implemented as `journey/` + `tools/journey.py` + `journey/INDEX.md`; applies to concept art, review stills, UI captures, and key charts.
- 2026-10-03 01:55: "That first concept image is almost exactly how I would LOVE this to turn out from a visual standpoint." -> `art/concept/00_prairie_golden_hour.jpg` is the visual north star. Every review round compares the build side by side against it.

## Log
- 01:00 Installed `_claude_setup/` into `.claude/` myself | SETUP.cmd had not been run and the contract depends on the hook and agents | waiting for the owner to run it (he is going to sleep).
- 01:05 Name: **Tallgrass** (repo `Samizdat-Publications/tallgrass`, private) | evocative, short, and it points at the tallgrass prairie, where bison and wolves are the canonical predator-prey story; picked during Phase 0 so the repo never needs a rename | Verdance, Trophic, Wildtide (more generic or more abstract).
- 01:05 Copied only GEMINI, ELEVENLABS, SKETCHFAB, MESHY keys into `.env` | least privilege; OpenAI/Anthropic keys are not needed | copying the whole file.
- 01:10 Capture path: Playwright headless shell (or `channel: 'chrome'`) with WebGL2 on D3D11 | verified real GPU rendering in headless, which sidesteps the screensaver | headed Playwright Chromium (its bundled chrome.exe will not spawn here).
- 01:15 Subagent fallback: `general-purpose` + model override + pasted role prompt | custom agent types added mid-session are not registered | skipping subagents entirely.
- 01:15 Session cron heartbeat as a backup to the Stop hook | the hook was installed after session start and may not be loaded | asking the owner to restart the session.
- 01:20 Deployed a placeholder to https://tallgrass.stewartgregerson.workers.dev | trigger the deploy approval while the owner is awake; real build replaces it later | waiting until morning.

## ADR-001: Stack = TypeScript sim core + Three.js (WebGL2) renderer + Vite, deployed to Cloudflare
**Status:** accepted 2026-10-03 01:10.
**Context:** the brief requires a renderer-independent, seed-deterministic sim that runs headless far faster than real time, a strong look on an RTX 5070 Ti, unattended overnight development, and reliable in-engine frame capture while the monitor sleeps. A URL build is a bonus.
**Decision:**
- Sim core in plain TypeScript (`src/sim/`), data-oriented (struct-of-arrays in typed arrays, uniform spatial grid), no DOM or three imports, seeded PRNG only. The same code runs in a browser Web Worker (live game) and in Node `worker_threads` (headless batch: one seed per thread, 16 threads).
- Renderer: Three.js 0.186 `WebGLRenderer` (WebGL2) with instancing, custom shaders for grass and animal gaits, shadows, GTAO, bloom, AgX. The worker posts snapshots; the renderer interpolates.
- UI: DOM/CSS overlay plus Canvas2D graphs. Build with Vite; deploy static files to `tallgrass.stewartgregerson.workers.dev`.
- Capture: Playwright headless shell, verified to render on the real GPU (ANGLE D3D11, RTX 5070 Ti).
**Why this over Godot 4:** the installed Godot is the standard build (no C#), so the sim would need GDExtension C++ or a .NET install plus Godot .NET, and GDScript is too slow for thousands of agents. Splitting the sim across languages doubles the headless tooling. Godot's higher native ceiling (volumetrics, SDFGI) is real, but tonight the risk is unattended iteration speed, and TS gives one language for sim, harness, renderer, and tests, with capture already proven. Web export from Godot would also drop to the Compatibility renderer, so the URL bonus favors three anyway.
**Why not WebGPU now:** no adapter in the verification run. WebGL2 is proven on this machine. Revisit only if a feature needs compute.
**Why not Unity / custom C++:** editor friction and licensing for CLI-only work; writing an engine.
**Consequences:** determinism is guaranteed within one JS engine (V8 in both Node and Chrome); cross-engine Math.* differences are accepted and documented. Visual ceiling is lower than native, so the art direction leans on light, color, wind, and composition rather than raw geometry.

## Simulation and balance decisions (01:30 to 03:40)
- Time scale: 1x = 10 ticks/s, 0.15 s of motion per tick (a gentle 1.5x time-lapse), year = 2400 ticks, day = 800 ticks | 1,000 bison generations must fit in minutes of headless time per seed | real-time animals (lifespans of hours).
- Wolves eat only from kills (natural deaths go to ravens and soil) | otherwise carrion from old-age deaths feeds wolves for free and they never hunt | letting wolves scavenge everything.
- Prey age structure: healthy adults in a herd are hard to kill, wolves "test" and break off, calves near a healthy mother are shielded | without it wolves crash the herd in 2 years | flat kill odds.
- Pronghorn added early as a second prey with a different niche (browse first, grass at 60%) | prey switching and niche partitioning; with a shared grass diet they drove bison extinct | delaying them to the depth phase.
- Wolf packs bud (pair plus yearlings) into free territory near prey, vacancies are filled from neighbors, remnant packs merge | single dispersers almost always died | individual dispersal.
- Inter-pack strife mortality, mostly for trespassers | the documented top natural cause of wolf death in Yellowstone; gives wolves a density ceiling | hard population cap.
- Scent-based prey detection scales with herd size | removes omniscient search, so sparse prey get a refuge (type III) | perfect knowledge of every herd in range.
- Wolves hunt small game when no herds are scented (keeps them alive, not breeding) | prevents wolf extinction after prey crashes without pinning prey | immigration from outside the valley (kept as a parameter, default off).
- Herds migrate toward greener pasture using a coarse 16 m map when their patch is spent | herds were starving beside green grass | longer local search only.
- Pronghorn fawns hide in the grass while the doe grazes nearby | the real recruitment refuge of pronghorn; fawns were being eaten to extinction | lower wolf success overall.
- Bison food value 0.42 -> 0.55 | bison were barely viable even without wolves (38% of time grazing) | more grass.
- Visual sun lingers near sunrise and sunset (GOLDEN_LINGER 0.55) and peaks lower | owner's golden-hour north star | constant-rate sun.
- World opens in late summer (season 1.8), golden; early summer is visibly greener | owner wants the golden concept look; the critic wanted seasons to read | green midsummer opening.
- 04:30 The first acceptance run (frozen f1d6e2c) is CPU-starved by builders' browsers (156 ticks/s per worker); it will stop at its 110-minute cap with ~12 seeds x ~500 generations. Keep it as a partial data point; rerun the full 20 seeds x 1000 generations on the faster live code once builders are idle | reporting partial evidence honestly beats a late full run | killing it now (loses 50 min of data).
- 04:30 Perf: herbivores think every 6 ticks (was 4), herd scan caps at 40 neighbors, vegetation updates in 16 row passes (was 8) | ~25-40% faster sim for long runs and 100x play | keeping the finer cadence.
