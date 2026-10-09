# Day plan: Friday 2026-10-09 ~15:30 to Saturday 2026-10-10 ~15:30

Written in the planning pass (extra-high effort) on Friday afternoon, for the 24-hour run that follows at high effort. Times assume a 15:30 start; if the start moves, shift the clock times and keep the order. The owner plays tonight.

## 1. Where we are

**Working (keep it, don't spend the day here):**
- **Ecology is solved enough.** v10b passes every gate over 1,200 valley years: bison 20/20, every species >= 90% present in 20/20, wolf CV 0.26, wolves track bison at 0.54, mule deer 70, wolves 1:17. Shocks recover in every world. The 45-year "breath" is real and visible on the graph. Ecosystem believability went from 5 to 7 with the critics.
- **The wide and drone views** read as painterly landscapes (critics: 7 to 8). The climate look, the long exposure and the species colours at speed work.
- **UI and story:** UI clarity 7 to 8 in every recent round. The chronicle, field notes, narrator, rare sightings, the documentary director v3 and the cuts all land.
- **The machinery:** golden hashes, frozen-worktree acceptance runs, capture tools, one-step deploy. Main is clean and live (13:04).

**Not working, and where we are stuck:**

| # | Problem | Evidence | Root cause |
|---|---|---|---|
| 1 | **Close-up animals look like clay.** Bison are dark blobs with a frosted rim, wolves merge into one grey mass. | Round 22: close-ups 3 to 4 of 10 against wide shots 7 to 8. Its single change: "make the close-up follow view look as good as the wide shots". | Every animal is a lofted procedural mesh with vertex colours only: no texture, no real anatomy. Ten rounds of procedural polish have hit that ceiling. |
| 2 | **Motion scores are stuck at 2 to 4** across ten video rounds, despite foot lock, IK, gallop spine flex and splashes. | Rounds 14 to 24. | Two causes. (a) The measuring tool: `tools/gemini_video_review.py` sends the video with no frame-rate setting, so Gemini samples **1 frame per second** and cannot see a gait cycle; everything slides. (b) Real gaps: herds don't react to a passing wolf, a kill reads as a bump, wolves run on the river surface. |
| 3 | **The ground up close is a brown smear** with dark blotches. | Rounds 22 to 24, plus my own look at the follow-camera stills. | The terrain is all procedural noise; no photo detail at all. |
| 4 | **Low golden-hour shots go purple and muddy**, and trees read as yellow cauliflower. The concept score has sat at 4/10 for days. | `review/round-22/05_golden_low.jpg` next to `art/concept/00_prairie_golden_hour.jpg`. | Grade, haze and dusk ambient are tuned per feature, never against the concept as a whole. Tree crowns are blob geometry. |
| 5 | **Bison carpet.** | Every round since 15. | Herd bands (built, off) split the herd but cost 12 to 15% of the bison in six variants. |
| 6 | **Snow looks like cow print.** | Rounds 22 and 23. | The fix exists on branch `r-snow`; it waited for an idle machine to measure frame cost. The machine is idle now. |
| 7 | **Never measured on an idle machine:** 100x speed, the GPU bench after this week's merges. | Last night's runs had 3 CPU batches going. | Low golden view was already 15.5 of 16.7 ms; visual upgrades must pay for themselves. |

## 2. Bang for the buck

| Item | What the owner sees | Effort | Risk | Verdict |
|---|---|---|---|---|
| Fix the motion measurement (Gemini frame rate, a close-range motion reel) | Nothing directly; stops us chasing a broken score | S | none | **Do first** |
| Golden-hour look toward the concept (grade, haze, warm shadows, grass back-light) | Every frame | M | low | **Do** |
| Real ground up close (CC0 photo textures blended near the camera, fix blotches) | Every close and follow shot | M | low | **Do** |
| Merge `r-snow` after an idle bench | Every winter | S | low | **Do** |
| Animals v3: authored meshes on our existing rig | The close-ups, the weakest thing in the game | L | medium | **Spike first (3 h gate), then roll out** |
| Animals that notice (render only: alert heads, kill dust and feeding, wading, flier shadows, wet ground) | Life and motion | M | low | **Do** |
| Trees v3 with ez-tree (MIT): real branching, bark, leaf cards, bare winter crowns | Wide and mid shots; fixes the parked winter-tree problem too | M to L | medium | **Spike, then roll out if clearly better** |
| v11: herd bands that keep the herd (CPU screens, acceptance, shocks overnight) | Fewer carpets | CPU hours | low | **Do, in the background** |
| Bigger valley | Room | L+ (reopens the ecology) | high | **Not this run** (VALLEY-SIZE.md) |
| 300x or "skip a decade" | Faster centuries | M | low | **Not this run** unless the idle 100x measurement is poor |
| New species, WebGPU, engine port | | L+ | high | **No** |

## 3. The plan

Three lanes run at once: up to **3 builders** on GPU and code work, the **CPU** on the v11 sim pipeline, and **the lead** (me) on briefs, reviews, merges, benches and deploys. GPU benches and A/B captures run one at a time, by the lead, never while a builder is capturing.

### Block 0: 15:30 to 16:15, set up and measure the baseline
- Deadline 2026-10-10 15:30 into `.claude/hooks/run_until.local.txt`. Quota check.
- On the idle machine: `tools/gpubench.mjs` baseline for every view on main; the achieved rate at 100x; the `r-snow` A/B (A,B,B,A).
- **Look set:** a fixed capture script of 10 views (concept bookmark, golden low, mid-range herd, close follow bison, close wolves at rest, a chase, a kill, water crossing, night, snow) at 1600x900, so every change is judged before and after on the same frames. Saved to `review/wip/day/baseline/`.
- **Look stats:** a small free tool (`tools/look_stats.py`) that compares sky, far, mid and near bands of a capture with the concept: luma, saturation, hue, contrast. It replaces the stuck Gemini concept score as the day-to-day measure.
- **Gemini frame rate:** add `videoMetadata.fps` (8 for clips of 40 s or less) to `tools/gemini_video_review.py`, and a `--set motion` reel in `tools/video.mjs`: 1x close and mid shots of walking, running, a chase, a kill, a water crossing.
- CPU starts **v11 screen 1** (below).

### Block 1: 16:15 to 19:30, three builders
- **B1 `r-look`, golden hour like the concept.** Warm back-lit sun, a sun-side haze glow, aerial perspective that layers the hills into paler warm bands, lifted warm shadows at low sun (no purple crush at dusk), grass tips catching the light. Grade by time of day, so night and winter keep their look. Gates: look stats move toward the concept in at least 4 of 5 bands at the concept and golden-low views; no regression in the night, winter, drought and megadrought views; +0.2 ms at most.
- **B2 `r-ground`, real ground up close.** CC0 photo textures (Poly Haven or ambientCG: dry grassland soil, short stubble, gravel, mud, burn), albedo and normal at 1K to 2K, world-space with anti-tiling, blended in within about 60 m under the grass and keyed to the existing ground state (dry, green, burnt, snow, wet). Find and fix the dark blotches. Gates: the close follow views show legible ground; +0.3 ms at most in the low golden view; textures logged in CREDITS.md and ASSETS.md.
- **B3 `a3-spike`, authored animals (3-hour spike).** Bison and grey wolf only. Source CC-BY or CC0 static models from Sketchfab (free; attribution in CREDITS.md), with Meshy as the fallback (746 credits left; spike cap 100). A converter (`tools/import_animal.mjs`): decimate to about 6 to 8k triangles, align and scale to our model frame, label every vertex with our parts (legs by distance to the leg bones from `legRig`, knee weights, head and neck weights, tail), set the pivots, and either bake colours or add an optional UV and albedo texture path to the animal shader. The existing gait, foot lock, IK and poses then drive the new mesh unchanged. Near LOD only; the far LOD stays procedural. **Gate at 3 hours:** stills at 8, 20 and 45 m (stand, walk, gallop, graze, lie) and a 10-second 1x clip, side by side with today's; my eye and a fresh blind critic asked "which looks more like a real animal". Clearly better and foot lock intact: roll out. Otherwise stop, and fall back to procedural close-up pass 2 (coat colour variation and fur shells, rim tone, pack bodies that keep apart at rest, lying legs).
- **Lead:** briefs, then the `r-snow` merge if it fits the budget, then review and merge B1 and B2.
- **CPU:** from 18:00 to 23:00 the batches drop to 8 threads so the owner's play session stays smooth (sooner and lower if he says he is playing).

### 19:30 to 20:00, deploy D1 for tonight's play
Merged: look, ground, snow (each only if it passed its gates), the measurement tools. Playtest, live check, before-and-after stills sent inline, MORNING.md top section updated with what to look at.

### Block 2: 20:00 to 00:00
- **Animals:** if the spike passed, roll out bison and wolf near LOD (`a3-bison-wolf`): every pose, the carcass, juveniles, mange and coat traits, the dense-herd budget. If it failed, procedural close-up pass 2.
- **B `r-life`, animals that notice (render only, no sim change, golden hash untouched):** grazers within about 60 m of a moving predator lift their heads, turn head and ears toward it and stop chewing, with tail flicks; a dust puff at a takedown, a real feeding posture with tugging, pack mates at their slots; wading (legs sink to the water line, spray, never running on the surface); flier shadows placed from altitude; wet ground darkening in and after rain, softer rain streaks.
- **B `r-trees-spike`:** ez-tree variants for cottonwood, willow and juniper with bark and leaf cards, plus bare winter crowns, instanced. Same 3-hour gate as the animals: clearly better and within budget, or it stops.
- **Review round 25** (fresh blind critic, the look set plus charts) at about 22:30 on main; triage; fix the top 3.
- **CPU:** v11 screen 2.

### Block 3: 00:00 to 08:00 (owner asleep)
- **CPU:** v11 acceptance (20 worlds x 1,200 years) and shocks (12 x 500 years x cull, drought, wolf wipeout) from a frozen worktree at full threads, about 3 hours side by side.
- **Builders:** the animal rollout for pronghorn, mule deer, coyote and cougar (in that order); trees rollout if the spike passed; round 25 fixes.
- **Video round 26** at about 03:00, the first with real frame-rate sampling: the motion reel plus the usual reel; triage; fix the top 3.
- **Performance gate** at about 05:00: every bench view on High at 16.7 ms or less. If a view is over, the near-LOD counts and the grass LOD 0 trim (R17, never done) pay for it before anything new merges.
- Deploys D2 about 01:00 and D3 about 07:30, each with playtest and live check.

### Block 4: 08:00 to 15:30
- **Adopt v11** if every gate passes (below), then deploy.
- **Review rounds 27 (stills) and 28 (video)** at about 10:00; fix the top 3.
- The making-of page republished with the day's journey images (read the artifact first); the landing page refreshed (M3 item 5) if there is time.
- Final deploy D4 about 14:30, MORNING.md with the adversarial self-audit, NEXT-SESSION.md, stop by 15:30.

### v11 on the CPU: bison in bands that keep the herd
The last six band variants lost bison to local overgrazing (tight bands) or to predation (loose bands). New lever: **bands move on** when the grass under them runs low (a band-level grazing rotation, as real herds do), so tight bands stop overgrazing.
- Screen 1 (32 worlds x 200 years, 6 variants: control v10b, bands with move-on at 2 thresholds, x 2 band sizes, plus the best old variant). Every variant is a param, off by default; off reproduces golden 77fd982c, 2fc8dc7c, 37517a14.
- Screen 2: the best variant against its control, 32 worlds x 400 years.
- Acceptance and shocks overnight. **Gates:** the standard ones (V2-PLAN section 3) plus bison mean within 5% of v10b, and a herd-shape measure that shows real separation (bands per 500 bison, nearest band distance from `tools/herdshape.py`).
- If no variant keeps the herd, v10b stays, and the night's CPU goes to a stronger climate screen (climate2 0.4, round 21 item 7) instead.

## 4. Gates that apply to everything
- **Sim:** new behaviour is a param, off by default; `npm test` reproduces the golden hash with it off. No `this.rng.fork()` in new code.
- **Render:** before and after on the look set; GPU A/B (A,B,B,A) on an idle GPU; the low golden view must stay at 16.7 ms or less, and each WP stays within its own budget.
- **Merges:** `npm test`, typecheck, build, playtest, then the live check after each deploy.
- **Reviews:** a fresh blind critic per round with only the folder path; Gemini with frame-rate sampling; triage in REVIEWS.md (fix, defer or reject, with a reason).
- **Assets:** CC0 or CC-BY only, attribution in CREDITS.md; every paid call in ASSETS.md (Meshy cap for the day: 300 credits; Gemini about $1).

## 5. Quota
Weekly use is 31% at 14:30 (resets Thursday 2026-10-15 14:00). The last 24 hours used about 31 points, so a full day at that pace ends near 62%, leaving room for the rest of the week.
- **Targets:** at most 40% by 20:00, 50% by 02:00, 58% by 09:00, 65% at the end.
- **If ahead of the targets:** drop to 2 builders. Cut in this order: the trees track, the last two species of the animal rollout, review round 27.
- **5-hour window at 90%:** commit, push, and wait for the reset. Never into paid extra usage. The 85% and 90% weekly rules still stand.

## 6. When the owner is around
- **Tonight:** D1 (about 19:30) is the build to play. Say "playing" and the CPU batches drop to 4 threads until you say "done".
- **Decisions you may want to overrule now** (each will be logged in DECISIONS.md):
  1. Animals from authored meshes (Sketchfab CC-BY with attribution, or Meshy at up to 300 credits), driven by our own rig. Near LOD only.
  2. Photo ground textures (CC0) near the camera.
  3. A third-party tree generator (ez-tree, MIT) if its spike wins.
  4. No bigger valley in this run.
  5. v11 is adopted only if it keeps bison within 5% of v10b.

## 7. Fallbacks
- A spike that misses its gate stops at 3 hours; its branch is pushed for reference and the procedural fallback takes the slot.
- A frame-budget overrun blocks the merge until the WP pays for itself.
- If the CPU runs slip past 13:00 Saturday, v11 ships as a named scenario and adoption moves to the next session.
- If quota runs short, Block 4 shrinks to: deploy what is verified, MORNING.md, NEXT-SESSION.md.

## 8. Done looks like (Saturday 15:30)
- Close follow shots that hold up next to the wide shots: textured animals (at least bison and wolves), real ground, the golden light of the concept.
- Animals that notice predators, kills that read as kills, no wolves on water.
- Snow without cow print; trees with real branches if the spike won.
- A measured motion score from a critic that can see the motion, and look stats closer to the concept.
- v11 adopted (bands that keep the herd) or a clear record of why not.
- Everything deployed, every bench view within 16.7 ms, MORNING.md audited.
