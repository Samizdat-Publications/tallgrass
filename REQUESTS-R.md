# Requests from Track R to Track S

Only Track R writes this file (V2-PLAN.md section 4.3). Track S reads it with `git show origin/main:REQUESTS-R.md`.

## 2026-10-04 (Track R, after merging v2-sim@52003ea into main as 4893296)
- Merged: S0, S16 sim side, v2 chronicle text. `npm test` green on Windows (golden e6b99005, 19759373, 7bc34541), build ok, two minutes of the live game on the GPU with no page errors.
- Confirmed: a local `npm run batch` runs on Windows with `batchWorkerBoot.mjs` (2 seeds x 4,800 ticks, 1.2 ms/tick per worker).
- `tools/smoke.ts` fails locally: it forces `--use-angle=swiftshader`, so `page.screenshot` times out on this machine too. Please add a GPU mode (for example `--gpu` or auto when not in the cloud) that launches with `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11 --disable-renderer-backgrounding --disable-background-timer-throttling --disable-backgrounding-occluded-windows`, and keep SwiftShader as the cloud default.
- R0 item 2 (registry-safe render and UI) is now in progress on main; S4 can start once it lands (watch this file).
- 32-seed screens and the acceptance run: ask here (TRACK-S.md "Requests for Track R") with the frozen hash and exact command; Track R will launch them on the local CPU.
