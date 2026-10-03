# NEXT SESSION: pick up here

**Updated:** 2026-10-03 ~03:00

## State
- The game runs end to end: `npm run dev` then open http://localhost:5199/ (or `node tools/capture.mjs --page index.html --out x.png`).
  - `src/main.ts` wires the sim worker (`src/sim/worker.ts`), Engine (`src/render/engine.ts`), GrassField, AnimalLayer and GameUI (`src/ui/ui.ts`).
  - Query params: `seed`, `scenario` (prairie|yellowstone|island|drought|collapse, see `src/scenarios.ts`), `cam` (wide|low|top; omitted = fly to the biggest herd), `speed`, `q=medium`, `tm`, `grass=0`.
  - Capture hooks: `__engine`, `__cam`, `__speed`, `__step`, `__ui`, `__select`, `__animals`, `__grass`, `__focusHerd`.
- **Open bug (being fixed by the grass builder, agent a7043abcf9209d6f5):** the grass makes the whole frame black whenever it is visible (NaN/Inf into bloom). `grass=0` works around it.
- Sim balance (16 seeds x 40 years, `scratch/long3`): bison, pronghorn and ravens persist 16/16; wolves 9/16. A batch with softer strife and bigger or double litters is running: `scratch/long4` (log `scratch/long4.log`).

## Next 3 steps
1. When long4 finishes: check wolf persistence. Then apply the deferred world-gen change (fewer upland trees and shrubs: the polka-dot look) and DAY_TICKS 400 -> 800 (a slower day). Both change sim inputs, so re-run the batch afterwards.
2. When the grass fix lands: capture stills (wide herd, low golden, close wolves, night, UI states) for review round 1 (fresh critic, folder `review/round-01/`). Archive the stills via `tools/journey.py`.
3. Commit, push, deploy to workers.dev, and update MORNING.md with the run instructions.

## Gotchas
- Fog is a post-process; materials output linear HDR (scene renders into a 4x MSAA HalfFloat target). Any NaN blacks out the frame via bloom.
- The rendered terrain is reshaped near the creek: render layers use `renderWorld` (world with `engine.terrain.heightTex` heights), not raw `world.height`.
- Don't change sim or world files while a batch runs: later seeds may load the edited code.
- Custom agent types are not registered: use general-purpose + model override. Builders can be resumed with SendMessage (they keep their context).
- Git Bash rewrites `/dev/x.html`: pass `dev/x.html` to capture.mjs.
