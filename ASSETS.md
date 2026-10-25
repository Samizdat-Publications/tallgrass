# Assets and API spend ledger

## Paid API calls
| When | Service | What | Count | Est. cost |
|---|---|---|---|---|
| 10-03 01:12 | Gemini `gemini-3-pro-image` | Phase 0 smoke: prairie concept art (bison + wolves, golden hour) -> `scratch/api_smoke/concept_smoke.jpg` | 1 image | ~$0.13 |
| 10-03 01:12 | Gemini `gemini-3.1-pro-preview` | smoke text + 2 s video understanding (plus 2 failed 404 calls to 2.5-pro) | 2 calls | <$0.01 |
| 10-03 01:12 | ElevenLabs sound-generation | 4 s prairie wind ambience -> `scratch/api_smoke/eleven_smoke_wind.mp3` | 1 SFX | ~100 chars-equivalent credits |
| 10-03 01:12 | Meshy | balance check only (1,292 credits) | 0 | free |
| 10-03 01:12 | Sketchfab | `/me` + CC0 search | 0 | free |
| 10-03 03:57 | ElevenLabs sound-generation | `wind_day` (20 s loop) -> `public/audio/wind_day.mp3` | 1 SFX | 110 credits |
| 10-03 04:01 | ElevenLabs sound-generation | `evening_birds` (20 s loop) take 1 (rubbing noise, no birds). REJECTED, raw only | 1 SFX | 110 credits |
| 10-03 04:01 | ElevenLabs sound-generation | `night_crickets` (20 s loop) -> `public/audio/night_crickets.mp3` | 1 SFX | 110 credits |
| 10-03 04:01 | ElevenLabs sound-generation | `rain` (20 s loop), take 1 (hissy, read as frying oil even after EQ). Superseded by procedural rain | 1 SFX | 110 credits |
| 10-03 04:01 | ElevenLabs sound-generation | `thunder` (6 s) -> `public/audio/thunder.mp3` | 1 SFX | 33 credits |
| 10-03 04:01 | ElevenLabs sound-generation | `wind_winter` (20 s loop) -> `public/audio/wind_winter.mp3` | 1 SFX | 110 credits |
| 10-03 04:01 | ElevenLabs sound-generation | `creek` (15 s loop) -> `public/audio/creek.mp3` | 1 SFX | 82 credits |
| 10-03 04:02 | ElevenLabs sound-generation | `wolf_pack` (7 s) -> `public/audio/wolf_pack.mp3` | 1 SFX | 38 credits |
| 10-03 04:02 | ElevenLabs sound-generation | `wolf_single` (5 s) -> `public/audio/wolf_single.mp3` | 1 SFX | 27 credits |
| 10-03 04:02 | ElevenLabs sound-generation | `bison_grunts` (5 s) -> `public/audio/bison_grunts.mp3` | 1 SFX | 27 credits |
| 10-03 04:02 | ElevenLabs sound-generation | `stampede` (8 s) take 1, a wooden ratchet. REJECTED, raw only | 1 SFX | 44 credits |
| 10-03 04:02 | ElevenLabs sound-generation | `raven_calls` (4 s) -> `public/audio/raven_calls.mp3` | 1 SFX | 22 credits |
| 10-03 04:09 | ElevenLabs sound-generation | `stampede` (8 s) retry #1 (take 1 was a wooden ratchet). Kept as the low thump layer under a procedural herd rumble -> `public/audio/stampede.mp3` | 1 SFX | 44 credits |
| 10-03 04:09 | ElevenLabs sound-generation | `evening_birds` retry #1 (meadowlark prompt, sounded like human whistling). REJECTED, raw only | 1 SFX | 110 credits |
| 10-03 04:10 | ElevenLabs sound-generation | `rain` retry #1 (crackly, sizzle). REJECTED, raw only. Final rain is procedural, see Generated assets | 1 SFX | 110 credits |
| 10-03 04:16 | ElevenLabs sound-generation | `evening_birds` retry #2 (generic songbirds prompt) -> `public/audio/evening_birds.mp3`. This was call 16 of 16, budget spent | 1 SFX | 110 credits |
| 10-03 03:58-05:25 | Gemini `gemini-3.1-pro-preview` | audio listen-checks of the generated clips and of recorded game mixes (inline mp3, ~60 word answers) | 35 calls | <$0.15 |
| 10-03 05:21 | Gemini `gemini-3-pro-image` | concept art: 01_moonlit_prairie -> art/concept/01_moonlit_prairie.jpg | 1 image | ~$0.13 |
| 10-03 05:22 | Gemini `gemini-3-pro-image` | concept art: 02_early_summer -> art/concept/02_early_summer.jpg | 1 image | ~$0.13 |
| 10-03 06:20 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (62511 KB) | 1 call | ~$0.05 |
| 10-03 12:00 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (53635 KB) | 1 call | ~$0.05 |
| 10-03 18:21 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (76846 KB) | 1 call | ~$0.05 |
| 10-03 23:13 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (80336 KB) | 1 call | ~$0.05 |
| 10-04 01:44 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (81708 KB) | 1 call | ~$0.05 |
| 10-04 03:55 | ElevenLabs text-to-speech `eleven_multilingual_v2`, voice George (stock) | documentary narrator: 1 test line at speed 1.0 (too fast, 226 wpm, kept in scratch/audio), then 18 lines at speed 0.8 -> `public/audio/narration/*.mp3` (script in `tools/narration.py`), then retakes of 4 weak lines (opening with pauses, stampede_1, outbreak_1, introducedWolf_1 twice; first takes kept in scratch/audio/narration_take1) | 24 takes, 1,911 characters | pay-as-you-go: about $0.40 to $0.60 |
| 10-04 03:56 | Gemini `gemini-3.1-pro-preview` | listen-checks of narrator lines (`scratch/audio/listen_narration.py`) | 24 calls | ~$0.10 |
| 10-04 07:51 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (80429 KB) | 1 call | ~$0.05 |
| 10-04 09:10 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (68596 KB) | 1 call | ~$0.05 |
| 10-04 10:57 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (62555 KB) | 1 call | ~$0.05 |
| 10-04 11:24 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (64178 KB) | 1 call | ~$0.05 |
| 10-04 14:34 | Gemini `gemini-3.1-pro-preview` | concept compare of concept_baseline.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 14:37 | Gemini `gemini-3.1-pro-preview` | concept compare of concept_baseline.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 14:40 | Gemini `gemini-3.1-pro-preview` | concept compare of tm_aces.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 14:40 | Gemini `gemini-3.1-pro-preview` | concept compare of tm_neutral.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 14:56 | Gemini `gemini-3.1-pro-preview` | concept compare of haze_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 14:57 | Gemini `gemini-3.1-pro-preview` | concept compare of haze_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 14:58 | Gemini `gemini-3.1-pro-preview` | concept compare of haze_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:11 | Gemini `gemini-3.1-pro-preview` | concept compare of water_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:16 | Gemini `gemini-3.1-pro-preview` | concept compare of water_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:24 | Gemini `gemini-3.1-pro-preview` | concept compare of water_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:25 | Gemini `gemini-3.1-pro-preview` | concept compare of terrain_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:29 | Gemini `gemini-3.1-pro-preview` | concept compare of terrain_after.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:32 | Gemini `gemini-3.1-pro-preview` | concept compare of merged_concept.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-04 15:03 | ElevenLabs music (/v1/music) | `dawn` take 1 (70 s, intro near silent, 5 s tail fade; REJECTED for length, raw only) -> `public/audio/music/dawn.mp3` | 1 music | ~450 credits (counter lags; 3,571 credits for all 6 music calls, about 7 credits per second) |
| 10-04 15:04 | ElevenLabs music (/v1/music) | `day` cue (90 s, music_v1, instrumental) -> `public/audio/music/day.mp3` | 1 music | ~450 credits (counter lags; 3,571 credits for all 6 music calls, about 7 credits per second) |
| 10-04 15:04 | ElevenLabs music (/v1/music) | `tension` cue (90 s, music_v1, instrumental) -> `public/audio/music/tension.mp3` | 1 music | ~600 credits (see dawn row) |
| 10-04 15:04 | ElevenLabs music (/v1/music) | `night` cue (90 s, music_v1, instrumental) -> `public/audio/music/night.mp3` | 1 music | ~450 credits (counter lags; 3,571 credits for all 6 music calls, about 7 credits per second) |
| 10-04 15:04 | ElevenLabs music (/v1/music) | `storm` cue (90 s, music_v1, instrumental) -> `public/audio/music/storm.mp3` | 1 music | ~450 credits (counter lags; 3,571 credits for all 6 music calls, about 7 credits per second) |
| 10-04 15:05 | ElevenLabs music (/v1/music) | `dawn` cue (90 s, music_v1, instrumental) -> `public/audio/music/dawn.mp3` | 1 music | ~450 credits (counter lags; 3,571 credits for all 6 music calls, about 7 credits per second) |
| 10-04 15:06 | ElevenLabs sound-generation | `bison_rut` (6 s) -> `public/audio/bison_rut.mp3` (R14) | 1 SFX | 33 credits |
| 10-04 15:06 | ElevenLabs sound-generation | `crane_bugle` (6 s) -> `public/audio/crane_bugle.mp3` (R14) | 1 SFX | 33 credits |
| 10-04 15:06 | ElevenLabs sound-generation | `blizzard` (20 s loop) -> `public/audio/blizzard.mp3` (R14) | 1 SFX | 110 credits |
| 10-04 15:06 | ElevenLabs sound-generation | `grasshopper` (12 s loop) -> `public/audio/grasshopper.mp3` (R14) | 1 SFX | 66 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `coyote_chorus_1` (8 s) -> `public/audio/coyote_chorus_1.mp3` (`tools/gen_wildlife.py`), 1 take, kept | 1 SFX | 44 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `coyote_chorus_2` (7 s), 3 takes: roosters crowing (rejected), one lone coyote (rejected), third kept | 3 SFX | 114 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `coyote_howl` (5 s), 3 takes: a wolf-like howl, a rooster (both rejected), third kept (a canine howl, no yips) | 3 SFX | 81 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `prairiedog_alarm` (5 s), 3 takes: mouth noises, rusty squeaks (both rejected), third kept | 3 SFX | 81 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `prairiedog_yip` (2 s), 3 takes: all read as a small dog barking, the last kept (three tiny barks, split and pitched up in the game) | 3 SFX | 33 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `thunder_crack_1` (4 s), 1 take, kept | 1 SFX | 22 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `thunder_crack_2` (5 s), 1 take, kept | 1 SFX | 27 credits |
| 10-04 18:22 | ElevenLabs sound-generation | R3 `meadowlark` (5 s), 3 takes: a human whistling twice (rejected), third kept (a songbird) | 3 SFX | 81 credits |
| 10-04 18:40 | ElevenLabs text-to-speech `eleven_multilingual_v2`, voice George (stock) | R3 narrator: 14 new lines (`tools/narration.py`, speed 0.8) -> `public/audio/narration/*.mp3`: wolvesArrive, returned, pronghornLeave, pronghornReturn, distemper, mange, plague, townBack, hareBoom, hareCrash, coyotePups, mesoRelease, lightningFire, storm | 14 takes, 1,048 characters | about $0.20 |
| 10-04 18:45 | Gemini `gemini-3.1-pro-preview` | R3 listen-checks of the 8 sound clips and their retakes (`scratch/listen_r3.py`, not committed) and a transcript check of the 14 narrator lines (`scratch/narr_check.py`) | 32 calls | ~$0.15 |
| 10-04 22:12 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (69323 KB) | 1 call | ~$0.05 |
| 10-05 02:03 | Gemini `gemini-3.1-pro-preview` | concept compare of concept_cap.jpg vs 00_prairie_golden_hour.jpg (2 images, JSON) | 1 call | ~$0.01 |
| 10-05 02:12 | ElevenLabs sound-generation | `hawk_scream_1` (3 s) -> `public/audio/hawk_scream_1.mp3` (R5, KEPT: Gemini heard a real red-tailed hawk) | 1 SFX | 16 credits |
| 10-05 02:12 | ElevenLabs sound-generation | `hawk_scream_2` (4 s) first take (R5, REJECTED: Gemini heard a human impression, replaced by the retake below) | 1 SFX | 22 credits |
| 10-05 02:12 | ElevenLabs sound-generation | `hawk_stoop` (2 s) (R5, REJECTED: sounded like a squeaky toy, file deleted) | 1 SFX | 11 credits |
| 10-05 02:12 | ElevenLabs sound-generation | `eagle_call_1` (3 s) (R5, REJECTED: sounded artificial, file deleted) | 1 SFX | 16 credits |
| 10-05 02:12 | ElevenLabs sound-generation | `eagle_call_2` (3 s) -> `public/audio/eagle_call_2.mp3` (R5, KEPT as the golden eagle call, played lower) | 1 SFX | 16 credits |
| 10-05 02:16 | ElevenLabs sound-generation | `hawk_scream_2` (4 s) retake -> `public/audio/hawk_scream_2.mp3` (R5, KEPT: Gemini heard a real red-tailed hawk twice; the sixth and last of the R5 budget) | 1 SFX | 22 credits |
| 10-05 02:20 | Gemini `gemini-3.8-flash` | R5 listen-checks of the raptor clips (`scratch` script, not committed): what animal, real or imitation | 9 calls | cents |
| 10-05 04:56 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (75996 KB) | 1 call | ~$0.05 |
| 10-07 15:53 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (48781 KB) | 1 call | ~$0.05 |
| 10-08 04:54 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (60291 KB) | 1 call | ~$0.05 |
| 10-08 16:37 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (51844 KB) | 1 call | ~$0.05 |
| 10-09 08:37 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (45544 KB) | 1 call | ~$0.05 |
| 10-09 11:50 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (61933 KB) | 1 call | ~$0.05 |
| 10-09 15:49 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (23923 KB) | 1 call | ~$0.05 |
| 10-09 22:59 | Gemini `gemini-3.1-pro-preview` | blind video critique of motion.mp4 (4785 KB) | 1 call | ~$0.05 |
| 10-10 02:10 | Gemini `gemini-3.1-pro-preview` | blind video critique of motion.mp4 (11109 KB) | 1 call | ~$0.05 |
| 10-10 06:54 | Gemini `gemini-3.1-pro-preview` | blind video critique of motion.mp4 (26544 KB) | 1 call | ~$0.05 |
| 10-10 14:09 | Gemini `gemini-3.1-pro-preview` | blind video critique of motion.mp4 (23150 KB) | 1 call | ~$0.05 |
| 10-10 15:18 | Gemini `gemini-3.1-pro-preview` | blind video critique of motion.mp4 (29842 KB) | 1 call | ~$0.05 |
| 10-17 18:37 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (58633 KB) | 1 call | ~$0.05 |
| 10-17 18:38 | Gemini `gemini-3.1-pro-preview` | blind video critique of motion.mp4 (28679 KB) | 1 call | ~$0.05 |
| 10-24 15:19 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (60047 KB) | 1 call | ~$0.05 |
| 10-24 16:02 | Gemini `gemini-3.1-pro-preview` | blind video critique of hero.mp4 (5863 KB) | 1 call | ~$0.05 |
| 10-24 21:10 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (59204 KB) | 1 call | ~$0.05 |
| 10-24 22:18 | Gemini `gemini-3.1-pro-preview` | blind video critique of reel.mp4 (59401 KB) | 1 call | ~$0.05 |

## Downloaded third-party assets
| Asset | Source | License | Used in |
|---|---|---|---|
| (none yet) | | | |

## Generated assets
All under `public/audio/`, 44.1 kHz stereo mp3 128 kbps, regenerated by `tools/gen_audio.py` (raw takes cached in `scratch/audio/raw`, not committed). Levels: beds at -23 dBFS RMS, one-shots at -2 dBFS peak. Beds are band-limited in post (rumble below 80 to 110 Hz and generation hiss above 5 to 9 kHz removed) because the raw takes had a hiss shelf that read as static. Raw takes that were rejected (and the earlier takes of retried clips) are kept in `scratch/audio/raw/*.vN.mp3`.
| File | Length | Source | Notes |
|---|---|---|---|
| `wind_day.mp3` | 20.0 s loop | generated with ElevenLabs (eleven_text_to_sound_v2, loop=true) | steady breeze in tall grass; API loop seam clean, no crossfade needed |
| `evening_birds.mp3` | 18.5 s loop | generated with ElevenLabs (loop=true) | distant songbirds and soft breeze; seam fixed with a 1.5 s equal-power crossfade in post. Third prompt, the meadowlark prompts came back as human-sounding whistling |
| `night_crickets.mp3` | 20.0 s loop | generated with ElevenLabs (loop=true) | cricket and katydid chorus; seam clean |
| `rain.mp3` | 20.0 s loop | procedural (numpy, `synth_rain` in `tools/gen_audio.py`) | noise wash plus Poisson noise-burst droplets, circular so it loops seamlessly. Both ElevenLabs rain takes sounded like frying oil, so they are not used |
| `thunder.mp3` | 5.9 s | generated with ElevenLabs | distant roll; saturated-sub harmonics added in post so small speakers can play it |
| `wind_winter.mp3` | 18.5 s loop | generated with ElevenLabs (loop=true) | hollow cold wind; 1.5 s crossfade ran |
| `creek.mp3` | 13.5 s loop | generated with ElevenLabs (loop=true) | shallow creek; 1.5 s crossfade ran |
| `wolf_pack.mp3` | 5.6 s | generated with ElevenLabs | listen-check says it reads as one wolf rather than a pack, which is fine as a second distant howl |
| `wolf_single.mp3` | 4.4 s | generated with ElevenLabs | one long howl |
| `bison_grunts.mp3` | 3.3 s | generated with ElevenLabs | about three grunts and huffs, segmented at load into separate calls |
| `stampede.mp3` | 8.0 s | generated with ElevenLabs (thump layer) plus procedural herd rumble (numpy, `synth_herd`) | the raw ElevenLabs takes were a ratchet and a heartbeat, so the final mixes the thump take with synthesized hoof impacts and a rumble |
| `raven_calls.mp3` | 3.3 s | generated with ElevenLabs | about five caws, segmented at load into separate calls |
| `coyote_chorus_1.mp3` | 4.2 s | generated with ElevenLabs (R3) | three overlapping yip-howls at dusk; the listen-check agrees it is a coyote chorus |
| `coyote_chorus_2.mp3` | 5.7 s | generated with ElevenLabs (R3) | a second chorus: yips and howls answering each other, a little insect bed under it |
| `coyote_howl.mp3` | 3.6 s | generated with ElevenLabs (R3) | one canine howl; it has no closing yips (the listen-check: partly matches) |
| `prairiedog_alarm.mp3` | 4.8 s | generated with ElevenLabs (R3) | about eight sharp chirping barks, the alarm chorus of a town |
| `prairiedog_yip.mp3` | 1.9 s | generated with ElevenLabs (R3) | three barks that sound like a small dog; split into single barks at load and pitched up 1.3 to 1.5 times for a prairie dog's jump-yip |
| `thunder_crack_1.mp3` | 4.0 s | generated with ElevenLabs (R3), sub harmonics added in post | a close sharp crack and a short roll |
| `thunder_crack_2.mp3` | 5.0 s | generated with ElevenLabs (R3), sub harmonics added in post | a very close crack-boom that rolls away |
| `meadowlark.mp3` | 3.7 s | generated with ElevenLabs (R3) | a bubbling songbird; the earlier prompts (flute, whistled) came back as a person whistling |

### R14 music and extra sounds (`tools/gen_music.py`, raw takes in `scratch/audio/music_raw`, not committed)
Music cues are in `public/audio/music/`, stereo mp3 96 kbps, levelled to -20 LUFS, tail crossfaded into the head over 5 s so they loop. ElevenLabs music API (`POST /v1/music`, `music_v1`, instrumental), prompts in the script.
| File | Length | Source | Notes |
|---|---|---|---|
| `music/dawn.mp3` | 77.8 s loop | ElevenLabs music | solo cello drone, fingerpicked guitar, soft piano; second take (the first was 70 s with a near-silent intro and a fade-out) |
| `music/day.mp3` | 74.6 s loop | ElevenLabs music | lone fiddle over guitar and soft piano |
| `music/tension.mp3` | 77.8 s loop | ElevenLabs music | low strings, soft frame drum pulse, high tremolo |
| `music/night.mp3` | 73.3 s loop | ElevenLabs music | sparse piano, distant bowed drone |
| `music/storm.mp3` | 76.3 s loop | ElevenLabs music | bleak cello and harmonics, used for storms and winter days |
| `bison_rut.mp3` | 4.6 s | ElevenLabs sound-generation | bull bellow, rut spot sound |
| `crane_bugle.mp3` | 4.9 s | ElevenLabs sound-generation | sandhill crane bugle, flyover calls |
| `blizzard.mp3` | 18.5 s loop | ElevenLabs sound-generation (loop=true) | blizzard wind bed, 1.5 s crossfade |
| `grasshopper.mp3` | 10.5 s loop | ElevenLabs sound-generation (loop=true) | grasshopper buzz bed, 1.5 s crossfade |
| 10-09 06:10 | ElevenLabs text-to-speech `eleven_multilingual_v2`, voice George (stock) | v10 narrator: 5 climate lines (climateWet_1, climateWet_2, climateDry_1, megadrought_1, climateMild_1; `tools/narration.py`, speed 0.8) -> `public/audio/narration/*.mp3`; loudness checked against the existing lines (-22.9 to -24.1 dB mean vs -24.0 to -24.3) | 5 takes, 486 characters | about $0.10 |

## a3 spike downloads (2026-10-09, Sketchfab, free downloads, no credits spent)
| Model | Author | License | Used for |
|---|---|---|---|
| Bison - animal (uid 4b8f112f...) | Brian Trepanier | CC BY 4.0 | a3 bison near LOD |
| WOLF - Realistic 3D Model (DEMO FREE) (uid 8840b859...) | WildMesh 3D | CC BY-NC 4.0 | a3 wolf near LOD |
Also downloaded for comparison and not used: European Bison NHMW (e8166095..., CC BY-NC, Natural History Museum Vienna). Meshy: not used.
| Pronghorn (a8cb6abf...) | FennecFyre | CC BY-NC 4.0 | a3 pronghorn |
| DEER - Realistic (DEMO FREE) (3997d669...) | WildMesh 3D | CC BY-NC 4.0 | a3 mule deer |
| coyote (e350e508...) | Raven-Woods | CC BY 4.0 | a3 coyote |
| Puma Gray (90f0fd2c...) | 1225659838@qq.com | CC BY 4.0 | a3 cougar |
Rollout: Sketchfab free downloads only, no Meshy credits spent.

### r-ground (2026-10-09): scanned ground detail
Six Poly Haven 1K scans (CC0) downloaded through the public API (`api.polyhaven.com/files/<id>`, Diffuse and nor_gl, jpg), no paid calls: `withered_grass`, `brown_mud_dry`, `grass_path_2`, `brown_mud_03`, `burned_ground_01`, `snow_02`. Reduced by `tools/build_ground_textures.py` (source scans kept out of the repo) to 12 small jpgs, about 2.5 MB, in `public/textures/ground/`. Sources and licenses are in `CREDITS.md`.

- 2026-10-24 Gemini video critique, round 34 (reel 108 s, 8 fps sampling, gemini-3.1-pro-preview): 1 call, about $0.10.
