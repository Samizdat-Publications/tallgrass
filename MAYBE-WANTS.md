# Maybe wants

Ideas from the owner for later, after the current plan is finished. Nothing here is scheduled; a planning session picks from this list and moves an item into V2-PLAN.md (or a later plan) when it is time.

## Rare events that unlock while the valley runs idle (owner, 2026-10-07)
A player who leaves Tallgrass running at 1x in the background should slowly unlock novel, rare events over real hours and days, and each one gets recorded somewhere they can look back at.
- Rare, memorable happenings the sim can produce or stage: for example a white bison calf, a wolf pack of record size, a cougar crossing the open prairie, a hundred-year flood, a comet or aurora storm, a lone wolf travelling in from far away, a beaver dam that floods a grove, a lightning-struck lone cottonwood, an eagle taking a hare in front of the camera.
- Unlocked by valley time actually lived at 1x (not by fast-forward), so patience is the way in.
- A record of them: a journal, a "rare sightings" page, or a section of the Field guide or Field notes, with the valley year, a still frame (photo mode capture) and a line of chronicle text.
- Open questions for the planner: which events are true sim outcomes versus staged rarities; persistence across reloads (local storage or a save file); whether the documentary camera should cut to them when they happen; how to keep the sim deterministic (golden hash) if a rarity changes the world.

## OpenAI Decisions API (owner FYI, 2026-10-08; lead's assessment)
An endpoint that returns one choice from a fixed list, given text or an image (announced at OpenAI DevDay, late September 2026; image pricing not published when checked).
- Not a fit for animal behaviour: the sim is deterministic per seed (golden hashes, share codes, replays) and runs headless at thousands of ticks per second; a network call per decision would break all three and cost money per tick.
- Possible later uses, offline or occasional: (1) automated playtesting, an agent that picks a god tool from a screenshot to try to win a challenge (we already have a scripted player in tools/challenge_suite.py, so low value); (2) for the idle rare-events journal above, classifying captured frames ("is the subject visible? which event?") to pick the best photo for each entry. Revisit when that feature is planned.
