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
12. **Slow breeders (checkpoint v5).** A bison cow calves about once a season-and-a-half of sim time and lives longer; pronghorn breed more slowly too. A herd can no longer double in a season and then starve, so fewer deaths are starvation and more are predation.
13. **Prey switching by abundance (type III).** Wolves put their effort where prey is common: a species' weight in their hunting choices is N / (N + 150). A crashed species gets a refuge instead of being hunted to the last animal.
14. **A staggered start.** Founding cows begin part-way through pregnancy or rest, so the first calves don't all arrive in one pulse (that pulse used to set off a boom, a crash and a predator pit).
15. **Small game is lean.** Voles and ground squirrels keep a wolf alive, but only at half the old rate, so wolf numbers can't coast through a prey crash for years.

## Evolution
Every animal carries speed, size, sight, boldness, herding, coat and litter genes, passed on with mutation. Trait costs are physical but mild: big bodies hold more reserves and resist wolves but need more grass and run a little slower, and a fast build adds a small metabolic cost that grows with activity. In the first century bison get faster and bigger under wolf pressure; then both traits sit near their limits (0.6 to 1.6 of the founders) and herding fades, because the costs are too weak to hold them back. Wolf traits mostly drift. A real arms race that keeps running needs steeper costs (see DECISIONS.md, 04:55 Sunday). Coat darkness is kept within each species' believable range, so bison stay dark and wolves stay pale.

## Evidence (checkpoint v5 on the 2x calendar is the default since Sunday 06:10; classic-calendar v5 and v4 kept for comparison)
- 2x calendar (a valley year of 1,200 ticks, biology per tick unchanged): 20 worlds past 1,000 bison generations (1,220 to 1,402 valley-years): bison, wolves, ravens and pronghorn 19/20 each; bison cycle about every 10 years and recover from a crash in about 8. `review/stability/cal2-2a5caf9/`. 300-year shocks: `review/stability/cal2-2a5caf9-shocks300/` (merged with a re-run of seeds 15 to 20).
- v5: 20 worlds past 1,000 bison generations (720 to 750 years): bison, wolves and ravens 20/20, pronghorn 18/20. `review/stability/v5P-4875c69/`.
- Trophic cascade, Yellowstone style: `review/stability/cascade/trophic_cascade.png`.
- v4: 20 worlds past 1,000 bison generations (600 to 670 years): bison, wolves and ravens 20/20, pronghorn 15/20. `review/stability/v4-5df7663/`.
- Shocks over 120 years (70% cull, two-summer drought, wolf wipeout and return): `review/stability/v4-5df7663-shocks/stability_overview.png`.
- 32 worlds x 40 years: bison, wolves and ravens 32/32, pronghorn 30/32.

## Known weaknesses (being worked on)
- Wolves are pinned near a ceiling set by space (den spacing fits about six packs), so their numbers respond to prey only weakly (annual CV about 0.1) and the graphs show prey cycles more than predator cycles. Where pronghorn and small game carry the wolves through a bison crash, the wolves can grind a herd out (seed 11). Prey-scaled pack sizes (`wolfPreyRef`) make wolves track bison but cost pronghorn over centuries; screens pairing them with a stronger refuge for rare prey are in DECISIONS.md.
- Ravens sit on a nest-site ceiling (flat line); making carrion limit them crashed them out.
- A severe drought starves the whole valley at once, so 10 to 15% of worlds lose their herds after one. Drought refuges along the water (`droughtRefuge`, off by default) soften it (fewer collapses, faster recovery); not yet tested over 1,000 generations.
- Evolution plateaus within a century (see above).
