# NEXT SESSION: pick up here

**Updated:** 11/11/2026, during the Fable retrofit session. Keep this file short: the state now, the next three steps, the gotchas. The old 57 KB log is in `docs/history/NEXT-SESSION-through-2026-10-30.md` (read it only when you need the history of one item).

## Read first
1. `CLAUDE.md` (the operating contract).
2. `docs/FABLE-REVIEW.md` (what is strong, what is weak, with evidence).
3. `_PLAN.md`, top section "Fable change order" (the current plan and each package's acceptance test).
4. `docs/ROUTING.md` (Fable decides and looks; builder, grunt, scout and verifier do the rest).

## State
- Live: v1.0.12, checkpoint v14 (conceiveEnergy 0.7, bisonCrowdCalf 0.5, bisonCrowdRef 600). Nothing in the sim or the shipped look changed in the retrofit session.
- The retrofit session (11/11/2026) audited the project, wrote the review and the change order, and started the harness packages H1, H2, H6 and H7 with three builders. **Their status is the next section; if it still says "running", check the working tree (`git status`) and finish or re-run them.**

## Overnight run 11/12/2026 (owner asleep, deadline 13:00; then Fable 5.2 reviews and proposes next steps)
- Lead on Opus 5.5 (Fable weekly limit at 100% until the 13:00 reset). Quota guard: stop at 98% of the weekly all-models limit (75% at 01:35, 81% at 03:40). Token-heavy debugging is expensive with a long context: delegate code to builders, keep lead turns few.
- **Nothing is committed yet.** Do not commit `src/**` until H1 and S1 are finished and `npm run check` passes.
- H1 findings tonight (for the Fable review): capture was made far more repeatable but not byte-identical. Fixed: bison sparring pairs planned or not depending on when the first snapshots arrived (animal time now 0 from the start in capture mode); every shot now rebuilds the animal display state (`AnimalLayer.captureReset`), clears dust and splash pools; each shot gets a fresh page load (camera rig, tree LOD bands and other caches otherwise carried over between shots: the concept shot differed in 99.99% of pixels after a follow shot). Remaining cross-load noise: mean 0.02 to 0.17 levels, at most 0.10% of pixels over 8 levels, p99.9 at most 9 (was 7 to 95% of pixels over 8). It exists even at frame 1 with identical CPU-side state (veg, trail, grass arrays, every animal's pose); hiding animals and grass leaves about 3% of pixels differing by at most 5 levels. Cause not found; candidates: a GPU-side input that differs per page load. The verify and drift checks now use a measured noise tolerance (builder, tonight).

## Harness status
- H2 scorecard and contact sheet (`tools/scorecard.py`, `reference/`): DONE, checked by the lead (contact sheet read, numbers match the eye). First concept score for the golden shot: 53.5 of 100, from the old JPEG frames; recheck on the lossless shots.
- H6 lint (`tools/lint.mjs`): DONE, run by the lead (0 errors, 2.5 s). H7 gate (`tools/check.mjs`): non-GPU steps pass in about 3 minutes (builder's run); the shots, scorecard and `--full` steps have never run because H1 is not finished.
- H1 deterministic capture (`?capture=1`, `tools/shots.json`, `tools/shots.mjs`): **STOPPED MID-WORK, not verified.** Partial edits are in `src/main.ts` and `src/render/` (animals, canids, cloudshadow, cranes, engine, grass, post, snowdepth, models/fx, models/splash). Before trusting them: `npx tsc --noEmit -p .`, then finish from the brief in `_PLAN.md` H1. If the partial state is a mess, `git checkout -- src/render src/main.ts` and redo it; the design is in `docs/FABLE-REVIEW.md` section 3.
- S1 balancing loop (`tools/gates.py`, `tools/screen.mjs`, `--abort-extinct` in `src/headless/batch.ts` and `batchWorker.ts`): **STOPPED MID-WORK, not verified.** Its test runs used up to 8 threads; that is the likely cause of the freeze together with three other builders. Check `artifacts/screens/` for partial output and delete it.
- Test runner now runs test files several at a time (`tools/run-tests.ts --jobs N`): the suite without the golden check takes 1 min 54 s, was 10 min 25 s (both measured 11/11/2026 with other work running).

## Next three steps
1. Verify H1 (`node tools/shots.mjs --shots all --verify`), look at all 14 PNGs, then accept the first baselines (`.venv/Scripts/python tools/scorecard.py <run> --accept`) and commit `reference/baseline*`. That is H8, together with a quiet-GPU `node tools/gpubench.mjs` run to set `tools/perf-budget.json`.
2. Show the owner the first contact sheet and the six questions at the end of `docs/FABLE-REVIEW.md` (each has a default; work continues on the defaults).
3. Start S1 (the balancing loop) on the CPU and L2a (one light chunk, zero drift) on the GPU. They do not touch the same files.

## Gotchas
- Captures need the Chromium build this project's Playwright expects. If a capture fails with "Executable doesn't exist", run `npx playwright install chromium` (another project's install can prune the shared cache). `npm run check` tests for this.
- The old capture sets in `tools/stills.mjs` are not repeatable (close-ups differ in 70 to 95% of pixels run to run). Do not score looks from them. Use `tools/shots.mjs`.
- `.claude/hooks/run_until.local.txt` holds a past date (10/24/2026), so the Stop hook lets a session end. Write a new deadline there only when the owner asks for an unattended run.
- The repo is public. Three animal models are CC BY-NC (wolf, mule deer, pronghorn); see question 4 in the review.
- GPU captures run one at a time. Sim screens can run beside them once H1 is verified under load.
