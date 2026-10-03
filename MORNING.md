# Good morning: Tallgrass overnight report

*(Updated 12:30 Saturday. I keep working until the deadline in `.claude/hooks/run_until.txt` (Sunday 12:00); this file is refreshed at every milestone.)*

## How to run it (one step)
Open **https://tallgrass.stewartgregerson.workers.dev** in Chrome or Edge. Click once anywhere to turn on sound. (The live build is redeployed after each verified milestone; the time of the last deploy is in the line below.)

Last deploy: 13:30 Saturday (commit 40f06ef: challenges, overlays, photo mode, UI and renderer round 3), verified: loads with no errors at 59 to 60 fps, default world and `?challenge=homecoming`. The fixes for foot sliding and the next renderer pass are still being verified and will follow.

Locally: `npm run dev`, then http://localhost:5199/.
- `?seed=anything` picks a world, `?scenario=yellowstone` picks a scenario, `?challenge=knife` starts a challenge. The menu (top right) does all three.
- Keys: Space pause, 1/2/3 speed, **N next event** (the camera flies to it), **C cinematic documentary mode**, **P photo** (saves a clean PNG of the frame), G big graph, E evolution chart, L log scale, F follow the selected animal, H hide UI, M mute, Esc back out. Click an animal to inspect it and read its life story. Left-drag orbits, right-drag pans, wheel zooms.

## What it is
**Tallgrass**: a living tallgrass prairie seen like a drone nature documentary. Grass greens and cures with the seasons; bison graze it and pronghorn browse forbs and shrubs; wolf packs hold named territories, bud new packs and fight over borders; ravens follow every kill; carcasses feed the soil. Every animal carries heritable traits (speed, size, sight, boldness, herding, coat, litter) that evolve. The sim runs in a Web Worker, deterministic from the seed. The renderer is Three.js (WebGL2) with about a million wind-blown grass blades, procedurally animated instanced animals, a golden-hour sky with a slow day cycle, seasons, snow, fire with smoke and regrowth. The UI is a "documentary broadcast" overlay: location slate, chronicle, chapter cards, population and evolution graphs, inspector with each animal's life story, god tools, map overlays. Ambient sound and SFX by ElevenLabs.

New since 09:00:
- **Challenges** (menu, top): five tuned challenges, each a named world, a time limit, an intervention budget and a goal. From easiest: *The wolves come home*, *Island of plenty*, *Knife's edge*, *Pull it back*, *The dry years*. Each was played headless both hands-off (it fails) and by a simple scripted player (it can be won within the budget). Details in `DECISIONS.md` (11:35).
- **Map overlays** (button right of the time controls): vegetation, landscape of fear, wolf territories with pack names and sizes, and a speed-gene heatmap.
- **Life story** in the inspector, with an "In memoriam" card when the animal dies. **Named worlds** in the menu (seeds with remarkable histories). **Photo mode** (P).
- **Cougars** in the "Cougar country" scenario: ambush hunters that wait in cover by the water.
- Renderer round 3: fire leaves a charred scar with smoke and greens back up; autumn dusk no longer wine-red; the square world edge is gone; late summer is honey gold rather than orange.

## What to look at first
1. Open the link and leave it at 1x for a minute: the camera opens on the biggest herd.
2. Press **C** and let the documentary director run for a few minutes.
3. Menu, Challenges, **The wolves come home**: bring wolves back to a valley that lost them. It's the gentle one.
4. Overlays, **Wolf territories**, then 10x: watch packs form, bud and fall apart.
5. Press **G**, then 100x: decades of booms and crashes. **E** for the evolution arms race.

## Screenshots (all in `review/morning/`; the 09:00 set is in `review/morning/old-0900/`)
- `1_opening_herd.png`: the opening shot, current build.
- `2_photo_mode_herd_at_pond.png`: a photo-mode frame (P), no UI.
- `3_winter_dawn.png`: early-winter dawn with snow and long tree shadows.
- `4_wolf_territories.png`: the territory overlay draped over the hills.
- `5_challenge_goal_card.png`: a challenge running in the real game (goal card, interventions left).
- `6_ui_evolution.png`: the evolution chart.
- `7_stability_20_worlds_650_years.png`: the acceptance run below, one panel per world.
- `8_trophic_cascade.png`: the trophic cascade evidence.
- Every image made tonight, in order, is in `journey/` (see `journey/INDEX.md`), as you asked.

## Stability: what is proven and what isn't (honest)
- **Acceptance run, checkpoint v4** (commit 5df7663, `review/stability/v4-5df7663/`): 20 seeds, each run until the bison passed **1,000 generations (600 to 670 sim-years)**. **Bison, wolves and ravens survived in 20 of 20 worlds** and pass every criterion (never near zero, bounded swings, a roughly 5-year cycle). **Pronghorn survived in 15 of 20 (75%), just under the 80% bar**: one world lost them in year 22, the other four after 148 to 475 years.
- **40-year check on 32 worlds:** bison, wolves and ravens 32/32, pronghorn 30/32.
- **Predators control the herd (measured):** `review/stability/cascade/trophic_cascade.png`. With no predators the herd climbs to 2,500 to 3,000 on grazed-down grass; when 12 wolves arrive, it settles at 300 to 600 and the grass recovers. The Yellowstone trophic cascade, emergent, not scripted.
- **Shock recovery, checkpoint v4** (20 seeds x 120 years, shock after a 42 to 48 year settling period; `review/stability/v4-5df7663-shocks/stability_overview.png`). The median trajectories come back from all three shocks. Per species, "recovered" means back inside its own pre-shock range:
  - **70% bison cull: passes for every species.** Bison recover in 80% of worlds (median 6 years); persistence 19/20 for each species.
  - **Two-summer drought:** bison, wolves and ravens pass (bison recover in 80%, median 9 years; wolves persist in 17/20). Pronghorn persist in 18/20 but return to range in only 75%, a narrow fail.
  - **Wolf wipeout, then 8 wolves reintroduced 18 years later:** without wolves the herd explodes to about 4,000, and it comes back down once wolves return. But the reintroduced wolves fail to establish in 3 of 20 worlds, and bison (65%) and pronghorn (70%) return to their old range in too few worlds within the run. This one fails the strict bar.
- **What the round-3 critic caught, and I agree with:** the dynamics are mostly bottom-up. Bison breed about one calf per animal per year, so the herd booms and then starves (68% of bison deaths are starvation, 20% predation), and wolves are pinned by territory space, so their numbers barely respond. The ecosystem persists, but the graphs read as jitter around a flat line rather than readable predator-prey cycles, and pronghorn boom and bust on browse. I'm running a **v5 research track** headless: slower ungulate breeding with longer lives, wolves that can respond in numbers, looser herds. v4 stays the default unless v5 beats it on persistence *and* shows lagged cycles (`tools/dynamics.py` measures both).
- Cougars (opt-in): 6 cougars survive in only 7 of 32 worlds at 40 years and cost pronghorn persistence (30/32 to 23/32), because they ride the pronghorn boom and bust. They stay opt-in until v5.

## Reviews so far
| Round | Source | Visual | Readability | Life | Ecosystem | UI | Keep watching |
|---|---|---|---|---|---|---|---|
| 1 (03:20) | blind critic, stills + charts | 5 | 3 | 5 | 2 | 6 | 3 |
| 2 (06:20) | Gemini, 99 s video | 5 | 8 | 2 | 4 | 9 | 3 |
| 3 (12:00) | blind critic, stills + 650-year charts | 6 | 4 | 5 | 4 | 7 | 5 |
| 3 (12:00) | Gemini, 108 s video | 4 | 7 | 2 | 4 | 8 | 3 |

Triage of every issue is in `REVIEWS.md`. The two biggest open items: **feet sliding** (both video reviews; root cause found and fixed at 12:15: leg cadence now follows on-screen speed, the animals builder is verifying) and the **bottom-up dynamics** above. Three builders are working on the rest now: animals (feet, predator visibility, palette, raven shadows), world (distant hills read as sand, trees, rocks, water, dusk, snow) and UI (chronicle height, graph, labels, honest speed readout).

## Decisions you might want to overrule
- **Stack:** TypeScript + Three.js instead of Godot (ADR-001 in `DECISIONS.md`): one language for sim, harness and renderer, headless GPU capture, and the URL build.
- **Time scale:** a year is 4 minutes at 1x, and biology is fast (a bison generation is well under a year) so that 1,000 generations fit in hours of compute. The critic rightly calls the breeding implausible; v5 slows it, which makes the 1,000-generation runs proportionally longer.
- **The world opens in late summer** (golden, like your concept); early summer is green.
- **Challenges** are fixed and hand-tuned, not generated; the tuning data is in `DECISIONS.md`.
- **Cougars and rabbits:** cougars are opt-in (above); rabbits stay abstract (wolves' "small game" in lean times).
- **No immigration:** wolves never wander in from outside the valley, so persistence numbers are for a closed valley.

## Blocked / cut
- **PixelLab:** no key (blank in Noclip's `.env`). Icons are hand-made SVG.
- **seked `.env`:** doesn't exist; keys came from Noclip's `.env` plus your `ELEVENLABS_API_KEY` environment variable.
- **Custom subagent types and the Stop hook:** `SETUP.cmd` hadn't been run, so I installed `.claude/` at 01:00; the custom agent types weren't registered mid-session, so I use general-purpose agents with the same prompts.
- **Gemini 2.5 Pro** is closed to new users; I used `gemini-3.1-pro-preview`.
- **Not built:** narrator voice, family tree view, river diversion and forest planting tools.

## API spend
Gemini: 3 concept images, about 40 short text and audio checks, 3 video critiques. ElevenLabs: 16 sound generations. Meshy, Sketchfab: none. Every call is in `ASSETS.md`.

## Next 5 things I'd do
1. Finish the v5 ecology screens and, if one wins, run the full acceptance and shock suite on it.
2. Land the three builders' round-3 fixes, verify, redeploy, and run review round 4 (stills and video).
3. Close the gap to your concept image: grass character on distant hills, a riparian look along the creek, water.
4. Revisit evolution trade-offs (traits hit their limits by year 100) and the raven cap.
5. Assemble the `journey/` record into a start-to-finish slideshow for a landing page.
