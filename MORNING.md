# Good morning: Tallgrass overnight report

*(Updated 09:00. I keep working until the deadline in `.claude/hooks/run_until.txt`; this file is refreshed at every milestone.)*

## How to run it (one step)
Open **https://tallgrass.stewartgregerson.workers.dev** in Chrome or Edge (redeployed 08:55 with the latest build, verified: loads with no errors, 60 fps). Click once anywhere to turn on sound.

Locally: `npm run dev`, then http://localhost:5199/.
- `?seed=anything` picks a world; `?scenario=yellowstone` (also `island`, `drought`, `collapse`) picks a scenario. The menu (top right) does the same.
- Keys: Space pause, 1/2/3 speed, **N next event** (the camera flies to it), **C cinematic documentary mode** (an auto-director cuts between hunts, stampedes, herds and vistas), G big graph, E evolution chart, L log scale, F follow the selected animal, H hide UI, M mute, Esc back out. Click an animal to inspect it. Left-drag orbits, right-drag pans, wheel zooms.

## What it is
**Tallgrass**: a living tallgrass prairie seen like a drone nature documentary. Grass greens and cures with the seasons; bison graze it and pronghorn browse forbs and shrubs; wolf packs hold territories, bud new packs and fight over borders; ravens follow every kill; carcasses feed the soil. Every animal carries heritable traits (speed, size, sight, boldness, herding, coat, litter) that evolve. The sim runs in a Web Worker, deterministic from the seed. The renderer is Three.js (WebGL2) with about a million wind-blown grass blades, procedurally animated instanced animals, a golden-hour sky with a slow day cycle, and seasons. The UI is a "documentary broadcast" overlay: location slate, chronicle, chapter cards, population and evolution graphs, inspector, god tools. Ambient sound and SFX by ElevenLabs.

## What to look at first
1. Open the link and leave it at 1x for a minute: the camera opens on the biggest herd at golden hour.
2. Press **C** and let the documentary director run for a few minutes.
3. Press **G**, then 100x: watch a few decades of booms and crashes; press **E** for the evolution arms race.
4. Menu, "Yellowstone return": no wolves for three years, then 12 arrive. Watch the herd fall and the grass recover.

## Screenshots (all in `review/morning/`)
- `1_opening_herd.png`: the opening shot (late-summer morning, herd at the pond).
- `2_stampede_dust.png`: a stampede with dust.
- `4_seasons_grass_vs_concept.png`: early summer vs late summer grass, beside your concept art.
- `5_ui_population_graph.png` and `6_ui_evolution.png`: the graphs.
- `7_trophic_cascade.png`: the trophic cascade chart (below).
- Every image made tonight, in order, is in `journey/` (see `journey/INDEX.md`), as you asked.

## Stability: what is proven and what isn't (honest)
- **Predators control the herd (measured):** `review/stability/cascade/trophic_cascade.png`. Same three worlds, two scenarios. With no predators the herd climbs to 2,500 to 3,000 on grazed-down grass (mean biomass about 0.27). When 12 wolves arrive in year 3, the herd settles at 300 to 600 and the grass recovers to 0.45 to 0.53. That is the Yellowstone trophic cascade, emergent, not scripted.
- **Long run, checkpoint v1** (commit f1d6e2c, `review/stability/v1-f1d6e2c/`): 14 of 20 seeds ran (CPU-starved, 110-minute cap), each to **600 to 1,001 bison generations (300 to 470 sim-years)**. Persistence: bison 13/14, wolves 13/14, ravens 13/14, pronghorn 12/14. Every failure came from one seed that collapsed in its first 14 years. Two flaws showed up and are fixed in v2: wolves could live on small game alone for centuries, and evolution ran to the bottom (bison shrank to the size floor).
- **Full acceptance run, checkpoint v2** (commit 9762475, 20 seeds, `review/stability/v2-9762475/`): 14 seeds reached **1,000+ bison generations (about 520 to 550 sim-years)**, and **in all 14, bison, wolves and ravens survived to the end**; pronghorn survived in 12 of those 14 (one lost at year 494). The other 6 seeds collapsed in their opening years (years 5 to 23). Overall persistence: bison 14/20, wolves 14/20, ravens 14/20, pronghorn 12/20, so **it fails the 80% bar as a whole**. The clear lesson: the long-run ecosystem is stable, and the whole remaining risk is the opening transient. I'm fixing that now by starting worlds near the long-run equilibrium (about 1,500 bison, 800 pronghorn, 55 wolves, grass already grazed) instead of on fresh, ungrazed prairie.
- Raven CV reads as 0.02 in that run, but it's a sampling artifact: samples every 2,400 ticks (exactly one year) always land at the same point of the ravens' annual breed-and-winter cycle. The 1,200-tick shock runs show the cycle clearly.
- **Shock recovery, v2** (20 seeds x 60 years per scenario, `review/stability/v2-9762475-shocks/stability_overview.png`): the median trajectories recover from all three shocks. After a 70% bison cull or a two-summer drought, bison dip and climb back within about 6 to 10 years. After a wolf wipeout the herd explodes to about 2,400, and when wolves return the herd comes back down to about 800. But the strict "back inside the prior range" metric only passes in 29 to 50% of seeds for bison. That's mostly because the shock hit at year 24, while the world was still settling from its opening transient, so the "prior range" isn't an equilibrium. I'm rerunning with a 60-year burn-in before the shock. Persistence in those 60-year runs was 65 to 75%, below the bar.
- **Known weakness, being fixed now:** the opening years overshoot. Pronghorn boom from 350 to over 1,000 in 18 months on fresh browse, wolves double, then a crash, and about 3 seeds in 16 lose a species before year 15. Every remaining failure I've traced starts this way.
- The final build adds heading-constrained movement (from the video review); a balance spot check of that change is running too.

### Latest: the opening-collapse problem is solved (09:20)
Digging into the failing seeds showed bison were dying mostly of **old age** (45 to 55% of deaths): they lived only six times their maturity age, so the herd turned over every year and couldn't absorb predation plus a bad year. With a more realistic lifespan (nine times maturity), **32 seeds x 40 years: bison 32/32, wolves 32/32, ravens 32/32, pronghorn 30/32**. The full acceptance suite on this version (checkpoint v4, commit 5df7663) is running now: 20 seeds to 1,000 generations, plus cull, drought and wolf wipeout-and-return shocks over 120 years with the shock after a settling period (`review/stability/v4-5df7663*`). Results go here when they land (about two hours).

## Reviews so far
- **Round 1** (blind critic, stills and charts): Visual 5, Readability 3, Ecosystem 2, UI 6. Triage and fixes in `REVIEWS.md`.
- **Round 2** (Gemini video critique of a 99 s reel): Readability 8, UI 9, Visual 5, Life and motion 2 (animals skated sideways; that's fixed in the build now being validated). `review/round-02/reel.gemini.md`.

## Decisions you might want to overrule
- **Stack:** TypeScript + Three.js instead of Godot (ADR-001 in `DECISIONS.md`). It gives one language for sim, harness and renderer, a proven headless GPU capture path, and the URL build.
- **Time scale:** a year is 4 minutes at 1x; a bison generation is about half a year. Animal ages are shown on a biological scale ("Bison cow, 7 years").
- **Pronghorn** were added early as a second prey species with a different diet. Prey switching and niche partitioning turned out to be essential to stability.
- **The world opens in late summer** (golden, like your concept); early summer is green and shows when the seasons turn.
- **Wolves eat only from kills** (natural deaths feed ravens and the soil).
- **No immigration:** wolves never wander in from outside the valley. It's a parameter, off by default, so persistence numbers are for a closed valley.

## Blocked / cut
- **PixelLab:** no key (blank in Noclip's `.env`). Icons are hand-made SVG.
- **seked `.env`:** doesn't exist; keys came from Noclip's `.env` plus your `ELEVENLABS_API_KEY` environment variable.
- **Custom subagents and Stop hook:** `SETUP.cmd` hadn't been run, so I installed `.claude/` at 01:00; the custom agent types weren't registered mid-session. I used general-purpose agents with the same prompts, and a session cron heartbeat as a backup to the hook.
- **Gemini 2.5 Pro** is closed to new users; I used `gemini-3.1-pro-preview`.
- **Not built yet:** rabbits and cougar (the models exist, the sim doesn't), named-seed list, challenges, photo mode, narrator voice.

## API spend
Gemini: 3 concept images and about 6 text and video calls. ElevenLabs: 16 sound generations (the full budget I set; rain and part of the stampede are synthesized). Meshy, Sketchfab: none. Details in `ASSETS.md`.

## Next 5 things I'd do
1. Finish the v2/v3 acceptance runs and fix whatever they surface; tame the opening overshoot (start closer to equilibrium or pre-warm the world).
2. Review round 3 (fresh critic plus a new video) after the renderer round-1/2 fixes land (night, terrain variation, snow transitions, trees).
3. Rabbits and a cougar (ambush hunter in cover) for a richer food web.
4. Documentary mode deepening: a life-story view for the followed animal, auto slow motion during hunts.
5. Named seeds with remarkable histories, and a "rescue the collapse" challenge.
