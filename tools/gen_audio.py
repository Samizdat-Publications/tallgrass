"""Generate the Tallgrass sound assets with the ElevenLabs sound-generation API, then post-process them.

Usage (from the repo root):
  .venv/Scripts/python tools/gen_audio.py status                 # show subscription credits and the call counter
  .venv/Scripts/python tools/gen_audio.py gen [name ...]         # generate (cached in scratch/audio/raw; never regenerates a cached file)
  .venv/Scripts/python tools/gen_audio.py gen --force name       # regenerate one clip (counts against the 16-call budget)
  .venv/Scripts/python tools/gen_audio.py post [name ...]        # raw -> public/audio/<name>.mp3 (loop crossfade, level, fades)
  .venv/Scripts/python tools/gen_audio.py check                  # ffprobe + seam report for everything in public/audio

Hard budget: BUDGET generations in total, including retries (counter lives in scratch/audio/gen_log.json).
The API key is read from .env and never printed.
"""
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "scratch" / "audio" / "raw"
PUB = ROOT / "public" / "audio"
LOG = ROOT / "scratch" / "audio" / "gen_log.json"
ASSETS = ROOT / "ASSETS.md"
RAW.mkdir(parents=True, exist_ok=True)
PUB.mkdir(parents=True, exist_ok=True)

BUDGET = 16
MIN_CREDITS_LEFT = 2500  # stop if the account gets this low
SR = 44100
OUT_FORMAT = "mp3_44100_128"

# kind 'bed'  : seamless loop, levelled by RMS, tail crossfaded into the head in post
# kind 'spot' : one-shot, levelled by peak, trimmed and faded
SPECS = [
    dict(name="wind_day", kind="bed", dur=20, loop=True, infl=0.45,
         text="Field recording ambience: steady warm breeze moving through tall prairie grass on an open plain in the middle of the day, "
              "soft rustling of grass blades, gentle low wind swells that rise and fall, no birds, no voices, no music, no insects"),
    dict(name="evening_birds", kind="bed", dur=20, loop=True, infl=0.45,
         text="Birdsong ambience in an open prairie field at dawn: several small songbirds chirping, trilling and twittering from a distance, "
              "with quiet pauses between songs, a very soft breeze in the grass, calm peaceful nature recording, no voices, no music, no human whistling"),
    dict(name="night_crickets", kind="bed", dur=20, loop=True, infl=0.45,
         text="Field recording ambience: prairie at night, a steady chorus of crickets and katydids, very soft low wind in the grass, "
              "calm and wide, no voices, no music, no birds"),
    dict(name="rain", kind="bed", dur=20, loop=True, infl=0.45,
         text="Soft mellow rain falling on a grassy meadow, gentle rainfall on grass and leaves, calm relaxing rain ambience, smooth soft patter and light hiss, "
              "natural and smooth, not crackling, no thunder, no wind gusts, no voices, no music"),
    dict(name="thunder", kind="spot", dur=6, loop=False, infl=0.5,
         text="Distant rolling thunder over open plains, a deep low rumble that builds slowly and fades away, no rain, no music"),
    dict(name="wind_winter", kind="bed", dur=20, loop=True, infl=0.45,
         text="Field recording: cold bleak winter wind blowing across an open snowy prairie, hollow whistling gusts through dry grass stalks, "
              "low moaning swells, no birds, no voices, no music"),
    dict(name="creek", kind="bed", dur=15, loop=True, infl=0.45,
         text="Field recording: a small shallow creek trickling and babbling over stones, gentle continuous flow of water, "
              "no voices, no music, no birds"),
    dict(name="wolf_pack", kind="spot", dur=7, loop=False, infl=0.5,
         text="A wolf pack howling in the far distance across a quiet open prairie at dusk, several wolves howling together in "
              "overlapping long mournful tones, natural outdoor reverb, no music, no other sounds"),
    dict(name="wolf_single", kind="spot", dur=5, loop=False, infl=0.5,
         text="A single gray wolf howling one long mournful howl in the distance across open prairie at night, rising then falling pitch, "
              "natural outdoor reverb, no music"),
    dict(name="bison_grunts", kind="spot", dur=5, loop=False, infl=0.5,
         text="American bison herd close by: deep low grunts, snorts and huffing breaths, a few animals grunting with low rumbling "
              "cow-like vocalizations, outdoors, no music, no human voices"),
    dict(name="stampede", kind="spot", dur=8, loop=False, infl=0.5,
         text="A large herd of buffalo stampeding past on dry dirt ground, deep thudding hoofbeats and rumbling earth, heavy low-frequency rumble "
              "muffled by distance, dull and bass heavy, no clacking, no wooden sounds, no music"),
    dict(name="raven_calls", kind="spot", dur=4, loop=False, infl=0.5,
         text="Common raven calls: several deep croaking caws, kraa kraa and rattling croaks, outdoors in an open field with slight distance, "
              "no music, no other animals"),
]
BY_NAME = {s["name"]: s for s in SPECS}


# ---------------------------------------------------------------------------------------------------- env / http

def load_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


KEY = load_env()["ELEVENLABS_API_KEY"]


def http(method, url, body=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def subscription():
    st, _, body = http("GET", "https://api.elevenlabs.io/v1/user/subscription")
    if st != 200:
        return None
    j = json.loads(body)
    return dict(tier=j.get("tier"), used=j.get("character_count"), limit=j.get("character_limit"))


def read_log():
    return json.loads(LOG.read_text()) if LOG.exists() else {"calls": []}


def write_log(j):
    LOG.write_text(json.dumps(j, indent=1))


# ---------------------------------------------------------------------------------------------------- ASSETS.md

def append_ledger_row(spec, cost):
    """Insert one row at the end of the 'Paid API calls' table in ASSETS.md."""
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
    loop = " loop" if spec["loop"] else ""
    row = (f"| {when} | ElevenLabs sound-generation | `{spec['name']}` ({spec['dur']} s{loop}) -> `public/audio/{spec['name']}.mp3` "
           f"| 1 SFX | {cost or '?'} credits |")
    lines.insert(last_row + 1, row)
    ASSETS.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------------------------------- generation

def generate(names, force=False):
    log = read_log()
    sub = subscription()
    print("subscription:", sub, "| calls so far:", len(log["calls"]), "of", BUDGET)
    for name in names:
        spec = BY_NAME[name]
        raw = RAW / f"{name}.mp3"
        if raw.exists() and not force:
            print(f"[{name}] cached, skipping ({raw.stat().st_size} bytes)")
            continue
        if raw.exists() and force:
            v = 1
            while (RAW / f"{name}.v{v}.mp3").exists():
                v += 1
            raw.rename(RAW / f"{name}.v{v}.mp3")  # keep the previous take
        if len(log["calls"]) >= BUDGET:
            print("BUDGET EXHAUSTED, stopping")
            return
        if sub and sub["limit"] and sub["limit"] - sub["used"] < MIN_CREDITS_LEFT:
            print("LOW CREDITS, stopping:", sub)
            return
        body = {"text": spec["text"], "duration_seconds": spec["dur"], "prompt_influence": spec["infl"], "model_id": "eleven_text_to_sound_v2"}
        if spec["loop"]:
            body["loop"] = True
        url = f"https://api.elevenlabs.io/v1/sound-generation?output_format={OUT_FORMAT}"
        t0 = time.time()
        st, hdrs, data = http("POST", url, body)
        log["calls"].append(dict(name=name, status=st, t=time.strftime("%Y-%m-%d %H:%M:%S"), bytes=len(data) if st == 200 else 0))
        write_log(log)  # count the call even if it failed
        if st != 200:
            print(f"[{name}] FAILED {st}: {data[:300]!r}")
            if st in (401, 402, 429):
                print("auth/credit/rate problem, stopping")
                return
            continue
        raw.write_bytes(data)
        low = {k.lower(): v for k, v in hdrs.items()}
        cost = low.get("character-cost")
        append_ledger_row(spec, cost)
        print(f"[{name}] ok {len(data)} bytes in {time.time() - t0:.1f}s, character-cost={cost} (call {len(log['calls'])}/{BUDGET})")
        sub = subscription() or sub


# ---------------------------------------------------------------------------------------------------- audio helpers

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate,duration,bit_rate",
                          "-of", "json", str(path)], capture_output=True, text=True, timeout=60).stdout
    return json.loads(out)["streams"][0]


def decode(path):
    info = probe(path)
    ch = int(info["channels"])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", str(ch), "-ar", str(SR), "-"],
                         capture_output=True, timeout=120).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy(), ch


def encode(x, path):
    ch = x.shape[1]
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(ch), "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", "128k", str(path)],
                   input=np.ascontiguousarray(x, dtype=np.float32).tobytes(), check=True, timeout=120)


def rms_db(x):
    r = float(np.sqrt(np.mean(np.square(x.astype(np.float64)))) + 1e-12)
    return 20 * np.log10(r)


def seam_report(x):
    """How big is the jump at the loop point compared with a typical sample step, and does the level match across it?"""
    m = x.mean(axis=1)
    jump = abs(float(m[0] - m[-1]))
    step = float(np.median(np.abs(np.diff(m)))) + 1e-9
    n = int(0.1 * SR)
    before, after = float(rms_db(m[-n:])), float(rms_db(m[:n]))
    return dict(jump_over_median_step=round(jump / step, 2), rms_before_db=round(before, 1), rms_after_db=round(after, 1),
                level_delta_db=round(abs(before - after), 2))


def loop_crossfade(x, seconds=1.5):
    """Equal-power crossfade the tail into the head. Result is shorter by `seconds`; last sample flows into first."""
    n = min(int(seconds * SR), len(x) // 4)
    L = len(x) - n
    t = np.linspace(0.0, np.pi / 2, n, dtype=np.float32)[:, None]
    out = x[:L].copy()
    out[:n] = x[:n] * np.sin(t) + x[L:L + n] * np.cos(t)
    return out, n / SR


def _fft_filter(x, gain_of_f):
    """Zero-phase FFT filter, per channel. Circular, so a seamless loop stays seamless."""
    n = len(x)
    f = np.maximum(np.fft.rfftfreq(n, 1 / SR), 1.0)
    g = gain_of_f(f).astype(np.float32)
    return np.fft.irfft(np.fft.rfft(x, axis=0) * g[:, None], n=n, axis=0).astype(np.float32)


def _lp(x, fc, order=2):
    return _fft_filter(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def _hp(x, fc, order=2):
    return _fft_filter(x, lambda f: 1 / np.sqrt(1 + (fc / f) ** (2 * order)))


def eq_tilt(x, db_per_oct, pivot, lo_cut=100, hi_cut=14000, max_boost_db=10.0):
    """Spectral tilt about `pivot` Hz, boost capped, with a low and a high cut."""
    def g(f):
        db = np.minimum(db_per_oct * np.log2(f / pivot), max_boost_db)
        return 10 ** (db / 20) / np.sqrt(1 + (lo_cut / f) ** 4) / np.sqrt(1 + (f / hi_cut) ** 4)
    return _fft_filter(x, g)


def bass_enhance(x, amount=0.7, split=180.0):
    """Psychoacoustic bass: saturate the sub band so its harmonics land where laptop speakers and earbuds can play them."""
    low = _lp(x, split)
    pk = float(np.max(np.abs(low))) + 1e-9
    h = np.tanh(3.0 * low / pk)
    h = _lp(_hp(h, 110), 1100)
    h *= (np.sqrt(np.mean(low ** 2)) / (np.sqrt(np.mean(h ** 2)) + 1e-9)) * amount
    return x + h


def _conv_train(times, amps, kernel, n, circular=True):
    """Place `kernel` at each time (samples), weighted by amps, via FFT convolution of an impulse train."""
    train = np.zeros(n, dtype=np.float32)
    idx = (times.astype(np.int64)) % n
    np.add.at(train, idx, amps.astype(np.float32))
    nk = len(kernel)
    kpad = np.zeros(n, dtype=np.float32)
    kpad[:nk] = kernel
    return np.fft.irfft(np.fft.rfft(train) * np.fft.rfft(kpad), n=n).astype(np.float32)


def _drop_kernel(rng, f_lo, f_hi, tau_lo, tau_hi, length_s, burst=0.5):
    """A droplet: a short band-limited noise burst with an exponential decay (noise, not a sine: sines sound like bubbles)."""
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = float(np.exp(rng.uniform(np.log(f_lo), np.log(f_hi))))
    tau = rng.uniform(tau_lo, tau_hi)
    noise = rng.standard_normal((n, 1)).astype(np.float32)
    band = _lp(_hp(noise, f / 1.7), f * 1.7)[:, 0]
    k = band / (band.std() + 1e-9) * np.exp(-t / tau)
    k *= np.minimum(1.0, t / 0.0004)  # 0.4 ms attack, avoids a click
    return k.astype(np.float32)


def synth_rain(n, seed):
    """Procedural gentle rain on grass: noise wash + Poisson droplets (damped resonances) + low plops. Circular, so it loops seamlessly."""
    rng = np.random.default_rng(seed)
    dur = n / SR
    wash = eq_tilt(rng.standard_normal((n, 1)).astype(np.float32), -4.0, 1500, lo_cut=250, hi_cut=6000)[:, 0]
    wash /= wash.std() + 1e-9
    drops = np.zeros(n, dtype=np.float32)
    for _ in range(40):
        k = _drop_kernel(rng, 1500, 6000, 0.0012, 0.006, 0.04)
        m = int(rng.poisson(55 * dur))  # ~55 drops per second per kernel type => ~2200/s total
        drops += _conv_train(rng.uniform(0, n, m), rng.exponential(1.0, m) ** 1.4 * rng.choice([-1, 1], m), k, n)
    plops = np.zeros(n, dtype=np.float32)
    for _ in range(10):
        k = _drop_kernel(rng, 300, 1100, 0.008, 0.02, 0.1)
        m = int(rng.poisson(4 * dur))
        plops += _conv_train(rng.uniform(0, n, m), rng.exponential(1.0, m) * rng.choice([-1, 1], m), k, n)
    drops /= drops.std() + 1e-9
    plops /= plops.std() + 1e-9
    slow = _lp(rng.standard_normal((n, 1)).astype(np.float32), 0.35)[:, 0]
    slow /= slow.std() + 1e-9
    y = (0.35 * wash + 1.0 * drops + 0.5 * plops) * (1.0 + 0.12 * slow)
    return y.astype(np.float32)


def synth_herd(n, seed, thump=None):
    """Procedural distant herd: a swell of random hoof impacts (low thuds with a short click) riding a faint rumble, gallop-grouped."""
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.float32) / SR
    dur = n / SR
    swell = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    drift = np.cumsum(_lp(rng.standard_normal((n, 1)).astype(np.float32), 0.6)[:, 0]) / SR
    gallop = (0.5 + 0.5 * np.sin(2 * np.pi * (2.9 * t + 0.6 * drift))) ** 2
    rate = 26.0 * swell * (0.25 + 0.75 * gallop)  # impacts per second, grouped into a gallop rhythm
    cand = np.cumsum(rng.exponential(1 / 40.0, int(40 * dur * 1.3)))
    cand = cand[cand < dur]
    keep = rng.uniform(0, 1, len(cand)) < np.interp(cand, t, rate) / 40.0
    times = cand[keep] * SR
    hits = np.zeros(n, dtype=np.float32)
    for _ in range(8):
        sel = rng.uniform(0, 1, len(times)) < 1 / 8
        kn = int(0.18 * SR)
        kt = np.arange(kn, dtype=np.float32) / SR
        f = rng.uniform(55, 120)
        k = np.sin(2 * np.pi * f * kt) * np.exp(-kt / rng.uniform(0.03, 0.07))
        click = rng.standard_normal(kn).astype(np.float32) * np.exp(-kt / 0.006)
        k = k + 0.8 * _lp(_hp(click[:, None], 160), 1100)[:, 0]
        hits += _conv_train(times[sel], rng.exponential(1.0, int(sel.sum())) ** 1.2, k.astype(np.float32), n)
    rumble = _lp(rng.standard_normal((n, 1)).astype(np.float32), 110)[:, 0]
    rumble *= swell
    hits /= hits.std() + 1e-9
    rumble /= rumble.std() + 1e-9
    return (1.0 * hits * (0.4 + 0.6 * swell) + 0.45 * rumble).astype(np.float32)


def post_rain(x):
    """Replace the (crackly, frying-oil sounding) raw take with a procedural rain; keep the API take only as a faint wash for realism."""
    n, ch = x.shape
    out = np.zeros_like(x)
    raw = eq_tilt(x, db_per_oct=-4.5, pivot=1800, lo_cut=120, hi_cut=9000, max_boost_db=11.0)
    for c in range(ch):
        s = synth_rain(n, seed=31 + c)
        s /= s.std() + 1e-9
        r = raw[:, c] / (raw[:, c].std() + 1e-9)
        out[:, c] = s + RAIN_RAW_MIX * r
    # gentle overall tilt: real rain is a mid-heavy patter, not flat white noise (which reads as static)
    return eq_tilt(out, db_per_oct=-3.0, pivot=2500, lo_cut=200, hi_cut=8000, max_boost_db=6.0)


def post_thunder(x):
    return _hp(bass_enhance(x, amount=1.5), 40, 3)


def post_stampede(x):
    n = len(x)
    thump = x / (np.max(np.abs(x)) + 1e-9)
    base = float(np.sqrt(np.mean(thump ** 2)))
    out = np.zeros_like(x)
    for c in range(x.shape[1]):
        s = synth_herd(n, seed=11 + c)
        s *= base / (float(np.sqrt(np.mean(s ** 2))) + 1e-9)
        out[:, c] = STAMPEDE_RAW_MIX * thump[:, c] + s
    return _hp(bass_enhance(out, amount=1.6), 40, 3)


RAIN_RAW_MIX = 0.0
STAMPEDE_RAW_MIX = 0.5
BED_SHAPE = {
    "wind_day": dict(hp=80, lp=7000),                                   # raw take has a hiss shelf above 10 kHz that reads as static
    "wind_winter": dict(hp=110, lp=5000, tilt=(-1.5, 400)),            # most energy was sub-100 Hz rumble; tame the whistle
    "evening_birds": dict(hp=300, lp=7000, tilt=(-2.0, 2500)),         # a little duller, so it reads as distant
    "night_crickets": dict(hp=300, lp=8500),
    "rain": dict(hp=150, lp=8000),
    "creek": dict(hp=150, lp=9000),
}


def shape_bed(name, x):
    sh = BED_SHAPE.get(name)
    if not sh:
        return x
    x = _lp(_hp(x, sh["hp"], 3), sh["lp"], 4)
    if "tilt" in sh:
        x = eq_tilt(x, sh["tilt"][0], sh["tilt"][1], lo_cut=20, hi_cut=20000, max_boost_db=6.0)
    return x


POST = {"rain": post_rain, "thunder": post_thunder, "stampede": post_stampede}


def process(name):
    spec = BY_NAME[name]
    raw = RAW / f"{name}.mp3"
    if not raw.exists():
        print(f"[{name}] no raw file, skipping")
        return
    x, ch = decode(raw)
    dur0 = len(x) / SR
    if name in POST and spec["kind"] == "spot":
        x = POST[name](x)  # spots: filter before trimming and levelling
    if spec["kind"] == "bed":
        before = seam_report(x)
        # The API's loop=true output is usually already seamless. Only crossfade when the raw seam is bad
        # (a click: big sample jump, or a level step across the wrap); otherwise keep the full length.
        needs_fade = before["jump_over_median_step"] > 8 or before["level_delta_db"] > 1.5 or not spec["loop"]
        if needs_fade:
            x, fade = loop_crossfade(x, 1.5)
        else:
            fade = 0.0
        if name in POST:
            x = POST[name](x)  # beds: filter after the loop fix (the FFT filter is circular, so the seam survives)
        x = shape_bed(name, x)
        after = seam_report(x)
        gain = 10 ** ((-23.0 - rms_db(x)) / 20)  # bed target: -23 dBFS RMS
        peak = float(np.max(np.abs(x))) * gain
        if peak > 0.89:
            gain *= 0.89 / peak
        x = x * gain
        encode(x, PUB / f"{name}.mp3")
        print(f"[{name}] bed {dur0:.2f}s -> {len(x) / SR:.2f}s (crossfade {"RAN " + format(fade, ".2f") + "s" if needs_fade else "not needed, API loop seam already clean"}) gain {20 * np.log10(gain):+.1f} dB | seam raw {before} -> looped {after}")
    else:
        m = np.max(np.abs(x), axis=1)
        thr = 10 ** (-48 / 20)
        idx = np.where(m > thr)[0]
        a = max(0, int(idx[0]) - int(0.02 * SR)) if len(idx) else 0
        b = min(len(x), int(idx[-1]) + int(0.05 * SR)) if len(idx) else len(x)
        x = x[a:b]
        fi, fo = int(0.015 * SR), int(0.12 * SR)
        x[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)[:, None]
        x[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)[:, None]
        peak = float(np.max(np.abs(x))) + 1e-9
        gain = 0.8 / peak  # spot target: -2 dBFS peak
        x = x * gain
        encode(x, PUB / f"{name}.mp3")
        print(f"[{name}] spot {dur0:.2f}s -> {len(x) / SR:.2f}s (trimmed {a / SR:.2f}s head, {(len(m) - b) / SR:.2f}s tail) gain {20 * np.log10(gain):+.1f} dB")


def check():
    for spec in SPECS:
        p = PUB / f"{spec['name']}.mp3"
        if not p.exists():
            print(f"[{spec['name']}] MISSING")
            continue
        i = probe(p)
        x, _ = decode(p)
        extra = ""
        if spec["kind"] == "bed":
            extra = f" seam={seam_report(x)}"
        print(f"[{spec['name']}] {i['codec_name']} {i['channels']}ch {i['sample_rate']}Hz dur={float(i['duration']):.2f}s "
              f"size={p.stat().st_size // 1024}KB rms={rms_db(x):.1f}dB peak={20 * np.log10(np.max(np.abs(x)) + 1e-9):.1f}dB{extra}")


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = args[0] if args else "status"
    force = "--force" in args
    names = [a for a in args[1:] if not a.startswith("--")]
    if cmd == "status":
        print("subscription:", subscription(), "| calls logged:", len(read_log()["calls"]), "of", BUDGET)
    elif cmd == "gen":
        generate(names or [s["name"] for s in SPECS], force)
    elif cmd == "post":
        for n in names or [s["name"] for s in SPECS]:
            process(n)
    elif cmd == "check":
        check()
    else:
        print(__doc__)
