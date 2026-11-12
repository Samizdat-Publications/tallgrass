"""R5 raptor calls (red-tailed hawk scream, golden eagle calls), generated with the ElevenLabs sound-generation API.

Reuses the machinery of tools/gen_audio.py (request, ledger row in ASSETS.md, spot post-processing) with its own budget:

  .venv/Scripts/python tools/gen_raptors.py gen [name ...]          # generate (cached in scratch/audio/raw; never regenerates a cached take)
  .venv/Scripts/python tools/gen_raptors.py gen --force name        # one retry of a clip (counts against the budget)
  .venv/Scripts/python tools/gen_raptors.py post [name ...]         # raw -> public/audio/<name>.mp3 (trim, level, fades)
  .venv/Scripts/python tools/gen_raptors.py check                   # ffprobe + level of every clip
  .venv/Scripts/python tools/gen_raptors.py status

Hard budget: BUDGET generations in total, including retries (the counter lives in scratch/audio/gen_log_r5.json). The key is read from
.env and never printed.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gen_audio as ga  # noqa: E402  (reads .env on import; nothing is printed)

BUDGET = 6

SPECS = [
    dict(name="hawk_scream_1", kind="spot", dur=3, loop=False, infl=0.5,
         text="A red-tailed hawk screaming as it soars: one long harsh raspy descending scream, kee-eeeeer, a wild bird of prey high above "
              "an open prairie, outdoors with a little distance, no music, no other animals, no human voices"),
    dict(name="hawk_scream_2", kind="spot", dur=4, loop=False, infl=0.5,
         text="Wild field recording of a red-tailed hawk screaming once from high in the sky: a long, hoarse, steam-whistle-like descending "
              "scream, kee-eeeeeer, authentic bird of prey, recorded outdoors in open country, wind in the background, no music, "
              "no human voices, no other animals"),
    dict(name="hawk_stoop", kind="spot", dur=2, loop=False, infl=0.5,
         text="A hawk's short sharp screech as it dives, a quick harsh high-pitched scream, kree, a bird of prey, outdoors on open prairie, "
              "one single call, no music, no other animals"),
    dict(name="eagle_call_1", kind="spot", dur=3, loop=False, infl=0.5,
         text="A golden eagle calling: a series of weak, thin, high-pitched whistling chirps and yelps, kee kee kee kee, surprisingly small "
              "voice for such a big bird, outdoors in open country with a little distance, no music, no other animals"),
    dict(name="eagle_call_2", kind="spot", dur=3, loop=False, infl=0.5,
         text="A golden eagle's lone call: a single thin high clear yelping whistle, kyow, then a few soft chirps, a large bird of prey far "
              "overhead in the open sky, outdoors, no music, no other animals, no human voices"),
]

ga.BUDGET = BUDGET
ga.LOG = ga.ROOT / "scratch" / "audio" / "gen_log_r5.json"
for s in SPECS:
    ga.BY_NAME[s["name"]] = s


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
