# NEXT SESSION: pick up here

**Updated:** 11/12/2026 morning, end of the overnight run (lead on Opus 5.5; the owner asked for a Fable 5.2 review at 13:00). Keep this file short: the state now, the next three steps, the gotchas. The old log is in `docs/history/NEXT-SESSION-through-2026-10-30.md`.

## Read first
1. `CLAUDE.md` (the operating contract).
2. `MORNING.md`, top section (what the overnight run did, with numbers).
3. `docs/FABLE-REVIEW.md` (the audit) and the top section of `_PLAN.md` (the change order; each package has a status).
4. `docs/ROUTING.md` (Fable decides and looks; builder, grunt, scout and verifier do the rest).

## State
- Live: v1.0.12, checkpoint v14. Nothing deployed overnight; no sim default changed.
- Harness done and in use: fixed shots (`npm run shots`), scorecard and contact sheet (`npm run score`), lint, the gate (`npm run check`), the long guard (`npm run test:long`), the balancing loop (`tools/screen.mjs`, `tools/gates.py`). First baselines accepted 11/12 (`reference/baseline/`, lossless copies in `reference/baseline/local/`, not in git).
- Refactors done with no visual change: L2a (one light: shared lighting chunks, aliased grass uniforms, checked shader patches), L4 first half (animal `update()` split into named steps), calendar per sim (S6a).
- Running at the end of the night (check before starting a screen: `artifacts/screen.lock`): `v14-full`, the 20 x 400-year control for v15 (`artifacts/screens/v14-full/`), and possibly a grunt archiving one-off tools (H9).

## Next three steps
1. Fable review at 13:00: confirm or reorder the "Next 5" in MORNING.md; show the owner the first contact sheet (`review/fable-audit-2026-11-11/first_contact_sheet_2026-11-12.jpg`) and the six questions at the end of `docs/FABLE-REVIEW.md`.
2. L2b (one sun) from the worklist of non-identical lighting copies in `_PLAN.md`, judged on the scorecard (the far-band wash is the worst term of the golden shot, 53.6 of 100).
3. S2: verify the truth table rows against the papers (`docs/ECOLOGY-TRUTH-draft.md`), then S3 and S4 toward v15, compared against the `v14-full` control.

## Gotchas
- Capture noise: shots are not byte-identical across page loads (mean 0.02 to 0.17 levels, at most 0.10% of pixels over 8 levels). It exists at frame 1 with identical CPU state (veg, trail, grass arrays, every animal's pose); hiding animals and grass leaves about 3% of pixels differing by at most 5 levels. Cause not found; a GPU-side input that differs per page load. The verify and drift checks use a measured tolerance (`tools/shots.mjs`, `tools/scorecard.py` constants).
- Each shot gets its own page load on purpose: the camera rig, tree level-of-detail bands and other caches carry over between shots otherwise.
- The laptop is shared: other projects run Godot, Blender and capture jobs overnight. Sim screens ran 6 to 15 times slower than measured; the GPU budget (`tools/perf-budget.json`) needs a quiet GPU and is not set.
- The filter stage judges ratios at the end, so a known-bad setting is rejected at the end of the stage, not early (about 40 to 60 minutes on a loaded machine).
- Do not wrap a screen chain in a short `timeout`: one overnight screen was cut off by a 1-hour limit.
- Playwright Chromium may need `npx playwright install chromium` (another project's install can prune the shared cache); `npm run check` tests for it.
- `.claude/hooks/run_until.local.txt` holds the overnight deadline (2026-11-12 13:00); after that the Stop hook lets sessions end.
- The repo is public. Three animal models are CC BY-NC (wolf, mule deer, pronghorn); see question 4 in the review.
