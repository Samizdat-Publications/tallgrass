# A bigger valley: feasibility (read-only study, 2026-10-09 06:10)

The owner allowed a bigger valley if it helps. Tonight's v10 does not change the size; this is the evidence for the next planning session. File references are as of main 7467e9e.

## Verdict
Feasible, effort **L** overall (sim plumbing M, renderer M, rebalancing M or more). Recommended only as a staged project, starting with plumbing that keeps 512 m bit-identical.

## Why it is not a constant change
- **Ecology:** grass per square metre is fixed, so carrying capacity grows with area. A 768 m valley would carry about 2.25x the animals and 1,024 m about 4x, not "the same animals, spread out". Anchors that would need re-screening: wolfPreyRef 1000 (params.ts), immigration rates, challenge thresholds. If the goal is fewer carpets, a bigger valley needs a grass productivity knob too.
- **Hard-coded 32 x 32 coarse grids** (16 m cells only at 512): sim.ts (7 literal sites), sp/muledeer.ts, worker.ts TRAIT_GRID, and COARSE_N users in smallprey.ts, winter.ts, hoppers.ts, trees.ts, sp/raptor.ts; render smalltex.ts, snowdepth.ts, overlay.ts, smalloverlay.ts. A missed site mis-indexes silently.
- **World generation counts that do not scale:** 3 ponds, 340 trees, 900 shrubs; noise relative to size (hills stretch instead of multiplying); populate() always makes 6 bison herds and 5 pronghorn bands.
- **Renderer assumptions of the 512 square:** the far-field rect (FAR_ORIGIN -768, FAR_SIZE 2048, centred on 256: terrain.ts, common.ts, cloudshadow.ts), hill shadow 512 texels, grass macro noise repeating every 512 m, camera presets (wide 410 m, top 690 m; a 1,024 m top view needs about 1,400 m).
- **Costs that grow with area:** terrain mesh (257 squared to 385 or 513 squared vertices), n x n vegetation textures (256 KB per snapshot to 576 KB or 1 MB every 200 ms), tree and shrub instances, n squared main-thread loops per vegetation frame, world generation (creek distance about 3.4x at 768). Costs that stay flat: grass blades (drawn within 175 m of the camera), animals, sun shadows.
- **Hard-coded coordinates:** scenarios.ts LIGHTNING_SPOTS, ui/describe.ts regionWord (its own WORLD_SIZE 512), several capture tools centred on 256, and tests (storms, raptor, weather2, smallprey, director, describe).

## Suggested stages
1. Plumbing with 512 unchanged: a valleySize param (it travels through setup, URL, share code and worker init already), world.coarseN, every literal 32 replaced, render grids sized from the world. Golden hashes must not move.
2. Scale-aware world generation (noise in metres; trees, shrubs, ponds, rocks and the rim band scaled to area), with 512 still identical.
3. Renderer: far rects centred and sized from the world, shadow resolution scaled, camera presets scaled, describe.ts fixed.
4. A 768 m scenario with headless screens, a grass productivity knob for "same animals, more room", a new golden hash.
5. A size option on the setup screen; 1,024 m only after a GPU benchmark and tick profiling.

## An alternative that may get most of the benefit sooner
Bison herd bands (branch s-bands, off by default) split the herd into separate groups with grass between them inside today's valley; with the v10 fewer-packs change the wolves already have more room. If the carpets are the main reason for a bigger valley, screen bands first.
