# Tallgrass v2.0 plan

> **For agentic workers:** use the project's builder protocol (CLAUDE.md section 2): the lead writes a brief per work package (WP), a `builder` subagent (Sonnet) implements it, and the lead reviews the diff, runs the gates in this plan, and commits. That is superpowers:subagent-driven-development with a single lead review per WP. Don't add more review stages, to save quota. Steps use checkboxes (`- [ ]`). Read sections 0 to 6 once per session, then only the WP you are on.
>
> **Format note:** this is a multi-week roadmap, not a single feature. Each WP has a spec, files, interfaces, gates and verification commands. Code is sketched only where the logic is subtle; builders write the rest from the spec.

**Goal:** take Tallgrass from a working v1 to v2.0:
- animals that move and fight like animals
- a landscape that matches the concept image
- predators that rise and fall
- 12 species with interactions you can see
- weather and events that unfold on screen
- more to play with

**Architecture:** the stack is unchanged: TypeScript sim in a Web Worker, Three.js WebGL2 renderer, DOM UI, Vite, Cloudflare.
- New ecology goes in new sim modules behind params. A param set to off must reproduce the golden hash exactly. Adoption happens only through measured screens and the acceptance run.
- Render work is measured with GPU timers against per-WP budgets.

**Spec sources:** BRIEF.md, DESIGN.md, ECOLOGY.md, REVIEWS.md (12 rounds), DECISIONS.md, this plan. Visual north star: `art/concept/00_prairie_golden_hour.jpg`.

---

## 0. Your questions, answered

**Switch effort here, or start a new session?** Start a new session.
- This one already carries over 200K tokens of context, and every turn re-sends it.
- The plan and notes live in the repo, so a fresh session at medium effort starts cheap and loses nothing.

**What happens when you click Accept:** this session does only Step 0 (section 12):
- puts this plan in the repo
- logs your rulings
- makes the git branch and notes the next session needs
- then gives you start instructions

No feature work happens here.

**Is Opus 5.5 at medium effort with Sonnet 5.5 builders enough?** Yes, for this plan.
- The judgment calls are made here: what to build, which ecology settings get adopted and by what rule, the art targets, and the pass/fail numbers. The executor's job is to implement and measure against written gates.
- Medium is weakest at open-ended diagnosis when a test fails and at taste calls. Each risky WP below has a fallback rule for that case.
- Three WPs are marked ★. If you happen to be around when one starts, bump the effort to high for it:
  - S3: adopting the new ecology
  - R1: the foot and leg math
  - S14: beavers and moving water

**Can the cloud credits do this work?** Partly.
- What a cloud session is: a Linux VM cloned from GitHub. It has no GPU, no `.env` keys, no Cloudflare login, and no Gemini or ElevenLabs.
- So it can't render the game, take review screenshots or videos, time the GPU, or deploy.
- It can do everything on the CPU side: the simulation and ecology (about half of v2), headless test runs, unit tests, and chronicle text and logic.
- Recommendation: run that half (Track S) in a cloud session on the credits, and the graphics half (Track R) locally on your quota.
- First, a 2-minute test to confirm the credits are spent instead of your weekly quota (the docs don't say). Instructions come with the handoff.
- When the credits run out or expire (Nov 5), Track S continues locally from the same branch with nothing lost.

---

## 1. Owner rulings (2026-10-04)

1. **Species for v2: all four groups.**
   - Coyotes, jackrabbits and prairie dogs
   - Golden eagles and red-tailed hawks
   - Mule deer, plus cougars that can make a living
   - Beavers and changing water
2. **Open prairie by default.** The valley is part of a wider prairie that animals can leave and enter. The sealed valley stays as a setting and for challenges.
3. **First focus before Thursday's quota reset: a bit of everything.** Motion and takedowns, the concept look, the first new species, storms.
4. **Quota guard.** Local sessions:
   - stop starting new work at 85% of the weekly limit and wrap up
   - stop at 90%
   - never run into paid extra usage
   - the lead may end a run by writing the current time to `.claude/hooks/run_until.local.txt` (section 4.4)
5. **Team.** An Opus 5.5 lead at medium effort, Sonnet 5.5 builders, Gemini for video critiques, and the blind critic once per milestone.
6. **Standing rulings from v1:**
   - the concept image is the north star
   - no em dashes anywhere
   - never ask the owner; decide and log the decision
   - send screenshots inline as they are made
   - journey images go in `journey/`
   - never run two local sessions in this folder at once

## 2. What v1 taught us (these shape v2)

1. **Closed-valley tweaks kept costing persistence.** About 20 screens of behaviour changes in a sealed valley each cost some. Open prairie gives a rescue effect (animals leaving and recolonizing), so predators can boom and crash without a species vanishing for good.
2. **Pronghorn under hungry wolves starve; they aren't hunted out.** Wolves hold the bison down, the freed forage lets pronghorn overshoot, and then they crash. The fixes are density-dependent seasonal migration and coyote predation on fawns, not more escape speed.
3. **Wolves are capped by den spacing (about six packs), not by breeding.** Disease (distemper and mange) and immigration can move their numbers without touching the prey.
4. **Ravens are capped by nest sites.** Making carrion limit their breeding crashed them out. Instead, use a floating vagrant population that carrion draws in.
5. **Close-range motion is the weakest score.** Life and motion scored 1 to 3 in every Gemini round. The causes are all at close range:
   - stance feet slip, because the legs swing as a sinusoid
   - feet don't meet the slope
   - wolves stand still at a kill
   - nothing has weight

   All of it is render-side, so fixing it carries no ecology risk.
6. **Wide shots are darker, greener and noisier than the concept.** The creek reads as asphalt and the trees as lollipops. The engine ships ACES tone mapping although the docs say AgX. Fix light, haze, palette and water before adding geometry.
7. **16-seed results swing about 10%.** Decide on 32 seeds × 200 valley-years, then confirm with the 20-world, 1,000-generation acceptance run.
8. **`Rng.fork()` draws from the main stream** (rng.ts:68-70). A new fork in the constructor changes every run, even with its feature off. New subsystems must seed their own Rng (section 5).
9. **The worker loses events.** When the sim trims its event array (sim.ts:1853-1856), the worker's index-based cursor drops a window of events (worker.ts:214-215 and the skip loop at 237-244).
10. **Gemini scores swing 2 to 3 points between runs of the same build.** Judge the trend across rounds, not one score.
11. **A new species touches about 40 hard-coded spots** across sim, worker, render, UI, audio, director and the Python tools, and the worker's trait grid stops at 8 species. A species registry comes first.

## 3. v2 targets (measured, not vibes)

| Pillar | Gate |
|---|---|
| Life up close | Foot slip in stance (dev rig): ≤ 5% at walk and trot, ≤ 8% at gallop. Gemini "life and motion" ≥ 5 in two consecutive video rounds (v1: 1 to 3). |
| A living ecosystem | Default world over 1,000 bison generations:<ul><li>Wolves: annual CV ≥ 0.2, and lagged correlation with prey ≥ 0.4 at 1 to 3 years.</li><li>Ravens: CV ≥ 0.1.</li><li>Every species present ≥ 90% of sampled time in ≥ 18 of 20 worlds.</li><li>Bison (still closed) persist in ≥ 19 of 20.</li></ul> |
| Species | 12 species, each with at least two interactions you can see: bison, pronghorn, wolves, ravens, cougars, coyotes, jackrabbits, prairie dogs, golden eagles, red-tailed hawks, mule deer, beavers. |
| Events | At least 10 new event kinds. Each gets chronicle text and a director shot or field note, plus a narrator line where it fits. |
| The concept look | Gemini concept-match score ≥ 7 of 10 at the concept bookmark (tools/concept_compare.py, R0). Stills critic visual score ≥ 8. |
| Performance | 1440p GPU median ≤ 16.7 ms in every bench view on High (tools/gpubench.mjs). 1x and 10x hold their speed. |
| Play | Field guide, share codes, valley setup, settings, and at least 4 new challenges. |

## 4. How to execute

### 4.1 Session modes
- **Single (local):**
  - One session does every WP in the section 6 order.
  - This is the default, and the fallback whenever the cloud is unavailable.
- **Two tracks (only if the credit test passes):**
  - Track S runs in a cloud session on branch `v2-sim`. It covers the sim, ecology, headless runs, tests, and UI text and logic.
  - Track R runs locally on `main`. It covers render, animation, audio, UI visuals, reviews, merges and deploys.

### 4.2 Session protocol (every session)
- [ ] **Start-up:**
  - Run `git pull`. Track S instead runs `git fetch origin && git checkout v2-sim && git merge origin/main`.
  - Read CLAUDE.md, this plan's sections 0 to 6, and NEXT-SESSION.md (Track S reads TRACK-S.md instead).
- [ ] **Check the build:** `npm test` must be green (it exists after S0).
- [ ] **Take the next WP:**
  - Take the first unchecked WP for your mode.
  - Brief a builder with:
    - the WP text, verbatim
    - the files to touch
    - the gates and verification commands
    - section 5's constraints
  - When the builder is done:
    - review `git diff`, especially shared files that other builders also edit
    - run the gates
    - commit and push
- [ ] **Sim changes:**
  - Every change starts as a new param that is off by default, and `npm test` (golden hash) must stay unchanged.
  - Then run the screens.
  - The new behaviour becomes the default only through the WP's adoption rule.
- [ ] **Render changes:**
  - Put before and after stills in `review/wip/<WP>/` as JPEG q90.
  - Run `tools/gpubench.mjs --ab`. The delta must be within the WP budget.
  - Send the key stills inline (owner ruling).
- [ ] **Checkpoints:** every 30 to 45 minutes and at every WP end:
  - update NEXT-SESSION.md (Track S: TRACK-S.md)
  - commit and push
  - run the quota guard (4.4)
- [ ] **Judgment calls:** write one line in DECISIONS.md (Track S: the "Decisions" list in TRACK-S.md). Never ask the owner.

### 4.3 Two-track ownership (prevents merge conflicts)
- **Track S writes only these:**
  - `src/sim/**`, `src/headless/**`
  - `src/scenarios.ts`, `src/seeds.ts`, `src/challenges.ts`
  - `src/ui/describe.ts`, `src/ui/feed.ts`, `src/ui/seasonlines.ts`, `src/ui/fieldnotes.ts`, `src/ui/*.test.ts`
  - `tools/*.py`, `tools/*.ts`, `review/stability/**`
  - `TRACK-S.md`
- **Track R writes everything else.** That includes:
  - V2-PLAN.md checkboxes, NEXT-SESSION.md, _PLAN.md
  - MORNING.md, DECISIONS.md, REVIEWS.md, ASSETS.md
  - REQUESTS-R.md
- **Contract files:** `src/sim/types.ts` and `src/sim/worker.ts` belong to Track S. Track R asks for contract changes in REQUESTS-R.md.
- **Track S reports in TRACK-S.md:** finished WPs, decisions, and requests (for example "run the 1,000-generation acceptance for v2-sim@abc1234 on the local CPU").
- **Reading each other's files:**
  - `git show origin/v2-sim:TRACK-S.md`
  - `git show origin/main:REQUESTS-R.md`
- **Track R merges at each checkpoint.** It merges `origin/v2-sim` into `main` once the game runs clean (`npm test`, `npm run build`, two minutes in the live game). Then it copies Track S's decisions into DECISIONS.md and ticks the boxes here.
- **New species ids land only after R0 item 2** (registry-safe render and UI) is on `main`.
- **If Track R is blocked** on unmerged Track S work, pull forward an independent R WP: R7, R8, R9 or R15.

### 4.4 Quota guard (owner ruling 4, local sessions)

**Setup:** load the tool once with ToolSearch `select:mcp__ccd_session_mgmt__get_usage`, then call it at every checkpoint.

**Weekly "all models" usage:**

| Weekly usage | What to do |
|---|---|
| ≥ 85% | Start no new WP. Run M1's wrap-up for whatever is verified: deploy, MORNING.md, journey. |
| ≥ 90% | 1. Finish the current step.<br>2. Commit and push.<br>3. Update NEXT-SESSION.md and MORNING.md.<br>4. Write the current local time (`YYYY-MM-DD HH:MM`) to `.claude/hooks/run_until.local.txt`. This is the owner-sanctioned way to end the run.<br>5. End the turn. |

**5-hour window ≥ 90% (weekly still under 85%):**
- Commit and push.
- Wait for the reset with a background `sleep` (Bash `run_in_background`, at most 2 hours per call, chained as needed). Never keep working into paid extra usage.

**Cloud sessions** can't see these meters. The owner watches the "Cloud session credits" line and stops the session when it runs low.

### 4.5 Cloud specifics (Track S)
- [ ] **Smoke test first.** Record the results in TRACK-S.md.
  - Run:
    - `node -v` (must be ≥ 22)
    - `nproc`
    - `npm ci`
    - `npm run typecheck`
    - `npx tsx src/headless/run.ts --seed 1 --ticks 2400 --every 600`
    - `pip install numpy matplotlib`
  - If `python` is missing, link it to python3 (`ln -s "$(command -v python3)" /usr/local/bin/python`, or a directory on PATH). The Stop hook calls `python`.
- **What the VM lacks:** a GPU and the API keys. Never run capture, review, ElevenLabs, Gemini or deploy tools there.
- **Screens:**
  - If `nproc` ≥ 8, run 32-seed screens with `--threads $(nproc)-1`.
  - Otherwise, run 16-seed direction screens and ask Track R (in TRACK-S.md) to run the 32-seed screen or the acceptance on the local machine. Launching a batch costs Track R almost nothing.
- **The cloud clock is UTC.**

### 4.6 Kickoff prompts (the handoff after Step 0 repeats these with exact values)

**Local, single mode:**
```
You are the Tallgrass v2 lead, running unattended at medium effort. Read CLAUDE.md, then V2-PLAN.md sections 0 to 6, then NEXT-SESSION.md. Mode: single. Work through the WPs in the order of V2-PLAN.md section 6, starting at the first unchecked one, without asking me anything.
My instructions for this run: (1) write "2026-10-08 12:00" to .claude/hooks/run_until.local.txt now; (2) follow the quota guard in section 4.4 (wrap up at 85% weekly, stop at 90%); (3) send me key screenshots inline as you make them.
```

**Local, Track R:** the same prompt, but with this mode line:
```
Mode: two tracks; you are Track R (local, GPU). A cloud session runs Track S on branch v2-sim. Do the Track R WPs in section 6 order, merge origin/v2-sim into main at every checkpoint as section 4.3 says, and handle Track S's requests in TRACK-S.md.
```

**Cloud, Track S:**
```
You are Tallgrass v2 Track S (simulation and ecology), running unattended at medium effort in a cloud VM with no GPU. Run: git fetch origin && git checkout v2-sim && git merge origin/main. Read CLAUDE.md, V2-PLAN.md sections 0 to 7, and TRACK-S.md. Run the cloud smoke test in section 4.5, then write "2026-10-08 12:00" to .claude/hooks/run_until.local.txt (my instruction; this clock is UTC). Work through the Track S WPs in section 6 order without asking me anything. Push to origin v2-sim after every finished WP. Never edit files that section 4.3 assigns to Track R.
```

## 5. Global constraints and gotchas (every WP includes these)

**Writing and repo rules:**
- No em dashes anywhere: code, comments, docs, UI text, commits. Use commas, colons, periods or a spaced hyphen.
- Stay inside the project folder.
- Never force-push.
- Never commit `.env`, review videos (`review/**/*.mp4`), or `run_until.local.txt`.

**Sim determinism:**
- No `Math.random` or `Date` in `src/sim`.
- New subsystems seed their own generator, for example `new Rng(hashSeed(seed + ':storms'))` (salts: storms, smallprey, region, disease, coyote, raptor, trees, beaver).
- Never call `this.rng.fork()` in new code: it consumes a draw from the main stream.
- New code may use the main `this.rng` only on paths that run when its feature is on.
- New params default to off, and off must reproduce the golden hash.
- Rates are per base year (2,400 ticks), like v1's biology. Seasonal timing comes from `env.state.season`.
- Once-a-year litters are divided by `calendarScale`, as wolves do at sim.ts:481.

**Batch runs:**
- Long runs work from a frozen copy: `git worktree add scratch/frozen/<hash> <hash>`, with a `node_modules` junction like `scratch/wt`.
- Never edit sim files while a non-frozen batch is running.
- Set batch timeouts to at least 2.5× the expected time.
- Background Bash commands are cut off at 2 hours, but node children keep running. Check the logs.
- TaskStop leaves orphan node processes. Kill them by command line.

**Windows quirks:**
- Never `sed -i` source files: it turns CRLF into LF. Use the Edit tool, or Python with byte-level CRLF handling.
- Bash heredocs collapse `\\`. Write files that contain backslashes with the Write tool.

**Measurement:**
- GPU A/B needs two runs with the builds swapped (A,B,B,A). An A/A test showed up to 1 ms of side bias.
- Decide on 32 seeds. 16 seeds is ±10% noise.

**Review images:**
- Review stills are JPEG q90.
- Run a fresh blind critic per round and give it only the folder path.
- For video, use Gemini (`tools/gemini_video_review.py`) with the model picked from the live model list.

**Logging:**
- Log paid API calls in ASSETS.md.
- Keep each ElevenLabs batch small; generate more only if the first ones are good.

---

## 6. Roadmap and order

★ means bump the effort to high if the owner is around.

Sizes are agent time:

| Size | Agent time |
|---|---|
| S | ≤ 2 h |
| M | 2-5 h |
| L | 5-12 h |

| Phase | WP | Track | Needs | Size |
|---|---|---|---|---|
| 1 alpha | S0 Foundations: registry, golden hash, event fix | S | - | M |
| 1 | R0 Render baseline, registry-safe render and UI, tone map, concept tool | R | S0 | M |
| 1 | S1 Open prairie | S | S0 | L |
| 1 | S2 Canid disease (distemper, mange) | S | S0 | M |
| 1 | S3 ★ Checkpoint v6: screens, adoption, acceptance | S | S1, S2 | M (+ CPU hours) |
| 1 | R1 ★ Close-range life: foot lock, slope contact, takedowns, weight | R | R0 | L |
| 1 | R2 The concept look | R | R0 | L |
| 1 | S4 Small-prey web: jackrabbits, prairie dogs, plague | S | S0, R0 item 2 | L |
| 1 | S5 Coyotes | S | S4 | L |
| 1 | R3 Render and audio for the new life | R | S2, S4, S5 merged | L |
| 1 | S6 Storm cells and lightning fires | S | S0 | M |
| 1 | R4 Storm visuals | R | S6 merged | M |
| 1 | M1 Milestone: review, fix top 3, deploy, report | R | all above | M |
| 2 beta | S7 + R5 Golden eagles and red-tailed hawks | S, R | S4 | M + M |
| 2 | S8 + R6 Mule deer and working cougars | S, R | S1 | L + M |
| 2 | R7 Animal fidelity: meshes, fur shading, LOD | R | R1 | L |
| 2 | R8 Behaviour library | R | R1 | M |
| 2 | S9 Evolution v2 | S | S3 | M |
| 2 | S10 Herd shape (drink spots, grazing spacing) | S | S3 | M |
| 2 | S11 + R9 Winter (snow depth), night sky | S, R | S3 | M + M |
| 2 | S15 + S16 + R12 Lineage, share codes, Field guide, setup, settings | S, R | S0 | M + M + L |
| 2 | S17 + R13 God tools v2 and new challenges | S, R | S4-S8 | M + S |
| 2 | S12 + R10 Dust storms, grasshoppers, floods | S, R | S6 | M + M |
| 2 | S13 + R11 Dynamic trees and trees v2 | S, R | S6 | L + L |
| 2 | R14 Music and spatial sound; R15 lens and photo mode | R | - | M + M |
| 2 | M2 Milestone | R | | M |
| 3 v2.0 | S14 ★ + R16 Beavers and moving water | S, R | S13 | L + L |
| 3 | S18 Chronicle decades and arcs | S | | S |
| 3 | R17 Performance pass and quality presets | R | | M |
| 3 | M3 v2.0: full acceptance, reviews, landing page, deploy | R | all | M |

### Single-mode order (interleaved so CPU runs overlap render work)

1. S0
2. R0
3. S1 and S2: code only, params off
4. S3 part 1: launch the four screens in the background
5. R1, while the screens run
6. S3 part 2: pick v6; launch the acceptance and shock suite in the background
7. R2, while the acceptance runs
8. S4 and S5: code, coyotes absent by default
9. R3
10. S3 part 3:
    - adopt v6 if it passed
    - screen v6b (small-prey web and coyotes on)
    - adopt v6b by the same rule
11. S6
12. R4
13. M1

Phase 2:

1. S7, R5
2. S8, R6
3. R7
4. R8
5. S9
6. S10
7. S11, R9
8. S15, S16, R12
9. S17, R13
10. S12, R10
11. S13, R11
12. R14, R15
13. M2

Phase 3:

1. S14, R16
2. S18
3. R17
4. M3

### Two-track order
- **Track S:** S0, S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S15, S16, S17, S12, S13, S14, S18.
- **Track R:** R0, R1, R2, R3 (after S4 and S5 merge), R4 (after S6), M1, R5, R6, R7, R8, R9, R12, R13, R10, R11, R14, R15, M2, R16, R17, M3.

---

## 7. Phase 1 work packages (v2 alpha, target: before Thursday's reset)

### S0. Foundations [Track S, cloud OK, M]
Make the code safe for many new species and for changes that stay identical while off.

**Files:**
- Create:
  - `src/sim/species.ts`
  - `src/headless/hash.ts`
  - `tools/golden.json`
  - `tools/run-tests.ts`
- Modify:
  - `src/sim/types.ts`, `src/sim/agents.ts`, `src/sim/worker.ts`, `src/headless/mocksim.ts`
  - `src/sim/sim.ts`: `isHerbivore` and `isPredator` (44-45); the species switches at 184, 198-247, 312, 411-430, 737-747, 863, 984, 1869, 1886-1931, 1992-2020, 2095
  - `tools/charts.py`, `tools/dynamics.py`, `tools/cycle_stats.py`, `tools/mine_seeds.py`
  - `package.json`

**Interfaces produced:**
- `SPECIES: SpeciesDef[]` with the fields shown below
- `npm test`
- the `npx tsx src/headless/hash.ts` command line
- `Sim.eventSerial`
- `St.Migrate = 11`
- flags `F_MANGE = 32` and `F_MIGRANT = 64`
- agent fields `origin` (Uint8: 0 native, 1 immigrant, 2 vagrant), `cdv` (Uint16 countdown) and `mange` (Float32 severity 0 to 1)
- optional snapshot fields `small?: Uint8Array` (32×32×4), `storms?: Float32Array` and `strikes?: Float32Array`
- event kinds added to `SimEventKind`:
  - `immigrated`, `emigrated`, `recolonized`
  - `distemper`, `mange`
  - `townFounded`, `townLost`, `sylvaticPlague`
  - `hareBoom`, `hareCrash`
  - `coyotePups`, `mesoRelease`
  - `storm`, `lightningFire`

**Fixed species ids, so both tracks agree:**
- Existing: Bison 0, Wolf 1, Raven 2, Deer (pronghorn) 3, Rabbit 4 (becomes jackrabbit, a field species), Cougar 5.
- New, each added by its WP: Coyote 6, PrairieDog 7, Eagle 8, Hawk 9, MuleDeer 10, Beaver 11.
- `SPECIES_COUNT` stays 6 in S0.

**Steps:**
- [x] **1. Golden hash first.** Do this before any refactor, then commit.
  - Write `src/headless/hash.ts` (below).
  - Record seeds 3, 7 and 11 at 24,000 ticks with default params in `tools/golden.json`.
  ```ts
  // npx tsx src/headless/hash.ts --seed 3 --ticks 24000 [--params '{"x":1}']
  let h = 0x811c9dc5;
  const mix = (v: number) => { h = Math.imul(h ^ (v >>> 0), 0x01000193) >>> 0; };
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  const mixF = (x: number) => { f[0] = x; mix(u[0]); };
  const BASE = ['bison', 'wolf', 'raven', 'pronghorn', 'rabbit', 'cougar']; // hash these by key, never by array length
  for (let t = 0; t < ticks; t += 600) {
    sim.step(Math.min(600, ticks - t));
    const pop = sim.populations();
    for (const k of BASE) mix(pop[SPECIES_KEYS.indexOf(k)]);
  }
  for (let i = 0; i < sim.a.hi; i++) if (sim.a.alive[i]) { mix(i); mix(sim.a.sp[i]); mixF(sim.a.x[i]); mixF(sim.a.y[i]); mixF(sim.a.energy[i]); }
  for (let c = 0; c < sim.veg.grass.length; c += 7) mixF(sim.veg.grass[c]);
  console.log(`seed=${seed} ticks=${ticks} hash=${h.toString(16).padStart(8, '0')}`);
  ```
- [x] **2. Test runner.** `tools/run-tests.ts` runs, in order:
  - every `src/**/*.test.ts` through tsx
  - `src/headless/metrics.ts --selftest`
  - the golden check

  It exits non-zero on any failure. `"test": "tsx tools/run-tests.ts"`.
- [x] **3. Species registry.** `src/sim/species.ts`:
  ```ts
  export interface SpeciesDef {
    id: number; key: string; name: string; plural: string;
    repr: 'agent' | 'field';
    guild: 'grazer' | 'browser' | 'predator' | 'mesopredator' | 'scavenger' | 'raptor' | 'engineer';
    prey: boolean;     // goes in the prey grid; who may target it is the DIET table
    threat: number;    // 0..1 how hard grazers react to it (wolf 1, cougar 1, coyote 0.3, others 0)
    flies: boolean; traits: boolean; core: boolean;
    color: string;     // UI colour, moved from src/ui/palette.ts
  }
  export const DIET: number[][]; // DIET[predator][prey] weight; replaces hard-coded prey checks
  ```
  - Replace `isHerbivore`, `isPredator` and every species switch in sim, worker, headless and the Python tools with registry lookups.
  - Size the worker's `TRAIT_SERIES` and trait grid by `SPECIES_COUNT`.
  - Python tools read species from the CSV header (`pop_*` columns).
  - The golden hash must not move.
- [x] **4. Event serial.**
  ```ts
  eventSerial = 0; // sim.ts: total events ever emitted; events[0] has serial eventSerial - events.length
  // in event(): push, then this.eventSerial++
  // worker.ts post(): const base = sim.eventSerial - sim.events.length;
  //   const fresh = sim.events.slice(Math.max(0, lastSerial - base)); lastSerial = sim.eventSerial;
  // skip loop (237-244): remember the start serial, not the array index
  ```
- [x] **5. Contract additions** (unused until later WPs, so the hash doesn't move).
  - The new agent fields must be copied when the agent pool grows.
  - `describe.ts` must ignore unknown event kinds without crashing.
- [x] **6. Elder text.** In `describe.ts`, "elder" fires at the animal's death (sim.ts:878-880), so its text must say it died at a great age, not that it "still roams".
- [x] **7. Smoke tool.** `tools/smoke.mjs`:
  - starts Vite and headless Chromium (any GL)
  - loads `index.html?grass=0&q=medium&autocam=0`
  - waits for `__ready`
  - runs `__step(2000)`
  - fails on any console error
  - saves one JPEG
  - in the cloud, if Playwright can't install Chromium, skip it and say so in TRACK-S.md

**Gates:**
- `npm test` is green and the golden hash is unchanged.
- `npm run typecheck` and `npm run build` pass.
- Track R, after merging: the game runs 5 minutes at 10x with no console errors.

### R0. Render baseline and quick wins [Track R, GPU, M]
- [x] **1. Bench tool `tools/gpubench.mjs`.**
  - Promote `scratch/b1/gpubench.mjs`. Fix it so it passes `autoscale=0` and drops the nonexistent `setAdaptiveScale`.
  - Views: wide-golden, low-golden, herd, top, winter, night (R4 adds storm).
  - Measurement: `EXT_disjoint_timer_query_webgl2`, median of 40 frames.
  - `--ab <dirA> <dirB>` runs A,B,B,A and reports the mean paired delta.
  - Commit the baseline as `review/perf/baseline-<hash>.json`.
- [ ] **2. Registry-safe render and UI.** These tables read `SPECIES`:
  - `animals.ts`: `INITIAL_CAPACITY` (:22), `DUST` (:37), `TURN` (:84), `BANK_MAX` (:93), `speciesScale` (:285), and the raven and predator branches at 516-899
  - `fx.ts`: `MARKER` (:423), `PING_TINT` (:442), grid sized by `SPECIES_COUNT` (:500)
  - `models/index.ts`
  - `palette.ts` and the `--sp-N` CSS vars, generated from the registry at startup
  - `describe.ts` (90-92, 145), `inspector.ts` (22-23), `traits.ts` (16), `popgraph.ts` (29), `chronicle.ts` (:272, `sp < 6`)
  - `audio/inputs.ts` (12-23), `director.ts` (16, 135-187), `main.ts` (165-176), `ui/tools.ts` (30-32)

  Rules and check:
  - A species with no model is not drawn.
  - A species never present has no graph row.
  - Check with `?p=rabbit.initial:20`: rabbits draw with the rabbit model and get a graph row, with no errors.
- [x] **3. Tone mapping.**
  - Make a side-by-side sheet of ACES (the current default, engine.ts:177), AgX and neutral against the concept image, in the same views.
  - Adopt the closest, judged by the lead's eye plus the item 5 concept score. Retune GradePass (post.ts:186-276) if needed.
  - Log the choice in DECISIONS.md.
- [x] **4. Hill shadows on animals.** Animals get the terrain horizon shadow (`injectTerrainShadow` on the animal material and its depth material). Budget ≤ +0.2 ms.
- [x] **5. Concept tool `tools/concept_compare.py`.**
  - Sends the concept image plus a build still to Gemini (vision model picked from the live list).
  - Asks for a 1-10 match each on light, palette, haze, water, trees, grass and composition, an overall score, and the top 5 differences.
  - Writes the result to `<still>.concept.md`.
  - Window hook `__concept()` frames the concept's view: the creek bend with groves, a high oblique angle, low sun from the left, late summer, dayFrac about 0.28.
  - Record the baseline score in MORNING.md.
- [x] **6. JPEG stills.** `tools/stills.mjs` and `tools/video.mjs` stills default to JPEG q90.

**Gates:**
- The baseline is committed and the registry check passes.
- The tone-mapping decision and the concept baseline score are logged.

### S1. Open prairie [Track S, L]
Animals can leave and enter the valley through corridors. All params ship off; S3 decides adoption.

**Files:**
- Create `src/sim/region.ts`.
- Modify `src/sim/sim.ts`, `src/sim/world.ts` (corridors), `src/sim/params.ts`, `src/headless/metrics.ts`, `tools/dynamics.py`.

**Params (off by default):**

| Param | Default | Meaning |
|---|---|---|
| `openPrairie` | 0 | Master switch |
| `wolfInRate` | 0.2 | Pairs per base year, when a den site is free |
| `wolfOutAfter` | 1.0 | Base years a pack-less adult wanders before it leaves |
| `deerOutK` | 0.6 | Pronghorn autumn exodus |
| `deerInK` | 0.5 | Pronghorn spring return |
| `deerInMax` | 60 | Pronghorn spring return cap |
| `deerRescue` | 12 | Spring rescue group when fewer than 20 remain |
| `ravenVagrants` | 0 | Vagrant raven switch |
| `ravenVagrantK` | measured | Vagrants per unit of carrion, set from a baseline run |
| `ravenVagrantCap` | 400 | Vagrant ceiling |

The existing `wolfImmigration` and `cougarImmigration` stay as they are.

- [ ] **1. Corridors.** World generation computes 8 border entry points:
  - the creek inlet and outlet
  - the lowest border cell in each eighth of the rim

  This adds new arrays only, so existing ones are untouched.
- [ ] **2. Regional pool (`region.ts`).**
  - Per species, a running mean and variance per gene, starting from the founders.
  - `absorb(sp, genes)`: an emigrant pulls the pool toward its genes by 2%.
  - `draw(sp, rng, out)`: genes for an immigrant come from the pool. This is gene flow.
- [ ] **3. Migrate state.**
  - The animal heads to the nearest corridor at 0.5× its run speed.
  - Within 4 m of the border it is removed, with death cause `emigrated`: no carcass, counted in `cEmig[sp]`, and `region.absorb`.
  - Immigrants spawn at a corridor with `F_MIGRANT` set until they are 30 m inside.
- [ ] **4. Wolves.**
  - **Leaving:** a pack-less adult that has wandered longer than `wolfOutAfter` leaves.
  - **Arriving:** every 100 ticks, roll `rng < wolfInRate * 100 / BASE_YEAR_TICKS`. On success, if `findDenSite()` returns a site, an adult pair (genes from the pool, `origin = 1`) enters at the nearest corridor. On arrival the pair founds a pack and emits `immigrated` (sp Wolf, a = 2).
- [ ] **5. Pronghorn.**
  - **Autumn exodus (season 2.6, once per valley year):**
    - B = browse per pronghorn.
    - f = clamp(deerOutK × (1 − B/Bref), 0, 0.5).
    - Groups leave together: a seed animal plus its herd-mates within 25 m, repeated until f of the adults is reached. Hidden fawns stay.
    - Emits `emigrated` with the count.
  - **Spring return (season 0.25):**
    - n = clamp(round(deerInK × (Kb − pop)), 0, deerInMax).
    - If pop < 20, n = max(n, deerRescue).
    - They arrive as one group and emit `immigrated`.
  - **Calibrating Bref and Kb:** measure them from a 32-seed default run (mean autumn browse per capita, and the equilibrium population). Write the values as param defaults.
- [ ] **6. Vagrant ravens.**
  ```ts
  // every 50 ticks when ravenVagrants > 0
  const carrion = sumRemainingMeat();                                  // same units as cMeat
  const winter = Math.max(0, Math.cos(((season - 3.5) / 4) * 2 * Math.PI));
  const target = Math.min(p.ravenVagrantCap, p.ravenVagrantK * carrion * (1 + 0.5 * winter));
  if (vagrants < target) spawnVagrants(Math.min(8, Math.ceil((target - vagrants) * 0.1))); // at an edge, flying to the richest carcass
  else if (carrion < 0.2 * target / p.ravenVagrantK) sendHome(Math.ceil(vagrants * 0.05));  // fly to the nearest edge, removed there
  ```
  - Vagrants have `origin = 2` and never breed (check it in `thinkRaven` at sim.ts:1803).
- [ ] **7. Recolonization.** When a species with `everPresent = 0` gains animals through immigration, emit `recolonized`.
- [ ] **8. Metrics** (`metrics.ts` and `dynamics.py`):
  - presence fraction (share of samples with pop > 0)
  - local extinctions per 1,000 years
  - years absent
  - immigrants and emigrants per century, from new `sample()` columns `imm_<key>` and `emig_<key>`

**Gates:**
- With defaults, the golden hash is unchanged.
- With `openPrairie 1`, a 50-year smoke on seeds 1 to 4 shows immigrants, emigrants and vagrants in the CSVs, with no crash.

### S2. Canid disease: distemper and mange [Track S, M]
Wolves (and coyotes, from S5) get two real diseases.

**Params (off by default):**

| Param | Default | Meaning |
|---|---|---|
| `cdvRate` | 0 | Yearly outbreak chance at 60 wolves; scales with (wolves/60)², capped at 2× |
| `cdvPupDeath` | 0.6 | Chance an infected pup dies |
| `cdvAdultDeath` | 0.1 | Chance an infected adult dies |
| `cdvTicks` | 300 | Course of the illness |
| `cdvImmuneYears` | 5 | Immunity after recovery, in base years |
| `mangeRate` | 0 | Yearly chance of introduction when there are more than 30 wolves |
| `mangeSpread` | 0.02 | Per day, per infected packmate |
| `mangeGrowth` | 0.5 | Severity gained per base year |
| `mangeColdK` | 1.5 | Winter cold cost × (1 + mangeColdK × severity) |
| `mangeRecover` | 0.3 | Recovery chance per base year while energy > 0.7 |
| `mangeImmigrantShare` | 0.05 | Share of immigrants that carry mange |

**Distemper (CDV):**
- Spread:
  - Outbreaks are checked once per valley year at season 1.2 (summer).
  - On a start, 1 or 2 wolves are infected.
  - Within a pack, each think gives each packmate a 0.02 chance.
  - Canids feeding at the same carcass within 40 ticks infect each other with chance 0.3.
- Effects:
  - Infected animals get `F_INFECTED`, and their energy drain is ×1.5.
  - Deaths happen at the end of the illness.
- Events and test:
  - The outbreak ends with `distemper` (a = pups lost, b = adults lost).
  - Unit test `src/sim/disease.test.ts`: in a forced outbreak, pup and adult death rates come within ±0.1 of the params.

**Mange:**
- Severity 0 to 1 sets `F_MANGE`.
- Effects:
  - winter cold cost
  - hunting speed × (1 − 0.1 × severity)
- The first case in a pack emits `mange` (a = pack serial).

**Gate:** with defaults, the golden hash is unchanged.

### S3 ★. Checkpoint v6: screens, adoption, acceptance [Track S, M + CPU hours]

**1. Screens** (each `--seeds 32 --ticks 240000 --sample 600`; params merged with `{"calendarScale":2}`):

| Screen | Params |
|---|---|
| A | Default (reuse `scratch/cal2` if present) |
| B | `openPrairie 1, ravenVagrants 1` |
| C | B + `cdvRate 0.15, mangeRate 0.03` |
| D | C + `wolfPreyRef 1000, wolfRareHalf 400, leanLitter 0.8` (Hungry wolves mechanics) |

**2. Adoption rule:**
- Pick the screen with the highest wolf annual CV among those that meet all of these:
  - bison persist in ≥ 30 of 32
  - wolves, pronghorn and ravens are present ≥ 90% of the time in ≥ 29 of 32
  - pronghorn starvation is ≤ 50% of their deaths after burn-in
  - the lagged correlation between wolves and bison is ≥ 0.4
- A tie goes to the simpler config.
- Log the full table in DECISIONS.md.

**3. Acceptance and shocks:**
- Run the 1,000-generation acceptance (20 seeds) on the chosen config from a frozen copy, plus the 300-year shock suite (section 10).
- The gates are section 3's ecosystem row, plus bison recovery ≥ 80% after each shock.

**4. If it passes:**
- Make it the default params: checkpoint v6.
- Update `tools/golden.json` in the same commit.
- Update ECOLOGY.md and DECISIONS.md.
- Add `CHALLENGE_PIN` in `challenges.ts`, setting every v6+ param off (also the S4, S5 and S6 params when they land), so challenges stay identical; `challenge_suite.py` must still pass.
- Re-mine named worlds with `mine_seeds.py`.

**5. If it fails:**
- Keep v5 as the default.
- Ship the best config as scenario `openprairie` ("Open prairie") with an honest blurb.
- Log why.

**6. Same rule for v6b and v6c:**
- v6b: S4 and S5 turned on over v6.
- v6c: S6 turned on.
- Run a v6b acceptance after its screens pass. It can run in the background during later work.

### R1 ★. Close-range life [Track R, L]
Fix the complaint every Gemini round repeats: sliding feet, stiff animals, wolves standing still at a kill.

**Files:** `src/render/animals.ts`, `src/render/models/shader.ts`, `src/render/models/builder.ts`, `dev/animals.ts`.

- [ ] **1. Foot-slip rig** in `dev/animals.html`.
  - A CPU mirror of the leg math.
  - Cases: each species, walk, trot and gallop, 1x and 10x, flat ground and a 20° slope.
  - Prints the stance slip (mean foot motion during stance ÷ body motion) and the foot-to-ground error.
  - Saves image strips.
- [ ] **2. Exact foot lock.**
  - Today the phase already advances by distance drawn ÷ stride (animals.ts:737), but a sinusoidal hip swing can't hold a planted foot still.
  - Replace it with a linear foot path during stance:
  ```glsl
  // u = gait phase 0..1, beta = stance share (walk 0.62, trot 0.5, gallop 0.38), S = stride (m), L = leg length (m)
  float footX, lift = 0.0;
  if (u < beta) { footX = mix(0.5, -0.5, u / beta) * beta * S; }            // planted: slides back exactly at body speed
  else { float w = (u - beta) / (1.0 - beta);
         footX = mix(-0.5, 0.5, smoothstep(0.0, 1.0, w)) * beta * S;
         lift = sin(w * 3.14159) * liftH; }                                  // swing: eased return with a lift
  float theta = asin(clamp(footX / L, -0.95, 0.95));                         // hip angle that puts the foot there
  ```
  - S must include the drawn model scale, including the distance size boost.
  - Blend gait parameters across walk, trot and gallop, and never reset the phase.
  - Raise `MAX_CADENCE` so it never binds below a real gallop cadence.
- [ ] **3. Slope contact,** within 45 m of the camera.
  - During stance, each leg reads the ground height at its foot's world position from the height texture.
  - A two-bone analytic IK (hip, knee, foot) reaches it within ±25% of the leg length.
  - Body height = mean stance-foot height + rest leg height.
- [ ] **4. Takedown v2.**
  - Code to change:
    - animals.ts:98-101, 530-575 and 711-732
    - shader.ts:127-130, 177-191 and 390-409
  - Timing:
    - `POUNCE_TIME` becomes 1.8 s.
    - The hold lasts from 0.24 until the prey's struggle ends (about 1.2 s into its 2.4 s fall).
  - During the hold, `tugShake` runs: head shakes, the body braced back by 8°, hind legs planted.
  - Pack mates:
    - Each one that arrives within 9 m during the struggle gets its own lunge to a different contact point (flank, hindquarter, throat, by arrival order).
    - After the fall, feeders take radial slots around the carcass by arrival order. The display offset from the sim position is ≤ 2.5 m.
    - The alpha eats first. One subordinate lies 4 to 6 m out for 5 to 15 s (chosen by an id hash) before joining.
- [ ] **5. Feeding loop.**
  - Bite, pull back with the neck and forequarters, shake, swallow with the head up; repeat every 2.5 to 4 s.
  - The carcass flank dents with each pull.
- [ ] **6. Ravens at kills.**
  - Two-footed hops with a wing flick, walking between pecks.
  - When a wolf lunges or feeds within 2 m, the raven flutters back 1 to 2 m.
  - Takeoff starts with a deep downstroke flare.
- [ ] **7. Weight.**
  - Render-side acceleration caps: bison 2.5 m/s², pronghorn 6, wolf 5, coyote 6.
  - Body pitch of −4° when speeding up and +5° when braking.
  - Bison get a wider turning radius (`TURN` table).
  - Stampedes run head-low with more dust.
- [ ] **8. Cougar kill.**
  - Rush, forelegs on the shoulders, neck bite with a short hold.
  - Then it drags the carcass up to 3 m toward cover (display offset only).
- [ ] **9. Border fade.** `F_MIGRANT` animals fade in or out (dithered) within 15 m of the border, so arrivals and departures don't pop.

**Gates:**
- Rig: slip ≤ 5% at walk and trot, ≤ 8% at gallop; foot-to-ground ≤ 5 cm on 20° slopes within 45 m.
- The kill strip shows bite, hold and tug through the whole struggle.
- Cost ≤ +0.3 ms (herd view).
- A Gemini video round with a hunt-heavy timeline (edit the `video.mjs` segments). Log the life-and-motion score and judge the trend.

### R2. The concept look [Track R, L]
For every item:
- a before and after sheet at `__concept()`, next to the concept image
- the `concept_compare` score
- the GPU delta

Budget for the whole WP: ≤ +1.0 ms at 1440p in every view.

- [x] **0. One source for the season curves.** Move `CURE_KEYS`, `keyCurve` and the winter and riparian curves into one shared module (today they are duplicated across grass.ts:126, engine.ts:58 and terrain.ts:952).
- [ ] **1. Water.**
  - The creek and ponds read silver from the drone.
  - Reflect the real sky radiance in the reflected direction (the sky dome function in sky.ts) with Fresnel.
  - Beyond 80 m and at incidence above 60°, apply an artistic reflectance floor of 0.35.
  - Up close, keep the bed and depth look (water.ts:450-488 and 635-675).
  - From the v1 backlog: a bare apron on the shaded side of ponds, and more width variation along the creek channel.
- [x] **2. Aerial perspective** (FogPass, post.ts:75-184):
  - distance haze with a forward-scattering lobe toward the sun (Henyey-Greenstein, g 0.75)
  - tinted by the sun colour
  - stronger in summer and drought (dust)
  - a horizon glow
  - weaker at night
- [ ] **3. Mid and far terrain** (`tgGround`, terrain.ts:902-1294):
  - Halve the macro mottling beyond 60 m.
  - Add broad, smooth tonal bands by slope aspect: sun-facing slopes pale gold, shaded slopes deeper ochre.
  - In late summer, the uplands turn more cured gold; green stays in the riparian ribbon and the swales.
- [ ] **4. Drought ground.** A drought term in the terrain and grass shaders, driven by env drought severity: pale straw grass and dusty tan soil, never mauve.
- [ ] **5. Cloud shadows.**
  - A ground mask from the same fbm as the sky's cloud layer (sky.ts:271-349), projected along the sun and moved by the wind.
  - It multiplies direct sun on terrain, grass, trees and animals.
  - Coverage follows the weather: clear days get scattered cumulus; overcast turns it off.
- [ ] **6. God rays.**
  - Active when the sun is within 45° of the view centre.
  - An occlusion mask from depth (sky = 1), with a radial blur toward the sun's screen position: 64 taps, half resolution.
  - Added before bloom and scaled by haze and dust.
  - ≤ 0.3 ms.
- [ ] **7. Falling snow.**
  - A camera-local, instanced volume of flakes, driven by the wind, with density from env snow.
  - Blizzard look when snow combines with wind > 0.6: dense, near-horizontal flakes and heavier fog.
- [ ] **8. Dawn fog.** After a clear, calm night (no rain, wind < 0.35), mist pools in low ground from dayFrac 0.2 and burns off by 0.35, using the FogPass height mist with slow noise drift.
- [ ] **9. Grass up close,** on LOD 0:
  - seed heads: bluestem's three-pronged tips, switchgrass sprays
  - a warm glow when backlit
  - copper-red bluestem stems in autumn

**Gates:**
- `concept_compare` overall ≥ 7, up from the R0 baseline.
- The seasons stills set shows no regression at night or in winter.
- Within budget.

### S4. Small-prey web: jackrabbits, prairie dogs, plague [Track S, L]
**Species:**
- Rabbit (4) becomes the jackrabbit; PrairieDog is 7.
- Both are field species on the 32×32 coarse grid (16 m cells), not agents.
- `SPECIES_COUNT` becomes 8. S4 also registers id 6 (coyote) with no behaviour yet and `initial` 0; S5 fills it in.
- Requires R0 item 2 on `main`.

**Files:**
- Create `src/sim/smallprey.ts`.
- Modify `sim.ts` (the `refreshCoarse` cadence, `snapshot`, `populations`, `sample`, events), `params.ts`, `world.ts` (`dogCap` suitability: flat, dry, open ground), `worker.ts` (small-prey texture every 200 ms) and the metrics.

**Fields:** `hare`, `dog`, `town` (burrow infrastructure, 0 to 1) and `plague` (0 to 1), all Float32Array(1024).

```ts
// SmallPrey.step(sim), every 50 ticks; yearFrac = 50 / BASE_YEAR_TICKS; breeding = season < 2 ? 1 : 0.15
const food = 0.7 * clamp(coarseGrass[c] / 0.5, 0, 1) + 0.3 * clamp(coarseBrowse[c] / 0.4, 0, 1);
const Kh = p.hareK * (0.25 + 0.75 * food);
hare[c] += p.hareR * breeding * yearFrac * hare[c] * (1 - hare[c] / Math.max(0.1, Kh))
         - p.hareWinterLoss * (1 - breeding) * yearFrac * hare[c];
// dogs: only where dogCap > 0; Kd = p.dogK * dogCap[c] * (0.5 + 0.5 * fertility); one spring pulse at season 0.3
// town[c] moves toward 1 while dog[c] > 3, decays 0.02 per base year when empty (old mounds stay visible)
// expansion: dog[c] > 0.8 Kd -> 2 founders to a suitable neighbour (p 0.1 per step); hares diffuse 5% to neighbours
take(x, y, kind, effort, rng): number { // a predator's catch attempt: Holling type II on local density
  const H = hare[c] * PREF[kind].hare, D = dog[c] * PREF[kind].dog, dens = H + D;
  if (dens < 0.01) return 0;
  if (rng.next() >= effort * (A[kind] * dens) / (1 + A[kind] * HANDLE[kind] * dens)) return 0;
  if (rng.next() * dens < H) { hare[c] = Math.max(0, hare[c] - 1); return GAIN[kind].hare; }
  dog[c] = Math.max(0, dog[c] - 1); return GAIN[kind].dog;
}
```

**Sylvatic plague:**
- Start chance per step = `plagueRate` × town size factor, only in summer and when dog[c] > 0.7 Kd.
- `plague[c]` rises toward 1 over about a quarter year.
- Dogs fall by 0.9 × plague per step (about 95% die within a season).
- It spreads to neighbouring town cells in proportion to plague × dogs.
- It fades within a year.
- At the end it emits `sylvaticPlague` (a = dogs lost).

**Other events:**
- `townFounded`, `townLost`
- `hareBoom` and `hareCrash`: the valley total passes 2× (or falls below 0.4×) its 10-year mean; at most once per 5 years

**Open prairie rescues:**
- 10 hares arrive at an edge cell when the valley holds fewer than 20.
- A founding dog colony arrives once per 20 base years with no town.

**Params (off by default):**

| Param | Default | Meaning |
|---|---|---|
| `smallPrey` | 0 | Master switch |
| `hareK` | 3 | Hare capacity per cell |
| `hareR` | 2.2 | Growth per base year, breeding season |
| `hareWinterLoss` | 0.6 | Loss per base year outside breeding |
| `dogK` | 4 | Prairie dog capacity per suitable cell |
| `dogR` | 1.0 | Growth per base year |
| `plagueRate` | 0.08 | Per base year, per large town |
| `smallGameField` | 0 | Wolf mousing success from the fields instead of the flat trickle (sim.ts:1369, 1451-1453) |
| `dogClip` | 0 | Grass in towns kept short |
| `dogGrazeBonus` | 0 | Bison prefer town edges |

**Gates:**
- Off: the golden hash is unchanged.
- Unit test `src/sim/smallprey.test.ts`: `take()` follows Holling II, and population is conserved through diffusion.
- On (screened with v6):
  - hares present ≥ 95% of the time, prairie dogs ≥ 90%
  - hare CV ≥ 0.3
  - median ≥ 1 plague per 100 years
  - core-species persistence within 1 of 32 of v6

### S5. Coyotes [Track S, L]
Coyote is id 6. `coyote.initial` stays 0 until R3's coyote model is on `main`, then becomes 12 (six pairs).

**Files:**
- Create `src/sim/sp/coyote.ts`.
- Modify `sim.ts` (the agent loop; wolf-on-coyote kills in `liveWolf`), `params.ts`, `species.ts` (threat 0.3; DIET), `metrics.ts`.

**Params (`coyote.*` block, like wolf):**

| Param | Value |
|---|---|
| `maxAge` | 4800 |
| `matureAge` | 900 |
| `litter` | 5, divided by `calendarScale` |
| `walkSpeed` | 1.3 |
| `runSpeed` | 11 |
| `sight` | 60 |
| `territory` | 75 m |
| `denSpacing` | 90 m |
| `wolfAvoid` | 120 m |
| `coyoteKilledByWolf` | 0.3 |

**Thinking (every 3 ticks), in priority order:**
1. **Danger.** A wolf within 40 m means flee. A coyote leaves a carcass when a wolf comes within 25 m.
2. **Carrion,** if no wolf is within 30 m.
3. **Fawns.** Pronghorn or mule deer younger than `hideAge` within 40 m: search, with detection limited by the fawn's camouflage, then kill.
4. **Small prey.**
   - Climb the coarse hare-plus-dog gradient inside the territory.
   - St.Stalk is the "mousing" state.
   - Catch with `SmallPrey.take`.
5. **Otherwise,** rest at the den or patrol.

**Breeding:**
- Pairs breed at the wolves' spring tick.
- Litter = round(`litter` × `foodIndex` × litter gene), where `foodIndex` is the smoothed intake over the last valley year (0.4 to 1.4). This lagged numeric response is what drives the hare cycle.
- At 1 valley year, pups disperse. They need a free spot at least `denSpacing` from coyote dens and at least `wolfAvoid` from wolf dens. If there is none, they emigrate (S1).

**Wolves and coyotes:**
- A wolf within 3 m of a coyote kills it with chance `coyoteKilledByWolf`, checked once per 20 ticks.
- This applies when the coyote is at a carcass or inside the wolf's territory core (≤ 0.5 × territory radius from the den).
- The dead coyote leaves a carcass for ravens.

**Prey reactions:**
- Bison ignore coyotes (threat 0 for bison).
- Pronghorn does with hidden fawns, and the fawns, react at threat 0.3.

**Disease:** distemper and mange are shared with wolves (S2).

**Events:**
- `coyotePups`: the first litter, then records.
- `mesoRelease`: coyotes reach ≥ 2× their 5-year mean while wolves are ≤ 0.5× theirs; at most once per 10 years.

**Gates (screens with v6 and S4 on):**
- coyotes present ≥ 90% of the time
- coyote CV ≥ 0.25
- lagged correlation between coyotes and hares ≥ 0.4 at 0.5 to 2 years
- pronghorn still present ≥ 90%
- after the wolfwipe shock, coyotes reach ≥ 1.5× their pre-shock level within 10 valley years
- Adoption follows the S3 rule (as v6b).

### R3. Render and audio for the new life [Track R, L]
Merge S2, S4 and S5 first.

- [ ] **1. Mange.**
  - `F_MANGE` gives a patchy coat: darker skin mottling scaled by severity, plus a thinner tail and ruff.
  - The distemper sick pose already exists (`F_INFECTED`).
- [ ] **2. Prairie dog towns** (new `src/render/smallprey.ts`):
  - **Mounds:** instanced dirt cones, each with a bare ring.
    - About 12 × `town` per cell, placed by hash.
    - They stay after a die-off and slowly grass over.
  - **Turf:** inside towns, grass height × 0.35, greener short turf and lighter soil, read from the small-prey texture.
  - **Puppets:** prairie dogs drawn within 110 m of the camera.
    - Budget 400 in total; per cell n = min(14, round(dog[c] × 0.5)).
    - Each runs a loop of forage, upright sentinel, jump-yip display and grooming, driven by hash and time.
  - **Alarm wave:**
    - Trigger: a ground predator, or an eagle, hawk or raven below 25 m, within 40 m of a town cell.
    - Each dog dives into its burrow at t = distance ÷ 8 m/s, so the wave sweeps across the town.
    - Dogs reappear 6 to 15 s after the threat leaves.
    - Sentinels bark (audio).
- [ ] **3. Jackrabbit puppets** (rabbit model, hopper kind):
  - Within 90 m; budget 250; per cell n = min(10, round(hare[c] × 0.3)).
  - Graze, sit up, ears up.
  - Bound away in a zig-zag from predators within 25 m.
- [ ] **4. Coyote.**
  - **Model** (`src/render/models/coyote.ts`, built from the wolf):
    - Shape: 0.72× scale, slimmer legs, larger ears, narrow muzzle, tail held low.
    - Colour: tawny grey with rusty legs and ears, pale throat.
  - **Animation:**
    - trot
    - mousing leap in Stalk near small prey: a high 1.2 s arc, forefeet first
    - a howl and yip chorus at dusk while resting: sitting, muzzle up, synced to the audio
    - a wary head-up glance every 2 to 3 s while scavenging
- [ ] **5. Migrants.** Border fade (R1 item 9 if not done), and groups travel in a short column.
- [ ] **6. UI.**
  - Graph rows and colours for coyote, jackrabbit and prairie dog.
  - The inspector shows coyotes, with a "pair" chip.
  - A "Small prey" overlay: densities, towns, plague.
  - The chronicle text comes from Track S.
- [ ] **7. Audio** (ElevenLabs; log each call in ASSETS.md; ≤ 25 generations):
  - New sounds:
    - coyote yip chorus ×2
    - a lone coyote howl
    - prairie dog alarm chorus
    - jump-yip
    - close thunder crack ×2 (for R4)
    - meadowlark song (spring and summer mornings)
  - Positional sound (PannerNode) at the source when the camera is low.
- [ ] **8. Narrator** (same voice, "George"; `tools/narration.py`).
  - About 14 lines:
    - wolves arrive from outside
    - a species returns
    - pronghorn leave, and pronghorn return
    - distemper, and mange
    - plague in the town, and the town recovering
    - hare boom, and hare crash
    - coyote pups
    - coyotes take over (mesopredator release)
    - lightning fire
    - a storm
  - Wired in `audio/narration.ts` with priorities.
- [ ] **9. Director shots.**
  - New shots: "town" (a dog town with a predator near), "mousing", "migration" (a group heading for a corridor).
  - Event-driven cuts for `immigrated`, `sylvaticPlague` and `mesoRelease`.
- [ ] **10. Field notes:** add 8:
  - first coyote pups
  - a mousing leap
  - an alarm wave
  - a plague
  - wolves returning on their own
  - pronghorn migration
  - mange
  - a hare boom

**Gates:**
- Everything is visible in game, with stills.
- Puppets cost ≤ +0.5 ms (herd view).
- 30 minutes at 10x with no console errors.
- Then Track S flips `coyote.initial` to 12 and turns the S4 fields on, per v6b's adoption.

### S6. Storm cells and lightning fires [Track S, M]

**Params (off by default):**

| Param | Default | Meaning |
|---|---|---|
| `stormCells` | 0 | Switch |
| `lightningRate` | 0.015 | Strike chance per tick per cell at full intensity |
| `lightningIgnite` | 0.15 | Chance a strike in dry, cured grass starts a fire |

Rain stays global, as now, so the weather sequence doesn't change. Lightning is the new effect.

```ts
// own Rng: new Rng(hashSeed(`${seed}:storms`)). On the day a storm starts (env.storm with rainTicks set):
//   spawn 1 (+1 at p 0.4) cells 150-250 m upwind outside the valley, r 60-120 m, moving with windDir at 2.5-5 m/s
// each tick: x += vx * DT; y += vy * DT; drop cells 400 m past the centre or when life <= 0
// strike: srng.next() < lightningRate * intensity -> a point within r; push to the snapshot's strikes list
// ignite: season in [1.4, 3.1] && grass > 0.3 && env.rain < 0.35 && srng.next() < lightningIgnite
//   -> veg.ignite(x, y, 4); event('lightningFire', -1, x, y, 0, 0)
// blizzard: purely a look when weather is Snow and windStrength > 0.6 (no new random draws)
```

- Rain above 0.5 stops fire spread; check vegetation.ts:131-160.
- **Snapshot:**
  - `storms`: up to 4 cells × [x, y, r, intensity, kind, age]
  - `strikes`: every strike since the last post
- **Events:** `storm` (once per big storm) and `lightningFire`.

**Gates:**
- Off: the golden hash is unchanged.
- On, in screens:
  - 10 to 30 natural fires per 100 years
  - persistence within 1 of 32 of the same config without storms
- Adoption: v6c, by the S3 rule.

### R4. Storm visuals [Track R, M]
Merge S6 first.

- [ ] **1. Clouds.**
  - Each cell gets a cumulonimbus mass: layered billboards with lit tops and dark bases, plus an anvil on strong cells.
  - The sky darkens toward cells.
  - The cell's shadow moves across the ground.
- [ ] **2. Rain shafts.**
  - Textured vertical curtains under each cell, visible from far away.
  - They fade near the camera, where the screen rain streaks take over.
- [ ] **3. Lightning.**
  - A forked bolt mesh from the cloud base to the strike: 0.12 to 0.2 s, with 1 or 2 restrikes.
  - A scene flash: ambient and sky boosted for 2 to 3 frames.
  - Thunder is delayed by distance ÷ 343 m/s at 1x; no delay at 10x and above.
- [ ] **4. Wind.** Grass gust bands get stronger under and ahead of cells.
- [ ] **5. Rainbow.** After a storm, with the sun low behind the camera: a sky-shader arc at 42° around the antisolar point, fading as the rain clears.
- [ ] **6. Lightning fire.** Strike, flash, then the smoke column starts.
- [ ] **7. Bench view.** Add a "storm" view to `gpubench.mjs`.

**Gates:**
- The storm reads from both the drone view and the low view.
- ≤ +0.6 ms in the storm view.
- A storm segment appears in the next Gemini video round.

### M1. Phase 1 milestone [Track R, M]
- [ ] **1. Merge and play.** Merge, then run `npm test` and the build. Play 20 minutes at 1x, 10x and 100x, and fix any crash.
- [ ] **2. Review.**
  - Stills: the review set as JPEG, plus the current stability charts, given to a fresh blind critic.
  - One Gemini video round.
  - Triage everything in REVIEWS.md.
  - Fix the top 3 if each takes ≤ 1 hour.
- [ ] **3. Deploy.** `npm run deploy`, then verify the live build.
- [ ] **4. Report.** Write a "v2 alpha" section in MORNING.md:
  - what's new
  - what to look at first
  - 4 to 6 screenshots
  - stability numbers
  - decisions to overrule
  - spend
  - next 5

  Then run the adversarial self-audit (CLAUDE.md section 8) and add the journey images.

---

## 8. Phase 2 work packages (v2 beta, after the reset)

### Raptors

**S7. Golden eagles (8) and red-tailed hawks (9)** [S, M]
- **Who and when:**
  - Eagles are winter visitors through the open prairie: 2 to 6, arriving at season 2.5 and leaving at 0.5.
  - Hawks are summer residents: 2 to 4 pairs nesting in cottonwoods (the tree list), raising 1 to 3 young.
- **States:**
  - soar: midday thermals over open ground
  - perch: tree and rock tops
  - hunt: glide over rich small-prey cells, then stoop (Chase with fast altitude loss), catching with `SmallPrey.take`
  - scavenge: eagles at winter carcasses; ravens give way within 3 m
- **Code:** reuse the raven flight integrator in a new `src/sim/sp/raptor.ts`.
- **Events:** `eaglesArrive`, `hawksReturn`.
- **Gate:** persistence moves by ≤ 1 of 32.

**R5. Raptor render** [R, M]
- **Models:** eagle and hawk, bird kind. Wingspans 2.0 m and 1.2 m, slotted primaries, slow flaps, soaring dihedral, a folded-wing stoop pose, a perched pose.
- **Ground shadow:** raptors below 40 m cast one. It triggers the dog-town alarm.
- **Sound and shots:** hawk scream and eagle calls; a "stoop" director shot.

### Mule deer and cougars

**S8. Mule deer (10) and working cougars** [S, L]
- **Deer behaviour:**
  - browse only where cover > 0.25 and in the draws
  - groups of 3 to 10
  - fawns hide
  - flight is flagged as stotting for render
- **Cougars:** prey preference deer > pronghorn > calves.
- **Screens:** with the open prairie on.
- **Adoption:**
  - Cougars join the default world if they are present ≥ 80% of the time over 200 years and the other species stay within 1 of 32.
  - Otherwise "Cougar country" gets deer.

**R6. Deer render** [R, M]
- The mule deer model is built from the pronghorn: big ears, black-tipped tail, white rump, grey-brown coat.
- Antlers grow from spring, are full in autumn and are shed in late winter.
- Stotting gait: all four feet bounce together.
- Polish the cougar ambush.

### The animals themselves

**R7. Animal fidelity** [R, L]
- **Meshes:** `builder.ts` lofts get 2 to 3× the rings at near LOD, plus a continuous body, neck and head.
- **Species details:**
  - bison: hump; cape and beard as a wool shell at near LOD; short upturned horns
  - pronghorn: black horns, white throat bands and rump
  - wolf: ruff
  - coyote
  - deer: antlers
- **Fur shading:**
  - sheen along the body axis
  - backlit rim glow at golden hour
  - procedural coat patterns
  - baked AO
- **LOD:** today's mesh becomes the far LOD.
- **Gates:** ≤ +0.5 ms (herd view); a Gemini close-up round.

**R8. Behaviour library** [R, M]
Render-side only, driven by sim state plus an id hash; no sim change.
- **Bison:**
  - wallow on bare dry ground (a roll plus dust)
  - rub against trees
  - swing their heads to crater through snow
  - summer rut sparring: two adult males within 6 m, both grazing, in season 1.0 to 1.8; a 6 to 10 s shove
  - a bellow
  - calf play
- **Wolves:**
  - howl at dusk and night (sitting, a chorus synced to the audio)
  - pups play near dens in spring and summer
  - scent marking
- **Pronghorn:** flare the white rump patch on alarm (×1.4 and brighter), readable from far away.
- **Ravens:** hop, walk and peck on the ground; flare at takeoff; roll in the air.
- **Raptors:** preen on their perches.

### Ecology

**S9. Evolution v2** [S, M]
- **Costs and limits:**
  - per-species `sprintCost`: bison 0.2, pronghorn 0.05, wolf 0.15, coyote 0.1
  - bison `maxLitter` 1 with `leanLitter`
  - `herdEyes` 1.5
- **Coat selection:**
  - Predators keep a coat search image that drifts toward the coats they kill.
  - Prey whose coat is within 0.1 of it are detected at ×1.3.
  - This favours rare coats, so the herd's colours keep shifting instead of settling.
- **Gates:**
  - bison speed and size stay below their bounds at year 300
  - herding ≥ 0.8
  - coat variance holds
  - persistence within 1 of 32
- **UI (Track R):** a "Then and now" card in the evolution view: the founders' animal next to today's average animal, rendered with the mean genes.

**S10. Herd shape** [S, M]
1. **Drink spots.** Finish `wip/drink-spots`: screen 0.6, 0.7 and 0.8 on 32 seeds, and merge the best if persistence stays within 1 of 32.
2. **Grazing spacing.** Screen personal space while grazing (`herdSpacingGraze`: 1.6× separation, weaker cohesion).
3. **Look.** Compare in-game stills the way `scratch/herds` did.

### Winter

**S11. Winter** [S, M]
- **Snow depth field** on the coarse grid:
  - builds on snow days and drifts into hollows with the wind
  - melts with warmth
- **Effects of depth:**
  - pronghorn grazing × (1 − 0.6 × depth)
  - bison grazing × (1 − 0.3 × depth)
  - movement cost × (1 + depth)
  - wolf kill chance × (1 + 0.3 × depth)
- **Events:** `blizzard`, `hardWinter`.
- **Spring green-up (v1 backlog):** move it about half a season later in both places it is set:
  - the sim growth window (env.ts `growthFactor`)
  - the cure curve (R2 item 0's shared module)

  Real tallgrass greens in mid-spring, not late winter.
- **Screens.**

**R9. Winter and night** [R, M]
- **Winter:** blizzard whiteout; snow on animals' backs; bison cratering.
- **Night sky:**
  - moon phases (one cycle per 8 valley days)
  - aurora on rare clear winter nights (deterministic from the tick)
  - August meteor showers
  - fireflies at summer dusk near water
  - twinkling stars

### Play

**S15. Lineage** [S, M]
- Keep records of animals that die with at least one offspring or were followed, in a ring of 30,000.
- Worker request `lineage(id)`: 3 generations up and 2 down.
- Pack dynasties: alpha pairs over time.

**S16. Share codes and replay** [S, M]
- The worker logs every intervention with its tick.
- `?w=` carries base64url JSON: `{v, seed, scenario, params, log}`.
- Replay applies each intervention at its exact tick.
- A version check warns when the build differs.

**R12. Play UI** [R, L]
- **Field guide:**
  - species pages, each with 4 to 6 behaviours to witness or photograph, and a short ecology note
  - a behaviour counts when the camera's focus is within 60 m of an animal in that state
  - photos are kept in IndexedDB
- **Family tree panel.**
- **Valley setup:**
  - species toggles and counts
  - climate (wetter or drier)
  - winters (harsher or milder)
  - open or closed valley
  - calendar
- **Share button:** copies the `?w=` URL.
- **Settings:**
  - quality preset: Low, Medium, High or Ultra
  - volume sliders
  - narrator
  - auto camera
  - idle dim
  - UI scale
- **First load:**
  - a title card: Watch, Challenges, New valley, Field guide
  - 3 first-run tips

### God tools and challenges

**S17. God tools v2 and challenges** [S, M]
- **New tools:**
  - lightning strike
  - blizzard
  - flood
  - introduce or remove any species
  - targeted disease: bison fever, wolf distemper, sylvatic plague
  - cull any species
  - plant a grove
- **New challenges:**
  - Mesopredator release
  - The town that came back
  - Storm season
  - Cat country
  - (Phase 3) Return of the beaver
- **Gate:** each one fails hands-off and is won by the scripted player (`challenge_suite.py`).

**R13. Tool rail v2** [R, S]
- Groups: Weather, Disaster, Life, Land.
- A species picker.
- A ground reticle sized to the tool's radius.

### Dust, grasshoppers and floods

**S12. Dust storms, grasshoppers, floods** [S, M]
- **Dust storm:**
  - triggers on drought + bare ground > 35% + wind > 0.6
  - −0.02 soil fertility in bare cells
  - vision × 0.6
- **Grasshopper outbreaks:** a field that surges in hot, dry summers. It eats grass and feeds coyotes, hawks and ravens.
- **Spring flood:**
  - triggers on rain + snowmelt
  - riparian cells within 15 m of the creek flood for days
  - fertility rises
  - animals move out
  - fawns are at risk
- **Events and screens** for each.

**R10. Their look** [R, M]
- a dust wall: a fog front plus particles, with brown light
- grasshopper shimmer near the camera
- the creek mesh rising in floods
- muddy aftermath

### Trees

**S13. Dynamic trees** [S, L]
- **Growth:** a tree list with growth stages.
- **New trees:**
  - cottonwoods recruit on moist bare ground near water after floods
  - junipers creep onto ridges when there's no fire
- **Fire:** kills 90% of seedlings and saplings and 10% of mature trees.
- **Browsing:** deer slow saplings.
- **Updates:** the cover field updates each season.
- **New pieces:** a "plant a grove" intervention; events `encroachment` and `grove`.

**R11. Trees v2** [R, L]
- **Crowns:** denser, lobed, with soft spherical lighting, backlit translucency, inner AO and fewer visible branches.
- **New looks:** autumn gold cottonwoods, burned snags, junipers, willow thickets along the creek.
- **Instancing:** dynamic, so trees can be added and removed without a rebuild.

### Sound and lens

**R14. Music and sound** [R, M]
- **Music:** use ElevenLabs if its music API is available.
  - 5 cues, 60 to 120 s loops: dawn, day, tension, night, storm or winter.
  - A tension index (chases, kills, die-offs, storms) drives the crossfades.
  - If the API isn't available, log it as Blocked.
- **More sound:**
  - bison rut bellow
  - sandhill crane flyovers in spring and autumn, with V-formations in render
  - blizzard wind
  - grasshopper buzz

**R15. Lens** [R, M]
- Depth of field in director close shots and photo mode (a gather bokeh from the depth texture).
- Film grain and faint chromatic aberration in cinematic mode.
- A photo mode panel: exposure, focus on the selected animal, freeze time.

**M2.** Same as M1.

## 9. Phase 3 (v2.0)

### S14 ★. Beavers and moving water (Beaver 11) [S, L]
- **Where:** colonies on creek reaches with willow or cottonwood food within 40 m.
- **Dams and ponds:**
  - The dam crest rises 0.3 m per season, to 1.4 m.
  - Upstream cells whose ground is below the crest fill with water (a water depth field).
  - When ponds change, `waterDist` and the water gradients are recomputed for that region, using `distanceTransform` from `wip/drink-spots`.
- **Effects:**
  - trees inside ponds die and stand as snags
  - a moisture bonus within 30 m (a greener ribbon)
  - water that lasts through droughts
- **Endings:**
  - A dam breaches in floods, with chance p.
  - Or the colony runs out of food and leaves, and the dam decays over 2 to 4 years.
  - Either way the pond drains into a fertile beaver meadow.
- **Agents:** beavers swim, gnaw, build and flee to water. Wolves take beavers on land.
- **Events:** `damBuilt`, `pondFilled`, `damBreached`, `beaverMeadow`.
- **Screen:** drought-shock recovery with beavers vs without.

### R16. Moving water render [R, L]
- Pond surfaces rebuild when the water field changes, with smooth level changes.
- Dams and lodges: instanced stick piles.
- Drowned snags.
- V-wakes behind swimming beavers.
- Tail-slap splash and sound.

### S18. Chronicle decades and arcs [S, S]
- Every 10 valley years, a decade line titled from what dominated, for example "The Wolf Decade", "The Dust Years", "The Town That Came Back".
- Multi-event arcs (drought, dust, fire, green-up) are told as one thread.

### R17. Performance pass [R, M]
- Trim LOD 0 grass instances, so blades killed in the vertex shader aren't processed (grass.ts:349-353).
- Budgets for puppets and shadow casters.
- Map the quality presets.
- Gate: every bench view ≤ 16.7 ms on High.

### M3. v2.0 [R, M]
- [ ] **1. Final acceptance:** for the open default and for the closed config.
- [ ] **2. Shock suites.**
- [ ] **3. Challenge suite.**
- [ ] **4. Reviews:** 2 stills rounds and 2 video rounds.
- [ ] **5. Landing page:** refresh it.
- [ ] **6. Deploy.**
- [ ] **7. Report:** the MORNING.md v2.0 report.

---

## 10. Ecology test commands (all WPs)

**Screen** (about 30 to 40 minutes at 6 threads):
```
npx tsx src/headless/batch.ts --seeds 32 --ticks 240000 --sample 600 --threads 6 --params '{"calendarScale":2, ...}' --out scratch/<name>
.venv/Scripts/python tools/dynamics.py scratch/<name>
.venv/Scripts/python tools/cycle_stats.py scratch/<name>
```

**Acceptance** (about 3 hours at 11 threads; run from a frozen worktree; timeout ≥ 8 hours):
```
npx tsx src/headless/batch.ts --seeds 20 --generations 1000 --ticks 3600000 --sample 2000 --params '<params>' --out review/stability/<name>-<hash>
```

**Shocks** (about 2 hours):
```
npx tsx src/headless/batch.ts --seeds 20 --ticks 720000 --sample 1500 --scenario cull70,drought,wolfwipe --params '<params>' --out review/stability/<name>-<hash>-shocks300
```

**Charts:**
```
.venv/Scripts/python tools/charts.py review/stability/<run>
```

**Challenge suite:** `tools/challenge_suite.py`. **Named-world mining:** `tools/mine_seeds.py`.

In the cloud, use `python3` instead of `.venv/Scripts/python`.

## 11. Risks, fallbacks, and what v2 won't do

**Risks and fallbacks:**

| If this happens | Do this |
|---|---|
| Open prairie fails acceptance | v5 stays the default; "Open prairie" ships as a scenario |
| Coyotes hurt the pronghorn | Lower fawn skill, retest |
| Foot IK is too costly | Keep the exact foot lock; IK only for the followed animal |
| Puppets are too costly | Halve the budgets; High and Ultra only |
| The credits don't cover cloud usage | Single local mode |
| The cloud VM is too small for screens | The local machine runs them on request |
| No music API | No music; log it |
| Quota runs short before M1 | The 85% rule makes M1 happen with whatever is verified |

**Not in v2:**
- **WebGPU migration:** a rewrite of every custom shader; WebGL2 is proven.
- **A skeletal or vertex-animation pipeline:** exact foot lock plus IK comes first.
- **New biomes or maps:** depth in this valley first. A good v3 item.
- **People or ranching.**
- **Multiplayer.**

## 12. Step 0: handoff prep (this session, right after approval; no feature work)

- [ ] **1. Copy this plan** to `V2-PLAN.md` in the repo.
- [ ] **2. DECISIONS.md:** add an "Owner rulings (2026-10-04)" block with section 1, the quota guard, and the `run_until.local.txt` rule.
- [ ] **3. _PLAN.md:** add a v2 milestone table pointing to V2-PLAN.md. **NEXT-SESSION.md:** v2 start state and the first three steps.
- [ ] **4. CLAUDE.md:** add a 6-line v2 addendum at the top:
  - follow V2-PLAN.md
  - Phase 0 is done
  - modes and tracks
  - quota guard
  - cloud notes
- [ ] **5. Track files:** create `TRACK-S.md` (status, decisions, requests, smoke results) and a `REQUESTS-R.md` stub.
- [ ] **6. Stop hook:**
  - `.claude/hooks/keep_going.py` reads `run_until.local.txt` first, if present, so each session sets its own deadline without git conflicts.
  - Add `.claude/hooks/run_until.local.txt` and `review/**/*.mp4` to `.gitignore`.
- [ ] **7. Git:** commit and push `main`; create and push branch `v2-sim` from it.
- [ ] **8. Hand off to the owner:**
  - the 2-minute cloud credit test
  - how to start the local session, and optionally the cloud session (model, effort, kickoff prompt)
  - deadlines
  - what to watch
  - how to fall back to the quota once the credits are gone
