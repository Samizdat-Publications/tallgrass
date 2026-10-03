# Good morning: Tallgrass overnight report

*(Work in progress. Updated at every milestone.)*

## How to run it (one step)
TBD after the vertical slice.

## Blocked / workarounds
- **PixelLab:** no key. `PIXELLAB_API_KEY` is blank in Noclip's `.env` and not in environment variables. Workaround: icons come from SVG or Nano Banana instead.
- **seked `.env`:** does not exist. All keys came from Noclip's `.env`, plus `ELEVENLABS_API_KEY` from your user environment variables (it is blank in Noclip's file).
- **Custom subagents and Stop hook:** `SETUP.cmd` had not been run, so I copied `_claude_setup/` into `.claude/` at 01:00. The `builder` and `blind-critic` agent types weren't registered for this already-running session, and the Stop hook may not be either. Workaround: `general-purpose` agents with model overrides and the same role prompts (both verified), plus a session cron heartbeat every 30 minutes as a backup to the hook.
- **Gemini 2.5 Pro:** returns 404 for this key ("no longer available to new users"). Using `gemini-3.1-pro-preview` instead.
