"""Generate the documentary narrator's lines with ElevenLabs text-to-speech.

    .venv/Scripts/python tools/narration.py [--only id,id] [--voice JBFqnCBsd6RMkjVDRZzb] [--dry]

Writes public/audio/narration/<id>.mp3 for every line in LINES that doesn't have a file yet (never overwrites), and
prints the characters spent so ASSETS.md can log them. The voice is a stock ElevenLabs voice ("George", a warm
storyteller) and imitates no real person. Lines are written to be true of the sim: fire greens the ground back,
sickness spreads where animals crowd, a valley without wolves fills with grazers.
"""
import argparse
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio" / "narration"

# id: text. Ids are <event kind>_<variant>; the game picks a variant at random.
LINES = {
    "opening_1": "Tallgrass prairie. Bison, pronghorn, wolves and ravens, and the grass that feeds them all.",
    "firstKill_1": "The first kill. From here on, the wolves and the herds will shape each other.",
    "packFounded_1": "A young pair has struck out on its own. A new pack claims the ridge.",
    "packFounded_2": "New wolves, new borders. Another pack carves out its range.",
    "packLost_1": "One of the packs has broken apart. Its territory falls quiet.",
    "packLost_2": "A pack falls silent. Its survivors will scatter, or join another.",
    "droughtLong_1": "The rains have failed. A long drought settles over the valley, and every animal here will feel it.",
    "drought_1": "A dry spell. The grass cures early, and the herds must walk farther to graze.",
    "outbreak_1": "Sickness moves through the herd. The weak and the crowded fall first.",
    "outbreak_2": "Disease spreads where the animals crowd together. It will thin the herd.",
    "stampede_1": "Something has startled the herd. Hundreds of bison break into a run.",
    "stampede_2": "Panic spreads faster than any wolf. The whole herd is on the move.",
    "extinct_bison": "The last bison is gone. The valley will have to find a new balance without them.",
    "extinct_wolf": "The last wolf is gone. Without hunters, the herds will grow, and the grass will pay for it.",
    "extinct_pronghorn": "The last pronghorn has gone from the valley.",
    "extinct_raven": "The ravens have abandoned the valley.",
    "introducedWolf_1": "Wolves return to the valley. The herds have forgotten what it means to be watched.",
    "fire_1": "Fire on the prairie. It looks like ruin, but within a season the burned ground will be the greenest in the valley.",
    # R3: the small-prey web, the canines' troubles, the storms and the valley's comings and goings
    "wolvesArrive_1": "Wolves have come in from beyond the valley. A new pair finds an empty den and settles in.",
    "returned_1": "An animal that had vanished from the valley has found its own way back.",
    "pronghornLeave_1": "Winter is coming, and the pronghorn drift out of the valley toward the open prairie.",
    "pronghornReturn_1": "With the spring, the pronghorn return.",
    "distemper_1": "Distemper moves through the canines. It spreads where they gather, and the young are the first to go.",
    "mange_1": "Mange has taken hold. The coats thin out, and a hard winter will finish what it started.",
    "plague_1": "Plague has reached the prairie dog town. Within a season, almost every one of them will be gone.",
    "townBack_1": "A few survivors start digging again. Slowly, the town comes back.",
    "hareBoom_1": "Jackrabbits are everywhere. A year like this does not last.",
    "hareCrash_1": "The jackrabbits have crashed. The prairie is suddenly much quieter.",
    "coyotePups_1": "Coyote pups at the den. Small, quick, and always hungry.",
    "mesoRelease_1": "With the wolves so few, the coyotes have taken their place. The valley has a new hunter.",
    "lightningFire_1": "Lightning strikes the dry grass, and the prairie catches fire.",
    "storm_1": "A thunderstorm crosses the valley. The air goes still, and then the sky breaks open.",
}

# What is actually sent to the voice when it differs from the caption text (pauses as ElevenLabs break tags).
SPOKEN = {
    "opening_1": 'Tallgrass prairie. <break time="0.9s" /> Bison, pronghorn, wolves and ravens, <break time="0.4s" /> and the grass that feeds them all.',
    "introducedWolf_1": '<break time="0.2s" /> Wolves return to the valley. <break time="0.7s" /> The herds have forgotten what it means to be watched.',
}


def key():
    for line in open(ROOT / ".env", encoding="utf-8"):
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("no ELEVENLABS_API_KEY in .env")


def tts(text, voice, k):
    body = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.6, "similarity_boost": 0.75, "style": 0.12, "use_speaker_boost": True, "speed": 0.8},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=body, headers={"xi-api-key": k, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    return urllib.request.urlopen(req, timeout=120).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--voice", default="JBFqnCBsd6RMkjVDRZzb")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    ids = [i for i in a.only.split(",") if i] or list(LINES)
    OUT.mkdir(parents=True, exist_ok=True)
    k = None if a.dry else key()
    spent = 0
    for i in ids:
        dst = OUT / f"{i}.mp3"
        if dst.exists():
            print(f"skip {i} (exists)")
            continue
        text = SPOKEN.get(i, LINES[i])
        if a.dry:
            print(f"would make {i}: {len(text)} chars")
            continue
        dst.write_bytes(tts(text, a.voice, k))
        spent += len(text)
        print(f"made {dst.relative_to(ROOT)} ({len(text)} chars, {dst.stat().st_size // 1024} KB)")
    print(f"characters spent: {spent}; all lines: {sum(len(t) for t in LINES.values())}")


if __name__ == "__main__":
    main()
