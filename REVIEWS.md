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
