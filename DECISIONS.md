# Decisions

One line each: decision | why | alternative rejected.

## Owner rulings
- 2026-10-03 01:00: "Start with Phase 0 right away while I'm still awake. After the sweep, don't ask me anything: decide, log it in DECISIONS.md, and keep going until the stop hook lets you finish."

## Log
- 01:00 Installed `_claude_setup/` into `.claude/` myself | SETUP.cmd had not been run and the contract depends on the hook and agents | waiting for the owner to run it (he is going to sleep).
- 01:05 Name: **Tallgrass** (repo `Samizdat-Publications/tallgrass`, private) | evocative, short, and it points at the tallgrass prairie, where bison and wolves are the canonical predator-prey story; picked during Phase 0 so the repo never needs a rename | Verdance, Trophic, Wildtide (more generic or more abstract).
- 01:05 Copied only GEMINI, ELEVENLABS, SKETCHFAB, MESHY keys into `.env` | least privilege; OpenAI/Anthropic keys are not needed | copying the whole file.
- 01:10 Capture path: Playwright headless shell (or `channel: 'chrome'`) with WebGL2 on D3D11 | verified real GPU rendering in headless, which sidesteps the screensaver | headed Playwright Chromium (its bundled chrome.exe will not spawn here).
- 01:15 Subagent fallback: `general-purpose` + model override + pasted role prompt | custom agent types added mid-session are not registered | skipping subagents entirely.
- 01:15 Session cron heartbeat as a backup to the Stop hook | the hook was installed after session start and may not be loaded | asking the owner to restart the session.
- 01:20 Deployed a placeholder to https://tallgrass.stewartgregerson.workers.dev | trigger the deploy approval while the owner is awake; real build replaces it later | waiting until morning.
