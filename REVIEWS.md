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
