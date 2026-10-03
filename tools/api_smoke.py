"""Phase 0 API smoke test. One cheap call per service. Never prints keys.

Usage: .venv/Scripts/python tools/api_smoke.py [gemini|eleven|meshy|sketchfab|all]
Writes small outputs to scratch/api_smoke/.
"""
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request
import base64

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "scratch" / "api_smoke"
OUT.mkdir(parents=True, exist_ok=True)


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


ENV = load_env()


def req(method, url, headers=None, body=None, raw=False, timeout=120):
    data = None
    if body is not None:
        data = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            content = resp.read()
            return resp.status, dict(resp.headers), (content if raw else json.loads(content or b"{}"))
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors="replace")[:400]
        return e.code, dict(e.headers), {"error": txt}


GEM = "https://generativelanguage.googleapis.com"


def gemini():
    key = ENV["GEMINI_API_KEY"]
    h = {"x-goog-api-key": key, "Content-Type": "application/json"}
    st, _, models = req("GET", f"{GEM}/v1beta/models?pageSize=200", h)
    print("[gemini] list models:", st)
    names = [m["name"].split("/")[-1] for m in models.get("models", [])]
    (OUT / "gemini_models.json").write_text(json.dumps(models, indent=1))
    print("[gemini] models:", ", ".join(n for n in names if "gemini" in n or "imagen" in n or "veo" in n))

    def pick(pred, prefs):
        cands = [n for n in names if pred(n)]
        for p in prefs:
            for c in cands:
                if c == p:
                    return c
        return cands[0] if cands else None

    text_model = pick(lambda n: n.startswith("gemini") and "image" not in n and "tts" not in n and "embedding" not in n and "live" not in n and "audio" not in n,
                      [os.environ.get("GEMINI_TEXT_MODEL", ""), "gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-3.8-flash", "gemini-2.5-flash"])
    img_model = pick(lambda n: "image" in n and n.startswith("gemini"),
                     ["gemini-3-pro-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"])
    print("[gemini] chosen text model:", text_model, "| image model:", img_model)

    st, _, r = req("POST", f"{GEM}/v1beta/models/{text_model}:generateContent", h,
                   {"contents": [{"parts": [{"text": "Reply with exactly: TALLGRASS_OK"}]}]})
    txt = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", r.get("error"))
    print("[gemini] text:", st, repr(str(txt)[:80]))

    if os.environ.get("SKIP_IMAGE"):
        prompt = None
    # Image: real concept-art prompt so the call is useful, not wasted.
    prompt = ("Concept art for a nature-simulation video game. Aerial drone shot at golden hour over a vast "
              "North American tallgrass prairie with rolling hills, a winding creek lined with cottonwoods, a herd "
              "of bison kicking up dust, and a small wolf pack shadowing them from a ridge. Wind ripples through "
              "the grass. Warm low sun, long shadows, soft atmospheric haze, painterly but grounded, cinematic. 16:9.")
    st, _, r = (0, None, {}) if os.environ.get("SKIP_IMAGE") else req("POST", f"{GEM}/v1beta/models/{img_model}:generateContent", h,
                   {"contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]}}, timeout=240)
    saved = False
    for part in r.get("candidates", [{}])[0].get("content", {}).get("parts", []) if st == 200 else []:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline:
            ext = "png" if "png" in inline.get("mimeType", inline.get("mime_type", "")) else "jpg"
            p = OUT / f"concept_smoke.{ext}"
            p.write_bytes(base64.b64decode(inline["data"]))
            print("[gemini] image saved:", p.name, p.stat().st_size, "bytes")
            saved = True
    if not saved:
        print("[gemini] image FAILED:", st, str(r.get("error", r))[:300])

    # Video upload + understanding with a 2 s test clip.
    clip = OUT / "smoke.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=15", "-t", "2",
                    "-pix_fmt", "yuv420p", str(clip)], check=True, timeout=60)
    data = clip.read_bytes()
    st, hdrs, _ = req("POST", f"{GEM}/upload/v1beta/files", {
        "x-goog-api-key": key, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(data)), "X-Goog-Upload-Header-Content-Type": "video/mp4",
        "Content-Type": "application/json"}, {"file": {"display_name": "tallgrass_smoke"}})
    up_url = {k.lower(): v for k, v in hdrs.items()}.get("x-goog-upload-url")
    st, _, f = req("POST", up_url, {"Content-Length": str(len(data)), "X-Goog-Upload-Offset": "0",
                                    "X-Goog-Upload-Command": "upload, finalize"}, data)
    finfo = f.get("file", {})
    print("[gemini] video upload:", st, finfo.get("state"), finfo.get("name"))
    for _ in range(30):
        if finfo.get("state") == "ACTIVE":
            break
        time.sleep(2)
        _, _, finfo = req("GET", f"{GEM}/v1beta/{finfo['name']}", h)
    st, _, r = req("POST", f"{GEM}/v1beta/models/{text_model}:generateContent", h, {"contents": [{"parts": [
        {"file_data": {"mime_type": "video/mp4", "file_uri": finfo.get("uri")}},
        {"text": "In under 15 words, what does this video show?"}]}]})
    txt = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", r.get("error"))
    print("[gemini] video understanding:", st, repr(str(txt)[:120]))
    req("DELETE", f"{GEM}/v1beta/{finfo['name']}", h)


def eleven():
    h = {"xi-api-key": ENV["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    st, _, sub = req("GET", "https://api.elevenlabs.io/v1/user/subscription", h)
    if st == 200:
        print("[eleven] subscription:", st, sub.get("tier"), "chars used/limit:", sub.get("character_count"), "/", sub.get("character_limit"))
    else:
        print("[eleven] subscription:", st, str(sub)[:200])
    st, _, audio = req("POST", "https://api.elevenlabs.io/v1/sound-generation", h,
                       {"text": "Gentle wind moving through tall prairie grass, distant meadowlark, calm open landscape ambience",
                        "duration_seconds": 4, "prompt_influence": 0.4}, raw=True)
    if st == 200:
        p = OUT / "eleven_smoke_wind.mp3"
        p.write_bytes(audio)
        print("[eleven] sfx saved:", p.name, len(audio), "bytes")
    else:
        print("[eleven] sfx FAILED:", st, audio[:300] if isinstance(audio, bytes) else audio)


def meshy():
    h = {"Authorization": f"Bearer {ENV['MESHY_API_KEY']}"}
    st, _, r = req("GET", "https://api.meshy.ai/openapi/v1/balance", h)
    print("[meshy] balance:", st, r)


def sketchfab():
    h = {"Authorization": f"Token {ENV['SKETCHFAB_TOKEN']}"}
    st, _, me = req("GET", "https://api.sketchfab.com/v3/me", h)
    print("[sketchfab] me:", st, me.get("username") if st == 200 else me)
    st, _, s = req("GET", "https://api.sketchfab.com/v3/search?type=models&q=bison&downloadable=true&license=cc0&count=5", h)
    res = s.get("results", [])
    print("[sketchfab] CC0 bison search:", st, len(res), "results:", [x.get("name") for x in res][:5])


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    for name, fn in [("gemini", gemini), ("eleven", eleven), ("meshy", meshy), ("sketchfab", sketchfab)]:
        if which in ("all", name):
            try:
                fn()
            except Exception as e:  # keep going so one failure doesn't hide others
                print(f"[{name}] EXCEPTION:", type(e).__name__, str(e)[:300])
