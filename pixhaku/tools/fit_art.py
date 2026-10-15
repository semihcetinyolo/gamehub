#!/usr/bin/env python3
"""Fit each level's existing picture to its new board (tools/puzzles/<id>.json).

A board keeps its picture's proportions within 7%, so the picture is centre-cropped to the
board's exact aspect ratio and saved under the name build_pack.js expects:
assets/levels/<id>.jpg for square boards, <id>-<cols>x<rows>.jpg for the others.
Existing files are left alone; no picture is redrawn.

Usage: python3 tools/fit_art.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets" / "levels"


def art_name(level_id, cols, rows):
    return f"{level_id}.jpg" if cols == rows else f"{level_id}-{cols}x{rows}.jpg"


def main():
    made = 0
    for path in sorted((ROOT / "tools" / "puzzles").glob("*.json")):
        level = json.loads(path.read_text())
        cols, rows = level["spec"]["cols"], level["spec"]["rows"]
        target = ART / art_name(level["id"], cols, rows)
        if target.exists():
            continue
        source = ART / art_name(level["id"], *level["art"])
        if not source.exists():
            print(f"  {level['id']}: no picture at {source.name}")
            continue
        img = Image.open(source).convert("RGB")
        want = rows / cols
        if img.height / img.width > want:
            h = round(img.width * want)
            box = (0, (img.height - h) // 2, img.width, (img.height - h) // 2 + h)
        else:
            w = round(img.height / want)
            box = ((img.width - w) // 2, 0, (img.width - w) // 2 + w, img.height)
        img.crop(box).resize((1024, round(1024 * want)), Image.LANCZOS).save(target, quality=92)
        made += 1
        print(f"  {target.name}  from {source.name}")
    print(f"{made} pictures fitted")


if __name__ == "__main__":
    main()
