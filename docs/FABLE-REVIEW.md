# Fable review of Tallgrass

Date: 11/11/2026. Build reviewed: v1.0.12 (checkpoint v14), commit b30f53c. Reviewer: Claude Fable 5.2 as the new head of the project.

How this was done: I captured the 10-frame look set from the current build and looked at every frame beside the concept art. Two Fable passes read the code, one for the sim (about 9,000 lines) and one for the renderer (about 15,000 lines), and I checked their main claims at the cited lines myself. Each claim below is marked **measured** (I ran it today), **read** (seen in the code or a results file at the line given) or **inferred**.

The stills I judged are in `review/fable-audit-2026-11-11/`.

## 1. Where it stands

### Strong
- **It is a finished, live game.** 105,000 lines, 982 commits, 41 review rounds, a deterministic sim with a golden hash, and a 600-year stability checkpoint (v14) that passes every gate.
- **The sim core is built the right way.** Struct-of-arrays typed arrays, bucket grids, staggered thinking. Measured today: 937 ticks per second on one thread with about 1,650 animals, which is about 47 valley-years per minute.
- **The low golden-hour herd shot is good** (`lk_02_golden_low.jpg`). Bison shapes, god rays and sky hold together as a real game.
- **The GPU benchmark is solid** (`tools/gpubench.mjs`): GPU timer queries, A/B order, fails on a software rasterizer.
- **There is frame budget left.** The heaviest view is 14.5 ms against 16.7 ms at 1440p (read, `MORNING.md:91`), so 2 to 3 ms can be spent on looks.
- Typecheck is clean in 18 seconds (measured).

### Weak, in order of how much it holds the project back

**A. Nothing visual can be measured, because the capture is not repeatable (measured).**
I ran `node tools/stills.mjs --set look` twice on the same commit. The frames differ:

| Shot | Pixels that changed by more than 8 levels |
|---|---|
| wolves close | 95% |
| bison close | 84% |
| pronghorn close | 70% |
| winter mid | 52% |
| golden low | 50% |
| midday mid | 46% |
| herd mid | 36% |
| concept framing | 16% |
| golden wide | 7% |

A look change smaller than that noise cannot be scored, only argued. This is why 41 review rounds kept returning the same complaints: each round was judged by a fresh critic from frames that were never the same twice. (The second run was taken while the test suite ran beside it. That is the point: the old capture waits in wall-clock time, so machine load changes the picture.)

**B. The wide and mid views are far from the concept, and the gap is in four frame-wide systems, not in props (my eyes, backed by the code read).**

| What the concept has | What the game shows | Where it comes from |
|---|---|---|
| Hills covered in grass to the horizon: streaks along the slopes, a sheen toward the sun, dark troughs | Beyond the near field the ground is a smooth tan surface with blotchy noise. At midday it reads as sand dunes (`lk_08_midday_mid.jpg`) | Grass blades stop at 175 m (`grass.ts:77-83`) and the scanned ground detail fades out by 90 m. Past that, most of the frame is one ground shader with no grass character |
| Raked light: sunlit slopes against shaded slopes, long shadows | Slopes facing the sun and away from it have almost the same value. Haze is a pale wash from one corner that lifts the blacks over half the frame (`lk_03_golden_wide.jpg`) | Ambient is a single two-colour hemisphere light (`engine.ts:310`). The sky is ten hand-keyed palettes (`sky.ts:22-43`), and the fog, the grass and the animals each carry their own copy of the sun |
| A bright creek that mirrors the sky | The creek reads as a grey road (`lk_01_concept.jpg`) | The water shader reflects an analytic sky but ends up darker than the land at grazing angles, and the creek is narrow and even |
| Animals that sit in the grass | In one herd the near bison are textured and the ones 20 m behind turn flat dark grey (`lk_05_bison_close.jpg`). Hooves rest on top of short sparse blades | Near and far animal meshes use different materials. Only the far mesh casts a shadow (`animals.ts:598`), and contact is a blob quad (`contact.ts:5`) |

Close and low, the game holds up. Wide and mid, where the camera spends most of its time, it does not yet.

**C. The ecosystem passes its gates, but not by the mechanism the game says it shows (read and verified).**
The brief's first test of success is "herd size is controlled by predators". Since the feeding bout went in (v13):
- Wolves cause **6% of adult bison deaths, against 30% before** (`review/stability/rebalance-2026-10-26/RESULT.md:36`).
- The herd is held by a rule that loses calves when the valley head count passes a **fixed 600** (`sim.ts:1890-1897`). That number does not move with climate, drought or grass.
- Pronghorn are **pinned from outside**: each spring a group walks in to refill toward 367 (`sim.ts:3311-3323`), and the measured means are 370 and 384.
- Persistence gates are partly met by rescue arrivals (pronghorn, mule deer and prairie dogs at least: `params.ts:710-744`).
- The wolf capacity rule counts bison and pronghorn but not mule deer (`sim.ts:675-680`).
- The chain of fixes is visible in the params: the feeding bout and lie-up (for looks) cut kills by 64%, then `feedBoutAge` 300, then `conceiveEnergy` 0.7, then `bisonCrowdCalf`. Each one covers the gap the last one opened.

Nothing is broken. But a player who removes the wolves, or brings a drought, is poking a system whose main regulator is a constant. The trophic story is weaker than the charts suggest. `ECOLOGY.md` stops at v6 and does not describe any of this.

**D. Balancing is slow and its tools are not in the repo (read).**
The last rebalance took three days and four hand-run rounds (10/26 to 10/28). A 400-year screen is about 5.7 CPU-hours for 20 seeds. The scripts that judge shocks, droughts and ceilings live only in the gitignored `scratch/rb`, and their run data was deleted on 10/30. Yet the project's own results show that 8 seeds for 150 years already separated the winners from the losers, and that a handful of "canary" seeds (seed 3 above all) fail first in nearly every losing screen.

**E. The state files no longer tell a cold session where things stand (read).**
`NEXT-SESSION.md` was a 57 KB log whose header said "updated 10/04". `_PLAN.md` said v2 had not started. `CLAUDE.md` says "private repo only" but the repo has been public since the 1.0 release. `DESIGN.md` says the tone map is AgX and the code uses ACES. There are 171 files in `tools/`, most of them one-off shot scripts, and about 95 local branches.

**F. Found in passing**
- Capture broke today because another project's Playwright install pruned the shared browser cache. Fixed with `npx playwright install chromium`; the new gate checks for it.
- Three shipped animal models are **CC BY-NC** (wolf, mule deer, pronghorn; `CREDITS.md:11-13`) in a repo that is now public. That is fine for a free game with credit. It rules out any paid or ad-supported use until they are replaced. See question 4.
- A raven can eat from a carcass slot that was reused by another carcass, for at most 5 ticks (`sim.ts:2589-2595` against `1223-1225`). Fixing it changes the golden hash, so it rides with the next checkpoint.
- No Node version pin, though the golden hash depends on the JavaScript engine's exact math functions.
- About 16 params from failed experiments still branch inside the hottest function.

## 2. What I would do differently

Ranked by how much each moves the result for the effort. The rule for all of it: **harness first, then looks and logic side by side, each change measured on fixed shots or fixed screens before it is adopted.**

### Looks

| # | Change | What it replaces | Effort | Frame cost (inferred) |
|---|---|---|---|---|
| L1 | **Ground and grass become one surface.** The far ground carries the grass look: the same palette function as the blades, a sheen toward the sun, wind bands sweeping the slopes, darker troughs and lighter crests. Near the camera the blades get taller and denser with a dark base, so hooves sink in | A blade system that stops at 175 m and a ground shader that knows nothing about grass | L | about 0.5 ms |
| L2 | **One sun.** First fold the three uniform sets and four copies of the lighting code into one shared chunk. Then: ambient taken from the sky itself (so shade gets a cool, directional fill), stronger hill shading at low sun (the horizon map is 512 px), haze as distance and height fog lit by the same sun, and the tone curve settled by an A/B (ACES or AgX) with metered exposure | Hemisphere light, keyed sky, separate fog and per-system suns | M, then M | about 0.3 ms |
| L3 | **Water that mirrors the sky.** At grazing angles the creek takes the bright horizon and a sun glitter path; the creek gets wider and uneven | A creek that reads as a road in wide shots | M | small |
| L4 | **Grounding.** Far animal meshes take the near mesh's colour and light response so the herd has no seam. Screen-space contact shadows along the sun ray. Near meshes cast shadows | Flat grey mid-distance animals, blob shadows | M | 0.5 to 0.8 ms |
| L5 | **Trees.** Canopy outline, leaf colour variation, a cleaner far hand-over, and a palette that sits with the land at midday. This is the owner's own MAYBE-WANTS item | Dark lumpy crowns in wide shots, cartoon green at noon | M | none |

**Not now, and why:**
- **A port to Godot or another engine.** The owner allowed it (ruling of 10/04). I recommend against it. The gap is in the lighting model and in surface continuity, and every item above fits in WebGL2 inside the frame budget. A port restarts about 15,000 lines of shader and scene code plus the director and UI, and would take the live web build with it.
- **WebGPU and TSL.** Headless capture got no WebGPU adapter on this machine (`ENVIRONMENT.md:28`), so the harness would lose its eyes. Same rewrite cost.
- **Temporal anti-aliasing.** It would fix canopy stipple and blade shimmer, but vertex-animated grass and animals need motion vectors. High risk. Revisit after L1 to L4.

### Logic

| # | Change | What it replaces | Effort |
|---|---|---|---|
| S1 | **A balancing loop that runs itself.** One versioned `gates` tool (adoption, shocks, drought, ceiling, means). Staged screens: 8 seeds for 150 years as a filter, then 20 for 400, then shocks. Canary seeds first, stop a screen the moment a gate is lost, one screen at a time on all cores, and every config appends a row to a sensitivity table | Hand-run rounds, four screens fighting for cores, scripts in scratch | M |
| S2 | **A dynamics truth table.** Real-world ranges with sources (share of adult bison deaths from wolves, herd change when wolves are removed, calving rate, wolves per 1,000 prey, and so on), checked against each screen. The sim's version of the photo scorecard | Gates that only ask "did it persist" | M |
| S3 | **One recruitment rule for every grazer: young raised follows forage per head.** The code already computes it for pronghorn (`sim.ts:3268`). It moves with climate and grass, so a drought lowers the ceiling instead of meeting a fixed 600 | `bisonCrowdCalf`, `bisonCrowdRef`, `leanLitter`, `deerOutK`, `deerBref` | M code, L screening |
| S4 | **One intake index for every hunter.** "Breed on last year's intake" is written three different ways (coyotes, ravens, wolves). Give wolves the coyote form, and count mule deer | `wolfPreyRef`, `wolfLitterBase`, `wolfLitterSpan`, `wolfBreedStore` | M |
| S5 | **Predation matters again, with the lie-up kept.** Target: wolves cause 15 to 30% of adult bison deaths and removing them visibly changes the herd, with drought losses no worse than v14. This is checkpoint v15, and it comes out of S3 and S4, not another patch | The patch chain in section 1C | L |
| S6 | **Housekeeping, no balance change.** Retire the dead params behind a "retired keys" list so old share codes still load. Split `sim.ts` along the seams `sp/` already uses. Add a longer guard hash (3 seeds, 240,000 ticks, every optional system on). Pin Node. Rewrite `ECOLOGY.md` to say what regulates what | 3,757 lines in one file, a short golden that barely touches rare paths | M |
| S7 | **100x speed as a "perf checkpoint".** The exact-hash rule blocks the clean optimisations. Do them in one pass, validate it statistically against v14, then re-record the golden | Owner's open item: 100x reaches 45 to 60x | L |

### Structure
- `animals.ts` has one 1,324-line `update()` (lines 2115 to 3439). Split it into takedown and feeding choreography, raven planning, dust and splash emitters, and instance writing. Do it before L4.
- Materials are patched by string replace on three.js chunks (`common.ts:359-399`), which breaks silently on a three upgrade. Add a warning on every missed replace, as the shadow patch already has.
- Archive the one-off shot scripts once `tools/shots.mjs` covers them.

## 3. Harness gap check

| # | Part | Status on 11/11/2026 | Smallest work to close |
|---|---|---|---|
| 1 | Capture | **Partial.** `tools/stills.mjs` has fixed sets, but the pixels are not repeatable (section 1A) | H1: `?capture=1` mode with a fixed frame clock and seeded effects, `tools/shots.json`, `tools/shots.mjs --verify` |
| 2 | Reference set | **Partial.** Three concept images in `art/concept`; only the golden-hour one is owner-approved; no sources file | H2: `reference/shots`, `reference/SOURCES.md`, the other two marked provisional |
| 3 | Scorecard | **Partial.** `tools/look_stats.py` scores colour bands of two frames against the concept; no history, no drift check | H2: `tools/scorecard.py` with a concept score per referenced shot, pixel drift against accepted baselines, and history |
| 4 | Contact sheet | **Partial.** One-off sheet scripts per round | H2: one `sheet.jpg` per scorecard run (reference, current, baseline, difference) |
| 5 | Performance | **Exists.** `tools/gpubench.mjs` | H7: a budget file and a pass or fail in the full gate |
| 6 | Truth tests | **Partial.** 40-odd unit tests and a golden hash guard regressions, but they compare the sim with itself, not with real numbers | S2: the dynamics truth table. S6: the longer guard hash |
| 7 | Lints | **Missing** | H6: `tools/lint.mjs` (em dashes, secrets, big files, credits, links, Node pin) |
| 8 | Gate | **Missing.** `npm test` and `npm run typecheck` are separate, nothing checks pictures | H7: `tools/check.mjs` (preflight, typecheck, lint, tests, gate shots with drift check) |

Sim-side harness (not in the standard's eight, but the same idea): **S1** the balancing loop and **S2** the truth table.

## 4. Routing

Per `docs/ROUTING.md`. Fable is the main session; it designs, looks at every capture and decides. Tags used in `_PLAN.md`:

- `[fable]`: every look decision and contact-sheet review; the designs for L1 to L5; the recruitment and intake rules (S3, S4); choosing the truth-table targets; adoption calls.
- `[builder]` (Opus): H1, H2, H6, H7; S1 tooling; shader and sim implementation from a written design; the `sim.ts` and `animals.ts` splits.
- `[grunt]` (Sonnet): running screens and summarising them, archiving old tools, pruning merged branches, credits and licence lists, log triage.
- `[scout]` (Haiku): sourcing the truth-table numbers, API lookups, "where is X".
- `[verifier]` (Opus): fresh-eyes check before each checkpoint.
- `blind-critic` stays for outside-view rounds, now fed the deterministic shots.

## 5. Questions for the owner (each has a default; work continues on the default)

1. **Engine.** Stay on three.js and WebGL2 and spend the effort on L1 to L5? **Default: yes.**
2. **Is "wolves hold the herd" still the goal?** It is the brief's first success test and it is no longer true. **Default: yes, aim for it in checkpoint v15 (S3 to S5), keep the lie-up, and show you the charts before anything goes live.**
3. **References.** Only the golden-hour concept is approved by you. May I score the night and early-summer shots against the other two concept images? **Default: yes, marked provisional until you say so.**
4. **Licences.** Wolf, mule deer and pronghorn models are CC BY-NC in a public repo. **Default: keep them (free game, credited), record it as a constraint, and have the lint warn on any new NC asset.**
5. **Looks go live only after you see a contact sheet.** **Default: yes, as with every earlier look change.**
6. **Housekeeping.** Archive the one-off scripts in `tools/` and delete local branches that are already merged? **Default: archive the scripts; leave the branches until you say.**
