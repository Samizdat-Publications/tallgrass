# r-perf profile (R17), 2560x1440, High, RTX 5070 Ti Laptop

Method and caveats. The GPU was shared all day with other builders' captures and benches and a CPU at 100 percent, so absolute times
move by several ms between runs and clocks were throttled at times. Every number below is a GPU timer query (EXT_disjoint_timer_query_webgl2).
Two kinds of measurement were used so the noise cancels:
- per-pass segments (`tools/r17_prof.mjs --mode seg`): each composer pass, the shadow map and every draw family get their own timer query.
  Small segments are fuzzy (a query boundary drains the pipeline), so they rank, they do not add up exactly (sum is about 1 ms under the frame).
- toggles (`--mode toggle`): hide or disable one thing, interleaved A,B,B,A blocks in one page, lowest block of each condition (the least
  disturbed). Raw log: `toggle_low_cull0.log`.
- build vs build (`tools/r17_ab2.mjs`): both builds loaded in one browser, blocks interleaved A,B,B,A so outside load hits both.

## Where the time went (low_golden, base c9512f9), segments in ms

| item | before | after |
|---|---|---|
| grass (4 LOD levels, 1.66M instances) | 3.82 | 3.23 (1.11M instances) |
| trees (crowns, bark, shrubs) | 2.84 | 3.15 (noise; untouched) |
| GTAO (AO + denoise fullscreen) | 2.50 | 0.90 |
| animals, camera pass | 1.90 | 1.57 |
| animals, shadow cascades | 1.67 | 0.75 |
| animals, AO pre-pass | 0.37 | 0.12 |
| terrain | 1.85 | 1.33 |
| fog pass | 0.73 | 0.72 |
| tree shadows | 0.62 | 0.63 |
| small prey | 0.54 | 0.03 (noise) |
| sky | 0.30 | 0.11 |
| god rays 0.29, bloom 0.21, grade 0.09, output 0.09, finish 0.06, scene copy 0.10 | same | same |
| sum of segments / whole frame (seg tool) | 18.2 / 19.2 | 13.6 / 14.8 |

night (herd, dayFrac 0.97): terrain 2.37 to 1.86, GTAO 1.44 to 0.62, animal shadows 1.38 to 0.56, animals 1.35 to 1.08, trees 1.26 to 0.90,
grass 1.19 to 1.02, whole frame 13.3 to 9.0.

Toggle deltas on the base (what the frame loses when the thing is removed; noise about plus or minus 0.6): AO off -3.5, grass hidden -3.6
(all blades culled in the vertex shader still -2.5, so about two thirds of the grass cost was launching blades that die at once),
terrain hidden -3.2, animals hidden -2.8, trees hidden -2.5, shadow pass off -2.4 (animals' casters -1.2, trees' casters about 0),
MSAA off -2.0, bloom -1.9, sky -1.1, fog -1.1, small prey -0.8, god rays -0.3.

This week's additions (the suspected 3 ms): the eye-adaptation meter (GradePass all in 0.09 ms: an 8 x 6 cell pre-pass, not a full frame pass),
the cut dip (a uniform in FinishPass, 0.06 ms), trails (hidden at 1x, no draw), and the close-range ground grain (inside the terrain shader)
are all small. The time was in things that scale with the number of animals and blades the frame submits (hundreds of bison, 1.7M grass
instances) and in the full-size AO. Those are what was fixed.

## What was changed and what it saved (low_golden, lowest block, build vs build)

Interleaved build-vs-build (`ab2_run1.json`, 6 rounds, lowest block): base vs r-perf
wide_golden 11.15 to 10.05, low_golden 17.55 to 13.70, herd 10.52 to 8.31, top 10.43 to 8.91, winter 10.86 to 9.79, night 12.56 to 10.63,
blizzard 11.99 to 9.79, storm 13.12 to 10.09 ms. Medians are noisier (other processes). A second 8-round run was cut short because the
machine was too loaded to be meaningful (its low_golden still read 35.6 to 14.8). Please bench on a quiet GPU.

1. Animal per-instance cull (animals.ts, engine.ts pre-render hook, main.ts): quadruped batches hold every animal in the world (570 bison) and
   each was drawn by the camera pass, the AO pre-pass and both shadow cascades. Rows are now partitioned into in view / casts a shadow into the
   view (sphere grown by the shadow's reach, body height over tan of the light elevation, cap 80 m) / dropped; the camera passes draw the first
   group, the shadow passes the first two. Near-LOD puppets copy only from the in-view rows. Seg: animal shadows 1.67 to 0.75, camera 1.90 to 1.57,
   AO pre-pass 0.37 to 0.12. `?cull=0` turns it off. Equivalence (same page, dt 0, `tools/r17_cullcheck.mjs`): 0 to 0.2 percent of pixels
   differ, max 1 level except one wide-view bison where draw order of two overlapping bodies changed (143 pixels, `cullcheck/result.json`).
2. Grass launches fewer dead blades (grass.ts): a blade's rank in its cell is now its thinning threshold and positions are uniform in the
   cell, so a cell needs only its first ceil(N x keep) blades; cells are bucketed by that share (9 buckets, per-bucket blades per cell via
   uniform tables, one draw per level as before). Instances: low 1.66M to 1.11M, herd 638k to 311k, night 934k to 457k. Grass 3.82 to 3.23 ms
   in low, 1.19 to 1.02 night. Blade positions are a fresh random scatter of the same density (not the same blades), see the stills.
3. GTAO at half size with a depth-aware upsample (post.ts): AO and denoise run at 0.5 scale, the normal/depth pre-pass stays full size and the
   composite weights the four nearest AO texels by depth from that pre-pass, so there is no leak over silhouettes. GTAO 2.50 to 0.90 (night
   1.44 to 0.62). Same page A/B (`aocheck/result.json`): 0.15 to 0.5 percent of pixels differ by more than 8 levels, only on animal outlines;
   the ground averages about 2 percent darker. `?aoscale=1` restores full size; `post.setAoScale(s)` at run time. The three.js copy-then-multiply
   output was also replaced by a single multiply pass (same product).
4. Terrain drawn after the grass, trees and animals (engine.ts renderOrder 5): early-Z rejects ground shaded under blades. Terrain 1.85 to 1.33
   (night 2.37 to 1.86).
5. Sky drawn last at the far plane with the depth test (sky.ts): early-Z rejects the sky shader under everything. Sky 0.30 to 0.11 (night 0.12 to 0).

## Look set

Before and after frames (`before/`, `after/`, JPEG q90) were captured by `tools/r17_cmp.mjs`: the sim starts paused and steps exactly 900
ticks, the clock is frozen, each shot waits 100 rendered frames, so a loaded machine does not change the state. Frames lk_02..lk_10 (lk_01
skipped: running the concept step first made the two builds diverge in env easing). Same trees, terrain, sky, water, animals, light; stats of
the foreground grass (mean colour and contrast) match to about 2 percent in lk_02 and lk_09. What still differs frame to frame and is not
from these changes: cloud-shadow patches (they accumulate per rendered frame), small differences in animal poses from snapshot interpolation,
and the new grass scatter. Pixel diff numbers from `tools/r17_diff.py` are therefore large (6 to 35 percent of pixels over 8 levels) and say
nothing by themselves; judge by eye. The official idle-machine baseline in `review/wip/day/baseline/` cannot be reproduced under this load
(the sim's start tick drifts), so the comparison is against the base build run through the same harness.

## Next

- Trees are now the largest single cost (about 3 ms in low_golden): alpha-tested leaf cards with no early-Z. A depth pre-pass for crowns, or
  fewer lobes in LOD1, are the options.
- Grass: 1.1M instances still launch in low_golden; a finer cell size at the ring borders or a per-blade ring bound would cut more.
- MSAA 4x on the half-float target is about 2 ms of resolve and bandwidth; a 2x option on the Medium preset is the obvious lever.
- Terrain fragment shader (1.3 ms) and the fog pass (0.7 ms) could skip work at distance.
