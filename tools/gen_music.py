"""Generate the Tallgrass music cues (ElevenLabs music API) and the R14 extra spot/bed sounds (sound-generation API),
then post-process them into public/audio/music/*.mp3 and public/audio/*.mp3.

Usage (from the repo root):
  .venv/Scripts/python tools/gen_music.py status
  .venv/Scripts/python tools/gen_music.py gen dawn                # one cue, cached in scratch/audio/music_raw (never regenerates a cached file)
  .venv/Scripts/python tools/gen_music.py gen --force dawn        # one retry (the previous take is kept as <name>.v1.mp3)
  .venv/Scripts/python tools/gen_music.py post [dawn ...]         # raw -> public/audio/music/<name>.mp3 (loop crossfade, -20 LUFS, 96 kbps)
  .venv/Scripts/python tools/gen_music.py gensfx [name ...]       # bison_rut crane_bugle blizzard grasshopper
  .venv/Scripts/python tools/gen_music.py postsfx [name ...]
  .venv/Scripts/python tools/gen_music.py check

Every paid call is appended to the 'Paid API calls' table in ASSETS.md and to scratch/audio/music_log.json.
The API key is read from .env and never printed.
"""
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "scratch" / "audio" / "music_raw"
PUB_MUSIC = ROOT / "public" / "audio" / "music"
PUB = ROOT / "public" / "audio"
LOG = ROOT / "scratch" / "audio" / "music_log.json"
ASSETS = ROOT / "ASSETS.md"
RAW.mkdir(parents=True, exist_ok=True)
PUB_MUSIC.mkdir(parents=True, exist_ok=True)

SR = 44100
MIN_CREDITS_LEFT = 2500
MUSIC_MODEL = "music_v1"
STYLE = ("Sparse acoustic American prairie score for a nature documentary. Restrained and spacious, lots of silence between notes, "
         "warm natural recording, no drum kit, no electronic sounds, no vocals, no choir. The music starts playing right away and never fades out at the end. ")

MUSIC = [
    dict(name="dawn", secs=90, text=STYLE +
         "Dawn on the open grassland. A slow solo cello holds a low drone while a soft fingerpicked acoustic guitar plays "
         "a few unhurried notes, a single warm piano note now and then, faint breath of wind. Gently hopeful, slowly brightening, around 56 bpm."),
    dict(name="day", secs=90, text=STYLE +
         "Midday on the open plains. A lone fiddle plays a slow, plain, folk-like melody over a steady fingerpicked acoustic guitar, "
         "soft piano chords underneath, an airy wide feeling, gentle forward motion, warm and unhurried, around 76 bpm."),
    dict(name="tension", secs=90, text=STYLE +
         "Suspense in the grass as a hunt begins. Low sustained cello and double bass, a slow soft frame drum pulse like a heartbeat, "
         "a thin high bowed string tremolo rising and falling, sparse low piano notes. Tense and watchful but quiet, no big hits, "
         "not an action movie, around 70 bpm."),
    dict(name="night", secs=90, text=STYLE +
         "Night under the stars over the prairie. Very quiet. Sparse soft piano notes with long decay, a distant bowed string drone, "
         "an occasional soft harmonic from an acoustic guitar. Calm, wide and lonely, almost nothing happening, around 50 bpm."),
    dict(name="storm", secs=90, text=STYLE +
         "Winter and storm on the empty prairie. A bleak low solo cello, hollow bowed harmonics like wind in dry grass, "
         "slow low piano notes far apart, cold and exposed, a quiet sense of endurance. Slow, around 48 bpm."),
]
MUSIC_BY = {m["name"]: m for m in MUSIC}

# kind 'spot' one-shot (peak levelled), 'bed' seamless loop (rms levelled)
SFX = [
    dict(name="bison_rut", kind="spot", dur=6, loop=False, infl=0.5,
         text="A large bull American bison bellowing during the rut, long deep resonant roaring bellows and low guttural groans, "
              "one bull close by on an open prairie, outdoors, no music, no human voices"),
    dict(name="crane_bugle", kind="spot", dur=6, loop=False, infl=0.5,
         text="Sandhill cranes bugling and calling in flight high overhead, rolling rattling trumpet-like bugle calls from several cranes, "
              "outdoors over open wetland and prairie, no music, no human voices"),
    dict(name="blizzard", kind="bed", dur=20, loop=True, infl=0.45,
         text="Field recording: a howling blizzard on an open snowy plain, strong steady wind roaring and whistling with fast hissing gusts of blown snow, "
              "harsh and cold, no voices, no music, no birds"),
    dict(name="grasshopper", kind="bed", dur=12, loop=True, infl=0.45,
         text="Field recording: dry summer grassland close to the ground, many grasshoppers buzzing and clicking and rasping in the dry grass, "
              "hot afternoon, a few ticking insects, no birds, no wind, no voices, no music"),
]
SFX_BY = {s["name"]: s for s in SFX}


# ---------------------------------------------------------------------------------------------------- env / http

def load_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


KEY = load_env()["ELEVENLABS_API_KEY"]


def http(method, url, body=None, timeout=300):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def subscription():
    st, _, body = http("GET", "https://api.elevenlabs.io/v1/user/subscription", timeout=30)
    if st != 200:
        return None
    j = json.loads(body)
    return dict(tier=j.get("tier"), used=j.get("character_count"), limit=j.get("character_limit"))


def read_log():
    return json.loads(LOG.read_text()) if LOG.exists() else {"calls": []}


def write_log(j):
    LOG.write_text(json.dumps(j, indent=1))


def append_ledger_row(service, what, count, cost):
    lines = ASSETS.read_text(encoding="utf-8").splitlines()
    start = next((i for i, l in enumerate(lines) if l.strip().lower().startswith("## paid api calls")), None)
    if start is None:
        return
    end = start + 1
    while end < len(lines) and not lines[end].startswith("## "):
        end += 1
    last_row = end - 1
    while last_row > start and not lines[last_row].strip().startswith("|"):
        last_row -= 1
    when = time.strftime("%m-%d %H:%M")
    lines.insert(last_row + 1, f"| {when} | {service} | {what} | {count} | {cost} |")
    ASSETS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def credits_used():
    s = subscription()
    return s["used"] if s else None


# ---------------------------------------------------------------------------------------------------- generation

def _stash_old(path):
    if path.exists():
        v = 1
        while path.with_suffix(f".v{v}.mp3").exists():
            v += 1
        path.rename(path.with_suffix(f".v{v}.mp3"))


def gen_music(names, force):
    log = read_log()
    for name in names:
        spec = MUSIC_BY[name]
        raw = RAW / f"{name}.mp3"
        if raw.exists() and not force:
            print(f"[{name}] cached, skipping")
            continue
        sub = subscription()
        print("subscription:", sub)
        if sub and sub["limit"] and sub["limit"] - sub["used"] < MIN_CREDITS_LEFT:
            print("LOW CREDITS, stopping")
            return
        _stash_old(raw)
        body = {"prompt": spec["text"], "music_length_ms": spec["secs"] * 1000, "model_id": MUSIC_MODEL, "force_instrumental": True}
        before = sub["used"] if sub else None
        t0 = time.time()
        st, hdrs, data = http("POST", "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", body)
        log["calls"].append(dict(name=name, kind="music", status=st, t=time.strftime("%Y-%m-%d %H:%M:%S"), bytes=len(data) if st == 200 else 0))
        write_log(log)
        if st != 200:
            print(f"[{name}] FAILED {st}: {data[:400]!r}")
            if st in (401, 402, 403, 422, 429):
                print("auth/credit/rate/validation problem, stopping")
                return
            continue
        raw.write_bytes(data)
        after = credits_used()
        cost = (after - before) if (after is not None and before is not None) else "?"
        append_ledger_row("ElevenLabs music (/v1/music)", f"`{name}` cue ({spec['secs']} s, {MUSIC_MODEL}, instrumental) -> `public/audio/music/{name}.mp3`", "1 music", f"{cost} credits")
        print(f"[{name}] ok {len(data)} bytes in {time.time() - t0:.1f}s, credits used by this call: {cost}")


def gen_sfx(names, force):
    log = read_log()
    for name in names:
        spec = SFX_BY[name]
        raw = RAW / f"sfx_{name}.mp3"
        if raw.exists() and not force:
            print(f"[{name}] cached, skipping")
            continue
        sub = subscription()
        if sub and sub["limit"] and sub["limit"] - sub["used"] < MIN_CREDITS_LEFT:
            print("LOW CREDITS, stopping")
            return
        _stash_old(raw)
        body = {"text": spec["text"], "duration_seconds": spec["dur"], "prompt_influence": spec["infl"], "model_id": "eleven_text_to_sound_v2"}
        if spec["loop"]:
            body["loop"] = True
        st, hdrs, data = http("POST", "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", body)
        log["calls"].append(dict(name=name, kind="sfx", status=st, t=time.strftime("%Y-%m-%d %H:%M:%S"), bytes=len(data) if st == 200 else 0))
        write_log(log)
        if st != 200:
            print(f"[{name}] FAILED {st}: {data[:300]!r}")
            if st in (401, 402, 429):
                return
            continue
        raw.write_bytes(data)
        cost = {k.lower(): v for k, v in hdrs.items()}.get("character-cost", "?")
        append_ledger_row("ElevenLabs sound-generation", f"`{name}` ({spec['dur']} s{' loop' if spec['loop'] else ''}) -> `public/audio/{name}.mp3` (R14)", "1 SFX", f"{cost} credits")
        print(f"[{name}] ok {len(data)} bytes, character-cost={cost}")


# ---------------------------------------------------------------------------------------------------- audio helpers

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate,duration,bit_rate", "-of", "json", str(path)],
                         capture_output=True, text=True, timeout=60).stdout
    return json.loads(out)["streams"][0]


def decode(path, ch=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"], capture_output=True, timeout=120).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()


def encode(x, path, kbps=96):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]), "-i", "-", "-c:a", "libmp3lame", "-b:a", f"{kbps}k", str(path)],
                   input=np.ascontiguousarray(x, dtype=np.float32).tobytes(), check=True, timeout=120)


def lufs(x):
    """Integrated loudness via ffmpeg ebur128 (BS.1770)."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-nostats", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]), "-i", "-", "-af", "ebur128=peak=true", "-f", "null", "-"],
                       input=np.ascontiguousarray(x, dtype=np.float32).tobytes(), capture_output=True, timeout=120)
    txt = r.stderr.decode("utf-8", "replace")
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", txt)
    return float(m[-1]) if m else -70.0


def rms_db(x):
    return 20 * np.log10(float(np.sqrt(np.mean(np.square(x.astype(np.float64))))) + 1e-12)


def loop_crossfade(x, seconds):
    """Equal-power crossfade of the tail into the head: shorter by `seconds`, last sample flows into the first."""
    n = min(int(seconds * SR), len(x) // 3)
    L = len(x) - n
    t = np.linspace(0.0, np.pi / 2, n, dtype=np.float32)[:, None]
    out = x[:L].copy()
    out[:n] = x[:n] * np.sin(t) + x[L:L + n] * np.cos(t)
    return out


def seam_report(x):
    m = x.mean(axis=1)
    jump = abs(float(m[0] - m[-1]))
    step = float(np.median(np.abs(np.diff(m)))) + 1e-9
    n = int(0.25 * SR)
    return dict(jump_over_median_step=round(jump / step, 2), rms_end_db=round(rms_db(m[-n:]), 1), rms_start_db=round(rms_db(m[:n]), 1))


def post_music(name):
    raw = RAW / f"{name}.mp3"
    if not raw.exists():
        print(f"[{name}] no raw file")
        return
    x = decode(raw)
    dur0 = len(x) / SR
    # trim leading silence (keep a hair), then fade the very start so the loop crossfade has material to blend
    m = np.max(np.abs(x), axis=1)
    idx = np.where(m > 10 ** (-42 / 20))[0]
    if len(idx):
        x = x[max(0, int(idx[0]) - int(0.3 * SR)):int(idx[-1]) + 1]
    # loop: 5 s equal-power crossfade of the tail into the head (this mixes the end of the piece into its beginning)
    y = loop_crossfade(x, 5.0)
    l0 = lufs(y)
    gain = 10 ** ((-20.0 - l0) / 20)
    y = y * gain
    pk = float(np.max(np.abs(y)))
    if pk > 0.89:
        y *= 0.89 / pk
    encode(y, PUB_MUSIC / f"{name}.mp3")
    print(f"[{name}] {dur0:.1f}s -> {len(y) / SR:.1f}s loop | {l0:.1f} LUFS -> gain {20 * np.log10(gain):+.1f} dB | peak {20 * np.log10(float(np.max(np.abs(y))) + 1e-9):.1f} dBFS | seam {seam_report(y)}")


def post_sfx(name):
    spec = SFX_BY[name]
    raw = RAW / f"sfx_{name}.mp3"
    if not raw.exists():
        print(f"[{name}] no raw file")
        return
    x = decode(raw)
    dur0 = len(x) / SR
    if spec["kind"] == "bed":
        n = min(int(1.5 * SR), len(x) // 4)
        L = len(x) - n
        t = np.linspace(0.0, np.pi / 2, n, dtype=np.float32)[:, None]
        y = x[:L].copy()
        y[:n] = x[:n] * np.sin(t) + x[L:L + n] * np.cos(t)
        gain = 10 ** ((-23.0 - rms_db(y)) / 20)
        y = y * gain
        pk = float(np.max(np.abs(y)))
        if pk > 0.89:
            y *= 0.89 / pk
        encode(y, PUB / f"{name}.mp3", 128)
        print(f"[{name}] bed {dur0:.1f}s -> {len(y) / SR:.1f}s rms {rms_db(y):.1f} dB seam {seam_report(y)}")
    else:
        m = np.max(np.abs(x), axis=1)
        idx = np.where(m > 10 ** (-48 / 20))[0]
        a = max(0, int(idx[0]) - int(0.02 * SR)) if len(idx) else 0
        b = min(len(x), int(idx[-1]) + int(0.05 * SR)) if len(idx) else len(x)
        y = x[a:b]
        fi, fo = int(0.015 * SR), int(0.15 * SR)
        y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
        y[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
        y = y * (0.8 / (float(np.max(np.abs(y))) + 1e-9))
        encode(y, PUB / f"{name}.mp3", 128)
        print(f"[{name}] spot {dur0:.1f}s -> {len(y) / SR:.1f}s")


def check():
    for m in MUSIC:
        p = PUB_MUSIC / f"{m['name']}.mp3"
        if not p.exists():
            print(f"[{m['name']}] MISSING")
            continue
        i = probe(p)
        x = decode(p)
        print(f"[{m['name']}] {i['codec_name']} {i['channels']}ch dur={float(i['duration']):.1f}s size={p.stat().st_size // 1024}KB {lufs(x):.1f} LUFS seam={seam_report(x)}")
    for s in SFX:
        p = PUB / f"{s['name']}.mp3"
        print(f"[{s['name']}] {'ok ' + str(p.stat().st_size // 1024) + 'KB' if p.exists() else 'MISSING'}")


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = args[0] if args else "status"
    force = "--force" in args
    names = [a for a in args[1:] if not a.startswith("--")]
    if cmd == "status":
        print("subscription:", subscription(), "| calls logged:", len(read_log()["calls"]))
    elif cmd == "gen":
        gen_music(names or [m["name"] for m in MUSIC], force)
    elif cmd == "post":
        for n in names or [m["name"] for m in MUSIC]:
            post_music(n)
    elif cmd == "gensfx":
        gen_sfx(names or [s["name"] for s in SFX], force)
    elif cmd == "postsfx":
        for n in names or [s["name"] for s in SFX]:
            post_sfx(n)
    elif cmd == "check":
        check()
    else:
        print(__doc__)
