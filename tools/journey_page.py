"""Build journey/index.html, the draft "making of" page, from journey/INDEX.md.

Usage:
  .venv/Scripts/python tools/journey_page.py

Reads the table in journey/INDEX.md (written by tools/journey.py), works out each image's real
size and the time it was made, cleans up the captions, sorts everything into chapters, and writes
one self-contained HTML file next to the images. Open journey/index.html straight from disk.

Notes on how the data is read:
  * "Made" time. INDEX.md records when an image was added to the journey, but early images were
    backfilled in one batch. tools/journey.py copies files with their original modified time, so when
    a file's modified time is clearly earlier than its recorded time (2 minutes to 2 days) the
    modified time is used as the time it was made. Otherwise the recorded time stands.
  * Captions. The recorder truncated some long captions; those are tidied (or overridden below).
    Captions shaped like "Review round 1 still (01_opening_herd): ..." are turned into a titled
    group so a ten-image round does not repeat one sentence ten times.
  * Hero pair. "The target" is the earliest concept image. "Where it is now" is the latest still that
    is a single frame (contact sheets are skipped).
  * Chapters are the CHAPTERS table below, by start time. The last chapter is open ended, so new
    images land there until someone gives them a chapter of their own. Empty chapters are dropped.

Fonts (Alegreya, Alegreya Sans) are embedded from node_modules/@fontsource so the page works
offline. If they are missing, the page falls back to Google Fonts. Nothing else is fetched.
"""
import argparse
import base64
import datetime as dt
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
J = ROOT / "journey"
INDEX = J / "INDEX.md"
OUT = J / "index.html"
FONTS = ROOT / "node_modules" / "@fontsource"

# (start time or None for "from the beginning", title, blurb). Sorted by start time.
CHAPTERS = [
    (None, "The picture to chase",
     "Before the game had any code, one generated image set the bar: a drone's-eye view of tallgrass "
     "prairie at golden hour, a bison herd kicking up dust, a wolf pack watching from the ridge. "
     "Everything after is an attempt to make this one move."),
    ("2026-10-03 01:00", "First ground",
     "The valley came first: a generated map of creek, ponds and groves, then the land and light, the "
     "grass, and the animals, each built on its own test page. The first balance chart, eight worlds "
     "over twenty years, came from the same stretch."),
    ("2026-10-03 02:30", "Everything at once",
     "The simulation, the renderer and the interface met for the first time. The first frame had the "
     "camera too far out to see any grass. By review round one the herd, the wolves, the ravens, the "
     "pronghorn and the turn of the day were all on screen."),
    ("2026-10-03 04:00", "Wolves, moonlight, morning",
     "Overnight the ecology got its proof: bring wolves back and the herd stays down while the grass "
     "recovers. The art direction widened to a moonlit prairie and an early-summer valley, and the "
     "morning report got its first stills."),
    ("2026-10-03 08:00", "Reading the land",
     "Thirty-two worlds ran for forty years: bison, wolves and ravens lasted in all thirty-two, "
     "pronghorn in thirty. Then the game learned to show its working, with wolf territories, the "
     "landscape of fear, a challenge result card, a photo mode and a pass over the renderer across "
     "late summer, autumn, night and winter."),
    ("2026-10-03 11:40", "Later rounds",
     "New work lands here until it earns a chapter of its own."),
]

# The recorder cut some captions at 150 characters. Keyed by a substring of the file name.
CAPTION_OVERRIDES = {
    "concept_01_moonlit_prairie": "Concept art: the same valley under a full moon, the creek catching the "
                                  "light and a small bison herd grazing in the silver grass.",
    "concept_02_early_summer": "Concept art: the same valley in early summer, with wildflowers in the "
                               "foreground, bison grazing on the far slope and pronghorn crossing the ridge "
                               "in late-afternoon light.",
}

EMBED = [  # (family, weight, style, package, file)
    ("Alegreya", 400, "normal", "alegreya", "alegreya-latin-400-normal.woff2"),
    ("Alegreya", 400, "italic", "alegreya", "alegreya-latin-400-italic.woff2"),
    ("Alegreya", 500, "normal", "alegreya", "alegreya-latin-500-normal.woff2"),
    ("Alegreya", 500, "italic", "alegreya", "alegreya-latin-500-italic.woff2"),
    ("Alegreya Sans", 400, "normal", "alegreya-sans", "alegreya-sans-latin-400-normal.woff2"),
    ("Alegreya Sans", 500, "normal", "alegreya-sans", "alegreya-sans-latin-500-normal.woff2"),
]

ROW = re.compile(
    r"^\|\s*(?P<when>\d{4}-\d\d-\d\d \d\d:\d\d)\s*\|\s*(?P<kind>[\w-]+)\s*\|\s*"
    r"\[(?P<name>[^\]]+)\]\([^)]*\)\s*\|\s*(?P<cap>.*?)\s*\|\s*(?P<src>[^|]*?)\s*\|\s*$")
NAME_TIME = re.compile(r"^(\d{8})-(\d{6})_")
GROUP_A = re.compile(r"^(?P<g>.+?) still \((?P<t>[^)]+)\)(?::\s*(?P<n>.+))?$")
GROUP_B = re.compile(r"^(?P<g>.+?) still:\s*(?P<t>\S+)$")


EM_DASH = chr(0x2014)
EM_ENTITY = "&" + "mdash;"


def clean(s: str) -> str:
    """House rule: no em dashes, ever."""
    return s.replace(EM_DASH, ", ").replace(EM_ENTITY, ", ").strip()


def sentence(s: str) -> str:
    s = clean(s)
    if not s:
        return s
    s = s[0].upper() + s[1:]
    return s if s[-1] in ".!?" else s + "."


def title_from_tag(t: str) -> str:
    t = re.sub(r"^\d+[_-]", "", t.strip())
    words = [w for w in re.split(r"[_\-\s]+", t) if w]
    words = ["UI" if w.lower() == "ui" else w for w in words]
    s = " ".join(words)
    return s[:1].upper() + s[1:]


def short_title(cap: str) -> str:
    """First clause of a caption, for labels."""
    first = re.split(r"\s*[:(,]\s*", cap, maxsplit=1)[0].strip()
    if len(first) > 60:
        first = first[:60].rsplit(" ", 1)[0]
    return first[:1].upper() + first[1:]


def tidy_caption(cap: str, name: str) -> str:
    for key, text in CAPTION_OVERRIDES.items():
        if key in name:
            return clean(text)
    cap = re.sub(r"^(Concept art: )(?=Concept art)", "", clean(cap))
    if len(cap) >= 140 and cap[-1] not in ".!?)":
        cut = cap.rfind(", ")
        if cut > 40:
            cap = cap[:cut]
        cap = cap.rstrip(",;: ") + "."
    return cap


def made_time(path: pathlib.Path, recorded: dt.datetime) -> dt.datetime:
    mtime = dt.datetime.fromtimestamp(path.stat().st_mtime).replace(microsecond=0)
    gap = recorded - mtime
    if dt.timedelta(minutes=2) <= gap <= dt.timedelta(days=2):
        return mtime
    return recorded


def image_size(path: pathlib.Path):
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return (0, 0)


def read_entries():
    rows = []
    for n, line in enumerate(INDEX.read_text(encoding="utf-8").splitlines()):
        m = ROW.match(line)
        if not m:
            continue
        name = m["name"]
        path = J / name
        if not path.exists():
            print(f"warning: {name} is listed in INDEX.md but missing, skipped")
            continue
        nt = NAME_TIME.match(name)
        if nt:
            recorded = dt.datetime.strptime(nt[1] + nt[2], "%Y%m%d%H%M%S")
        else:
            recorded = dt.datetime.strptime(m["when"], "%Y-%m-%d %H:%M")
        raw = clean(m["cap"])
        e = {"file": name, "kind": m["kind"], "order": n, "made_dt": made_time(path, recorded),
             "group": "", "note": ""}
        e["w"], e["h"] = image_size(path)
        g = GROUP_A.match(raw) or GROUP_B.match(raw)
        if g:
            e["group"] = clean(g["g"])
            e["title"] = title_from_tag(g["t"])
            e["note"] = sentence(g.groupdict().get("n") or "")
            e["caption"] = (e["title"] + ". " + e["note"]).strip()
        else:
            e["caption"] = tidy_caption(raw, name)
            e["title"] = short_title(e["caption"])
        rows.append(e)
    rows.sort(key=lambda e: (e["made_dt"], e["order"]))
    # A group of one is just a captioned image.
    counts = {}
    for e in rows:
        counts[e["group"]] = counts.get(e["group"], 0) + (1 if e["group"] else 0)
    for e in rows:
        if e["group"] and counts[e["group"]] < 2:
            e["caption"] = f'{e["group"]}: {e["title"]}. {e["note"]}'.strip()
            e["group"], e["note"] = "", ""
    return rows


def assign_chapters(entries):
    starts = [dt.datetime.strptime(s, "%Y-%m-%d %H:%M") if s else None for s, _t, _b in CHAPTERS]
    for e in entries:
        idx = 0
        for k, s in enumerate(starts):
            if s is None or e["made_dt"] >= s:
                idx = k
        e["ch_raw"] = idx
    used = sorted({e["ch_raw"] for e in entries})
    remap = {old: new for new, old in enumerate(used)}
    for e in entries:
        e["ch"] = remap[e["ch_raw"]]
    return [{"title": CHAPTERS[k][1], "blurb": CHAPTERS[k][2]} for k in used]


def pick_hero(entries):
    target = next((i for i, e in enumerate(entries) if e["kind"] == "concept"), 0)
    now = None
    for i, e in enumerate(entries):
        if e["kind"] == "still" and "sheet" not in e["file"].lower() and "contact" not in e["caption"].lower():
            now = i
    return {"target": target, "now": len(entries) - 1 if now is None else now}


def font_assets():
    faces, ok = [], True
    for family, weight, style, pkg, fname in EMBED:
        p = FONTS / pkg / "files" / fname
        if not p.exists():
            ok = False
            break
        b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        faces.append(
            f'@font-face{{font-family:"{family}";font-style:{style};font-weight:{weight};font-display:swap;'
            f'src:url(data:font/woff2;base64,{b64}) format("woff2")}}')
    if ok:
        return "\n".join(faces), ""
    link = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;1,400;1,500'
            '&family=Alegreya+Sans:wght@400;500&display=swap">')
    return "", link


def js_literal(obj) -> str:
    return json.dumps(obj, ensure_ascii=True, separators=(",", ":")).replace("</", "<\\/")


def build(out: pathlib.Path):
    entries = read_entries()
    if not entries:
        raise SystemExit("No entries found in journey/INDEX.md")
    chapters = assign_chapters(entries)
    hero = pick_hero(entries)
    payload = []
    for i, e in enumerate(entries):
        payload.append({
            "i": i, "file": e["file"], "kind": e["kind"], "made": e["made_dt"].strftime("%Y-%m-%dT%H:%M:%S"),
            "title": e["title"], "caption": e["caption"], "group": e["group"], "note": e["note"],
            "w": e["w"], "h": e["h"], "ch": e["ch"],
        })
    faces, link = font_assets()
    html = TEMPLATE
    html = html.replace("__FONT_FACES__", faces).replace("__FONT_LINK__", link)
    html = html.replace("__ENTRIES__", js_literal(payload))
    html = html.replace("__CHAPTERS__", js_literal(chapters))
    html = html.replace("__HERO__", js_literal(hero))
    assert EM_DASH not in html and EM_ENTITY not in html, "em dash slipped into the page"
    out.write_text(html, encoding="utf-8", newline="\n")
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB)")
    print(f"  {len(payload)} images, {len(chapters)} chapters, fonts {'embedded' if faces else 'from Google Fonts'}")
    print(f"  target: {payload[hero['target']]['file']}")
    print(f"  now:    {payload[hero['now']]['file']}")
    for k, c in enumerate(chapters):
        n = sum(1 for e in payload if e["ch"] == k)
        print(f"  chapter {k + 1}: {c['title']} ({n})")


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tallgrass, the making of</title>
<meta name="description" content="Every image made while building Tallgrass, from the first concept picture to the current build.">
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231a1711'/%3E%3Cpath d='M9 26c1-8 1-13-1-18 4 3 6 8 6 18M15 26c0-9 3-14 8-18-1 6-2 12-2 18' fill='none' stroke='%23d9b65c' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E">
__FONT_LINK__
<style>
__FONT_FACES__
:root{
  --night:#100e0a;
  --umber:#1a1711;
  --smoke:rgba(26,23,17,.52);
  --smoke-deep:rgba(20,17,12,.82);
  --edge:rgba(240,228,200,.14);
  --paper:#efe6d0;
  --paper-dim:#b8ad95;
  --gold:#d9b65c;
  --serif:"Alegreya",Georgia,"Times New Roman",serif;
  --sans:"Alegreya Sans","Segoe UI",system-ui,sans-serif;
  --gutter:clamp(16px,4vw,48px);
  --maxw:1240px;
  --glass:blur(14px) saturate(1.2);
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--night);scroll-behavior:smooth;-webkit-text-size-adjust:100%}
html.lock,html.lock body{overflow:hidden}
body{margin:0;color:var(--paper);font:400 17px/1.5 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%}
a{color:inherit}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
.num,time{font-variant-numeric:lining-nums tabular-nums}

/* Light spilled from whichever chapter is on screen, so the smoked glass has something to pick up. */
.ambient{position:fixed;inset:0;z-index:-1;overflow:hidden;background:var(--night)}
.amb{position:absolute;inset:-10%;background:center/cover no-repeat;filter:blur(56px) saturate(1.3) brightness(.66);opacity:0;transition:opacity 1.6s ease}
.amb.on{opacity:1}
.ambient::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(16,14,10,.36),rgba(16,14,10,.74) 60%,rgba(16,14,10,.88))}

/* Top bar */
.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:clamp(12px,2.4vw,32px);padding:10px max(var(--gutter),calc((100% - var(--maxw)) / 2 + var(--gutter)));min-height:56px;transition:background .3s ease,border-color .3s ease;border-bottom:1px solid transparent}
.bar.stuck{background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);border-bottom-color:var(--edge)}
.bar::after{content:"";position:absolute;left:0;bottom:-1px;height:2px;width:var(--p,0%);background:var(--gold);opacity:.85}
.brand{margin-right:auto;font:italic 500 25px/1 var(--serif);text-decoration:none;text-shadow:0 1px 12px rgba(0,0,0,.55)}
.chapnav{display:flex;gap:clamp(14px,2vw,28px);font-size:14px}
.chapnav a{color:var(--paper-dim);text-decoration:none;padding:6px 0;border-bottom:1px solid transparent;transition:color .2s ease,border-color .2s ease}
.chapnav a:hover{color:var(--paper)}
.chapnav a[aria-current="true"]{color:var(--gold);border-bottom-color:var(--gold)}
@media (max-width:1019px){.chapnav{display:none}}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:9px;min-height:40px;padding:8px 18px;border-radius:7px;border:1px solid var(--edge);background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);color:var(--paper);font:500 16px/1.2 var(--sans);text-decoration:none;cursor:pointer;transition:background .2s ease,border-color .2s ease,color .2s ease}
.btn:hover{border-color:rgba(240,228,200,.34);background:rgba(40,35,26,.62)}
.btn.primary{background:var(--gold);border-color:var(--gold);color:#1a1711}
.btn.primary:hover{background:#e6c777;border-color:#e6c777}
.btn.sm{min-height:36px;padding:6px 14px;font-size:14px}
.btn svg{flex:none}

/* Hero */
.hero{max-width:var(--maxw);margin:0 auto;padding:clamp(40px,8vw,104px) var(--gutter) 0}
.hero-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:clamp(24px,5vw,72px);align-items:end}
.hero h1{margin:0;font:500 clamp(3.6rem,12vw,9rem)/.92 var(--serif);letter-spacing:-.012em;text-shadow:0 1px 12px rgba(0,0,0,.55)}
.hero h1 em{display:block;margin-bottom:.12em;font:italic 400 clamp(1.5rem,3.4vw,2.6rem)/1.1 var(--serif);color:var(--paper-dim);letter-spacing:0}
.lede{margin:clamp(20px,3vw,32px) 0 0;max-width:30em;font:italic 400 clamp(1.25rem,2.3vw,1.8rem)/1.35 var(--serif);text-shadow:0 1px 12px rgba(0,0,0,.55)}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:clamp(22px,3vw,34px)}
.stats{display:flex;flex-direction:column;gap:18px;margin:0;padding:0 0 6px}
.stat{display:flex;flex-direction:column-reverse;gap:2px}
.stat dt{font-size:14px;color:var(--paper-dim);max-width:17em}
.stat dd{margin:0;font:400 39px/1 var(--serif);font-variant-numeric:lining-nums tabular-nums}
@media (max-width:859px){.hero-top{grid-template-columns:1fr}.stats{flex-direction:row;flex-wrap:wrap;gap:20px 36px}}

.pair{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:clamp(12px,2vw,24px);margin-top:clamp(36px,6vw,72px)}
.frame{position:relative;margin:0;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid var(--edge);background:#000}
.frame .shot{height:100%;border:0;border-radius:0}
.frame img{height:100%;object-fit:cover}
.lower{position:absolute;left:14px;bottom:14px;max-width:calc(100% - 28px);display:flex;flex-direction:column;gap:2px;padding:10px 14px;border-radius:10px;background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);border:1px solid var(--edge);text-shadow:0 1px 12px rgba(0,0,0,.55);pointer-events:none}
.lower .big{font:italic 400 25px/1.1 var(--serif)}
.lower .small{font-size:14px;color:var(--paper-dim);line-height:1.3}
.pair-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px;margin-top:14px;color:var(--paper-dim);font-size:14px}
.pair-tools p{margin:0}
@media (max-width:759px){.pair{grid-template-columns:1fr}}

.pair.is-wipe{grid-template-columns:1fr}
.pair.is-wipe .frame{grid-area:1/1}
.pair.is-wipe .frame.b{clip-path:inset(0 0 0 var(--pos,50%))}
.pair.is-wipe .frame.b .lower{left:auto;right:14px}
.wipe-range{position:absolute;inset:0;z-index:3;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;-webkit-appearance:none;appearance:none;background:transparent}
.wipe-range[hidden]{display:none}
.wipe-range::-webkit-slider-thumb{-webkit-appearance:none;width:2px;height:2px}
.wipe-range::-moz-range-thumb{width:2px;height:2px;border:0}
.divider{display:none;position:absolute;top:0;bottom:0;left:var(--pos,50%);width:2px;margin-left:-1px;background:var(--gold);pointer-events:none;z-index:2}
.pair.is-wipe .divider{display:block}
.knob{position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;display:grid;place-items:center;border-radius:50%;background:var(--smoke-deep);border:2px solid var(--gold);color:var(--gold)}
.wipe-range:focus-visible ~ .divider .knob{outline:2px solid var(--paper);outline-offset:3px}

/* Chapters */
#chapters{padding-bottom:clamp(40px,6vw,80px)}
.chapter{max-width:var(--maxw);margin:0 auto;padding:clamp(56px,9vw,120px) var(--gutter) 0;scroll-margin-top:56px}
.chapter::before{content:"";display:block;height:1px;margin-bottom:clamp(28px,4vw,48px);background:linear-gradient(90deg,var(--gold) 0 56px,var(--edge) 56px)}
.chapter-head{max-width:46rem;margin-bottom:clamp(24px,4vw,44px)}
.when{margin:0 0 .7em;font-size:14px;color:var(--paper-dim)}
.chapter h2{margin:0 0 .35em;font:italic 400 clamp(2.2rem,6vw,3.8rem)/1.05 var(--serif);text-shadow:0 1px 12px rgba(0,0,0,.55)}
.blurb{margin:0;font:400 clamp(1.1rem,1.7vw,1.3rem)/1.55 var(--serif);color:var(--paper-dim);text-wrap:pretty}
.blocks{display:grid;gap:clamp(28px,4vw,52px)}

.shot{display:block;position:relative;width:100%;margin:0;padding:0;line-height:0;border:1px solid var(--edge);border-radius:10px;overflow:hidden;background:var(--umber);cursor:zoom-in}
.shot img{display:block;width:100%;height:auto;transition:opacity .6s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
.shot:hover img{transform:scale(1.025)}
.shot img.pending{opacity:0}

figure{margin:0}
figcaption{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin-top:12px;align-items:baseline}
figcaption .t{font-size:14px;color:var(--paper-dim)}
figcaption .cap{font:italic 400 18px/1.45 var(--serif);text-wrap:pretty}
.solo .cap{font-size:clamp(1.15rem,1.9vw,1.4rem);max-width:44em}
.solo.tall{max-width:min(100%,820px)}
.duo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(20px,2.6vw,36px);align-items:start}
@media (max-width:699px){.duo{grid-template-columns:1fr}}

.sheet header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 18px;margin-bottom:16px}
.sheet h3{margin:0;font:italic 400 25px/1.2 var(--serif)}
.sheet header p{margin:0;color:var(--paper-dim);max-width:46em}
.grid{display:grid;gap:clamp(12px,1.8vw,22px)}
.grid.c2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid.c3{grid-template-columns:repeat(3,minmax(0,1fr))}
.grid.c4{grid-template-columns:repeat(4,minmax(0,1fr))}
.grid.c5{grid-template-columns:repeat(5,minmax(0,1fr))}
@media (max-width:1099px){.grid.c3,.grid.c4,.grid.c5{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fig.small figcaption{display:block;margin-top:8px}
.fig.small .cap{font:400 14px/1.35 var(--sans);color:var(--paper-dim)}

.aside{display:grid;gap:clamp(16px,3vw,40px);align-items:center;padding:clamp(14px,2vw,22px);border-radius:10px;background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);border:1px solid var(--edge)}
.aside.wide{grid-template-columns:minmax(0,6fr) minmax(0,6fr)}
.aside.mid{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
.aside.sq{grid-template-columns:minmax(120px,220px) minmax(0,1fr)}
.aside figcaption{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:0}
.aside .kind{display:inline-block;padding:1px 10px;border:1px solid var(--edge);border-radius:99px;font-size:12px;color:var(--paper-dim)}
.aside .cap{font-size:clamp(1.1rem,1.9vw,1.35rem)}
.aside .note{font-size:14px;color:var(--paper-dim)}
@media (max-width:699px){.aside.wide,.aside.mid{grid-template-columns:1fr}}

.foot{max-width:var(--maxw);margin:0 auto;padding:clamp(56px,8vw,96px) var(--gutter) clamp(48px,7vw,80px)}
.foot::before{content:"";display:block;height:1px;margin-bottom:32px;background:linear-gradient(90deg,var(--gold) 0 56px,var(--edge) 56px)}
.foot h2{margin:0 0 .3em;font:italic 400 clamp(1.8rem,4vw,2.6rem)/1.1 var(--serif)}
.foot p{margin:0 0 18px;max-width:40em;color:var(--paper-dim);font:400 1.15rem/1.55 var(--serif)}
.foot .fine{font:14px/1.5 var(--sans);margin-top:28px}
.foot code{font:inherit;color:var(--paper)}

/* Viewer: lightbox and slideshow */
.viewer{position:fixed;inset:0;z-index:100;background:#0a0907;color:var(--paper);overflow:hidden}
.viewer[hidden]{display:none}
.stage{position:absolute;inset:0;touch-action:pan-y}
.layer{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .25s ease;transform-origin:50% 55%;user-select:none;-webkit-user-drag:none}
.viewer.playing .layer{transition-duration:1s}
.layer.on{opacity:1}
.layer.small{inset:0;margin:auto;width:min(100%,calc(var(--nw) * 2px));height:min(100%,calc(var(--nh) * 2px))}
.layer.kb{animation:kb var(--dur,5s) ease-out forwards}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.07)}}
.shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to top,rgba(8,7,5,.74),rgba(8,7,5,0) 40%),linear-gradient(to bottom,rgba(8,7,5,.5),rgba(8,7,5,0) 18%)}
.ui{transition:opacity .4s ease}
.viewer.idle .ui{opacity:0;pointer-events:none}
.viewer.idle{cursor:none}
.vtop{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(14px,2.4vw,28px)}
.vwhere{display:flex;flex-direction:column;min-width:0;text-shadow:0 1px 12px rgba(0,0,0,.55)}
.vcount{font-size:14px;color:var(--paper-dim)}
.vchap{font:italic 400 20px/1.2 var(--serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vtools{display:flex;gap:8px;flex:none}
.vnav{position:absolute;top:50%;margin-top:-24px;width:48px;height:48px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--edge);background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);cursor:pointer;padding:0}
.vnav:hover{border-color:rgba(240,228,200,.34)}
.vnav.prev{left:clamp(10px,2vw,24px)}
.vnav.next{right:clamp(10px,2vw,24px)}
.vnav[disabled]{opacity:.3;cursor:default}
.vcap{position:absolute;left:clamp(14px,3vw,40px);bottom:76px;max-width:min(640px,calc(100% - 28px));padding:12px 16px 12px;border-radius:10px;background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);border:1px solid var(--edge);text-shadow:0 1px 12px rgba(0,0,0,.55);transition:opacity .5s ease}
.viewer.carding .vcap{opacity:0}
.vmeta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:14px;color:var(--paper-dim)}
.vmeta .chip{padding:0 10px;border:1px solid var(--edge);border-radius:99px;font-size:12px}
.vtext{margin:6px 0 0;font:italic 400 clamp(1.05rem,2vw,1.3rem)/1.4 var(--serif)}
.vfile{margin:8px 0 0;font-size:12px;color:var(--paper-dim);word-break:break-all}
.vcard{position:absolute;left:clamp(16px,5vw,72px);right:16px;bottom:22%;pointer-events:none;opacity:0;transition:opacity .8s ease;text-shadow:0 1px 12px rgba(0,0,0,.55)}
.vcard.on{opacity:1}
.vcard .ct{font:italic 400 clamp(2.2rem,6vw,3.8rem)/1.05 var(--serif)}
.vcard .cs{margin-top:6px;font-size:16px;color:var(--paper-dim)}
.vbar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:16px;padding:14px clamp(14px,2.4vw,28px) 18px}
.vprog{flex:1;height:3px;border-radius:2px;background:rgba(240,228,200,.22);overflow:hidden}
.vprog i{display:block;height:100%;width:0;background:var(--gold);transition:width .5s ease}
.vbtn{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:6px 14px;border-radius:7px;border:1px solid var(--edge);background:var(--smoke);-webkit-backdrop-filter:var(--glass);backdrop-filter:var(--glass);color:var(--paper);font:500 14px/1.2 var(--sans);text-decoration:none;cursor:pointer}
.vbtn:hover{border-color:rgba(240,228,200,.34)}
.vbtn.primary{background:var(--gold);border-color:var(--gold);color:#1a1711;font-size:16px}
.vbtn.primary:hover{background:#e6c777}
.vbtn[hidden]{display:none}
@media (max-width:640px){
  .vnav{width:40px;height:40px;margin-top:-20px}
  .vtools .vfs{display:none}
  .vcap{bottom:70px}
}
@media (max-height:520px){.vcap{bottom:62px}.vtext{font-size:1rem}}

noscript p{max-width:var(--maxw);margin:40px auto;padding:0 var(--gutter);color:var(--paper-dim)}

@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
  .shot:hover img{transform:none}
  .layer.kb{animation:none}
}
</style>
</head>
<body>
<div class="ambient" aria-hidden="true"><div class="amb" id="ambA"></div><div class="amb" id="ambB"></div></div>

<div id="page">
  <header class="bar" id="bar">
    <a class="brand" href="#top">Tallgrass</a>
    <nav class="chapnav" id="chapnav" aria-label="Chapters"></nav>
    <button class="btn primary sm" id="barPlay" type="button"></button>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="h1">
      <div class="hero-top">
        <div>
          <h1 id="h1"><em>the making of</em>Tallgrass</h1>
          <p class="lede">One concept picture, and the working night it took to chase it. Every image made along the way, in the order it was made.</p>
          <div class="cta">
            <button class="btn primary" id="heroPlay" type="button"></button>
            <a class="btn" href="#chapters">Scroll the timeline</a>
          </div>
        </div>
        <dl class="stats" id="stats"></dl>
      </div>
      <div class="pair" id="pair"></div>
      <div class="pair-tools">
        <p>Click either frame to see it large.</p>
        <button class="btn sm" id="wipeToggle" type="button" aria-pressed="false">Wipe between them</button>
      </div>
    </section>

    <div id="chapters"></div>
    <noscript><p>The timeline is laid out by a small script, which is turned off here. The images are in this folder and listed in INDEX.md.</p></noscript>

    <footer class="foot" id="foot">
      <h2>It keeps going</h2>
      <p>The record grows with the game. Each new frame, chart and concept picture is added as it is made, and this page is rebuilt from the same list.</p>
      <button class="btn" id="footPlay" type="button"></button>
      <p class="fine">Times show when each file was made, so frames added to the record later keep their original time. Built from <code>INDEX.md</code> by <code>tools/journey_page.py</code>.</p>
    </footer>
  </main>
</div>

<div class="viewer" id="viewer" role="dialog" aria-modal="true" aria-label="Image viewer" hidden>
  <div class="stage" id="stage"><img class="layer" alt=""><img class="layer" alt=""></div>
  <div class="shade"></div>
  <div class="vtop ui">
    <div class="vwhere"><span class="vcount num" id="vcount"></span><span class="vchap" id="vchap"></span></div>
    <div class="vtools">
      <a class="vbtn" id="vopen" target="_blank" rel="noopener">Open file</a>
      <button class="vbtn vfs" id="vfs" type="button">Full screen</button>
      <button class="vbtn" id="vclose" type="button" aria-label="Close viewer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Close</span></button>
    </div>
  </div>
  <button class="vnav prev ui" id="vprev" type="button" aria-label="Previous image"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <button class="vnav next ui" id="vnext" type="button" aria-label="Next image"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  <div class="vcard" id="vcard" aria-hidden="true"><div class="ct"></div><div class="cs"></div></div>
  <div class="vcap" id="vcap" aria-live="polite"><div class="vmeta"><time class="num" id="vtime"></time><span class="chip" id="vkind"></span><span id="vgroup"></span></div><p class="vtext" id="vtext"></p><p class="vfile" id="vfile"></p></div>
  <div class="vbar ui"><button class="vbtn primary" id="vplay" type="button"></button><div class="vprog" aria-hidden="true"><i id="vfill"></i></div></div>
</div>

<script>
(() => {
'use strict';
const ENTRIES = __ENTRIES__;
const CHAPTERS = __CHAPTERS__;
const HERO = __HERO__;

const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
const KIND = {concept: 'Concept art', still: 'In-game frame', chart: 'Chart', ui: 'Interface', asset: 'Debug view', video: 'Video'};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ICON = {
  play: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wipe: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}
const parseIso = (iso) => { const [d, t] = iso.split('T'); const [y, m, dd] = d.split('-').map(Number); const [hh, mm, ss] = t.split(':').map(Number); return new Date(y, m - 1, dd, hh, mm, ss || 0); };
ENTRIES.forEach((e) => { e.date = parseIso(e.made); e.url = encodeURI(e.file); });
const hhmm = (e) => e.made.slice(11, 16);
const dayLabel = (e) => MONTHS[e.date.getMonth()] + ' ' + e.date.getDate();
const whenLabel = (e) => dayLabel(e) + ', ' + hhmm(e);
const isChartish = (e) => e.kind === 'chart' || e.kind === 'asset';
const ratio = (e) => (e.w && e.h ? e.w / e.h : 16 / 9);
const HEROES = new Map([[HERO.target, 'the target'], [HERO.now, 'where it is now']]);

function chapterWhen(items) {
  const a = items[0], b = items[items.length - 1];
  if (hhmm(a) === hhmm(b) && dayLabel(a) === dayLabel(b)) return whenLabel(a);
  if (dayLabel(a) === dayLabel(b)) return whenLabel(a) + ' to ' + hhmm(b);
  return whenLabel(a) + ' to ' + whenLabel(b);
}

/* ---------- images ---------- */
function makeImg(e, opts = {}) {
  const i = h('img', {src: e.url, alt: e.caption, width: e.w || null, height: e.h || null, decoding: 'async', loading: opts.eager ? 'eager' : 'lazy'});
  if (opts.eager) i.setAttribute('fetchpriority', 'high');
  if (!i.complete) {
    i.classList.add('pending');
    const done = () => i.classList.remove('pending');
    i.addEventListener('load', done, {once: true});
    i.addEventListener('error', done, {once: true});
  }
  return i;
}
function shot(e, opts) {
  return h('button', {class: 'shot', type: 'button', 'aria-label': 'View large: ' + e.title,
    onclick: (ev) => openViewer(e.i, {opener: ev.currentTarget})}, makeImg(e, opts));
}
const timeEl = (e) => h('time', {class: 't', datetime: e.made}, hhmm(e));
function fig(e) {
  return h('figure', {class: 'fig', 'data-i': e.i}, shot(e), h('figcaption', {}, timeEl(e), h('span', {class: 'cap'}, e.caption)));
}
function sheetFig(e) {
  return h('figure', {class: 'fig small', 'data-i': e.i}, shot(e), h('figcaption', {}, h('span', {class: 'cap'}, e.title)));
}
function asideFig(e) {
  const r = ratio(e);
  const shape = r < 1.3 ? 'sq' : r > 2.2 ? 'wide' : 'mid';
  const note = HEROES.has(e.i) ? 'Shown at the top of the page as ' + HEROES.get(e.i) + '.' : '';
  return h('figure', {class: 'aside ' + shape, 'data-i': e.i}, shot(e),
    h('figcaption', {}, timeEl(e), h('span', {class: 'kind'}, KIND[e.kind] || e.kind), h('span', {class: 'cap'}, e.caption), note && h('span', {class: 'note'}, note)));
}

/* ---------- layout of one chapter ---------- */
function blocksFor(items) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const r = run.slice();
    if (r.length % 2 === 1) out.push({t: 'solo', items: [r.shift()]});
    for (let k = 0; k < r.length; k += 2) out.push({t: 'duo', items: r.slice(k, k + 2)});
    run = [];
  };
  for (let k = 0; k < items.length; k++) {
    const e = items[k];
    if (HEROES.has(e.i) || isChartish(e)) { flush(); out.push({t: 'aside', items: [e]}); }
    else if (e.group) {
      flush();
      const g = [e];
      while (k + 1 < items.length && items[k + 1].group === e.group && !HEROES.has(items[k + 1].i)) g.push(items[++k]);
      out.push({t: 'sheet', items: g});
    }
    else if (ratio(e) < 1.5) { flush(); out.push({t: 'solo', items: [e], tall: true}); }
    else run.push(e);
  }
  flush();
  return out;
}
// Columns for a contact sheet: fill the last row if we can, otherwise lean towards 3.
function pickCols(n) {
  if (n <= 3) return Math.max(2, n);
  if (n === 4) return 2;
  let best = 3, fill = -1;
  for (const c of [3, 4, 5]) {
    const f = (n % c || c) / c;
    if (f > fill + 1e-9) { best = c; fill = f; }
  }
  return best;
}
function renderBlock(b) {
  if (b.t === 'solo') return h('div', {class: 'solo' + (b.tall ? ' tall' : '')}, fig(b.items[0]));
  if (b.t === 'duo') return h('div', {class: 'duo'}, b.items.map(fig));
  if (b.t === 'aside') return asideFig(b.items[0]);
  const g = b.items[0];
  return h('section', {class: 'sheet', 'aria-label': g.group},
    h('header', {}, h('h3', {}, g.group), g.note && h('p', {}, g.note)),
    h('div', {class: 'grid c' + pickCols(b.items.length)}, b.items.map(sheetFig)));
}

/* ---------- page ---------- */
const chaptersEl = $('#chapters');
const chapnav = $('#chapnav');
CHAPTERS.forEach((c, ci) => {
  const items = ENTRIES.filter((e) => e.ch === ci);
  if (!items.length) return;
  const lead = items.find((e) => ['still', 'concept', 'ui'].includes(e.kind)) || items[0];
  chaptersEl.append(h('section', {class: 'chapter', id: 'ch-' + ci, 'aria-labelledby': 'cht-' + ci, 'data-ambient': lead.url},
    h('header', {class: 'chapter-head'},
      h('p', {class: 'when'}, chapterWhen(items)),
      h('h2', {id: 'cht-' + ci}, c.title),
      h('p', {class: 'blurb'}, c.blurb)),
    h('div', {class: 'blocks'}, blocksFor(items).map(renderBlock))));
  chapnav.append(h('a', {href: '#ch-' + ci}, c.title));
});

/* hero: the target and where it is now */
const tgt = ENTRIES[HERO.target], now = ENTRIES[HERO.now];
const frame = (e, cls, big) => h('figure', {class: 'frame ' + cls}, shot(e, {eager: true}),
  h('figcaption', {class: 'lower'}, h('span', {class: 'big'}, big), h('span', {class: 'small'}, e.title), h('span', {class: 'small num'}, whenLabel(e))));
const pair = $('#pair');
const wipeRange = h('input', {type: 'range', min: 0, max: 100, value: 50, class: 'wipe-range', id: 'wipeRange', hidden: true,
  'aria-label': 'Wipe between the target and where it is now'});
const knob = h('span', {class: 'knob'});
knob.innerHTML = ICON.wipe;
pair.append(frame(tgt, 'a', 'The target'), frame(now, 'b', 'Where it is now'), wipeRange, h('div', {class: 'divider', 'aria-hidden': 'true'}, knob));
const wipeToggle = $('#wipeToggle');
wipeToggle.addEventListener('click', () => {
  const on = !pair.classList.contains('is-wipe');
  pair.classList.toggle('is-wipe', on);
  wipeRange.hidden = !on;
  wipeToggle.setAttribute('aria-pressed', String(on));
  wipeToggle.textContent = on ? 'Side by side' : 'Wipe between them';
  $$('.shot', pair).forEach((b) => { b.tabIndex = on ? -1 : 0; });
  if (on) wipeRange.focus({preventScroll: true});
});
wipeRange.addEventListener('input', () => pair.style.setProperty('--pos', wipeRange.value + '%'));

/* hero: stats */
(() => {
  const mins = Math.round((ENTRIES[ENTRIES.length - 1].date - ENTRIES[0].date) / 60000);
  const span = mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min';
  const stat = (n, label) => h('div', {class: 'stat'}, h('dt', {}, label), h('dd', {}, n));
  $('#stats').append(
    stat(String(ENTRIES.length), 'images in the record'),
    stat(span, 'from the first concept to the latest frame'),
    stat(String($$('.chapter').length), 'chapters'));
})();

/* play buttons */
const playHtml = (label) => ICON.play + '<span>' + label + '</span>';
['barPlay', 'heroPlay', 'footPlay'].forEach((id) => {
  const b = $('#' + id);
  b.innerHTML = playHtml(id === 'barPlay' ? 'Play' : id === 'footPlay' ? 'Play it again' : 'Play the journey');
  b.addEventListener('click', (ev) => openViewer(0, {play: true, opener: ev.currentTarget}));
});

/* top bar: progress and scrollspy */
const bar = $('#bar');
let ticking = false;
const onScroll = () => {
  ticking = false;
  const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
  bar.style.setProperty('--p', (max > 0 ? Math.min(100, y / max * 100) : 0).toFixed(2) + '%');
  bar.classList.toggle('stuck', y > 24);
};
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, {passive: true});
onScroll();

const ambs = [$('#ambA'), $('#ambB')];
let ambIdx = 0, ambCur = '';
function setAmbient(url) {
  if (!url || url === ambCur) return;
  ambCur = url;
  ambIdx ^= 1;
  ambs[ambIdx].style.backgroundImage = 'url("' + url + '")';
  ambs[ambIdx].classList.add('on');
  ambs[ambIdx ^ 1].classList.remove('on');
}
setAmbient(tgt.url);
const links = $$('a', chapnav);
const heroEl = $('.hero');
function activate(el) {
  if (el === heroEl) {
    links.forEach((a) => a.removeAttribute('aria-current'));
    setAmbient(tgt.url);
    return;
  }
  links.forEach((a) => { if (a.getAttribute('href') === '#' + el.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  setAmbient(el.dataset.ambient || tgt.url);
}
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) activate(en.target); }), {rootMargin: '-40% 0px -55% 0px'});
  $$('.chapter').forEach((s) => io.observe(s));
  io.observe(heroEl);
}

/* ---------- viewer ---------- */
const viewer = $('#viewer'), page = $('#page'), docEl = document.documentElement;
const layers = $$('.layer', viewer);
const vplay = $('#vplay');
const V = {open: false, i: 0, playing: false, flip: 0, token: 0, timer: 0, idleTimer: 0, cardTimer: 0, lastCh: -1, extra: 0, opener: null};
const keep = [];

const slideMs = (e) => (e.group ? 2800 : isChartish(e) ? 6500 : 4400);
function syncPlayBtn(state) {
  const ended = state === 'ended';
  vplay.innerHTML = (ended ? ICON.replay : V.playing ? ICON.pause : ICON.play) + '<span>' + (ended ? 'Replay' : V.playing ? 'Pause' : 'Play') + '</span>';
  $('#vcap').setAttribute('aria-live', V.playing ? 'off' : 'polite');
}
function schedule() {
  clearTimeout(V.timer);
  if (!V.playing) return;
  V.timer = setTimeout(() => step(1, true), slideMs(ENTRIES[V.i]) + V.extra);
}
function showCard(ci) {
  const items = ENTRIES.filter((e) => e.ch === ci);
  const card = $('#vcard');
  $('.ct', card).textContent = CHAPTERS[ci].title;
  $('.cs', card).textContent = chapterWhen(items);
  card.classList.add('on');
  viewer.classList.add('carding');
  clearTimeout(V.cardTimer);
  V.cardTimer = setTimeout(hideCard, 3400);
}
function hideCard() {
  $('#vcard').classList.remove('on');
  viewer.classList.remove('carding');
  clearTimeout(V.cardTimer);
}
function show(i) {
  i = Math.max(0, Math.min(ENTRIES.length - 1, i));
  const e = ENTRIES[i];
  V.i = i;
  const token = ++V.token;
  clearTimeout(V.timer);

  // text
  $('#vcount').textContent = (i + 1) + ' of ' + ENTRIES.length;
  $('#vchap').textContent = CHAPTERS[e.ch].title;
  $('#vtime').textContent = whenLabel(e);
  $('#vtime').setAttribute('datetime', e.made);
  $('#vkind').textContent = KIND[e.kind] || e.kind;
  $('#vgroup').textContent = e.group || '';
  $('#vtext').textContent = e.caption;
  $('#vfile').textContent = e.file;
  $('#vopen').setAttribute('href', e.url);
  $('#vfill').style.width = ((i + 1) / ENTRIES.length * 100) + '%';
  $('#vprev').disabled = i === 0;
  $('#vnext').disabled = i === ENTRIES.length - 1;

  // chapter card while playing
  const newChapter = e.ch !== V.lastCh;
  V.lastCh = e.ch;
  V.extra = 0;
  if (V.playing && newChapter) { showCard(e.ch); V.extra = 1400; }
  else if (!V.playing) hideCard();

  // image
  V.flip ^= 1;
  const layer = layers[V.flip];
  const ready = () => {
    if (token !== V.token) return;
    layers.forEach((l) => l.classList.toggle('on', l === layer));
    layer.classList.remove('kb');
    const small = layer.naturalWidth > 0 && layer.naturalWidth < 900;
    layer.classList.toggle('small', small);
    if (small) { layer.style.setProperty('--nw', layer.naturalWidth); layer.style.setProperty('--nh', layer.naturalHeight); }
    if (V.playing && !reduceMq.matches && !isChartish(e)) {
      void layer.offsetWidth;
      layer.style.setProperty('--dur', (slideMs(e) + V.extra + 1500) + 'ms');
      layer.classList.add('kb');
    }
    schedule();
  };
  layer.alt = e.caption;
  if (layer.getAttribute('src') === e.url && layer.complete && layer.naturalWidth) ready();
  else { layer.onload = ready; layer.onerror = ready; layer.setAttribute('src', e.url); }

  const nx = ENTRIES[i + 1];
  if (nx) { const p = new Image(); p.src = nx.url; keep.push(p); if (keep.length > 4) keep.shift(); }
}
function step(d, auto) {
  const j = V.i + d;
  if (j < 0) return;
  if (j >= ENTRIES.length) { if (auto) endPlay(); return; }
  show(j);
}
function endPlay() {
  V.playing = false;
  clearTimeout(V.timer);
  viewer.classList.remove('playing', 'idle');
  syncPlayBtn('ended');
}
function setPlaying(on) {
  if (on === V.playing) return;
  V.playing = on;
  viewer.classList.toggle('playing', on);
  if (on) {
    bumpIdle();
    if (V.i >= ENTRIES.length - 1) { V.lastCh = -1; show(0); } else schedule();
  } else {
    clearTimeout(V.timer);
    clearTimeout(V.idleTimer);
    viewer.classList.remove('idle');
  }
  syncPlayBtn();
}
function bumpIdle() {
  viewer.classList.remove('idle');
  clearTimeout(V.idleTimer);
  if (V.playing) V.idleTimer = setTimeout(() => viewer.classList.add('idle'), 2800);
}
function openViewer(i, opts = {}) {
  if (!V.open) {
    V.opener = opts.opener || document.activeElement;
    V.open = true;
    viewer.hidden = false;
    try { page.inert = true; } catch (_) { /* older browsers */ }
    const sb = window.innerWidth - docEl.clientWidth;
    if (sb > 0) docEl.style.paddingRight = sb + 'px';
    docEl.classList.add('lock');
  }
  V.playing = !!opts.play;
  viewer.classList.toggle('playing', V.playing);
  V.lastCh = -1;
  syncPlayBtn();
  show(i);
  $('#vfs').hidden = !document.fullscreenEnabled;
  (V.playing ? vplay : $('#vclose')).focus({preventScroll: true});
  bumpIdle();
}
function closeViewer() {
  if (!V.open) return;
  V.open = false;
  V.playing = false;
  V.token++;
  clearTimeout(V.timer); clearTimeout(V.cardTimer); clearTimeout(V.idleTimer);
  viewer.hidden = true;
  viewer.classList.remove('playing', 'idle', 'carding');
  $('#vcard').classList.remove('on');
  try { page.inert = false; } catch (_) { /* ignore */ }
  docEl.classList.remove('lock');
  docEl.style.paddingRight = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const o = V.opener;
  V.opener = null;
  if (o && document.contains(o)) o.focus({preventScroll: true});
}
function toggleFs() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else viewer.requestFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { $('#vfs').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });

$('#vclose').addEventListener('click', closeViewer);
$('#vprev').addEventListener('click', () => step(-1));
$('#vnext').addEventListener('click', () => step(1));
$('#vfs').addEventListener('click', toggleFs);
vplay.addEventListener('click', () => {
  if (!V.playing && V.i >= ENTRIES.length - 1) { V.lastCh = -1; V.playing = true; viewer.classList.add('playing'); syncPlayBtn(); bumpIdle(); show(0); return; }
  setPlaying(!V.playing);
});
['pointermove', 'pointerdown'].forEach((t) => viewer.addEventListener(t, bumpIdle, {passive: true}));

function trapTab(ev) {
  const f = $$('button, a[href]', viewer).filter((n) => !n.hidden && !n.disabled && n.getClientRects().length);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1], cur = document.activeElement;
  if (!viewer.contains(cur)) { ev.preventDefault(); first.focus(); }
  else if (ev.shiftKey && cur === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && cur === last) { ev.preventDefault(); first.focus(); }
}
document.addEventListener('keydown', (ev) => {
  if (!V.open || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  bumpIdle();
  const k = ev.key;
  if (k === 'Escape') { ev.preventDefault(); closeViewer(); }
  else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown') { ev.preventDefault(); step(1); }
  else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { ev.preventDefault(); step(-1); }
  else if (k === 'Home') { ev.preventDefault(); show(0); }
  else if (k === 'End') { ev.preventDefault(); show(ENTRIES.length - 1); }
  else if (k === ' ' && !(ev.target instanceof HTMLButtonElement) && !(ev.target instanceof HTMLAnchorElement)) { ev.preventDefault(); vplay.click(); }
  else if (k === 'f' || k === 'F') { toggleFs(); }
  else if (k === 'Tab') trapTab(ev);
});

// swipe between images
(() => {
  const stage = $('#stage');
  let sx = 0, sy = 0, down = false;
  stage.addEventListener('pointerdown', (ev) => { down = true; sx = ev.clientX; sy = ev.clientY; });
  stage.addEventListener('pointerup', (ev) => {
    if (!down) return;
    down = false;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 80) step(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('pointercancel', () => { down = false; });
})();

window.__journey = {ENTRIES, CHAPTERS, HERO, open: openViewer, close: closeViewer, state: V};
})();
</script>
</body>
</html>
'''


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(OUT), help="output html path (default journey/index.html)")
    a = ap.parse_args()
    build(pathlib.Path(a.out))
