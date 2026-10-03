# How the Tallgrass ecosystem stays alive

Plain predator-prey models (Lotka-Volterra) oscillate until something hits zero. Tallgrass stays alive because of the same mechanisms that stabilize real prairies. Each one below was added because a measured failure showed it was missing; `DECISIONS.md` has the history and `review/stability/` has the evidence.

## The food web
- **Grass** grows logistically, driven by season, moisture and soil, with a seed-bank floor so grazed-out ground always recovers. Overgrazing wears soil down; carcasses feed it back.
- **Forbs and shrub browse** are a second plant layer, eaten mostly by pronghorn.
- **Bison** graze grass in herds. **Pronghorn** browse forbs and shrubs, and fall back on grass only at reduced value. Different diets let them coexist (niche partitioning); with a shared diet, pronghorn drove bison extinct.
- **Wolves** hunt in packs. **Cougars** (opt-in scenario) ambush from cover. **Ravens** scavenge. Wolves eat only from kills; natural deaths feed ravens and the soil.

## What keeps it stable
1. **Prey age structure.** Healthy adult bison in a herd are very hard to kill, and wolves test them and break off. Predation lands on calves, the sick, the old and the isolated.
2. **The selfish herd.** Wolves strongly prefer animals on their own, so staying in the herd pays and herding doesn't evolve away.
3. **Herd defense of calves.** A calf inside a herd is shielded by every adult nearby, not just its mother.
4. **Hidden fawns.** Pronghorn fawns lie still in the grass while the doe grazes nearby, the real recruitment refuge of pronghorn.
5. **Prey switching.** Packs learn a search image from recent kills, and wolves rate prey by how catchable it is. Fast healthy pronghorn mostly escape, but wolves are endurance hunters and win the long chases.
6. **Territories and strife.** Wolf packs need space (den spacing), bud new packs into free ground, and fight at borders. Inter-pack strife is the top natural cause of wolf death in Yellowstone, and it gives wolves a density ceiling. Cougars hold exclusive ranges, and young cougars leave the valley if there's no room.
7. **Lean times.** Wolves can live on small game when no herd is near, but pups can only be raised on real kills, so wolf numbers still fall after a prey crash.
8. **Migration.** When a herd's patch is spent, it heads for greener pasture on a coarse 16 m map, and the grazed ground rests and recovers.
9. **The landscape of fear.** Kill sites stay frightening for a while; grazers avoid them, so grass there recovers.
10. **Realistic lifespans.** Bison live about nine times their age at maturity. With shorter lives, old age alone turned the herd over every year and left no margin for predation; that single change took 40-year bison persistence from 69% to 100%.
11. **Density-dependent disease** flares in crowded herds as a backstop.

## Evolution
Every animal carries speed, size, sight, boldness, herding, coat and litter genes, passed on with mutation. Trait costs are physical: big bodies hold more reserves but need more grass and run slower, and speed costs energy mainly while sprinting. Over centuries you see a real arms race: bison get faster and bigger, and wolves get faster in response (`review/stability/v2-9762475/baseline/traits.png`). Coat darkness is kept within each species' believable range, so bison stay dark and wolves stay pale.

## Evidence
- Trophic cascade, Yellowstone style: `review/stability/cascade/trophic_cascade.png`.
- 20 worlds past 1,000 bison generations (600 to 670 years): bison, wolves and ravens 20/20, pronghorn 15/20. `review/stability/v4-5df7663/`.
- Shocks over 120 years (70% cull, two-summer drought, wolf wipeout and return): `review/stability/v4-5df7663-shocks/stability_overview.png`.
- 32 worlds x 40 years: bison, wolves and ravens 32/32, pronghorn 30/32.

## Known weakness (being worked on)
Regulation is mostly bottom-up. Bison breed fast enough to outgrow a nearly constant wolf load, so most bison deaths are starvation after a boom, and wolves are pinned between a territory ceiling and a small-game floor, so their numbers barely respond to prey. `tools/dynamics.py` measures this (births per capita, death shares, wolf lag). Slowing the ungulates alone opens a predator pit after the opening boom; the current experiments make wolves food-limited at both ends.
