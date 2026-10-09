# Reviews and triage

## Round 1 (03:20, stills + 40-year charts) -> `review/round-01/critique.md`
Scores: Visual 5, Readability 3, Life 5, Ecosystem 2, UI 6, Keep watching 3.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Ecosystem doesn't persist | FIX (top priority) | lead | Root causes found: (a) pack-budding bug sterilized dispersers (fixed), (b) herds starve beside green pasture because foraging only looks 8-20 m (adding coarse-map migration), (c) predator pit after crashes (small game reduced). |
| 2 | Ecology not visible | FIX | animals builder + lead | Carcass + flattened grass + circling ravens, sick tint, chase dust; "Next event" flies the camera to the event (lead, main.ts). |
| 3 | Die-off causes; raven hard cap | FIX | lead | Spatial starvation fix (#1b). Ravens: breed only after carrion meals so numbers track carcass supply; soften the nest cap. |
| 4 | Animal readability | FIX | animals builder | Lit brown bison with lighter hump, cool grey wolves with dark saddle, pronghorn white rump flash, zoom-dependent herd/pack markers in wide views. |
| 5 | Night/dusk/top map/edge | FIX | renderer builder | Moonlit silver-blue night with a brightness floor, less haze for high cameras, hide the world edge. |
| 6 | Prairie look and seasons | FIX (partly REJECT) | grass + renderer builders | Rejected: "midsummer should be green" as the default look; the owner wants the golden concept. Instead the world opens in late summer (honestly golden), early summer is visibly greener, stripes broken into organic clumps with flowers, short grass on ridges instead of sand. |
| 7 | Trees and shrubs | FIX | renderer builder; lead (camera) | Airier, smaller, desaturated canopies; muted shrubs; follow-cam fades occluding canopies. |
| 8 | Chronicle spam | FIX | UI builder + lead | Sim: stampede cooldown and threshold up, elder events rarer. UI: dedupe, cooldowns, weight toward predator-prey drama. |
| 9 | Water looks like a canal | FIX (lower priority) | renderer builder | Softer banks, depth color, reedy margins. |
| 10 | UI colors, graph scale, labels | FIX | UI builder | Distinct species colors, log scale by default, labeled tool icons, plain-language speed text. |

## Round 2 (06:20, Gemini video critique of a 99 s reel) -> `review/round-02/reel.gemini.md`
Model: gemini-3.1-pro-preview. Scores: Visual 5, Readability 8 (was 3), Life and motion 2, Ecosystem 4, UI 9 (was 6), Keep watching 3.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Animals skate; bodies don't face travel; gait not synced | FIX | lead | Sim: velocity now follows heading with a turn-rate limit (no sideways sliding). Main: leg animation follows real sim speed (cap 12x, was 4x). |
| 2 | Stampede herds clip into one blob | FIX | lead + animals builder | Separation radius 2.3 -> 2.7 m. Check the far-distance minimum-size scaling isn't fattening close herds. |
| 3 | Ground texture repetition, "golf course" | FIX | renderer builder | Macro variation in terrain far-field (dirt, green swales, rocks), no tiling. |
| 4 | Snow pops in and out in one frame | FIX | renderer builder | Snow cover accumulates and melts over seconds of sim time. |
| 5 | Rigid follow camera | FIX | renderer builder | Deadzone and softer catch-up. |
| (lead) | Director films empty vistas; night still dim; hard straight edge at 01:37 | FIX | lead + renderer builder | Vista shots must contain animals; edge reported to the renderer builder. |

## Round 3 (12:00, stills + 650-year charts, blind critic) -> `review/round-03/critique.md`; video -> `review/round-03-video/reel.gemini.md`
Stills critic: Visual 6 (was 5), Readability 4, Life 5, Ecosystem 4 (was 2), UI 7, Keep watching 5 (was 3).
Gemini video: Visual 4, Readability 7, Life and motion 2, Ecosystem 4, UI 8, Keep watching 3.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Graphs are jitter around a flat line; wolves flat; breeding too fast | FIX (research track, v5) | lead | Confirmed on data: births per year about equal the herd, 68% of bison deaths are starvation vs 20% predation, wolves pinned by territory (CV 0.20). Bottom-up overcompensation, not predator-prey cycles. v5 screens: slower ungulate breeding with longer lives, more numeric wolf response. Ships only if it beats v4 on persistence and shows lagged cycles. Charts get annual means. |
| 2 | Feet slide; animals walk in place while gliding (Gemini #1, 2 rounds running) | FIX | lead (done) + animals builder | Root cause: leg cadence used sim speed x time scale, but on screen animals move 1.5x that (0.15 s per tick at 10 ticks/s) and slower still when the sim lags. Cadence now comes from measured on-screen displacement; gait style from 1x pace. |
| 3 | Can't see predation; kill shot is a smudge; wolves are specks | FIX | animals builder | Predator rim/marker at wide zoom, carcass legibility, ravens landing in a visible group; feeding tug added (lead). |
| 4 | Bison render as solid blobs, donuts and rings | FIX | lead (sim) | Herd spacing and milling: more personal space, looser grazing spread, strung-out travel lines, break circular milling. |
| 5 | Pronghorn extinct in 5/20 baseline seeds | FIX (v5) | lead | 60% of pronghorn deaths are starvation: boom and bust on browse. Slower breeding in v5. (They already eat a separate browse layer; the critic couldn't know.) |
| 6 | Evolution pins by year 100 | FIX (v5, lower priority) | lead | Bison speed at the ceiling, sight and herding at the floor. Revisit trade-offs after v5. |
| 7 | One amber palette; pronghorn read as foxes; murky dusk | FIX | renderer + animals builders | Straw/green/sage variety, darker bison, tan pronghorn with bold white bands, dusk contrast. |
| 8 | Trees: square leaf cards; rocks: identical grey pillows | FIX | renderer builder | Softer clustered canopy; rock variety, clustering, smaller. |
| 9 | Distant hills read as sand dunes (lead), water white/flat (Gemini), raven shadow huge and pixelated (Gemini), snow is a flat overlay (Gemini) | FIX | renderer + animals builders | Far-field grass texture; darker water with Fresnel; no shadows for ravens in flight; slope-aware snow. |
| 10 | Raven sawtooth at a ceiling | DEFER | lead | Nest-site cap still binds; revisit with v5. |
| 11 | UI: chronicle too tall, log graph squashes, territory label contrast, speed readout vs actual rate, trait bars look like sliders | FIX | UI builder | |
| 12 | Trees and grass don't move (Gemini) | REJECT (mostly) | - | Grass does sway; at drone height it doesn't read. Tree sway is a cheap add for the renderer builder if time allows. |

## Round 4 (18:30, stills + v5 charts, blind critic) -> `review/round-04/critique.md`; video -> `review/round-04-video/reel.gemini.md`
Stills critic: Visual 6, Readability 4, Life 5, Ecosystem 5 (was 4), UI 6, Keep watching 5.
Gemini video: Visual 4, Readability 8, Life and motion 1, Ecosystem 6 (was 4), UI 9, Keep watching 3.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Animals illegible at the default wide camera; motion doesn't read ("sliding statues") | FIX (top) | animals builder | Frames show wolves about 20 px tall in drone shots: legs can't read. Whole-body motion scaled with distance (bounding, bob, head pump), minimum on-screen size, distinct value per species, turn smoothing and banking, a kill lunge and topple, stampede dust. |
| 2 | Graphs flat; wolves don't lag prey; ravens capped | FIX (v6) | lead | v6X (prey-scaled wolf capacity) gives wolf-prey correlation 0.63 at a 1-year lag. Raven cap relaxation hurt persistence in two screens (rejected for now). Slow climate cycles (wet and dry runs of years) to be screened. |
| 3 | Evolution: herding and sight collapse | FIX (v6) | lead | loneIndividual keeps herding at 0.99 at year 40 (was sliding to 0.8); litter caps stop fecundity drift. |
| 4 | Births year-round; no spring pulse | FIX (screen) | lead | Seasonal conception window so calves arrive in spring; screen for stability. |
| 5 | Muddy wide shots, snow blobs, crater ponds, square world | FIX | renderer builder | Trees first (also Gemini #7), then ponds and snow edges. |
| 6 | Trees: lollipops, poles, smudges | FIX | renderer builder | Sent at 18:25. |
| 7 | Too many animals in too small a valley | PARTLY FIXED | lead | v5 equilibrium is about 450 bison (v4 1,200); the opening still starts at 800 and booms. Start nearer equilibrium. |
| 8 | Shocks leave the herd bigger | EXPLAIN + FIX | lead | Shock lands during the first-century evolution climb; 300-year shock suite planned; litter caps reduce the climb. |
| 9 | UI: unlabeled glyphs, graph scale, pronghorn green on green, title cards over the action, white rings | FIX | UI builder + animals builder | Expanded graph as small multiples (one row per species), pronghorn color, lower-third title cards, rail labels visible on first view. Rings: animals builder. |
| 10 | Story moments not staged; founders have no story | FIX | UI + lead | Founder backstory line; director prefers animals with something happening. |
| G3 | Turning on a pivot (Gemini) | FIX | animals builder | Render-side heading smoothing and banking. |
| G6 | Static camera during fast-forward (Gemini) | FIX | lead | Idle drift at 10x and 100x. |

## Round 5 (23:10, stills + v5 charts incl. 60-year close-up and 300-year shocks; Gemini video) -> `review/round-05/critique.md`, `review/round-05-video/reel.gemini.md`
Stills critic: Visual 6, Readability 4, Life 5, Ecosystem 5, UI 7, Keep watching 5.
Gemini video: Visual 5, Readability 8, Life and motion 3 (was 1), Ecosystem 6, UI 9, Keep watching 5 (was 3).

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Predation off-camera | FIX (done) + animals builder | lead | The documentary director is now the default camera when idle (25 s without input), with shot angles chosen for a clear line of sight. Wolf contrast at distance: animals builder. |
| 2 | Dynamics read as noise; wolves flat; ravens capped | DEFER (documented) | lead | v6 research showed faster predator response costs pronghorn persistence over centuries; a calendar re-scale is the real fix. 60-year close-up chart added. |
| 3 | First hour is a decline | FIX (screen) | lead | Starting near the long-run means (bison 550, pronghorn 450) screening at 100 years. |
| 4 | White patches in summer; snow as sand; moonlit grass as snow; lawn-green spring | FIX | lead (done: snow lag after fast-forward) + renderer builder | |
| 5 | Distant land like a desert | FIX | renderer builder | Keep frame cost flat (1440p is at 16 to 17.5 ms on an RTX 5070 Ti Laptop). |
| 6 | Evolution plateaus | DEFER | lead | loneIndividual works for herding but is part of the rejected v6 package. |
| 7 | Herds as donuts and clumps | DEFER | lead | herdNearest rejected (persistence). |
| 8 | A drought can end the wolves | DEFER (design) | lead | Closed valley by design for the stats; the 300-year drought test keeps wolves in 16 of 20 worlds and recovers 80%. |
| 9 | Burnt trees, pronghorn glow, red sick bison | FIX | renderer + animals builders | |
| 10 | Graph label collisions, flat sparklines, cut-off chronicle | FIX | UI builder | |
| G1 | Gallop slides at chase speed | FIX | animals builder | Chases reach about 27 m/s on screen; cadence cap and gallop stride. |
| G3 | Rigid follow judder in hunt shots | FIX | lead | Director follow with lazier smoothing. |
| G4 | Weightless kills | FIX | animals builder | Stagger before the roll. |
| G6 | Chapter cards linger at 100x | FIX | UI builder | |
| G7 | Shadow flicker | FIX | renderer builder | |

## Round 6 (01:40, deployed build b679901: stills, v5 charts, Gemini video) -> `review/round-06/critique.md`, `review/round-06-video/reel.gemini.md`
Stills critic: Visual 7 (was 6), Readability 5 (was 4), Life 7 (was 5), Ecosystem 4 (was 5), UI 7, Keep watching 6 (was 5).
Gemini video: Visual 4, Readability 6, Life and motion 2, Ecosystem 7, UI 9, Keep watching 5. Gemini praises the graphs as showing booms, crashes and lags; the stills critic reads the 700-year charts as noise. Both are about the same data at different zooms.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Dynamics too fast for "years"; shocks heal in 5 years; births in autumn | RESEARCH | lead | Third round in a row. Screening a calendar re-scale (a year of 600 ticks instead of 2,400, biology unchanged per tick) on a frozen copy: compute-neutral, so 1,000 generations still fit. Adopt only if it passes the same acceptance and shock suite as v5. |
| 2 | Wolves flat, ravens capped | DEFER (folds into 1) | lead | With a 4x shorter year the existing 1-year wolf lag becomes a 4-year lag. The raven ceiling stays (rejected twice). |
| 3 | Evolution plateaus; herding evolves away | DEFER | lead | loneIndividual alone may be screened alongside the calendar work. |
| 4 | Wolves invisible at distance; selection ring a smudge | FIX | animals builder | Distance-scaled predator readability; crisp ring. |
| 5 | Deep snow in early summer (still 11) | FIX (lead) | lead | Real bug: the snow ease capped sim ticks at 14 per frame, so at a low frame rate and 100x the melt trailed the season by months. Fix: smooth the worker's tick chunks over real time instead of capping them. |
| 6 | Herds read as stains in wide, dusk and top views | FIX | animals builder | Species value and tint lift at distance; dusk floor. |
| 7 | Distant terrain smear, world edge streaks, identical far trees | FIX | renderer builder | Designed world edge, no streaks, varied far trees. |
| 8 | Herd formations, overlap | DEFER | lead | Sim herd shape changes cost persistence (rounds 4 and 5). |
| 9 | Charred trunks low, grey dusk sky, faceted rocks, snow puddles | FIX (partly) | renderer builder | Sun glow and clouds at dusk; trunk value at low angles. |
| 10 | Chronicle order, banner over labels, no ambient mode, UI colors vs coats | FIX (partly) | UI builder | Newest first everywhere with a scroll cue; chapter card drops when its season has passed and stays clear of labels; hide-UI key. UI colors stay a legend (brown on dark panels would be unreadable): REJECT. |
| G1 | Locomotion slides (0:10 to 0:28) | PARTLY FIX | animals builder | Frame-by-frame check of the reel (30 fps, 18 frames from 0:14): the chase is a 70 to 100 m wide shot where legs are 2 to 3 px, so no gait reads at that size. Fix the distance cue (body bob and slope pitch), not foot IK. |
| G2 | Close ground reads as carpet or sponge | FIX | renderer builder | Close-range detail. |
| G3 | Kill reads as a stop and a green lump | FIX | animals builder | Check carcass value next to shrubs. |
| G4 | Shadow cascade lines scroll during pans | FIX | renderer builder | |
| G5 | Riverside trees all the same | FIX | renderer builder | Same as 7. |
| G6 | Cinematic camera moves in straight lines | FIX | lead | Ease the cinematic path. |
| G7 | Flat river | DEFER | renderer builder | After the above. |

Round 6 outcomes (04:40):
- Fixed: 5 (snow lag, e82a67b, verified with stills set 'snow'), G6 (director cuts and eased glides, 94182a0, verified by logging camera moves), 4 + 6 + G1 + G3 (animal layer round 6, ac1a420: wolves at distance, dusk herds warm brown, species separable from above, 1.5 to 2x distance motion, crisp ring, carcass belly and stain; frame cost flat), 10 (UI round 6, 948ffb6: chronicle order and pager, cards never contradict the header, H ambient view, calmer notice).
- In progress: 7, 9, G2, G4, G5 (renderer builder: world edge and ridges first).
- Research: 1 (calendar re-scale cal2: 100-year screen within noise of v5 and visibly slower cycles, chart journey/20261004-042209_chart_calendar-cycles.png; acceptance and 300-year shocks running), 2 (wolf-tracking screens queued on cal2).
- Also from this round: the documentary narrator (18 lines, being wired in), and fast-forward throughput (the worker stepped only 11 ms per 27 ms cycle).

## Round 7 (07:25, build with renderer round 7, water rework, dust fix, Field notes, narrator, 2x calendar; charts from the 2x acceptance and shock suite) -> `review/round-07/critique.md`
Stills critic: Visual 7, Readability 6 (was 5), Life 6, Ecosystem 4, UI 7, Keep watching 5.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Predators flat (wolves about 50, ravens capped at 320) | DEFER (researched) | lead | Prey-scaled wolves track bison (corr 0.71 to 0.76) but cost pronghorn by starvation overshoot (diagnosed 07:35); next: lean-times births (leanLitter, screening now). Raven cap rejected twice. |
| 2 | Seed 11 dies | DEFER (documented) | lead | The failure mode (wolves carried by pronghorn and small game grind the bison out) is the same as in item 1; an immigration safety net would hide it rather than fix it. |
| 3 | Evolution caps; litter about 2.4; herding collapses | DEFER + chart fix | lead | herdEyes keeps herding (screen evo2); sprint cost too strong at 0.5. Chart: mask the last stretch where few worlds remain (lead). Bison twinning: a bison litter cap was part of the rejected v6 package; worth re-screening on the 2x calendar. |
| 4 | Births in autumn and winter | RESEARCH | lead | The spring birth pulse failed on the classic calendar because bison lived 3.3 valley-years; on the 2x calendar it may now hold. Screen when CPU frees. |
| 5 | Distant river reads as pavement; night reads as an ocean; pond blotches in rain | FIX | water builder (river, rain), renderer builder (night) | |
| 6 | Rain invisible; trees leafy in late winter; no snow in winter | FIX | renderer builder | Seasonal snowpack (the 2x calendar made snow weather rarer), foliage wrap bug, overcast in rain. |
| 7 | Chronicle too thin; pack lost while count rises | FIX | UI builder | Season lines from population history; pack break-up phrasing. |
| 8 | Herds as texture at distance; near-camera wolves glitch (03) | FIX | animals builder | |
| 9 | Founder alpha with 0 offspring and kills | FIX | UI builder | |
| 10 | UI and chart rough edges | FIX (partly) | UI builder (label overlap), lead (charts: right axis, persist labels, thinning) | "100x running at 20x" is honest hardware reporting: REJECT. Graph covering a third of the scene: it's the expanded view (G), by design. |

Round 7 Gemini video (07:51, review/round-07-video/reel.gemini.md): Visual 5, Readability 7, Life and motion 2, Ecosystem 4, UI 8, Keep watching 3.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| G1 | Sliding locomotion in the hunt shot (0:09 to 0:21) | CHECK + FIX | animals builder | Frame check of the reel at gallop speed (on-screen speed is 1.5x sim speed). |
| G2 | Bison jog away without scattering | DEFER | lead | Flight behaviour is sim; flee changes cost persistence before (flee momentum rejected 00:45 Saturday). |
| G3 | Robotic raven flight | FIX | animals builder | Soar, glide, bank, varied flaps. |
| G4 | Rigid carcasses | FIX | animals builder | Align to slope, slumped pose. |
| G5 | Territory overlay looks like debug UI | FIX | UI builder | Feathered tinted ranges, softer edges. |
| G6 | Captions lost on bright grass | FIX | UI builder | Soft scrim or shadow. |
| G7 | Chapter cards over the action | PARTLY | UI builder | Already lower third; smaller at speed. |

## Round 8 (09:05, deployed build dcf4809; stills from a clean worktree; Gemini video 09:10) -> `review/round-08/critique.md`, `review/round-08-video/reel.gemini.md`
Stills critic: Visual 7, Readability 5, Life 6, Ecosystem 4, UI 6, Keep watching 5. Gemini: Visual 5, Readability 6, Life 2, Ecosystem 4, UI 8, Keep watching 3.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Predators flat; ravens crash in the drought | DEFER (researched) | lead | Hungry wolves scenario shows the predator side working; pronghorn are the blocker. |
| 2 | Worlds die (seed 11; shocks 17 to 19/20) | DEFER (documented) | lead | |
| 3 | Evolution converges and stops | DEFER (researched) | lead | evo2, L5 screens. |
| 4 | Wide-zoom readability: toy-blue wolves, wolves bigger than bison from above, rust bison at dusk | FIX (final quick round) | animals builder | |
| 5 | Herds in rings around water | RESEARCH | lead | herdNearest re-screen on the 2x calendar running (scratch/hn2). |
| 6 | Snow cow print, pond glare disc, faceted rocks | FIX (final quick round) | renderer + water builders | |
| 7 | UI covers the action | FIX (partly) | UI builder | Panels dim when idle; ambient view (H) already exists. |
| 8 | Territories too faint, stacked graph labels, chart colours and subtitle | FIX | UI builder (overlay, graph), lead (charts: game colours, shock lines and prior bands drawn for the merged suite, honest legend) | Chart part done. |
| 9 | Opening decade is a settling crash | DEFER | lead | Near-equilibrium start rejected Saturday (cost persistence). |
| 10 | Chronicle skips events in year 2 | DEFER | lead | Season lines land at season close; acceptable. |
| G1 | Sliding, instant turns | PARTLY FIXED | animals builder | Path smoothing landed in dcf4809 (speed variation 44% to 25%); Gemini still sees it. |
| G2 | Kill as bumper cars | FIX (if quick) | animals builder | |
| G3 | Herd clipping | DEFER | lead | Sim spacing; herdSpacing changes cost persistence before. |
| G4 | Blurry close ground | FIX (if quick) | renderer builder | |
| G5 | No idle motion | FIX | animals builder | |

## Round 9 (10:19, deployed build aee1c66 with the final quick round; stills from a clean worktree with ?dim=0) -> `review/round-09/critique.md`
Stills critic: Visual 7, Readability 5, Life 6, Ecosystem 5, UI 7, Keep watching 6 (round 8: 7, 5, 6, 4, 6, 5). My mistake: the four charts in the folder were stale copies from round 8 (09:02), made before the 09:22 chart fixes, so the chart legend and subtitle complaints in issue 10 were already fixed.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| 1 | Wolves and ravens flat; ravens crash in a die-off | DEFER (researched) | lead | Hungry wolves (opt-in) gives wolf CV 0.27 with a lag, but pronghorn 0/20 over 1,000 generations. Ravens are capped by nest sites; uncapping them crashed them out (00:20 Saturday). |
| 2 | Evolution saturates by year 300; herding lost; bison twins | DEFER (researched) | lead | sprintCost, herdEyes and a bison single-calf cap (L4: 29/32) screened; next is a per-species sprint cost plus the calf cap. |
| 3 | Winter, drought and wide shots muddy; drought mauve; night pond white ring | PARTLY | renderer builder (riparian round in progress) | The mauve in still 11 is partly the territory tints over drought ground. Night pond rim FIXED 10:28 (snow on ice greys under moonlight and drifts against the shore). Drought grading is a next-session item. |
| 4 | Herds as one carpet, clipping | DEFER | lead | herdNearest 6 does not visibly loosen herds (scratch/herds/compare_early.jpg); next is personal space while grazing. |
| 5 | Donut rings around water | DEFER | lead | Same root as 4: water-seeking plus herd cohesion. |
| 6 | UI boxes in the action | DONE (not visible in this round) | UI builder, lead | Panels dim after 20 s idle, but these stills were captured with ?dim=0; H gives a clean ambient view. Chapter cards about 18% smaller (10:31). |
| 7 | Events told, not shown | DEFER | lead | Sick animals already lower their heads; stampedes raise dust in dry ground only. |
| 8 | Fragile, slow opening; 100x runs at 34x | DEFER | lead | Near-equilibrium start rejected (cost persistence); fast-forward is CPU-bound on the sim. |
| 9 | Potato rocks, repeated bare trees | DEFER | renderer | Rocks were reworked at 09:44; still read as smooth ovals. |
| 10 | Rain streaks in the map view | FIXED | lead | Streaks fade out as the camera looks steeply down (engine.ts); checked in scratch/rain_fix/sheet.jpg. Graph: each row's low number is now quieter (bd57789). Inspector traits read in plain words against the founders (54e479c). Pink territory tint: deferred. |

## Round 10 (10:57, Gemini video of 673802a: the final build before the riparian ribbon) -> `review/round-10-video/reel.gemini.md`
Gemini: Visual 7, Readability 6, Life 3, Ecosystem 8, UI 9, Keep watching 5 (round 8: 5, 6, 2, 4, 8, 3).

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| G1 | Locomotion slides, feet don't plant at close range | DEFER | animals | Round 4 measured 8 to 12% foot slip; path smoothing in round 7. Gemini keeps seeing it at the hunt close-ups; next step is a close-range gait check on the reel frames. |
| G2 | Kill snaps to a dead pose without struggle | FIXED 11:19 | animals builder | The 0.25 s struggle became about 1.2 s (bucking, rearing, head tosses, scrabbling legs) before the roll; rig strips in scratch/b3/r10. Not yet seen on video. |
| G3 | Metronomic raven flight | DEFER | animals | Glides and soaring landed in round 7; still reads as mechanical in flapping flight. |
| G4 | Night too dark to watch | REJECT for now | lead | Round 9's stills critic and earlier rounds read the night as land; Gemini sees the darkest moment of the reel. |
| G5 | Captions hard to read on grass | DEFER | UI | A soft shadow was added in round 8; a fuller scrim is the next step. |

## Round 11 (11:24, Gemini video of 86eb206: the final live build, with the riparian ribbon and the 1.2 s takedown) -> `review/round-11-video/reel.gemini.md`
Gemini: Visual 6, Readability 7, Life 2, Ecosystem 5, UI 8, Keep watching 3 (round 10, 27 minutes earlier on a build without the ribbon and the takedown: 7, 6, 3, 8, 9, 5). The same territory overlay went from "a brilliant, readable way to visualize" (round 10) to "visually abrasive" (round 11), so single Gemini rounds swing by 2 to 3 points on their own; read the trend across rounds, not one score.

| # | Issue | Triage | Owner | Notes |
|---|---|---|---|---|
| G1 | Sliding feet | DEFER | animals | Same as every round; next session's first item. |
| G2 | Wolves stand still beside the struggling prey | DEFER | animals | The prey now fights for 1.2 s, but the wolves around it don't bite, lunge or tug; that is the next half of the takedown. |
| G3 | Territory overlay too opaque | REJECT for now | UI | Round 10 Gemini praised the same overlay; round 8 and 9 stills critics asked for it stronger. |
| G4 | Stampede feels weightless | DEFER | lead | Flight speed is sim; slower acceleration would be render-side. |
| G5 | Carcasses stiff, no tearing | DEFER | animals | Carcasses settle on the slope since round 7; feeding tugs exist but read only up close. |

## Round 12 (11:35, blind critic, stills of the live 11:19 build and the current charts) -> `review/round-12/critique.md`
Stills critic: 7, 5, 6, 5, 7, 6, the same as round 9: the stills scores have plateaued at this level. New and fixed: the chart's late "collapse" was an artifact (a dead world's zeros dominating the median as the other worlds finished); population medians now end where fewer than 5 worlds remain, like the trait medians (tools/charts.py, 11:38), and the table title no longer overlaps the persistence axis. Its season complaint (#7) stands: at 100x the ground is green and snowless under a 'late winter' header (the header is right; the snowpack curve or the grass green-up runs early); logged for the next session. Everything else repeats rounds 8 and 9 and is triaged there.

## Round 13 (stills, v2 alpha in progress, 2026-10-04 ~18:10)
Folder `review/round-13/` (default-world stills at main 77cfda6, the concept view, dawn mist and snow from R2 work, charts from screen D re-run at 3bb97a5). Fresh blind critic. Scores: visual 7, readability 5, life and motion 6, ecosystem believability 5, UI clarity 7, keep watching 6.

| # | Issue | Triage | Reason / outcome |
|---|---|---|---|
| 1 | No visible boom-bust cycles in the first hour; drift instead | Defer to Track S (S3 v6 adoption, S5) | Screen D gets wolf CV 0.26 and corr 0.72 but needs the pronghorn brake before adoption; passed to Track S in REQUESTS-R. |
| 2 | Ravens flat at a ceiling; predators ratchet up | Defer to Track S | Raven nest-site cap is known (v1 lesson 4); vagrant ravens (S1) in screens B to D; noted for v6. |
| 3 | Grazers grow through autumn and winter; wolves only step at denning | Pass to Track S | Chronicle "bison come through autumn stronger" in year 1 is a real seasonality question for the sim. |
| 4 | Herds read as scabs, rings around ponds | Defer (S10 drink spots and grazing spacing) | Known; S10 is queued for Track S. |
| 5 | River reads as a road at mid range and dusk | Fix (builder) | Silver far mirror works only beyond ~100 m; mid range still flat with hard edges. |
| 6 | Grazed ground and early-winter snow read as missing textures / purple marble | Fix (builder) | Snow patches need to follow terrain with soft edges; grazed slopes need stubble. |
| 7 | See-through panels over trees | Fixed | Idle dim was 0.5 opacity on the whole panel incl. glass; now 0.75. |
| 8 | Potato rocks, hard map edge | Defer | Rocks to R7/R11 asset pass. |
| 9 | Snow does not bury grass; same bare trees | Fix with 6 (snow) / defer trees to R11 | |
| 10 | Night too dark on animals | Fix (small) | Moonlight rim on animals. |

## Round 14 (Gemini video, M1, 2026-10-04 22:12) -> `review/round-14-video/reel.gemini.md`
Hunt-heavy v2 timeline (`node tools/video.mjs --set v2`), main at 6c94a83, gemini-3.1-pro-preview. Scores: visual 7, readability 6, **life and motion 4** (v1 rounds: 1 to 3), ecosystem 7, UI 8, keep watching 6.

| # | Issue | Triage | Reason / outcome |
|---|---|---|---|
| 1 | Animals slide like pucks at 10x and 100x | Fix (M1) | Known from the rig (time-lapse not gated); a time-lapse gait look (lower cadence, longer strides, motion smear) instead of 12 Hz leg buzz |
| 2 | Night flattens animals (also round 13 #10) | Fix (M1) | Moonlight rim on animals |
| 3 | Wolves seem to hover at 1x | Investigate with 1 | IK is on within 45 m; check grass occlusion and the far path |
| 4 | Camera clips trees, stutter in a pan | Defer (R15/R17) | Camera collision is its own WP |
| 5 | Hard shadows strobe at 100x | Fix (M1) | Soften sun shadows with time speed |
| 6 | Chronicle text small | Defer to R12 settings (UI scale exists) | |
| 7 | Rain looks like a flat overlay | Fix if cheap (M1) | Depth layers for the rain streaks |

## Round 15 (blind critic, stills of the live v7c build and v7c acceptance charts, 2026-10-07 15:50) -> `review/round-15/critique.md`
Scores: visual 6, readability 4, life and motion 5, ecosystem believability 5, UI clarity 6, keep watching 5.

| # | Issue | Triage | Reason / outcome |
|---|---|---|---|
| 1 | Bison carpet (about 1,000 bison smother the wide views) | defer to the next-phase planner | Core design call (bison carrying capacity sets the whole web); the Gemini video round praised the herd scale. Needs a planned change plus re-acceptance. |
| 2 | Long-run dynamics read as jitter, phase plots without loops | defer to planner | Ecology redesign question (cycle period, smoothing); evidence in review/stability/v7c-a6b02bb charts. |
| 3 | Mule deer settle near 10, prairie dog towns small, raven ceiling | defer to planner | Balance work on S8/S4/S1; all pass the persistence gates today. |
| 4 | Field notes point at nothing; small species invisible | fix | Builder r-fieldnote-camera: director frames the subject of each field note and headline event. |
| 5 | First decades are a warm-up | defer to planner | Option: start worlds from a spun-up state. |
| 6 | Blotchy snow in wide views, flat river, haze, square map edge | defer | Partly addressed by the snow depth render (off by default); revisit after v8. |
| 7 | Territory overlay shows no tinted ranges | fix | Builder r-overlay-chronicle (video round saw them as flat debug blobs, so also restyle). |
| 8 | Chronicle repeats lines word for word | fix | Builder r-overlay-chronicle. |
| 9 | UI footprint, rail reflow, sparkline scales | defer | Planner (tool drawer idea). |
| 10 | Same dead snag in winter, floating grey creature, bison clipping | defer | Polish backlog. |

## Round 16 (Gemini video, v7c live build, 2026-10-07 15:53) -> `review/round-16-video/reel.gemini.md`
| # | Issue | Triage | Reason / outcome |
|---|---|---|---|
| 1 | Camera pushes through tree canopy | fix | Builder r-camera-night. |
| 2 | Animals glide, lack weight on slopes | defer | Gait and foot-plant work; planner. |
| 3 | Night herd scenes are muddy | fix | Builder r-camera-night. |
| 4 | UI flashing during time-lapse | defer | Planner (calmer UI at speed). |
| 5 | Territory overlay looks like flat debug blobs | fix | Builder r-overlay-chronicle. |

## Round 17 (blind critic, v8b live build, 2026-10-08 ~05:00) -> `review/round-17/critique.md`
Scores unchanged from round 15 (6/4/5/5/6/5). Repeated themes: bison density and herd shape, invisible small animals, mule deer and raven dynamics, phase plots without loops, water. New: follow camera does not frame the followed animal; title card overlaps the hint pill and the status line contradicts the blizzard.
Triage: planner items (density, dynamics, mule deer, ravens, water look, UI footprint). Fix candidates for the next session: follow camera framing, title-card versus hint-pill overlap and weather line consistency, Cottonwood pack tint against summer grass.

## Round 18 (Gemini video, v8b live build, 2026-10-08 ~05:00) -> `review/round-18-video/reel.gemini.md`
Scores: visual 6, readability 8, life and motion 2, believability 5, UI clarity 9, keep watching 4 (round 16: 7/6/5/8/6/7).
Reported: animals do not animate (slide like chess pieces), stay level on slopes, a giant black sphere in a cottonwood grove, bison clipping, jerky follow pan. A black disc is visible in the reel at 00:08. Triage: possible regression from 2026-10-07 merges or the v8b defaults; builder r-regress bisecting.

## Round 19 (Gemini video, after the design-call fixes, 2026-10-08 afternoon) -> `review/round-19-video/reel.gemini.md`
Scores: visual 5, readability 7, life and motion 2, believability 5, UI clarity 8, keep watching 3. Video critics keep scoring motion low.
| # | Issue | Triage |
|---|---|---|
| 1 | Wolves gallop like rigid toys (no spine flex) | fix: builder r-anim-polish |
| 2 | A bird frozen mid-flap during time-lapse | fix: r-anim-polish |
| 3 | Herds slide at mid distance | partly the reel's 1 fps sampling (see r-regress); gallop work may help |
| 4 | Pile of animals on a pond at night with ravens (01:37: pronghorn bedded on the water) | fix: r-anim-polish |
| 5 | Snow pops on in one frame at 10x | fix: r-anim-polish (ease by real time) |
| 6 | No splashes when animals cross water | fix: r-anim-polish |
| 7 | Title cards over scenes that do not show the event | defer: director already frames field-note subjects; headline cards may need the same |

## Round 20 (blind critic, after the design-call fixes, 2026-10-08 evening) -> `review/round-20/critique.md`
Scores 7/4/6/5/6/6 (round 17: 6/4/5/5/6/5). Triage in the critique file: builders r-far-read and r-ui-calm2; ecology items in the v9 acceptance; early drift and wolf to bison ratio to the planner.

## Round 21 (blind critic, charts only: v10 screen EA, 14 worlds x 400 years, 2026-10-09 06:20) -> `review/round-21-charts/critique.md`
Scores: charts 7, readability 5, life (from charts) 6, ecosystem believability 6 (rounds 15 to 20: 5), chart UI 5, keep watching 5.
| # | Issue | Triage | Reason / outcome |
|---|---|---|---|
| 1 | Mule deer fade to about 15 after year 150 | fix next cycle | Diagnosed: pronghorn (also browsers) rise 340 to 590 as their litter gene drifts to triplets while mule deer births fall 36 to 6 per sample; mature creek cottonwoods thin 198 to about 120. The v10b screen (running) caps pronghorn at twins. |
| 2 | Drift at year 400 (pronghorn litters, bison size, prairie dogs) | fix next cycle | Pronghorn twins cap in v10b; bison size cap is a plain bound; prairie dogs to re-check under v10. |
| 3 | Cougars blink out for a few years | defer | Five to ten cats in a 512 m valley; open-prairie arrivals bring them back (presence >= 90% in 14/14). Narrating the arrival is a cheap fix; more room needs a bigger valley (VALLEY-SIZE.md). |
| 4 | Prairie dogs barely outnumber cougars | reject for now | Towns are a density field; the population counter shows a scaled number. A display question, not ecology. |
| 5 | No clean predator-prey loops; wolves should breed on last season's food | partly addressed | The v10 candidate's fewer packs give 0.64 wolf tracking in its screen; wolfBreedStore (exists, off) is the lagged-breeding lever for a later screen. |
| 6 | Bison sight and speed fall while wolf speed rises | fix next cycle | Bison sprintCost 0.2 (evolution2) is heavy; v10b raises the wolf sprint cost to 0.3; a lighter bison cost is the next screen. |
| 7 | Weather barely shows in the populations | partly | 60% more grass and +40% bison in wet runs on average; a stronger climate2 (0.4) is a next-cycle screen; the r-breath graph band makes it visible in the game. |
| 8 to 10 | Chart readability and polish | defer | tools/charts.py polish. |
