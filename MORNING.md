# Good morning: Tallgrass overnight report

*(Work in progress. Updated at every milestone. Last update: 03:10.)*

## How to run it (one step)
```
npm run dev
```
Then open http://localhost:5199/ (Chrome or Edge). The first load takes a few seconds while the world generates.
- `?seed=anything` picks a world; `?scenario=yellowstone` (also `island`, `drought`, `collapse`) picks a scenario. The menu (top right) does the same.
- Keys: Space pause, 1/2/3 speed, N next event, G big graph, L log scale, H hide UI, C cinematic, F follow the selected animal, Esc back out. Click an animal to inspect it. Left-drag orbits, right-drag pans, wheel zooms.

## What it is
**Tallgrass**: a living tallgrass prairie seen like a drone nature documentary. Grass greens and cures with the seasons, bison and pronghorn graze it, wolf packs hold territories and hunt, ravens circle every kill, and carcasses feed the soil. The sim runs in a Web Worker, deterministic from the seed; the renderer is Three.js (WebGL2) with GPU-instanced wind-blown grass and procedurally animated animals; the UI is a "documentary broadcast" overlay (location slate, chronicle, chapter cards, population graphs, inspector, god tools).

## What to look at first
1. Open it and let it run at 1x for a minute: the camera opens on the biggest herd at golden hour.
2. Click a wolf, press F to follow it.
3. Press G for the population graph, then 100x for a few minutes of sim years.
4. Try the menu's "Yellowstone return" scenario.

## Status (honest)
- **Playable vertical slice:** done (03:00). Screenshots: `review/round-01/`.
- **Stability:** NOT yet at the acceptance bar. Prey (bison, pronghorn, ravens) persisted 16/16 in a 40-year 16-seed run at one point, but that run had a bug that silently sterilized dispersing wolves. With the bug fixed, wolves boom and crash the prey. Balancing is in progress (see `REVIEWS.md` and `DECISIONS.md`).

## Blocked / workarounds
- **PixelLab:** no key. `PIXELLAB_API_KEY` is blank in Noclip's `.env` and not in environment variables. Workaround: icons are hand-made inline SVG.
- **seked `.env`:** does not exist. All keys came from Noclip's `.env`, plus `ELEVENLABS_API_KEY` from your user environment variables (it is blank in Noclip's file).
- **Custom subagents and Stop hook:** `SETUP.cmd` had not been run, so I copied `_claude_setup/` into `.claude/` at 01:00. The `builder` and `blind-critic` agent types weren't registered for this already-running session, and the Stop hook may not be either. Workaround: `general-purpose` agents with model overrides and the same role prompts (verified), plus a session cron heartbeat every 30 minutes.
- **Gemini 2.5 Pro:** returns 404 for this key ("no longer available to new users"). Using `gemini-3.1-pro-preview` instead.

## API spend so far
1 Gemini image (concept art), a few Gemini text calls, 1 Gemini video smoke call, 1 ElevenLabs 4 s SFX. Details in `ASSETS.md`.
