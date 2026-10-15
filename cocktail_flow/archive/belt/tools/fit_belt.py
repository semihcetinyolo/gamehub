#!/usr/bin/env python3
"""Fit generated belt art (assets/raw/belt_v1.png ...) for the game.

Trims the transparent margin around the loop, then scales it to the size of
that view's template (assets/wireframes/*_belt_<view>_template_WxH.png) and
writes assets/img/<same name>. The game stretches it over the loop's box, so
only the outline has to match the template.

Run:  python3 tools/fit_belt.py
"""
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW, IMG, WIRE = ROOT / "assets" / "raw", ROOT / "assets" / "img", ROOT / "assets" / "wireframes"


def template_size(view):
    for f in WIRE.glob(f"*_belt_{view}_template_*.png"):
        m = re.search(r"_(\d+)x(\d+)\.png$", f.name)
        if m:
            return int(m.group(1)), int(m.group(2))
    return None


def main():
    done = 0
    for src in sorted(RAW.glob("belt_v*.png")):
        view = re.match(r"belt_(v\d)", src.stem).group(1)
        size = template_size(view)
        if not size:
            print(f"! {src.name}: no template for {view} (run tools/wireframes.js)")
            continue
        im = Image.open(src).convert("RGBA")
        box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if box:
            im = im.crop(box)
        w, h = im.size
        if abs(w / h - size[0] / size[1]) > 0.08:
            print(f"  {src.name}: shape {w}x{h} differs from the template {size[0]}x{size[1]}, it will be stretched")
        im.resize(size, Image.LANCZOS).save(IMG / src.name)
        print(f"  {src.name} -> assets/img/{src.name} {size[0]}x{size[1]}")
        done += 1
    print(f"{done} belt image(s) written" if done else "no assets/raw/belt_v*.png found")


if __name__ == "__main__":
    main()
