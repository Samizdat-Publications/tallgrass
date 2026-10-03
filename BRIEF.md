# Creative Brief

You have full creative and technical discretion. This brief gives you a vision, a quality bar, and some guardrails. It isn't a spec. Anything here labeled an idea is optional. Make the game you'd want to make, log your decisions, and move on.

## The pitch

*(This paragraph is also the only context the blind critics get. Keep it in sync with `.claude/agents/blind-critic.md` if you refine it.)*

> A living-ecosystem simulation game. Grass grows, grazers eat and multiply, predators hunt and multiply, and over thousands of generations the whole system finds its own balance: booming, crashing, recovering, and never quite settling into a flat line. The player is part nature-documentary viewer, part god: they can follow an individual animal's life, watch the population graphs, and step in with weather, disasters, or new species to see how the ecosystem responds. It should be beautiful enough to leave running on a second monitor and interesting enough to watch for an hour.

Think of it as Conway's Game of Life grown up into a real ecosystem: simple rules, deep emergent behavior, with real graphics.

## What success looks like by morning

1. **It works as an ecosystem, and you've measured it.** Herd size is controlled by predators, and the system reaches a dynamic equilibrium (bounded oscillation, recovery from shocks) without hand-holding. Prove it with headless batch runs, not by eyeballing one session.
2. **It looks good.** Someone glancing at a screenshot should think "that's a real game," not "that's a tech demo."
3. **It's fun to watch and to poke.** Things happen, the player can understand why, and interventions have visible, interesting consequences.

### Stability acceptance (starting point: refine the thresholds, log your reasoning)

- Run 20 random seeds headless at default settings for 1,000+ herbivore generations. All core species should persist in at least 80% of runs.
- Populations should oscillate within bounds. No trophic level should spend long stretches near zero or explode past carrying capacity.
- **Shock recovery:** after a forced 70% herbivore cull, a drought, or a predator wipeout followed by reintroduction, the system returns to its prior range within a reasonable time.
- **Liveliness:** at default speed, a viewer should see meaningful population swings and visible events within a few minutes. A perfectly flat equilibrium is a failure too.
- Save the charts and the metrics table in `review/stability/` and summarize them in `MORNING.md`.

## Simulation depth (go as deep as you can while staying stable)

Start with three trophic levels that work, then layer complexity. A menu of ideas:

- **Producers:** grass with regrowth that depends on soil moisture and nutrients, wildflowers, shrubs, trees with seed dispersal and succession, overgrazing that degrades soil, fire.
- **Herbivores:** grazers (bison or cattle), browsers (goats or deer), fast-breeding small prey (rabbits). Each with different diets, speeds, and reproduction strategies.
- **Predators:** pack hunters (wolves) and ambush hunters (big cats), with territory, satiation, and hunting success that depends on prey condition.
- **Scavengers and decomposers:** carcasses feed vultures or crows and return nutrients to the soil, closing the loop.
- **Environment:** terrain, water sources, rivers, seasons, day and night, weather, drought, floods, fire, disease outbreaks at high density.
- **Individuals:** energy, hydration, age, maturation delay, fear, herding and flocking, vigilance (more eyes means safer herds), mate finding, parental care, life history.
- **Genetics and evolution:** heritable traits (speed, size, sight range, metabolism, litter size, coat color) with mutation and selection. Over thousands of generations you might see arms races (faster predators, faster prey) and adaptation to biomes. This is the "thousands of generations" payoff, so make it visible.

Ecology levers that tend to produce stability (use what fits): logistic regrowth, Holling type II/III functional responses (handling time, satiation, prey switching), spatial patchiness and refugia, predator territoriality, reproduction costs and maturation delays, density-dependent disease, migration toward greener areas, and the "landscape of fear" (prey avoid risky areas, so vegetation recovers there, as in the Yellowstone wolf trophic cascade). Plain Lotka-Volterra on its own tends to oscillate to extinction. Spatial structure and behavior are what save it.

**Scale:** aim high, then profile. A rough target: a large vegetation field (tens of thousands of cells or a GPU texture), thousands of herbivores, hundreds of predators, at 60 fps on an RTX 5070, with headless runs of 1,000+ generations in minutes. Use data-oriented design, spatial hashing, and LOD for both sim and render. Log the numbers you actually reach.

## Visual bar

- Pick an art direction early, write it in `DESIGN.md`, and generate concept art (Nano Banana) to anchor it. One idea: a nature documentary shot from a drone, with golden-hour light, wind moving through the grass, dust kicked up by stampedes, trampled paths, and seasons and weather visibly shifting the palette. Stylized works too, if it's coherent and polished.
- **Readability beats realism.** At a glance the viewer must be able to tell grazers from predators and see where the herds and hunts are.
- Animating thousands of animals with full skeletons won't scale. Look at GPU instancing with vertex animation textures (bake them in Blender) or shader-driven procedural gaits, with impostors at distance.
- The target is the owner's RTX 5070, so use it: shadows, ambient occlusion, volumetric fog, good post-processing, within the frame budget.

## Gamification ideas (pick, remix, or invent)

- **God tools:** rain, drought, wildfire, plague, introduce or remove a species, cull, plant a forest, divert a river.
- **Scenarios with known interesting outcomes:** a predator reintroduction (trophic cascade), an island with no predators (boom and bust), keystone species removal, an invasive species, an ice age, a collapse to save.
- **Seeds as shareable codes,** with a curated list of named seeds that do something remarkable.
- **Challenges:** keep biodiversity above a threshold for N years using only K interventions, or rescue a collapsing ecosystem.
- **Documentary mode:** a follow-cam on one animal with its life story (birth, lineage, hunts, close calls, death), a family tree, an auto-generated chronicle of the world ("The Great Drought of Year 212").
- **Time controls:** pause, 1x, 10x, 100x, and "skip to the next interesting event."
- **Overlays:** vegetation, predation pressure / fear map, genetic trait heatmaps, migration flows.
- Photo mode and a cinematic mode with the UI hidden.

## UI

Do a deliberate design pass before you build the UI. Use any design skill or plugin this Claude Code session has (for example a frontend-design skill). Write `DESIGN-UI.md` with layout, typography, color, and information hierarchy, mock it up, then build it. The simulation is the star, so the UI should be elegant, collapsible, and out of the way. It needs to cover: time controls, live population graphs (per species, with a log-scale toggle), an inspector for the selected animal, overlays, the event chronicle, the god-tools palette, and the scenario and seed picker. UI screenshots go through the blind critic too.

## Audio (once the core is solid)

Ambient soundscapes that change with biome, time of day, weather, and season; animal SFX; music that reacts to ecosystem tension. Optional: a narrator voice for major events. If you add one, design an original voice. Do not imitate any real narrator.

## Stack decision criteria (your call; write it up as an ADR)

Requirements whatever you pick: the sim core is renderer-independent, deterministic from a seed, and runs headless much faster than real time. The owner is on Windows 11 with an RTX 5070. A URL-hostable build would be a nice bonus (his other projects deploy to Cloudflare from GitHub), but a native exe is fine.

| Option | Strengths | Watch out for |
|---|---|---|
| **Godot 4** (installed) | Best native fidelity for the effort on this GPU (Forward+, volumetrics, MultiMesh instancing), plus Movie Maker mode for deterministic video capture | GDScript is too slow for thousands of thinking agents, so put the sim core in C#, C++ (GDExtension), or compute shaders. Web export uses the lower-fidelity Compatibility renderer, and C# web export has historically been unsupported (check the current status if a URL build matters to you). |
| **Three.js / WebGPU** (his existing pipeline: static files, Cloudflare) | Ships to a URL trivially and is playable anywhere. Sim can run in Workers, WASM, or WebGPU compute. Headless sim runs in Node. | Lower visual ceiling than native; browser throttling during capture (see CLAUDE.md section 6) |
| **Unity** (installed) | DOTS/ECS is built for huge agent counts | Heavier setup, licensing and editor friction for unattended CLI work |
| **Custom C++** | Total control | You'd spend the night writing an engine. Not recommended. |

## Toolbox notes

- **Blender** (installed): headless Python (`blender -b -P script.py`) for procedural models, LODs, terrain, and baking vertex animation textures. Renders can also make marketing stills.
- **Gemini:** Nano Banana image generation and editing for concept art, terrain textures, skyboxes, and UI icons; video understanding for the video critique. Check the current model list instead of hardcoding names.
- **Meshy:** text- or image-to-3D for hero animal models. Check whether its rigging/animation supports quadrupeds before you rely on it.
- **Mixamo:** humanoid-only and has no official API, so it's essentially no use for animals. Skip it unless a biped shows up.
- **Sketchfab:** the download API needs a token. CC0/CC-BY only, with attribution in `CREDITS.md`.
- **ElevenLabs:** sound effects, ambience, music, and (optionally) an original narrator voice.
- **PixelLab:** pixel art; only if the chosen style uses it (maybe icons).
- A **ComfyUI** install may exist in the owner's Documents\Claude folder. It's optional; don't modify it.

## Name

Invent a short, evocative name. The project folder stays `ecosystem-sim` (renaming it breaks Claude Code's history). The repo and the game can use the new name.
