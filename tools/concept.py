"""Generate a concept image with Gemini (Nano Banana). Logs to ASSETS.md and journey/.
Usage: .venv/Scripts/python tools/concept.py <name> "<prompt>"
"""
import base64, datetime, json, pathlib, sys, urllib.request, subprocess
ROOT = pathlib.Path(__file__).resolve().parent.parent
key = [l.split("=", 1)[1].strip() for l in (ROOT / ".env").read_text().splitlines() if l.startswith("GEMINI_API_KEY=")][0]
name, prompt = sys.argv[1], sys.argv[2]
model = "gemini-3-pro-image"
body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]}}
r = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", data=json.dumps(body).encode(),
                           headers={"x-goog-api-key": key, "Content-Type": "application/json"}, method="POST")
res = json.loads(urllib.request.urlopen(r, timeout=300).read())
out = None
for part in res["candidates"][0]["content"]["parts"]:
    d = part.get("inlineData") or part.get("inline_data")
    if d:
        out = ROOT / "art" / "concept" / f"{name}.jpg"
        out.write_bytes(base64.b64decode(d["data"]))
if not out:
    sys.exit("no image returned")
assets = (ROOT / "ASSETS.md").read_text(encoding="utf-8")
row = f"| {datetime.datetime.now():%m-%d %H:%M} | Gemini `{model}` | concept art: {name} -> art/concept/{name}.jpg | 1 image | ~$0.13 |\n"
assets = assets.replace("\n\n## Downloaded third-party assets", "\n" + row + "\n## Downloaded third-party assets", 1)
(ROOT / "ASSETS.md").write_text(assets, encoding="utf-8")
subprocess.run([sys.executable, str(ROOT / "tools" / "journey.py"), str(out), name, f"Concept art: {prompt[:140]}", "--kind", "concept"], check=True)
print("saved", out)
