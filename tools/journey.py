"""Keep a permanent, timestamped record of every image made during development.

Owner ruling (2026-10-03): every generated image (concept art, review stills, captures,
charts worth keeping) goes into journey/ so we can later cut a progression video or a
landing page from it.

Usage:
  .venv/Scripts/python tools/journey.py <image> <tag> "<caption>" [--kind concept|still|chart|ui|asset]

Copies the image to journey/<YYYYMMDD-HHMMSS>_<kind>_<tag>.<ext> (JPGs and PNGs are kept as-is
unless larger than 2.5 MB, in which case a 1920px-wide JPG is written instead) and appends a
row to journey/INDEX.md. Never deletes anything.
"""
import argparse
import datetime
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
J = ROOT / "journey"
INDEX = J / "INDEX.md"
MAX_BYTES = 2_500_000


def add(src: pathlib.Path, tag: str, caption: str, kind: str = "still") -> pathlib.Path:
    J.mkdir(exist_ok=True)
    if not INDEX.exists():
        INDEX.write_text("# Journey: every image made while building Tallgrass\n\n"
                         "Chronological. Use this to cut a progression video or landing page.\n\n"
                         "| When | Kind | File | Caption | Source |\n|---|---|---|---|---|\n", encoding="utf-8")
    now = datetime.datetime.now()
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in tag)[:48]
    ext = src.suffix.lower()
    dst = J / f"{now:%Y%m%d-%H%M%S}_{kind}_{safe}{ext}"
    if src.stat().st_size > MAX_BYTES:
        dst = dst.with_suffix(".jpg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", "scale='min(1920,iw)':-2",
                        "-q:v", "3", str(dst)], check=True, timeout=60)
    else:
        shutil.copy2(src, dst)
    try:
        rel_src = src.resolve().relative_to(ROOT)
    except ValueError:
        rel_src = src.name
    with open(INDEX, "a", encoding="utf-8") as f:
        f.write(f"| {now:%Y-%m-%d %H:%M} | {kind} | [{dst.name}]({dst.name}) | {caption.replace('|', '/')} | {rel_src} |\n")
    return dst


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("tag")
    ap.add_argument("caption")
    ap.add_argument("--kind", default="still", choices=["concept", "still", "chart", "ui", "asset", "video"])
    a = ap.parse_args()
    print(add(pathlib.Path(a.image), a.tag, a.caption, a.kind))
