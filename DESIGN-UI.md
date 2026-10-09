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
| Wolf | `#6FA4EA` | blue |
| Raven | `#B48CE6` | violet |
| Pronghorn | `#4FC4BC` | teal, clear of the grass sage |
| Rabbit | `#E9E4D4` | bone |

Checked in CIE Lab: every pair of species colours, plus the grass sage and the gold accent, is at least 30 apart (bison against the gold accent is the closest at about 23, and the accent is never used for a species).
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
- **Tools (top left, under the slate):** one quiet "Tools" button. It opens a drawer of the fourteen god tools, labelled and in three columns (Weather, Disasters, Wildlife and land), on a click or the I key; the drawer puts itself away when a tool is used, the ground is clicked, or Esc is pressed. A first session's button carries a short line ("rain, fire, wolves and more") for two minutes. An armed positional tool shows on the button in gold ("Fire: click the ground"); a click on the button or Esc lets it go. A challenge keeps the button, with the interventions left as a badge, and the drawer greys out with an ember note when none are left. Animal tools take their species color; danger tools use `--ember` icons. Picking a tool arms it (the ground click applies it) or, for global tools (drought, rain), applies it at once.
- **Right, chronicle:** a narrow column (280 px) of chronicle entries, newest on top, each one line of Alegreya with the year in `--paper-dim`. Click an entry to fly the camera to it. Collapses to a single "chronicle" tab.
- **Bottom left, population:** a strip panel (440 x 92 px) with one sparkline per species plus the current count. Click `[^]` (or `G`) to expand it to 640 x 300 px (336 with four or more species): small multiples, one row per species on a shared time axis, each scaled to its own range with its real numbers on the axis, plus a slim grass row, so every species shows its swings whatever its size. Species toggles, a log-scale toggle (linear by default; `L` puts each row on a log scale) and the grass row labelled "Grass, 0 to 1". Five or six species shrink the toggles to colour dots. A vertical marker shows each chronicle event.
- **Bottom center, time:** pause, 1x, 10x, 100x, and next event. The active speed button fills with `--gold`. Show the pace of the calendar in plain words in small text ("1 year every 24 s"), never ticks. When the machine cannot keep up the running speed button says so on itself (a small second line, "100x" over "at 13x") and the note beside it says "this machine is running at 13x".
- **Bottom right, inspector (appears on selection):** the animal is named like a documentary caption: species, sex, and age ("Bison cow, 6 years"), plus its lineage ("generation 212, daughter of #18233"). Bars for energy, water, and stamina; current activity in plain words ("grazing", "fleeing a wolf"); traits as read-only meters with the number beside each (the bar is this animal, a grey tick marks where the founders started, a bright tick the species now; no knob, nothing to drag); kills and offspring; buttons to follow (`F`) and to watch its life story (documentary mode). Close with `Esc`.
- **Overlays menu (bottom right of the time bar):** vegetation, fear, territories, trait heatmap. Only one is active at a time.
- **Expanded graph:** docks along the bottom, above the time bar (wide and low), instead of covering the middle of the scene; the chronicle column shortens to make room. Each species row has its name in a left gutter (in its colour) with its high and low numbers beside it, and its current value in a right gutter, so no line ever runs through a word. With six or more rows they run in two columns. Log puts every row on a log scale from 1 up (zero sits on the floor).
- **Documentary camera chip:** while the camera is driving itself (after about 25 s with no camera input) a small glass chip, "Documentary camera" with a gentle pulse and a "Take over" button, sits left of the time controls. A click hands the camera back; moving it does too. It fades with the rest of the UI in cinematic mode.
- **Graph rows:** every row keeps its two axis numbers inside its own band, so rows never share a label; grass has its own band scaled to its seasonal range. The corner sparklines are scaled to each species' recent range with a faint baseline and an average line.
- **Cards at speed:** chapter cards hold about 4.8 s at 1x, 3.2 s at 10x and 2.5 s from 100x up, never more than one at a time; at 10x a lone new pack is skipped, and at 100x only extinctions, reintroductions and droughts earn a card.
- **Whole entries only:** the chronicle and the life story never end on half a sentence; whatever does not fit whole is masked away at the edge.
- **Ambient view:** `H`, or the small eye button beside the menu, hides every panel for a clean second-monitor view (photo mode, `P`, still works and leaves it hidden). A quiet note says how to get back; any key (not a bare modifier) or any click brings the interface back, and that key is spent doing it, so Space does not also pause.
- **Field notes:** a naturalist's notebook of eighteen moments the player has witnessed (the first kill, a stampede of a hundred bison, a pack founded and lost, a drought and its end, sickness, fire and the green-up a year later, an elder, riding along on a hunt, reading a life story to its In memoriam card, bringing wolves back, a hundred years, snow, the documentary camera filming a kill, a species pulled back from the brink, winning a challenge). Each is ticked the first time it happens and remembered in the browser (nothing breaks without storage). A quiet toast in the lower left says "Field note: The first kill" for about four seconds; it waits while a chapter card is up, never appears in the ambient or cinematic view (the note is earned silently), and at 100x only the first of a burst gets one. The menu has a "Field notes 7 of 18" entry that opens a notebook page: a pencil tick, the title and "Tallgrass, year 12" for the earned ones, and dimmed hints for the rest, with a two-step "Clear field notes" at the foot.
- **Season lines:** the chronicle also carries a few quiet lines written from the population history as each season closes (no sim events needed): a season that thinned or grew a herd by about a tenth ("Winter thins the herd: 955 bison to 860", "A spring of fawns: the pronghorn pass 500"), pups at the dens when the wolf count jumps in spring, ravens gathering (read against a year ago: "Ravens flock to the valley: 30 to 114"), and records (the biggest herd, the most wolves). At most two a season and four a year (one and two at 100x), dated the last tick of their season so they carry its tag, newest first like everything else.
- **Pack break-ups:** worded by what happened to the wolf count. When it did not fall, "The Bluff pack breaks apart; its wolves join others" (card: "A pack breaks apart"); only when it fell does it say wolves were lost. Never "is no more" for a pack that simply split up.
- **Founders:** "Founder: arrived with the first wolves"; the offspring and kill counters stay hidden until the first one, and a founder's counts say "since the valley began".
- **Labels and panels:** territory labels are nudged just clear of the tools button and drawer, the chronicle, the inspector and the goal card (a CSS translate over the position the overlay gives them), kept on screen, and hidden only if they would have to move too far from their den.
- **Territories on the map** read as part of the land: a feathered tint over each range with a thin, soft, wandering edge line (the radius varies with direction, each pack its own shape), muted earthy pack colours, and a small den dot with a faint breathing ring. They keep their strength at night.
- **Territories** are a clearly visible soft tinted fill (organic shape, feathered edge) with the edge line only a secondary crisping. The map legend and the other panels are treated as obstacles by the label nudger, so no pack label sits on them.
- **Graph rows:** each row's two numbers wear its species colour and hang off short ticks joined by a thin bracket, so a pair reads as one scale and never as part of a column. Hovering within about 12 px of an event diamond enlarges it and the tooltip reads the event in the chronicle's own words with its year.
- **Idle fade:** after about 8 s with no pointer or key input the Tools button, chronicle, population strip, time bar and top-right chips fade to a faint, low-opacity state (0.3 to 0.4), and any mouse move or key brings them back at once. Not while the tools drawer, a menu, the notebook or the expanded graph is open, or an armed tool is waiting for its click; the challenge card stays at full strength; the ambient (H) and cinematic views handle themselves. `?dim=0` turns it off for captures.
- **Narrator caption:** in cinematic mode it sits on a soft dark pool feathered on every side, with a stronger text shadow, so it holds on gold grass and snow without becoming a subtitle box.
- **Chapter cards at speed:** above 1x the title is smaller and sits lower, so it names the moment without covering the action.
- **Narrator:** a calm voice-over for the big moments (a new pack, a drought, sickness, a stampede, fire, an extinction, wolves returning, the first kill, and a one-time opening line). It speaks only while the documentary camera or cinematic mode is filming, only at 1x or 10x, only after the first click has unlocked audio, never overlaps itself and at most once every 40 s; an event older than about 8 s is dropped, not read late. While a line plays the ambient bed and sound effects duck by about 40% over 0.3 s. A "Narrator" switch at the top of the menu (on by default, remembered in the browser) and the `V` key turn it off. In cinematic mode the spoken line also shows as a quiet italic caption under the chapter card.
- **Hint:** after a minute with no input a quiet pill above the time bar says "H ambient view, C documentary mode", once per browser; any input dismisses it. The menu lists every key.
- **Territory labels:** paper text on a dark backing with the pack's colour as a border accent; they fade out toward the top and bottom edges so they never slide under the slate or the time bar.
- **Chronicle:** capped to about seven entries visible; older ones scroll and fade. Entries sit under a heading for each valley year; a year with more than five events keeps its four biggest and folds the rest into a line like "and 3 smaller events" that opens on a click.
- **Order:** the chronicle says "newest first" in its header and runs that way everywhere: newest year on top, newest entry first inside each year (ties broken by arrival). Each entry carries the season it happened in, in small type, so the order can be checked at a glance. Nothing drops off silently: an "N earlier entries" line at the foot pages down through what is out of sight and then opens the older years.
- **Chapter cards** sit in the lower third, just above the population strip and time bar, so they never cover the action at the centre of the frame. A card never contradicts the header: once the valley has left the season a card names, a minor card is dropped and an important one keeps only its year; from 10x it names only the year, from 100x only its title. Pack labels that sit under a card fade out while it is up.
- **Life story:** a founder (an animal there at the start or brought in by hand) opens on a one-line backstory ("Came into the valley with the first herds", "One of the founding pack"); "Nothing to tell yet" is only for animals born later who have no events yet.
- **Cinematic mode (`C`):** hides all UI, slowly drifts the camera, adds thin letterbox bars, and still shows chapter cards.

## Challenges
- **Menu:** a "Challenges" section above "Named worlds" (name, blurb, and a line with the years and the intervention budget). A click reloads the page with `?challenge=id`; the challenge brings its own seed and scenario.
- **Goal card:** a compact glass card under the location slate: challenge name, one line per goal, the live progress line, and "Interventions left: 3 of 5" with a pip for each. It folds from its header, fades with the rest of the UI in cinematic mode, and the tool rail makes room beneath it.
- **Budget:** every applied tool counts. When none are left the rail locks with an ember note ("No interventions left") and further applies are ignored.
- **Result card:** unboxed, in the chapter-card style, over a feathered shade: "Challenge complete" or "The valley slipped away", the reason, the years taken and interventions used, and two buttons: "Try again" and "Keep watching". The sim pauses behind it; Keep watching (or Esc) dismisses it and resumes, and the goal card keeps the result.

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
