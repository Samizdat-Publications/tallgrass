"""Blind video critique with Gemini: upload a gameplay reel, ask for the same format the blind critic uses.

Usage: .venv/Scripts/python tools/gemini_video_review.py review/round-02/reel.mp4 [--model MODEL]
Picks the best available Gemini pro model from the live model list unless --model is given.
Writes <video>.gemini.md next to the video and logs the call to ASSETS.md.
"""
import argparse
import datetime
import json
import pathlib
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
GEM = "https://generativelanguage.googleapis.com"

PITCH = ("A living-ecosystem simulation game. Grass grows, grazers eat and multiply, predators hunt and multiply, and over "
         "thousands of generations the whole system finds its own balance: booming, crashing, recovering, and never quite settling "
         "into a flat line. The player is part nature-documentary viewer, part god: they can follow an individual animal's life, watch "
         "the population graphs, and step in with weather, disasters, or new species to see how the ecosystem responds. It should be "
         "beautiful enough to leave running on a second monitor and interesting enough to watch for an hour.")

PROMPT = f"""You are a sharp, experienced game reviewer and art director, with a working knowledge of real ecology. You know nothing about how this game was built and you don't care. You only know what it's supposed to be:

> {PITCH}

Watch this gameplay video (real-time play, then fast-forward). Critique it the way an honest reviewer would for a paying audience. Don't flatter and don't hedge. Be specific about what you see and when (timestamps). Judge motion, animation, camera work, pacing, readability and whether the ecosystem feels alive. Don't guess about tech or implementation.

Reply in exactly this format:

**First impression (2 sentences):** what you'd think scrolling past this on a store page.

**Scores (1 to 10):** Visual quality / Readability (can you tell what's happening?) / Sense of life and motion / Ecosystem believability / UI clarity / "Would I keep watching?"

**Top issues, ranked by how much fixing each would help:** up to 10. For each one: severity (critical / major / minor), what you see (with timestamps), why it hurts, and what you'd change.

**What's working:** up to 5 things, so they don't get lost in the fixes.

**The single change that would help most:** one sentence.
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
        return dict(resp.headers), json.loads(resp.read() or b"{}")


def pick_model(key):
    _, m = req("GET", f"{GEM}/v1beta/models?pageSize=200", {"x-goog-api-key": key})
    names = [x["name"].split("/")[-1] for x in m.get("models", []) if "generateContent" in x.get("supportedGenerationMethods", [])]
    pros = sorted([n for n in names if "pro" in n and "image" not in n and "tts" not in n and "customtools" not in n], reverse=True)
    for pref in ("gemini-3.1-pro-preview", "gemini-pro-latest"):
        if pref in names:
            return pref
    return pros[0] if pros else "gemini-3.8-flash"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--model")
    # Gemini samples video at 1 frame per second unless told otherwise, which hides every gait cycle (DAY-PLAN.md): default 8 fps.
    # Keep reels at about 40 s or less at 8 fps (token cost grows with frames); 0 sends no setting (the API default).
    ap.add_argument("--fps", type=float, default=8.0)
    a = ap.parse_args()
    key = env()["GEMINI_API_KEY"]
    model = a.model or pick_model(key)
    vid = pathlib.Path(a.video)
    data = vid.read_bytes()
    h, _ = req("POST", f"{GEM}/upload/v1beta/files", {
        "x-goog-api-key": key, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(data)), "X-Goog-Upload-Header-Content-Type": "video/mp4",
        "Content-Type": "application/json"}, {"file": {"display_name": vid.name}})
    up = {k.lower(): v for k, v in h.items()}["x-goog-upload-url"]
    _, f = req("POST", up, {"Content-Length": str(len(data)), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"}, data)
    info = f["file"]
    for _ in range(90):
        if info.get("state") == "ACTIVE":
            break
        time.sleep(3)
        _, info = req("GET", f"{GEM}/v1beta/{info['name']}", {"x-goog-api-key": key})
    _, r = req("POST", f"{GEM}/v1beta/models/{model}:generateContent", {"x-goog-api-key": key, "Content-Type": "application/json"}, {
        "contents": [{"parts": [dict({"file_data": {"mime_type": "video/mp4", "file_uri": info["uri"]}},
                                     **({"video_metadata": {"fps": a.fps}} if a.fps > 0 else {})), {"text": PROMPT}]}]}, timeout=600)
    text = "".join(p.get("text", "") for p in r["candidates"][0]["content"]["parts"])
    outp = vid.with_suffix(".gemini.md")
    outp.write_text(f"# Gemini video critique ({model}, {a.fps:g} fps sampling, {datetime.datetime.now():%Y-%m-%d %H:%M})\n\nVideo: {vid.name}\n\n{text}\n", encoding="utf-8")
    try:
        req("DELETE", f"{GEM}/v1beta/{info['name']}", {"x-goog-api-key": key})
    except Exception:
        pass
    with open(ROOT / "ASSETS.md", "r", encoding="utf-8") as fh:
        assets = fh.read()
    row = f"| {datetime.datetime.now():%m-%d %H:%M} | Gemini `{model}` | blind video critique of {vid.name} ({len(data) // 1024} KB) | 1 call | ~$0.05 |\n"
    assets = assets.replace("\n\n## Downloaded third-party assets", "\n" + row + "\n## Downloaded third-party assets", 1)
    (ROOT / "ASSETS.md").write_text(assets, encoding="utf-8")
    print("saved", outp)


if __name__ == "__main__":
    main()
