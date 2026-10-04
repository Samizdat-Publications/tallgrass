# Good morning: Tallgrass overnight report

*(Updated 02:20 Sunday. I keep working until the deadline in `.claude/hooks/run_until.txt` (Sunday 12:00); this file is refreshed at every milestone.)*

## How to run it (one step)
Open **https://tallgrass.stewartgregerson.workers.dev** in Chrome or Edge. Click once anywhere to turn on sound. (The live build is redeployed after each verified milestone; the time of the last deploy is in the line below.)

Last deploy: about 01:40 Sunday (commit b679901: everything through renderer, animal and UI round 6, the documentary camera, death sounds), verified: loads with no errors at 60 fps, default world and `?challenge=homecoming`.

Locally: `npm run dev`, then http://localhost:5199/.
- `?seed=anything` picks a world, `?scenario=yellowstone` picks a scenario, `?challenge=herd` starts a challenge. The menu (top right) does all three.
- Performance, measured on this machine's RTX 5070 Ti Laptop GPU (01:55 Sunday, forced renders with a GPU sync): **1080p 7.7 to 11.5 ms per frame, 1440p 10 to 15.4 ms**, so 60 fps with headroom at both. On bigger or high-DPI screens the game lowers its render resolution a little if it has to, to hold 60 fps.
- Keys: Space pause, 1/2/3 speed, **N next event** (the camera flies to it), **C cinematic documentary mode**, **P photo** (saves a clean PNG of the frame), G big graph, E evolution chart, L log scale, F follow the selected animal, H hide UI, M mute, Esc back out. Click an animal to inspect it and read its life story. Left-drag orbits, right-drag pans, wheel zooms.

## What it is
**Tallgrass**: a living tallgrass prairie seen like a drone nature documentary. Grass greens and cures with the seasons; bison graze it and pronghorn browse forbs and shrubs; wolf packs hold named territories, bud new packs and fight over borders; ravens follow every kill; carcasses feed the soil. Every animal carries heritable traits (speed, size, sight, boldness, herding, coat, litter) that evolve. The sim runs in a Web Worker, deterministic from the seed. The renderer is Three.js (WebGL2) with about a million wind-blown grass blades, procedurally animated instanced animals, a golden-hour sky with a slow day cycle, seasons, snow, fire with smoke and regrowth. The UI is a "documentary broadcast" overlay: location slate, chronicle, chapter cards, population and evolution graphs, inspector with each animal's life story, god tools, map overlays. Ambient sound and SFX by ElevenLabs.

New since Saturday evening (overnight into Sunday):
- **Animals you can read from the drone:** wolves keep a cool slate coat and a faint glint at distance, bison stay warm brown at dusk instead of turning into black stains, pronghorn read tan, and the species separate from straight above. Bodies bound and pitch with the slope more strongly at distance, so movement reads as effort even when legs are a few pixels tall. The selection ring is a crisp thin ring. Carcasses show a pale belly and a fresh-kill stain.
- **Documentary camera:** it now cuts to a subject across the valley instead of flying the camera through the trees, and near moves ease in and out.
- **UI:** the chronicle is newest first everywhere, with a season tag on each entry and an "N earlier entries" pager. Chapter cards never contradict the header. **H** (or the eye button by the menu) gives an ambient view with no interface for a second monitor.
- **Snow bug fixed:** after a fast-forward on a slow frame rate, snow could linger into early summer. Weather now tracks the calendar at any frame rate.

Earlier, Saturday (since 09:00):
- **Challenges** (menu, top): five tuned challenges, each a named world, a time limit, an intervention budget and a goal. From easiest: *The wolves come home*, *Island of plenty*, *Save the herd*, *Pull it back*, *The dry years*. Each was played headless on the current sim both hands-off (it fails) and by a simple scripted player (it can be won within the budget); `tools/challenge_suite.py` re-checks all five in one command. Details in `DECISIONS.md` (11:35 and 17:20).
- **Map overlays** (button right of the time controls): vegetation, landscape of fear, wolf territories with pack names and sizes, and a speed-gene heatmap.
- **Life story** in the inspector, with an "In memoriam" card when the animal dies. **Named worlds** in the menu (seeds with remarkable histories). **Photo mode** (P).
- **Cougars** in the "Cougar country" scenario: ambush hunters that wait in cover by the water.
- Renderer round 3: fire leaves a charred scar with smoke and greens back up; autumn dusk no longer wine-red; the square world edge is gone; late summer is honey gold rather than orange.
- Round 4 (Saturday afternoon and evening):
  - **Animals:**
    - Feet plant on the ground (measured slip fell from 47 to 67% of body speed to 8 to 12%).
    - Running animals visibly bound at drone distance, and turns are smooth with banking.
    - A kill shows a lunge and the prey stumbling over.
    - Stampedes kick up dust.
    - Ravens cast no shadows in flight.
    - Bison are chocolate, and pronghorn tan and white.
  - **World:**
    - Distant hills read as combed grass with green draws instead of sand.
    - Trees and rocks are rebuilt.
    - Water is darker, with reflections.
    - Snow follows the slopes.
  - **UI:**
    - The big graph shows one row per species.
    - The chronicle groups by year.
    - Chapter cards sit in the lower third.
    - Founding animals have a backstory.
  - **Camera:** it drifts slowly during fast-forward.

## What to look at first
1. Open the link and leave it alone: the camera opens on the biggest herd, and after 25 seconds without input the **documentary camera** takes over and films hunts, kills, herds and vistas (a small chip says so; any mouse or key input, or Take over, gives you the camera back).
2. Press **C** for the full cinematic version (interface hidden, letterbox).
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
- `7_stability_20_worlds_v5.png`: the v5 acceptance run below, one panel per world.
- `8_trophic_cascade.png`: the trophic cascade evidence.
- Every image made tonight, in order, is in `journey/` (see `journey/INDEX.md`), as you asked. **Browse them as a page with a slideshow: https://claude.ai/artifact/7jPHUFvbzTv6AUz5UCA3Mu** (private to you; republished as new images are added). Locally: open `journey/index.html`.

## Stability: what is proven and what isn't (honest)
The default sim is now **checkpoint v5** (since 16:45 Saturday). v4 results are kept below for comparison.

- **v5 acceptance** (`review/stability/v5P-4875c69/`): 20 seeds, each run until the bison passed **1,000 generations (720 to 750 sim-years)**. **Bison, wolves and ravens survived in 20 of 20 worlds** and pass every criterion. **Pronghorn survived in 18 of 20 (90%)**, above the brief's 80% bar (v4: 75%). One criterion still flags pronghorn: a 2.5-year stretch near zero in one world, against a 2-year limit.
- **What changed from v4 to v5, and why:** the round-3 critic was right that v4's dynamics were bottom-up. Bison bore about one calf per animal per year, so the herd boomed and then starved (47 to 65% of bison deaths were starvation), and wolves barely moved. v5 changes four things:
  - Slower breeding and longer lives for both grazers.
  - Wolves spread their hunting by prey abundance, so a crashed species gets a refuge.
  - Founding cows are staggered, so the first calves don't all arrive in one pulse.
  - Lean small game, so wolves can't coast through a prey crash.
  
  At 40 years, starvation falls to 25% of bison deaths, predation rises to 37%, and year-to-year swings drop from 21% to 13%. Details and every rejected variant (about 20 screens of 32 worlds each) are in `DECISIONS.md`.
- **v5 shocks** (20 seeds x 120 years; `review/stability/v5P-4875c69-shocks/stability_overview.png`):
  - Every species persists in 90 to 100% of worlds through a 70% cull, a two-summer drought, and a wolf wipeout followed by reintroduction.
  - Pronghorn recover in 90 to 95% of worlds after a cull or drought.
  - Reintroduced wolves re-establish in 20 of 20 worlds (v4: 17 of 20).
  - The strict "bison back inside their pre-shock range" metric fails (30 to 65%). The chart shows why: the herds don't fall short, they **overshoot and settle higher** (about 450 before, about 1,000 after). The bison are still evolving bigger and faster through their first century, so a shock at year 48 lands mid-way through that climb.
- **The fair version: v5 shocks after evolution settles** (20 seeds x 300 years, shock at year 105 to 120; `review/stability/v5-shocks300/stability_overview.png`):
  - **70% cull:** every species passes, and **100% of worlds return to their pre-shock range** (bison in a median 24 years).
  - **Two-summer drought:** every species passes (80 to 85% of worlds recover; bison in a median 10 years).
  - **Wolf wipeout, then reintroduction 45 years later:** bison recover in 90% of worlds, pronghorn in 100%, ravens in 100%, and the reintroduced wolves re-establish in 95%. The tool still flags wolves and pronghorn on this one, but both flags are artifacts of the test design: the 45 deliberately wolf-free years count as wolves being "near zero", and the predator-free pronghorn boom trips the max-over-mean limit.
- **Predators control the herd (measured):** `review/stability/cascade/trophic_cascade.png`. With no predators the herd climbs to 2,500 to 3,000 on grazed-down grass; when 12 wolves arrive, it settles far lower and the grass recovers. The Yellowstone trophic cascade, emergent, not scripted.
- **v4, for comparison** (`review/stability/v4-5df7663*`): 1,000 generations, bison, wolves and ravens 20/20, pronghorn 15/20. Shocks: the cull passed for every species; the drought passed except pronghorn recovery; the wolf wipeout failed strict recovery.
- **What I tried next and did not ship (v6, Saturday evening):** about 20 more screens chasing the critics' "wolves should rise and fall a few years behind their prey". Prey-scaled wolf capacity does exactly that, lifting wolf-prey correlation from 0.29 to 0.58 at a one-year lag. Adding litter caps and individual herd protection stops the evolutionary drift and keeps herding alive. At 40 and 100 years it looked like a clear win (100 years: bison 32, wolves 31, ravens 32, pronghorn 28 of 32). But the 1,000-generation acceptance lost pronghorn in **every** finished world, between years 117 and 390: wolves that follow the pronghorn booms make each crash deeper. In this model a faster predator response trades directly against prey persistence, so **v5 stays the default**. The mechanisms are in the code, off by default, with every result in `DECISIONS.md` (18:10 to 20:35).
- **Also rejected:** a spring birth pulse (calves only in spring). It collapsed everything, because bison live only about 3.3 valley-years in the compressed calendar, so one calf a year can't replace them; a real birth pulse needs the calendar re-scaled. Slow climate cycles also cost persistence.
- Cougars (opt-in "Cougar country"): under v5 they starved within 2 to 16 years in all 32 worlds (about 0.2 kills of their own per cougar-year; the valley also holds only about four cougar ranges). Retuned at 22:40 with surer ambushes, a leaner metabolism, and a pair of dispersers wandering in when the valley empties of cats. Cougars are now present 85% of the time over 40 years (13 of 16 worlds at year 40), and the other species are unaffected.

## Reviews so far
| Round | Source | Visual | Readability | Life | Ecosystem | UI | Keep watching |
|---|---|---|---|---|---|---|---|
| 1 (03:20) | blind critic, stills + charts | 5 | 3 | 5 | 2 | 6 | 3 |
| 2 (06:20) | Gemini, 99 s video | 5 | 8 | 2 | 4 | 9 | 3 |
| 3 (12:00) | blind critic, stills + 650-year charts | 6 | 4 | 5 | 4 | 7 | 5 |
| 3 (12:00) | Gemini, 108 s video | 4 | 7 | 2 | 4 | 8 | 3 |
| 4 (18:30) | blind critic, stills + v5 charts | 6 | 4 | 5 | 5 | 6 | 5 |
| 4 (18:30) | Gemini, 108 s video | 4 | 8 | 1 | 6 | 9 | 3 |
| 5 (23:10) | blind critic, stills + v5 charts | 6 | 4 | 5 | 5 | 7 | 5 |
| 5 (23:10) | Gemini, video | 5 | 8 | 3 | 6 | 9 | 5 |
| 6 (01:40) | blind critic, stills + v5 charts | 7 | 5 | 7 | 4 | 7 | 6 |
| 6 (01:40) | Gemini, video | 4 | 6 | 2 | 7 | 9 | 5 |

Every issue and its triage is in `REVIEWS.md`.
- Round 4's verdict: animals were illegible and looked motionless at drone distance. In the drone shots a wolf is about 20 px tall, so planted feet can't read. The animal work since then targets exactly that, with whole-body motion scaled to camera distance, larger minimum sizes and a kill lunge.
- Rounds 5 and 6: the stills critic's visual, life and keep-watching scores rose (visual 6 to 7, life 5 to 7). Its top complaint, three rounds running, is that population swings are too fast for "years": a bison lives about 3.3 valley-years, so a crash heals in about 5 years. That is the calendar trade-off described under "Decisions you might want to overrule", and I'm screening a fix for it (below). Gemini's top complaint is gait and weight in wide shots. A frame-by-frame check of its clip found a 70 to 100 m wide shot where legs are 2 to 3 px tall, so the fix is distance cues (body bob, slope pitch), not foot IK.
- Round 6 also found a real bug: deep snow in early summer after fast-forward at a low frame rate. Fixed (e82a67b).

## Decisions you might want to overrule
- **Stack:** TypeScript + Three.js instead of Godot (ADR-001 in `DECISIONS.md`): one language for sim, harness and renderer, headless GPU capture, and the URL build.
- **Time scale:** a year is 4 minutes at 1x, and biology is fast so that 1,000 generations fit in hours of compute: a v5 bison lives about 3.3 valley-years. That is why a realistic spring birth pulse failed (see Stability). Re-scaling the calendar would be the deeper fix and a bigger job.
- **The world opens in late summer** (golden, like your concept); early summer is green.
- **Challenges** are fixed and hand-tuned, not generated; the tuning data is in `DECISIONS.md`.
- **Cougars and rabbits:** cougars are opt-in, and their scenario lets dispersers wander in from outside (the valley is too small to hold a cat population on its own); rabbits stay abstract (wolves' "small game" in lean times).
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
1. **Wolves that follow their prey.** Even on the slower calendar, wolf numbers stay nearly flat (annual CV about 0.1): the packs are limited by territory, and pronghorn and small game carry them through a bison crash, so in a few worlds they grind the herd down (seed 11). Prey-scaled pack sizes fix the tracking (wolves follow bison at correlation 0.68), but on their own they cost pronghorn. Tonight's screens pair them with a stronger refuge for rare prey; next is a full acceptance of the best pairing.
2. **Evolution that keeps running.** Bison speed and size climb to their limits within a century, because speed costs almost nothing and size pays for itself, and herding fades. The fix is a real sprint cost, wider limits with steep costs near them, and a stronger many-eyes payoff for herding (diagnosis in `DECISIONS.md`, 04:55 Sunday).
3. **Herd shape.** Grazing herds still form rings and crescents. The nearest-neighbour fix looks right but cost persistence on the old calendar; worth re-screening on the new one.
4. **Close the gap to your concept image:** close-range ground detail, water with depth and current, and the riparian green along the creek.
5. **Landing page:** turn the making-of page and the best stills into a front page for the game, if you like it.
