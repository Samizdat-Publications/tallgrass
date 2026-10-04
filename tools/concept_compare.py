"""Compare a build still against the concept art with Gemini (vision), score the match and list what to change.

Usage: .venv/Scripts/python tools/concept_compare.py <still.jpg> [--concept art/concept/00_prairie_golden_hour.jpg] [--model MODEL]
Picks the best available Gemini "pro" text model from the live model list unless --model is given.
Writes <still>.concept.md next to the still (still filename + ".concept.md"), prints the overall score,
and logs the call to ASSETS.md.
"""
import argparse
import base64
import datetime
import json
import mimetypes
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEM = "https://generativelanguage.googleapis.com"
CRITERIA = ["light", "palette", "haze", "water", "trees", "grass", "composition"]

PROMPT = """You are a sharp art director comparing a game build against its target concept art.

You get two images. IMAGE 1 is the CONCEPT ART: the look the game is trying to reach. IMAGE 2 is a SCREENSHOT OF THE BUILD, captured from the same kind of view (a creek bend with cottonwood groves, high oblique drone angle, low sun from the left, late summer, golden hour). Ignore the animals and any UI; judge the landscape rendering only.

Score how closely the BUILD matches the CONCEPT on each criterion, as an integer from 1 (nothing alike) to 10 (indistinguishable):
- light: sun direction, warmth, rim light, long soft shadows, contrast
- palette: overall color range, golden grass versus green, saturation, shadow tint
- haze: atmospheric depth, dust and glow in the air, distance falloff, sun bloom
- water: the creek's color, reflectivity, width, glints, banks
- trees: cottonwood shape, leaf color and volume, grove clustering, scale and shading
- grass: texture, blade detail, wind-swept streaks, color variety on the slopes
- composition: framing, camera height and angle, depth layering, where the eye goes

Then give an overall match score (1 to 10) and the top 5 concrete differences, most impactful first. Each difference must say what you see in the build versus the concept and what the build should change to match (a specific, actionable rendering change, for example "raise the grass cured color toward ochre" rather than "make it prettier"). Do not guess at implementation details you cannot see.

Reply with JSON only, exactly this shape:
{"scores": {"light": 0, "palette": 0, "haze": 0, "water": 0, "trees": 0, "grass": 0, "composition": 0}, "overall": 0, "summary": "two sentences", "differences": [{"area": "light|palette|haze|water|trees|grass|composition", "concept": "what the concept shows", "build": "what the build shows", "change": "what to change in the build"}]}
"""


def env():
    out = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def req(method, url, headers, body=None, timeout=300):
    data = body if isinstance(body, (bytes, bytearray)) or body is None else json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read() or b"{}")


def pick_model(key):
    m = req("GET", f"{GEM}/v1beta/models?pageSize=200", {"x-goog-api-key": key}, timeout=60)
    names = [x["name"].split("/")[-1] for x in m.get("models", []) if "generateContent" in x.get("supportedGenerationMethods", [])]
    pros = sorted([n for n in names if "pro" in n and "image" not in n and "tts" not in n and "customtools" not in n], reverse=True)
    for pref in ("gemini-3.1-pro-preview", "gemini-pro-latest"):
        if pref in names:
            return pref
    return pros[0] if pros else "gemini-3.8-flash"


def inline(path):
    mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(path.read_bytes()).decode()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("still")
    ap.add_argument("--concept", default=str(ROOT / "art" / "concept" / "00_prairie_golden_hour.jpg"))
    ap.add_argument("--model")
    a = ap.parse_args()
    still = pathlib.Path(a.still)
    concept = pathlib.Path(a.concept)
    for p in (still, concept):
        if not p.is_file():
            sys.exit(f"missing image: {p}")
    key = env()["GEMINI_API_KEY"]
    model = a.model or pick_model(key)
    body = {
        "contents": [{"parts": [
            {"text": "IMAGE 1: the concept art (the target look)."}, inline(concept),
            {"text": "IMAGE 2: a screenshot of the build."}, inline(still),
            {"text": PROMPT}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.3},
    }
    r = req("POST", f"{GEM}/v1beta/models/{model}:generateContent", {"x-goog-api-key": key, "Content-Type": "application/json"}, body, timeout=300)
    text = "".join(p.get("text", "") for p in r["candidates"][0]["content"]["parts"])
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    scores = data.get("scores", {})
    overall = data.get("overall")
    lines = [
        f"# Concept match ({model}, {datetime.datetime.now():%Y-%m-%d %H:%M})",
        "",
        f"Build still: `{still.name}`  ",
        f"Concept: `{concept.name}`",
        "",
        f"**Overall match: {overall} / 10**",
        "",
        data.get("summary", ""),
        "",
        "| Criterion | Score (1-10) |",
        "|---|---|",
    ]
    for c in CRITERIA:
        lines.append(f"| {c} | {scores.get(c, '?')} |")
    lines.append(f"| **overall** | **{overall}** |")
    lines += ["", "## Top differences (what the build should change)", ""]
    for i, d in enumerate(data.get("differences", [])[:5], 1):
        lines += [f"{i}. **{d.get('area', '')}**",
                  f"   - Concept: {d.get('concept', '')}",
                  f"   - Build: {d.get('build', '')}",
                  f"   - Change: {d.get('change', '')}"]
    out = still.with_name(still.name + ".concept.md")
    out.write_text("\n".join(lines).replace(chr(0x2014), "-").replace(chr(0x2013), "-") + "\n", encoding="utf-8")
    with open(ROOT / "ASSETS.md", "r", encoding="utf-8") as fh:
        assets = fh.read()
    row = f"| {datetime.datetime.now():%m-%d %H:%M} | Gemini `{model}` | concept compare of {still.name} vs {concept.name} (2 images, JSON) | 1 call | ~$0.01 |\n"
    assets = assets.replace("\n\n## Downloaded third-party assets", "\n" + row + "\n## Downloaded third-party assets", 1)
    (ROOT / "ASSETS.md").write_text(assets, encoding="utf-8")
    print("saved", out)
    print("overall", overall)


if __name__ == "__main__":
    main()
