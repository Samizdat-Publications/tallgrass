# Tallgrass UI design

## Job of the UI
The prairie is the star. The UI is a broadcast layer over nature footage: it tells you where and when you are, what is happening, and lets you poke the world, then gets out of the way. Every panel collapses; `H` hides all of it.

## Direction: "documentary broadcast graphics"
Wildlife documentaries put restrained titles over footage: a location slate, chapter cards ("The long drought"), small lower-third captions naming an animal. Tallgrass borrows that vocabulary instead of a game HUD or a dashboard. Panels are smoked glass over the scene, so the golden light still shows through.

**The one bold element:** chapter cards. When something major happens (drought, a new pack, a stampede, an extinction, a reintroduction), a large serif title fades in over the lower third of the frame for about four seconds, then settles as an entry in the chronicle. Everything else stays quiet.

## Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `--smoke` | `rgba(26, 23, 17, 0.52)` over `backdrop-filter: blur(14px) saturate(1.2)` | panel glass (a warm umber dusk, not black) |
| `--edge` | `rgba(240, 228, 200, 0.14)` | 1 px panel edge |
| `--paper` | `#EFE6D0` | primary text (warm light, like sunlit grass seed heads) |
| `--paper-dim` | `#B8AD95` | secondary text |
| `--gold` | `#D9B65C` | the single accent: active control, selection ring, focus |
| `--ember` | `#E0763C` | danger tools only (fire, plague, cull) |

Species (lines, chips, and dots; four clearly separate hues so no two lines in a chart can be mistaken for each other, all light enough to read on smoked glass):
| Species | Hex | Name |
|---|---|---|
| Bison | `#CF8B4E` | hide amber-brown |
| Wolf | `#7FA8D6` | slate blue |
| Raven | `#A892DA` | violet ink |
| Pronghorn | `#86C3A4` | mint sage |
| Rabbit | `#D7C29A` | sand |
| Cougar | `#D27A8C` | rose |
| Grass | `#93B36B` | sage (faint secondary axis only) |

### Type
- **Alegreya** (serif, literary, calligraphic italics): chapter cards, the location slate, animal names in the inspector, chronicle entries. Narrative voice.
- **Alegreya Sans** (same superfamily, clearly distinct): controls, numbers, labels. Use lining tabular figures (`font-variant-numeric: lining-nums tabular-nums`) for counts so digits don't jitter.
- Self-hosted via `@fontsource` so the game works offline.
- Scale (1.25 ratio): 12 / 14 / 16 / 20 / 25 / 31 / 39 / 61 px. Chapter cards at 61 px italic, slate at 20 px, panel text 14 px, small labels 12 px.
- Sentence case everywhere. No all-caps labels, no tracked-out eyebrows, no middle-dot meta strings, no monospace.

### Shape and depth
- Radius follows hierarchy: panels 10 px, buttons 7 px, chips fully round, chapter cards no box at all (just text with a soft shadow).
- No drop shadows on panels (the blur does the separation). Text over the scene gets `text-shadow: 0 1px 12px rgba(0,0,0,.55)`.
- Motion: panels slide 8 px and fade on open/close (180 ms); the chapter card is the only unprompted animation. Respect `prefers-reduced-motion` (cards just appear and disappear).

## Layout
```
+--------------------------------------------------------------------------+
| Tallgrass Valley, year 12                                [seed] [menu]   |
| late summer, evening, clear                                              |
|                                                                          |
| [rain]                                                   Chronicle   v   |
| [drought]                                                year 12  ...    |
| [fire]                          (the scene)              year 11  ...    |
| [plague]                                                 year 11  ...    |
| [cull]                                                                   |
| [add]                                                                    |
| [remove]                                                                 |
|                                                                          |
|                     The long drought                                     |
|                     year 12, summer                (chapter card)        |
|                                                                          |
| +-- population -----------------------+           +-- inspector ------+ |
| | bison 612  /\/\_/\    wolf 41 _/\_  |           | Bison, cow, 7 yrs | |
| | raven 88   ...         [log] [^]    |           | energy ...        | |
| +-------------------------------------+           +-------------------+ |
|              [pause] [1x] [10x] [100x] [next event]   overlays v         |
+--------------------------------------------------------------------------+
```
- **Top left, location slate:** place and year in Alegreya 20 px, then season, time of day, and weather in 14 px `--paper-dim`. No panel, just text with a soft shadow, like a documentary slate.
- **Top right:** seed chip (click to copy the shareable seed code) and a menu button (scenarios, named seeds, new world, help, settings).
- **Left rail, god tools:** a vertical column of 36 px pills, each an icon plus a short word that is always visible (Rain, Drought, Fire, Plague, Cull, Add wolves, Add bison, Remove wolves). Animal tools take their species color so wolves and bison are told apart at a glance. A longer hint slides out on hover or focus. Below 900 px wide the pills shrink to round icon buttons. Danger tools use `--ember` icons. Picking a tool arms it: the cursor becomes a ground reticle sized to its radius, and clicking the terrain applies it. Global tools (drought, rain) apply instantly. `Esc` disarms.
- **Right, chronicle:** a narrow column (280 px) of chronicle entries, newest on top, each one line of Alegreya with the year in `--paper-dim`. Click an entry to fly the camera to it. Collapses to a single "chronicle" tab.
- **Bottom left, population:** a strip panel (440 x 92 px) with one sparkline per species plus the current count. Click `[^]` (or `G`) to expand it to 640 x 300 px: a full chart over the whole history with species toggles, a log-scale toggle (on by default, so predators and ravens do not flatten against the axis; `L` flips it), and grass on a faint secondary axis. A vertical marker shows each chronicle event.
- **Bottom center, time:** pause, 1x, 10x, 100x, and next event. The active speed button fills with `--gold`. Show the pace of the calendar in plain words in small text ("1 year every 24 s"), never ticks.
- **Bottom right, inspector (appears on selection):** the animal is named like a documentary caption: species, sex, and age ("Bison cow, 6 years"), plus its lineage ("generation 212, daughter of #18233"). Bars for energy, water, and stamina; current activity in plain words ("grazing", "fleeing a wolf"); traits as small horizontal gauges with the number beside each (the dot is this animal, a tick marks where the founders started); kills and offspring; buttons to follow (`F`) and to watch its life story (documentary mode). Close with `Esc`.
- **Overlays menu (bottom right of the time bar):** vegetation, fear, territories, trait heatmap. Only one is active at a time.
- **Cinematic mode (`C`):** hides all UI, slowly drifts the camera, adds thin letterbox bars, and still shows chapter cards.

## Copy
- Name things by what the player sees: "Start a fire", not "Ignite cell". "Bring in wolves", not "Introduce species 1".
- Chapter card titles are short noun phrases: "The long drought", "A new pack on the ridge", "The last wolf", "Wolves return", "Stampede at the creek".
- The chronicle thins repetitive events (one stampede per two years unless it is much bigger, one elder per species per three years, one outbreak per species per year and a half) and varies the wording, so predator-prey drama is not buried.
- Chronicle entries are one plain sentence: "A drought settles over the valley." "The Ridge pack is founded." "Plague spreads through the eastern herd."

## Accessibility and quality floor
- Every control is a real `<button>` with a visible focus ring (2 px `--gold`, 2 px offset) and a keyboard shortcut shown in its tooltip.
- Text contrast is at least 4.5:1 against the darkest scene behind the glass. Test it over a bright noon frame.
- Works from 1280 x 720 up to 4K. Panels scale with `clamp()`. Below 900 px wide, the rail and chronicle collapse to icons.

## Review against the generic defaults (done before building)
- First instinct was a "field notebook": cream paper panels and a serif. That is the first listed AI default (cream plus serif plus warm accent), so I rejected it for smoked glass over footage, which also keeps the scene visible.
- A mono "telemetry" readout for the inspector (radio collars) was tempting but lands on the monospace-data-label tell. I replaced it with documentary captions in serif and sans.
- I avoided a dark UI with an acid accent: the accent is cured-grass gold from the concept art, and the danger color only appears on the tools that destroy things.
- I avoided identical rounded cards with shadows: radius varies by hierarchy, there are no shadows, and the bold moment is unboxed type.
