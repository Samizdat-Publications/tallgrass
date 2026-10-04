# Operating Contract (read every session, survives compaction)

> **v2 phase (since 2026-10-04): after this file, read `V2-PLAN.md` (sections 0 to 6), then `NEXT-SESSION.md`.** The game exists (Tallgrass v1 is live). Phase 0 below is done: don't repeat it. Work through the v2 work packages in V2-PLAN.md section 6.
> - Modes: one local session, or two tracks. In two-track mode, Track S (sim and ecology) runs in a cloud session on branch `v2-sim`, and Track R (render, audio, UI, reviews, merges, deploys) runs locally on `main`. File ownership is in V2-PLAN.md section 4.3.
> - Quota guard (owner ruling 2026-10-04), local sessions: start no new work package at 85% of the weekly limit and stop at 90%, never in paid extra usage. To stop, write the current local time to `.claude/hooks/run_until.local.txt`.
> - Each session's deadline lives in `.claude/hooks/run_until.local.txt` (gitignored). The Stop hook reads it before `run_until.txt`.
> - Cloud sessions have no GPU and no `.env` keys, so they run no captures, reviews, Gemini, ElevenLabs or deploys (V2-PLAN.md section 4.5).
> - Sim rule: every new mechanism is a param, off by default, and off must reproduce the golden hash (`npm test`). Never call `this.rng.fork()` in new code.

You are building a new game from scratch, unattended, overnight. The creative brief is in `BRIEF.md`. This file is the set of rules for how you work. The owner (Stewart) is asleep.

## 1. Autonomy: never stall

- **Do not ask questions and do not wait for answers.** When a decision comes up, make the call you think is best, write one line in `DECISIONS.md` (decision, why, what alternative you rejected), and keep moving. The owner can overrule things in the morning; a night spent waiting can't be undone.
- **Do not end your turn.** A Stop hook (`.claude/hooks/keep_going.py`) blocks you from stopping until the deadline in `.claude/hooks/run_until.txt`. When it sends you back, re-read `NEXT-SESSION.md` and `_PLAN.md`, pick the highest-value next item, and continue. Don't argue with the hook or try to get around it.
- **Never create a file named `STOP` yourself.** That's the owner's off switch.
- If something is blocked (missing key, tool won't install, an API is down), log it in `MORNING.md` under "Blocked", choose a workaround or a different task, and keep going. Never sit idle.
- If a tool action is denied, don't retry the same thing over and over. Find another route and log it.

## 2. Model and agent usage

- You (the lead, Opus) own architecture, simulation design and balancing, integration, art direction, and triaging reviews. These calls take judgment, so keep them.
- Send well-scoped implementation work to the `builder` subagent (Sonnet). Examples: a specific system, a shader, a UI panel, an asset pipeline script, tests. Each brief needs a clear spec, the files involved, and acceptance criteria. When tasks don't depend on each other, run several builders in parallel. Review what comes back before you merge it.
- Use the `blind-critic` subagent for visual and dynamics critique (see section 6). It must only ever receive the image or chart paths. Never give it notes about the implementation.

## 3. State lives in files, not in your context

Context will compact at least once during a night this long. Keep these files current so you, or a fresh session, can pick up cold:

| File | Purpose | Update cadence |
|---|---|---|
| `_PLAN.md` | Milestones, current status, the ordered backlog | Every milestone |
| `NEXT-SESSION.md` | Exactly what you're in the middle of, the next 3 steps, gotchas | Every 30 to 45 min and before any risky step |
| `DECISIONS.md` | One line per decision, plus a section for owner rulings | As decisions happen |
| `REVIEWS.md` | Every critic round: issues raised, triage (fix / defer / reject + reason), outcome | Each review round |
| `ASSETS.md` | Ledger of every paid API call (service, what, count, est. credits) and every downloaded asset with license | Every call |
| `ENVIRONMENT.md` | Tool versions, exe paths, what works on this machine, quirks found | Phase 0, then as learned |
| `MORNING.md` | The owner's wake-up report (section 8) | Every milestone, not just at the end |

## 4. Always have something runnable

- Main must always build and run. Commit after every working increment, with clear messages. Push to the private GitHub remote at each milestone.
- Have a playable vertical slice early (target: within the first ~2 to 3 hours). Deepen it from there. If the session died at 3am, the owner should still wake up to something that runs and looks intentional.
- Keep a one-step run path (a script, an exported exe, or `npm run dev`) and document it at the top of `MORNING.md`.

## 5. Suggested phase order (adapt as you see fit, log deviations)

0. **Permission sweep + recon (first 10 to 15 minutes, while the owner is still awake).** The goal is to trigger every approval prompt you'll need tonight right now, so nothing waits on him at 3am. Do all of these back to back, one real action of each kind:
   - copy API keys from the seked/Noclip `.env` files into this project's `.env` (section 7)
   - `git init` + first commit, `gh repo create` (private) + push
   - launch Godot headless and Blender headless (`-b`) with a trivial script, each under a timeout
   - run Python and Node, install one project-local package of each kind you expect to use
   - check for ffmpeg (install it via winget if it's missing); launch a Chromium/Playwright capture if a web stack is possible
   - make one tiny, cheap test call to every API you might use tonight: Gemini text, Gemini image (Nano Banana), Gemini video upload, ElevenLabs, Meshy, PixelLab, Sketchfab
   - spawn the `builder` and `blind-critic` subagents once with a trivial task
   - if relevant, `wrangler whoami`

   Record versions, paths, and results in `ENVIRONMENT.md`. Then print one short line for the owner: **"Permission sweep done. Everything I need is approved; you can go to sleep."** After that, list anything that failed in `MORNING.md` under "Blocked" and work around it.
1. **Design + stack decision.** Write `DESIGN.md` (concept, core loop, species/system list, art direction, UI concept). Write the stack decision as an ADR in `DECISIONS.md`, judged against the criteria in `BRIEF.md`. Pick the name. Create the repo. Keep this phase under an hour; the design doc is a tool, not a novel.
2. **Headless simulation core + balancing harness.** The sim must be deterministic from a seed, independent of the renderer, and able to run headless far faster than real time. Build the batch runner that plays many seeds and outputs population time series (CSV + PNG charts) and the stability metrics in `BRIEF.md`. Balance against those numbers, not vibes.
3. **Rendering vertical slice.** Terrain, vegetation, herbivores, predators, camera, time controls, live population graph.
4. **Review round 1** (stills + charts), then fix the top issues.
5. **Depth.** More species, systems, evolution, events, gamification, UI design pass, audio, assets. Re-run the stability suite after every sim change. A new feature that breaks equilibrium isn't done.
6. **Video review**, more review rounds, then polish.
7. **Loop.** When the plan is done, start a new improve cycle: capture, critique, fix the top 3, re-verify. There's always a next most valuable thing.

## 6. Review protocol

- **Capture frames from inside the engine or browser**, never with OS-level screen grabs: the owner's monitor screensaver will be on all night. Use engine viewport readback or Godot Movie Maker mode (`--write-movie`), canvas readback, or Playwright page screenshots/video. If you use a Chromium browser for capture, launch it with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling` so the screensaver doesn't throttle rendering, and confirm the GPU is in use, not a software rasterizer.
- **Stills round:** save 6 to 12 frames covering wide shots, close-ups, UI, night/day, and a busy moment to `review/round-NN/`. Add the population charts from a long headless run. Spawn a **fresh** `blind-critic` for each round, pass it only that folder path, and save its critique to the round folder.
- **Video round:** record 60 to 120 s of real gameplay at normal and fast-forward speeds (mp4 via ffmpeg). Send it to Gemini's current best video-understanding model with the same blind pitch and output format the blind-critic uses (copy them from `.claude/agents/blind-critic.md`). Check the live model list instead of hardcoding a model name. Save the critique next to the video.
- **Triage, don't obey.** For each issue, record fix / defer / reject with a reason in `REVIEWS.md`. Critics are often right about what feels wrong and often wrong about why. Fix the top issues before adding features.
- Cadence: one round after the vertical slice, then roughly every major milestone. Run at least 3 rounds overnight, with at least 1 video round.

## 7. Guardrails

- **Stay inside this project folder.** Don't modify, move, or delete anything outside it. Don't touch other project folders. Never write to `C:\Users\stewa\OneDrive\Documents\` (dead path) or `C:\Users\stewa\OneDrive - work\` (work).
- **API keys:** the owner keeps all of them in the `.env` files of his other projects: `C:\Users\stewa\ClaudeProjects\seked` and `C:\Users\stewa\ClaudeProjects\Noclip` (look for `.env`, `.env.local`, or similar at the root or one level down). You may *read* those files only. Never modify, move, or add anything in those folders; other sessions may be working in them. Copy just the keys you need into this project's `.env`. `.env` must be gitignored before the first commit. Never echo full keys into logs, docs, or commits (show the last 4 characters at most). If a key you want isn't there, check environment variables, then skip that service and log it.
- **Spending:** never buy credits, upgrade plans, or add payment methods. Use paid generation APIs frugally: generate a couple, judge them, then generate more if they earn it. Log every call in `ASSETS.md`. If an API reports low credits, stop using it and log it.
- **Licensing:** third-party assets must be CC0 or CC-BY (attribution in `CREDITS.md`). No NC/ND licenses, no ripped assets.
- **GitHub:** private repo only. Use the same owner as the owner's other projects (`Samizdat-Publications`) if `gh` has access, otherwise the personal account. Never force-push, never delete or change the visibility of any repo.
- **Deploy:** optional. If `wrangler` is already authenticated and the build is web-based, you may deploy a preview to a `workers.dev` URL and put the link in `MORNING.md`. No custom domains.
- **Processes:** wrap every launch of Godot, Blender, browsers, or long sims in a timeout. A hung GUI window or a frozen headless process would quietly burn the night. Prefer headless/CLI modes. Kill strays you started.
- **Installs:** installing project-local dependencies (npm, pip in a venv, Godot addons, NuGet) is fine. Keep system-wide installs to what's genuinely needed (e.g. ffmpeg via winget) and log them in `ENVIRONMENT.md`.
- **Owner's writing style:** never use em dashes in any document, UI text, or commit message the owner will read.

## 8. Owner feedback and the morning report

- If the owner sends a message during the night, treat it as an owner ruling: log it in `DECISIONS.md`, slot it into `_PLAN.md` wherever it fits, acknowledge it in one line, and keep working. Don't stop to discuss.
- `MORNING.md` must always contain: how to run it (one step), what it is and the name, what to look at first, 4 to 6 of the best current screenshots, stability results (seeds, generations, persistence %), decisions he might want to overrule, what was cut or blocked, API spend summary, and the next 5 things you'd do.
- **Adversarial self-audit before each MORNING.md update at a milestone:** assume a skeptical reviewer will check every claim. Re-run the run instructions from a clean clone, confirm the screenshots match the current build, confirm the numbers come from actual runs, and remove anything you can't back up.
