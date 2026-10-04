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
