# Good morning: Tallgrass overnight report

*(Updated 09:53 Sunday. I keep working until the deadline in `.claude/hooks/run_until.txt` (Sunday 12:00); this file is refreshed at every milestone.)*

## How to run it (one step)
Open **https://tallgrass.stewartgregerson.workers.dev** in Chrome or Edge. Click once anywhere to turn on sound. (The live build is redeployed after each verified milestone; the time of the last deploy is in the line below.)

Last deploy: 09:51 Sunday (commit aee1c66: everything below, including the final quick round: natural grey wolves, slimmer predators and brown bison from above, bison dark at dusk, idle head bobs and look-arounds, prey that struggles under a kill, wolf territories as tinted ranges, side panels that dim after 20 s idle, softer snow edges, smooth rocks, ponds without a white glare disc; and the rounds before it: smoother animal motion, curled resting wolves, species readable from above, carcasses on the slope, gliding ravens, water that reads at distance and in rain, winter snowpack and bare trees, visible rain, the chronicle's season lines, softer territories, the Hungry wolves scenario, the 2x valley calendar and the narrator), verified live: no errors at 59 to 60 fps; the default world reads "1 year every 2 min" and challenges keep "1 year every 4 min".

Locally: `npm run dev`, then http://localhost:5199/.
- `?seed=anything` picks a world, `?scenario=yellowstone` picks a scenario, `?challenge=herd` starts a challenge. The menu (top right) does all three.
- Performance on this machine's RTX 5070 Ti Laptop GPU, measured after renderer round 7 (06:30 Sunday, GPU timers, median ms per frame at 1440p): wide golden 10.0, low golden 15.8, herd 10.3, top 9.6, winter 9.2, night 11.4. The later rounds each measured within about half a millisecond of flat in isolated A/B tests, but I couldn't take a clean whole-game measurement while simulations ran; the live checks show 57 to 60 fps at 1280x720. The low grass view has the least headroom. On bigger or high-DPI screens the game lowers its render resolution a little if it has to, to hold 60 fps.
- Keys: Space pause, 1/2/3 speed, **N next event** (the camera flies to it), **C cinematic documentary mode**, **P photo** (saves a clean PNG of the frame), G big graph, E evolution chart, L log scale, F follow the selected animal, **H ambient view** (hides all UI; any key or click brings it back), **V narrator on/off**, M mute, Esc back out. Click an animal to inspect it and read its life story. Left-drag orbits, right-drag pans, wheel zooms.

## What it is
**Tallgrass**: a living tallgrass prairie seen like a drone nature documentary. Grass greens and cures with the seasons; bison graze it and pronghorn browse forbs and shrubs; wolf packs hold named territories, bud new packs and fight over borders; ravens follow every kill; carcasses feed the soil. Every animal carries heritable traits (speed, size, sight, boldness, herding, coat, litter) that evolve. The sim runs in a Web Worker, deterministic from the seed. The renderer is Three.js (WebGL2) with about a million wind-blown grass blades, procedurally animated instanced animals, a golden-hour sky with a slow day cycle, seasons, snow, fire with smoke and regrowth. The UI is a "documentary broadcast" overlay: location slate, chronicle, chapter cards, population and evolution graphs, inspector with each animal's life story, god tools, map overlays. Ambient sound and SFX by ElevenLabs.

New since Saturday evening (overnight into Sunday):
- **A slower, truer calendar:** a valley year is now 2 minutes at 1x, so a bison lives about 6.7 valley-years and the herds boom and bust over a decade instead of a few years. Proven over 1,000 generations (see Stability).
- **A documentary narrator:** a calm voice speaks a line when something big happens (a drought, a stampede, a new pack, a fire, the first kill), only while the documentary camera or cinematic mode is filming at 1x or 10x, at most once every 40 seconds. **V** or the menu switch turns it off. In cinematic mode the line also shows as a caption.
- **Field notes** (menu): a naturalist's notebook of 18 moments you witness, from the first kill and a 100-bison stampede to riding along on a hunt, reading an animal's whole life story, or catching a kill on the documentary camera. Notes tick off with a quiet toast and are remembered between visits.
- **Fast-forward is faster:** 100x had been running at about a quarter of that; the sim now gets more of each frame.
- **Animals you can read from the drone:** wolves keep a cool slate coat and a faint glint at distance, bison stay warm brown at dusk instead of turning into black stains, pronghorn read tan, and the species separate from straight above. Bodies bound and pitch with the slope more strongly at distance, so movement reads as effort even when legs are a few pixels tall. The selection ring is a crisp thin ring. Carcasses show a pale belly and a fresh-kill stain.
- **Motion that reads:** animals now move along a smoothed path (uneven snapshot timing made running animals surge and stall, so their legs lurched; the measured speed jitter fell from 44% to 25%), resting wolves lie curled instead of reading as pale sticks end-on, carcasses settle onto the slope, and ravens alternate flapping bursts with glides and soaring.
- **Documentary camera:** it now cuts to a subject across the valley instead of flying the camera through the trees, and near moves ease in and out.
- **A chronicle that keeps up:** besides events, it now writes a line when a season leaves a mark ("A hard winter for the bison: 636 down to 569", "Pups at the dens: 47 wolves to 55", ravens gathering, records), about one or two a year. Wolf territories are soft tinted ranges instead of neon rings, and the narrator's captions sit on a soft shadow so they read on bright grass.
- **UI:** the chronicle is newest first everywhere, with a season tag on each entry and an "N earlier entries" pager. Chapter cards never contradict the header: once the valley leaves the season a card names, it trims to the year, even while on screen. **H** (or the eye button by the menu) gives an ambient view with no interface for a second monitor.
- **A landing page draft** (you mentioned the journey could become one): https://claude.ai/artifact/JHgLkaPPUGvWmeZU5FJ3YM (private to you). Film stills from the current build, what you can do in the game, a chart drawn from a real 1,000-generation run, and the controls; source in `landing/`.
- **Winters and weather that read:** on the short calendar snow storms were rare, so winters looked like autumn. Deep winter now carries a patchy snowpack, trees stay bare until spring (a leaf-curve bug had them greening in late winter), rain brings overcast light and streaks, and nights keep their relief instead of a flat teal.
- **Water that reads as water:** depth and a visible bed, a creek current that scrolls downstream, wet banks, reflections of the banks and trees, and ponds that freeze from the shore in winter.
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
1. Open the link, **click once** (that turns the sound on), and leave it alone: the camera opens on the biggest herd, and after 25 seconds without input the **documentary camera** takes over, cutting between hunts, kills, herds and vistas, and the **narrator** speaks when something big happens. Any mouse or key input, or Take over, gives you the camera back.
2. Press **C** for the full cinematic version (interface hidden, letterbox, narrator lines as captions), or **H** for the ambient view on a second monitor.
3. Menu, Challenges, **The wolves come home**: bring wolves back to a valley that lost them. It's the gentle one.
4. Overlays, **Wolf territories**, then 10x: watch packs form, bud and fall apart.
5. Press **G**, then 100x: decades of booms and crashes, now on the slower calendar. **E** for evolution.

## Screenshots (current build, captured about 09:10 in `review/morning/sunday2/`; earlier sets in `review/morning/`)
- `2_golden_low.png`: bison against a low sun, the new horizon and dusk glow (no interface, H).
- `1_golden_herd.png`: the valley from the drone at golden hour, with the creek reading as water.
- `4_winter_dawn.png`: winter dawn with the new snowpack, bare cottonwoods and a herd along the creek.
- `5_ui_golden.png`: the documentary interface with the chronicle's season lines ("Pups at the dens, and the wolves rise from 24 to 40").
- `7_follow_a_wolf_hunt.png`: following a founder wolf pup on a hunt, with its traits and life story and a Field note.
- `6_ui_territories.png`: wolf territories with named packs, and a chapter card.
- `8_field_notes.png`, `9_chart_60_years.png` (60 valley-years in 4 worlds), `10_chart_shocks.png` (the 300-year shock suite).
- Every image made tonight, in order, is in `journey/` (see `journey/INDEX.md`), as you asked. **Browse them as a page with a slideshow: https://claude.ai/artifact/7jPHUFvbzTv6AUz5UCA3Mu** (private to you; republished as new images are added). Locally: open `journey/index.html`.

## Stability: what is proven and what isn't (honest)
The default sim is now **checkpoint v5 on a 2x valley calendar** (since about 06:10 Sunday). Same animals and rules as v5, but a valley year is 1,200 ticks (2 minutes at 1x) instead of 2,400, so a bison lives about 6.7 valley-years instead of 3.3. Every critic since round 3 said the population swings were too fast for "years"; this is the fix I kept deferring, done properly. Challenges keep the classic calendar they were tuned on.

- **2x calendar acceptance** (`review/stability/cal2-2a5caf9/`): 20 worlds, each run until its bison passed **1,000 generations (1,220 to 1,402 valley-years)**. **Bison, wolves, ravens and pronghorn each survived in 19 of 20.** The lost world is seed 11: its wolves, kept at about 57 by pronghorn and small game, grind the bison out by year 40, and the rest collapses by year 115. Every criterion passes except the ravens' "not a flat line" floor (CV 0.05 against 0.05; the nest-site cap keeps them flat on both calendars).
- **What it buys, measured:** bison cycle about every 10 years (v5: 5), recover from a crash in about 8 years instead of 5.5, and swing less year to year (8% instead of 15%). Births run 0.42 per bison per year, close to real herds (v5: 0.85). Pronghorn do better than on v5: 19 of 20 instead of 18, never near zero, peaks 2.7x their mean instead of 3.4x. The cost is one world lost on three species. Chart: `journey/20261004-042209_chart_calendar-cycles.png` (60 years in 4 worlds, old calendar on top).
- **2x calendar shocks over 300 years** (`review/stability/cal2-2a5caf9-shocks300/stability_overview.png`; 20 worlds per shock, 600 valley-years, shock at 40%; my first run was cut at 3 hours by my own timeout, so seeds 15 to 20 were re-run and merged, see `metrics_merged.md`):
  - **70% cull:** every species persists in 19 of 20 worlds (seed 11 is lost before the shock) and 100% of the rest return to their pre-shock range.
  - **Severe drought:** bison, wolves and ravens persist in 17 of 20 (v5: 17, 16, 18), pronghorn in 18 (v5: 17); about 90% of survivors return to range (v5: 80 to 85%).
  - **Wolf wipeout, then reintroduction 90 years later:** wolves re-establish and persist in 19 of 20; long after, wolves sit at a median 1.03x and bison 1.21x their pre-shock levels (v5: 1.07x and 1.26x). The strict "back inside the pre-shock range and holding" metric is lower than on v5 (wolves 58% vs 95%, bison 68% vs 90%), partly because wolf and bison numbers are steadier on this calendar, so that range is narrower. One honest regression: pronghorn persist in 17 of 20 through this test against v5's 19, losing two worlds to the boom and crash around the predator-free decades.
- **Below: checkpoint v5 on the classic calendar,** which is still what the challenges run on.

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
- **A spring birth pulse** (calves only in spring) collapsed everything on the classic calendar, because bison lived only about 3.3 valley-years. On the 2x calendar, with a birth cooldown shorter than a year, bison now survive it in 26 of 32 worlds (starvation falls to 30% of their deaths), but pronghorn, living about 3.75 valley-years, collapse in 28 of 32. So a real birth season is within reach for bison; pronghorn need a longer life first. Slow climate cycles also cost persistence.
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
| 7 (07:25) | blind critic, stills + 2x-calendar charts | 7 | 6 | 6 | 4 | 7 | 5 |
| 7 (07:51) | Gemini, video | 5 | 7 | 2 | 4 | 8 | 3 |
| 8 (09:05) | blind critic, stills + 2x-calendar charts | 7 | 5 | 6 | 4 | 6 | 5 |
| 8 (09:10) | Gemini, video | 5 | 6 | 2 | 4 | 8 | 3 |

Every issue and its triage is in `REVIEWS.md`.
- Round 4's verdict: animals were illegible and looked motionless at drone distance. In the drone shots a wolf is about 20 px tall, so planted feet can't read. The animal work since then targets exactly that, with whole-body motion scaled to camera distance, larger minimum sizes and a kill lunge.
- Rounds 5 and 6: the stills critic's visual, life and keep-watching scores rose (visual 6 to 7, life 5 to 7). Its top complaint, three rounds running, is that population swings are too fast for "years": a bison lives about 3.3 valley-years, so a crash heals in about 5 years. That was the calendar trade-off; the 2x calendar adopted at 06:25 is the fix (see Stability). Gemini's top complaint is gait and weight in wide shots. A frame-by-frame check of its clip found a 70 to 100 m wide shot where legs are 2 to 3 px tall, so the fix is distance cues (body bob, slope pitch), not foot IK.
- Round 6 also found a real bug: deep snow in early summer after fast-forward at a low frame rate. Fixed (e82a67b).
- Round 7 (after the calendar, narrator, Field notes, renderer, water and dust rounds): readability up to 6. Praised: golden-hour and dusk lighting ("wallpaper-grade"), wolves that pop, the follow panel, the territory overlay, and shock tests that "tell a real trophic story". Its top complaint is still the predators: wolves and ravens sit on near-flat lines (the research is under Next 5 things). Fixed since: winter snowpack and leafless winter trees, visible rain, night that reads as land, distant water that reads as water, a richer chronicle, readable species from above.
- Round 8 (on the 09:01 build): scores held (stills 7, 5, 6, 4, 6, 5; Gemini 5, 6, 2, 4, 8, 3). Both critics still lead with the same two things this build can't fix tonight: predators that don't move (the stills critic) and close-up animation that reads as sliding (Gemini, even after the motion smoothing). A last quick round from it is now live: natural grey wolves, species proportions from above, softer snow edges, smooth rocks, no glare discs on ponds, clearer territories, and side panels that dim when you're not touching them.

## Decisions you might want to overrule
- **Stack:** TypeScript + Three.js instead of Godot (ADR-001 in `DECISIONS.md`): one language for sim, harness and renderer, headless GPU capture, and the URL build.
- **Time scale:** a year is now 2 minutes at 1x (seasons 30 s), down from 4. Biology runs per tick and is unchanged, so 1,000 generations still fit in a few hours of compute while a bison lives about 6.7 valley-years. If you'd rather keep the slower seasons of Saturday's build, set `calendarScale: 1` in `src/sim/params.ts` (or open the game with `?p=calendarScale:1`). The seasons now turn twice as fast as before; the day stays 80 s.
- **The world opens in late summer** (golden, like your concept); early summer is green.
- **Challenges keep the classic calendar** (a year is 4 minutes there): they were tuned and validated on it, and on the 2x calendar three of the five stopped behaving as tuned. Retuning them for the new calendar is a morning's work if you want one calendar everywhere.
- **The narrator is on by default** but speaks only in documentary or cinematic mode, at 1x or 10x, at most once every 40 seconds. V or the menu switch turns it off for good (remembered in your browser).
- **Hungry wolves is opt-in, not the default:** its wolves are far more alive, but its pronghorn die out within a few centuries in every world that has finished 1,000 generations.
- **The landing page is a private draft,** not deployed beside the game. Deploy it only if you like it.
- **Challenges** are fixed and hand-tuned, not generated; the tuning data is in `DECISIONS.md`.
- **Cougars and rabbits:** cougars are opt-in, and their scenario lets dispersers wander in from outside (the valley is too small to hold a cat population on its own); rabbits stay abstract (wolves' "small game" in lean times).
- **No immigration:** wolves never wander in from outside the valley, so persistence numbers are for a closed valley.

## Blocked / cut
- **PixelLab:** no key (blank in Noclip's `.env`). Icons are hand-made SVG.
- **seked `.env`:** doesn't exist; keys came from Noclip's `.env` plus your `ELEVENLABS_API_KEY` environment variable.
- **Custom subagent types and the Stop hook:** `SETUP.cmd` hadn't been run, so I installed `.claude/` at 01:00; the custom agent types weren't registered mid-session, so I use general-purpose agents with the same prompts.
- **Gemini 2.5 Pro** is closed to new users; I used `gemini-3.1-pro-preview`.
- **Not built:** family tree view, river diversion and forest planting tools.

## API spend
Gemini: 3 concept images, 7 video critiques, about 60 short text and audio listen-checks (under $1.50 in all). ElevenLabs (pay-as-you-go): 17 sound-effect generations and 24 narrator takes (1,911 characters, roughly $0.40 to $0.60). Meshy, Sketchfab: balance and search checks only. Every call is in `ASSETS.md`.

## Next 5 things I'd do
1. **Wolves that follow their prey.** On the default calendar wolf numbers stay nearly flat (annual CV about 0.1): packs are limited by territory, and pronghorn and small game carry them through a bison crash, so in a few worlds they grind the herd down (seed 11). Tonight's best screen (2x calendar + prey-scaled pack sizes + a stronger refuge for rare prey + fewer young in lean times; `scratch/L1`, 32 worlds x 200 valley-years) makes wolves truly follow the bison (correlation 0.77, two years behind, CV 0.30) with bison, wolves and ravens alive in **32 of 32** worlds. Pronghorn reach 25 of 32 at 200 years, but its 1,000-generation run (still finishing, `review/stability/hungrywolves-44a2bfe`) shows them dying out in every finished world between years 112 and 373: they starve after overshooting on the forage the held-down bison leave (two-thirds of their deaths). So the predator side works and the pronghorn side doesn't yet; the next step is a pronghorn-specific brake on fawning. You can watch it today: Menu, Scenarios, **Hungry wolves**.
2. **Evolution that keeps running.** Bison speed and size climb to their limits within a century, because speed costs almost nothing and size pays for itself, herding fades, and the litter gene drifts until bison routinely bear twins. Tonight's screens: a real sprint cost (`sprintCost` 0.5) keeps herding alive but pushes pronghorn speed, their defence, down to 0.74; at 0.1 herding still fades; a single-calf cap for bison costs a little persistence (29 of 32). Next: a per-species sprint cost between those, plus the bison calf cap (details in `DECISIONS.md`, 04:55 to 08:50 Sunday).
3. **Herd shape.** Grazing herds still form rings and crescents. The nearest-neighbour fix looks right but cost persistence on the old calendar; worth re-screening on the new one.
4. **Close the gap to your concept image:** the riparian green along the creek, more width variation in the creek channel, pond rims (the mud band still reads as a ring from above), and herds that graze in loose patches instead of tight masses.
5. **Landing page:** the draft is up (link above); if you like it, deploy it beside the game (for example at /about) and swap in fresh stills.
