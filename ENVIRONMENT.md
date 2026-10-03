# Environment (Phase 0 sweep, 2026-10-03 ~01:00)

## Machine
- Windows 11 Home 10.0.26200
- GPU: **NVIDIA GeForce RTX 5070 Ti Laptop GPU**, 12 GB, driver 610.71 (the brief said RTX 5070; it is the Ti laptop part)

## Tools (all verified with a real run)
| Tool | Version | Path / how | Result |
|---|---|---|---|
| Python | 3.14.3 | `C:\Python314\python.exe`; project venv at `.venv/` | OK. venv has numpy 2.5.3, matplotlib 3.11.2 |
| Node / npm | 24.19.0 / 11.17.0 | `C:\Program Files\nodejs` | OK |
| three | 0.186.1 | project-local | installed |
| vite | 8.3.2 | project-local | installed |
| typescript | 7.0.2 | project-local | installed |
| tsx | 4.23.15 | project-local | installed |
| playwright | 1.63.0 | project-local, browsers in `%LOCALAPPDATA%\ms-playwright` (chromium-1243 already present) | OK, see GPU notes |
| wrangler | 4.147.0 | project-local (`npx wrangler`) | `whoami` OK (owner's personal Cloudflare account). Placeholder deploy OK: `npx wrangler deploy --name tallgrass --assets <dir> --compatibility-date 2026-10-01` -> https://tallgrass.stewartgregerson.workers.dev |
| git | 2.53.0 | | OK |
| gh | 2.97.0 | logged in as `Samizdat-Publications` (scopes: repo, workflow, gist, read:org) | OK |
| ffmpeg | 9.0.2 (gyan.dev full build) | WinGet link on PATH | OK, already installed (no install needed) |
| Godot | 4.7.2.stable (standard, not .NET) | `godot` WinGet link on PATH | headless `--script` OK |
| Blender | 5.1.2 | `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (NOT on PATH) | `-b --factory-startup -P` OK |

## Browser capture (critical for reviews)
- **Headless Chromium (Playwright headless shell) renders WebGL2 on the real GPU**: `ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Laptop GPU Direct3D11)`. Same for `channel: 'chrome'` (installed Google Chrome) headless and headed, and `channel: 'msedge'` headless.
- Flags used: `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --enable-gpu --ignore-gpu-blocklist --use-angle=d3d11`.
- Playwright's bundled full `chrome.exe` (chromium-1243) fails to spawn (`spawn UNKNOWN` / permission denied). Use the headless shell or `channel: 'chrome'` instead.
- WebGPU returned no adapter on `about:blank` (probably not a secure context). Not needed: the renderer is WebGL2.

## APIs (one cheap call each)
| Service | Key source | Result |
|---|---|---|
| Gemini text | Noclip `.env` (key ...hBVg) | OK with `gemini-3.1-pro-preview`. `gemini-2.5-pro` returns 404 "no longer available to new users". |
| Gemini image (Nano Banana) | same | OK with `gemini-3-pro-image` (one concept image, 890 KB jpg). Also listed: `gemini-3.1-flash-image`, `gemini-2.5-flash-image`. |
| Gemini video upload + understanding | same | OK: Files API resumable upload, then `gemini-3.1-pro-preview` described the clip correctly. |
| ElevenLabs | env var `ELEVENLABS_API_KEY` (blank in Noclip `.env`) (...a67a) | OK. Tier `payg`, 7,633 / 37,472 chars used. One 4 s SFX generated. |
| Meshy | Noclip `.env` (...GEvL) | OK, balance 1,292 credits |
| Sketchfab | Noclip `.env` (...5af4) | OK, user Mr.Pastrami; CC0 search works |
| PixelLab | blank in Noclip `.env`, not in env vars | **Unavailable** (see MORNING.md Blocked) |
| seked | no `.env` file anywhere in the repo | n/a |

Smoke script: `tools/api_smoke.py` (`.venv/Scripts/python tools/api_smoke.py all`). Set `SKIP_IMAGE=1` to skip the paid image call, `GEMINI_TEXT_MODEL=...` to override.

## Claude Code session quirks
- `SETUP.cmd` had not been run, so `.claude/` (Stop hook, agents, settings) was installed by me at 01:00 by copying `_claude_setup/`. Because that happened after the session started, the `builder` and `blind-critic` agent types are **not registered** this session, and the Stop hook may not be live either.
- Workarounds: builder = `general-purpose` agent with `model: sonnet` and the builder brief pasted in; blind critic = `general-purpose` with `model: opus`, the blind-critic prompt pasted verbatim, told to use only Read/Glob, and given only a folder path. Both verified. A session cron heartbeat (`13,43 * * * *`) re-prompts the lead if it ever goes idle before the deadline.
- npm 11 gates install scripts: `workerd` postinstall was not run. Only `wrangler dev` needs it; `wrangler deploy` does not.
