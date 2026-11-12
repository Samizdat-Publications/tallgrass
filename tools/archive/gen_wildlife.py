"""R3 sound effects for the small-prey web and the storms, generated with the ElevenLabs sound-generation API.

Reuses the machinery of tools/gen_audio.py (request, ledger row in ASSETS.md, spot post-processing) with its own budget:

  .venv/Scripts/python tools/gen_wildlife.py gen [name ...]          # generate (cached in scratch/audio/raw; never regenerates a cached take)
  .venv/Scripts/python tools/gen_wildlife.py gen --force name        # one retry of a clip (counts against the budget)
  .venv/Scripts/python tools/gen_wildlife.py post [name ...]         # raw -> public/audio/<name>.mp3 (trim, level, fades)
  .venv/Scripts/python tools/gen_wildlife.py check                   # ffprobe + level of every clip
  .venv/Scripts/python tools/gen_wildlife.py status

Hard budget: BUDGET generations in total, including retries (the counter lives in scratch/audio/gen_log_r3.json). The key is read from
.env and never printed.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gen_audio as ga  # noqa: E402  (reads .env on import; nothing is printed)

BUDGET = 25

SPECS = [
    dict(name="coyote_chorus_1", kind="spot", dur=8, loop=False, infl=0.5,
         text="A pack of coyotes yipping and howling together at dusk across an open prairie, high-pitched yips, yaps and short quavering howls "
              "overlapping and building up, in the distance, natural outdoor reverb, no wolves, no human voices, no music"),
    dict(name="coyote_chorus_2", kind="spot", dur=7, loop=False, infl=0.5,
         text="Several coyotes at once at night: overlapping yaps, yips and wavering howls from three or four coyotes calling back and forth across open prairie, "
              "distant, wild canids only, no roosters, no birds, no human voices, no music"),
    dict(name="coyote_howl", kind="spot", dur=5, loop=False, infl=0.5,
         text="A single coyote howling at dusk: a long, high, wavering howl, like a small wolf, ending with a few barks, a wild canine, "
              "no rooster, no dog barking at a house, no music"),
    dict(name="prairiedog_alarm", kind="spot", dur=5, loop=False, infl=0.5,
         text="A chorus of many tiny high-pitched yapping barks and sharp chirps from a large prairie dog town, like squeaky puppies barking over each other, "
              "outdoors in an open field, a few seconds of overlapping calls, no music"),
    dict(name="prairiedog_yip", kind="spot", dur=2, loop=False, infl=0.5,
         text="One short sharp chirping bark from a prairie dog, a quick high chirp-bark, chee-yip, from a small rodent standing up on its mound, "
              "a single call, outdoors in a field, not a dog, no music"),
    dict(name="thunder_crack_1", kind="spot", dur=4, loop=False, infl=0.5,
         text="A close sharp thunder crack right overhead, a loud violent crack followed by a short rolling rumble, outdoors on open plains, "
              "no rain, no music"),
    dict(name="thunder_crack_2", kind="spot", dur=5, loop=False, infl=0.5,
         text="A very close lightning strike thunderclap, a sudden loud crack-boom with a tearing crackle and then a deep rumble that fades, "
              "open prairie, no rain, no music"),
    dict(name="meadowlark", kind="spot", dur=5, loop=False, infl=0.5,
         text="A single wild songbird singing cheerful chirps, warbles and trills from a fence post in a grassy meadow at sunrise, avian field recording, "
              "tweet tweet, chirp chirp, a real bird, no human voices, no music"),
]

ga.BUDGET = BUDGET
ga.LOG = ga.ROOT / "scratch" / "audio" / "gen_log_r3.json"
for s in SPECS:
    ga.BY_NAME[s["name"]] = s
ga.POST.update({"thunder_crack_1": ga.post_thunder, "thunder_crack_2": ga.post_thunder})


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "status"
    force = "--force" in args
    names = [a for a in args[1:] if not a.startswith("--")]
    allnames = [s["name"] for s in SPECS]
    for n in names:
        if n not in allnames:
            raise SystemExit(f"unknown clip {n}; known: {', '.join(allnames)}")
    if cmd == "status":
        print("subscription:", ga.subscription(), "| calls logged:", len(ga.read_log()["calls"]), "of", BUDGET)
    elif cmd == "gen":
        ga.generate(names or allnames, force)
    elif cmd == "post":
        for n in names or allnames:
            ga.process(n)
    elif cmd == "check":
        ga.SPECS[:] = SPECS
        ga.check()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
