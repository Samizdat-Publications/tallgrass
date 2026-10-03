# Tallgrass: design

## Concept
A drone's-eye nature documentary of a tallgrass prairie valley that runs itself. Grass greens and cures with the seasons, bison herds graze it down and move on, wolf packs hold territories and shadow the herds, ravens circle every kill, and carcasses feed the soil that grows the next grass. Over hundreds of in-game years the populations boom, crash, and recover, and heritable traits drift and race against each other. The player watches, follows individual animals, reads the chronicle, and plays god with weather, fire, plague, culls, and reintroductions.

Pillars, in priority order:
1. **A real ecosystem, measured.** Predators control herd size; the system oscillates within bounds and recovers from shocks. Proven by headless batch runs.
2. **Beautiful at a glance.** Golden-hour documentary look. Readable: dark bulky bison, pale lean wolves, golden vs green vs bare grass.
3. **Legible cause and effect.** When something happens, the player can see why: a fear map, a chronicle entry, ravens over a carcass, a grazed-out brown patch.

## Core loop (player)
Watch (drone camera, follow-cam, graphs) -> notice (chronicle event, swing in a graph, a stampede) -> poke (god tool) -> watch the response ripple through the trophic levels -> try a scenario or seed.

## Time scale (compressed on purpose)
| Unit | Ticks | At 1x (10 ticks/s) |
|---|---|---|
| Sim tick | 1 | 0.1 s |
| Day/night cycle | 400 | 40 s |
| Season | 600 | 1 min |
| Year | 2,400 | 4 min |
| Bison generation (mean parent age at birth) | ~1,000 | ~1.7 min |

Why: the brief wants 1,000+ herbivore generations headless in minutes. At a target of under 0.6 ms per tick, 1,000 bison generations is ~1M ticks, about 10 minutes per seed, and 16 threads run 20 seeds in about 20 minutes. Individual lives (2 to 5 minutes at 1x) are still long enough to follow in documentary mode.

## World
- 512 x 512 m valley (1 unit = 1 m). Procedural heightfield: rolling hills, a meandering creek through a valley floor, a few ponds, rocky ridges, cottonwood groves along the water.
- **Vegetation grid:** 256 x 256 cells (2 m each, 65,536 cells). Per cell: grass biomass, capacity, soil fertility, moisture, fear, trampling. Updated in strided passes (1/8 of rows per tick) so cost stays flat.
- Static fields precomputed at world gen: height, slope, distance-to-water and its gradient (so thirsty animals can descend it cheaply), cover (tree groves and shrubs).

## Species (vertical slice first, then layers)
| Level | Species | Role | Key behaviors |
|---|---|---|---|
| Producer | Grass | main forage | logistic regrowth driven by season, moisture, soil; seed-bank floor so bare cells recover; overgrazing degrades soil; trampling |
| Producer | Shrubs / cottonwoods | browse + cover | slow growth, fire-killable, provide refuge (rabbits) and ambush cover (cougar) *(depth)* |
| Herbivore | **Bison** | grazer, herd | herding, vigilance (more eyes = earlier detection), alarm contagion -> stampedes, calves follow mothers, drink at water |
| Herbivore | Pronghorn / deer | fast browser | fast, small herds, shrub + grass diet *(depth)* |
| Herbivore | Rabbits | fast-breeding small prey | short generations, hide in shrubs, prey for foxes and hawks *(depth)* |
| Predator | **Wolves** | pack hunter | packs with dens and territories, dispersal founds new packs, only the alpha pair breeds once a year, satiation and handling time, prefer weak, young, old, or isolated prey |
| Predator | Cougar | ambush hunter | solitary, exclusive territory, stalks from cover near water *(depth)* |
| Predator | Fox | small predator | rabbits *(depth)* |
| Scavenger | **Ravens** | scavenger + readability | circle in the sky, converge on carcasses; carcasses decay into soil fertility *(depth, early)* |

## Stability levers (built in from day one)
- Logistic regrowth with a seed-bank floor (no permanent deserts).
- **Holling type II:** handling time while feeding on a carcass, satiation stops hunting.
- **Type III-like:** prey switching to whatever is encountered most; low-density prey hide better (refuges, herd vigilance).
- **Predator territoriality:** a bounded number of packs, each with a territory; only alphas breed. This caps predator density spatially and damps the classic Lotka-Volterra blow-up.
- **Maturation delays and reproduction costs** on both levels.
- **Landscape of fear:** kills write to a decaying fear map; grazers weigh fear against food, so high-risk ground recovers (trophic cascade, Yellowstone style).
- **Density-dependent disease** at very high herbivore density as a backstop.
- **Spatial patchiness:** water, groves, ridges make heterogeneous habitat; predators travel, prey migrate to greener areas.

## Genetics and evolution
Each animal carries a genome of floats: `speed`, `size`, `sight`, `boldness`, `herding`, `litter`, `coat` (0 = pale, 1 = dark). Offspring take each gene from a random parent plus Gaussian mutation. Trade-offs:
- speed costs energy (metabolism scales with speed squared)
- size costs energy but makes bison harder to bring down
- sight costs a little energy
- **coat** sets detectability: detection range scales with contrast between coat and local ground color (season-dependent). Selection should visibly shift coat colors over generations, shown in the herd's actual colors and in trait charts.
Arms race readout: mean wolf speed vs mean bison speed over time.

## Interventions (god tools)
Rain, drought, wildfire (spreads over dry grass, wind-driven), plague, cull (70%), introduce a species, remove a species, plant a grove. Scenarios: Yellowstone reintroduction (no wolves, then 6 wolves), Island (no predators, boom and bust), Keystone removal, Hard winter, Collapse to save.

## Art direction
**"Drone documentary, golden hour."** **North star (owner ruling): `art/concept/00_prairie_golden_hour.jpg`. The owner said this is almost exactly how he wants the game to look.** Match it: high oblique drone angle, warm low sun from one side, gold grass with green lowlands along the creek, rounded cottonwood groves, a silver creek, dust plumes behind the herd, long shadows, haze toward the horizon. Painterly-grounded realism, not low-poly toy.
- Palette: cured gold grass, sage and spring green where it's lush, umber earth, cottonwood green, creek silver-blue. Warm sun, cool blue shadows.
- Readability: bison near-black brown with a hump silhouette; wolves pale grey with light underside; ravens black specks circling. Grazed ground reads as short brown stubble; trampled paths are visible lines.
- Light: sun on a slow day cycle that spends long stretches near golden hour, a short blue night with moonlight, fog and haze in valleys at dawn.
- Motion: wind waves rolling across the grass field (the signature shot), dust plumes behind running herds, birds circling.
- Seasons: spring green-up, summer gold, autumn rust, winter pale straw with frost.
- Post: AgX tone mapping, GTAO, soft bloom on the sun, gentle vignette, color grade per time of day.

## UI concept (detailed in DESIGN-UI.md)
The sim is the star. Thin, translucent panels at the edges that collapse to icons. Editorial typography (documentary title cards). Time controls bottom center; population graph bottom left; chronicle right; inspector appears on selection; god tools in a left rail; scenario and seed picker on the title screen and in a menu. Cinematic mode hides everything.

## Audio (depth)
ElevenLabs: prairie wind beds per season, meadowlarks by day, crickets and wolves howling at night, rain and thunder, bison rumble during stampedes, raven calls. Music swells with ecosystem tension (predator-prey ratio swings, mass die-offs).
