#!/usr/bin/env python3
"""Extract Hidden Match3 levels from the .psb sources into web assets.

Each levels/<Name>.psb is one level. Inside it every leaf layer whose name is a
number (1, 2, 3 ...) is one item type. If the same number appears on several
layers, those are rotation/pose variants of that item.

For each PSB it writes, under levels_assets/<Name>/:
  <n>.png                 trimmed sprite for item <n> (single)
  <n>_v0.png, <n>_v1.png  trimmed variant sprites (when item <n> has >1 layer)

and rebuilds levels-data.js  ->  window.HM3_LEVELS = [ {id,name,types:[...]}, ... ]
with sensible default gameplay metadata (visualScale 1, physicsScale .9).

The game (Demo.html) reads window.HM3_LEVELS at runtime, so editing a PSB +
re-running this script is all that's needed to change a level.

Requires: psd-tools, Pillow.   Usage:  python3 extract_levels.py
"""
import json
import re
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parent
LEVELS_DIR = ROOT / "levels"
OUT_DIR = ROOT / "levels_assets"

# Preferred display order (README order); anything else is appended alphabetically.
ORDER = ["Toy", "Toy_Rotation", "Sports", "Red", "Blue", "Badge", "Scale_Diff"]


def trim(im):
    """Crop fully-transparent margins."""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def leaf_items(psd):
    """Return {item_name: [PIL.Image, ...]} for numbered leaf layers, in order."""
    items = {}
    order = []

    def walk(layers):
        for l in layers:
            if l.is_group():
                walk(l)
                continue
            name = (l.name or "").strip()
            if not re.fullmatch(r"\d+", name):      # only numbered item layers
                continue
            try:
                img = l.composite()
            except Exception as e:
                print(f"   !! layer {name} composite failed: {e}")
                continue
            if img is None or img.size[0] == 0 or img.size[1] == 0:
                continue
            if name not in items:
                items[name] = []
                order.append(name)
            items[name].append(trim(img))

    walk(psd)
    # numeric order
    order.sort(key=lambda s: int(s))
    return [(n, items[n]) for n in order]


def display_name(stem):
    return stem.replace("_", " ")


def export_level(psb_path):
    stem = psb_path.stem                       # "Toy_Rotation"
    psd = PSDImage.open(str(psb_path))
    out = OUT_DIR / stem
    out.mkdir(parents=True, exist_ok=True)

    items = leaf_items(psd)
    types = []
    for name, imgs in items:
        item_id = f"{stem.lower()}_{name}"
        if len(imgs) == 1:
            fn = f"{name}.png"
            imgs[0].save(out / fn)
            asset = f"levels_assets/{stem}/{fn}"
            t = {"id": item_id, "name": name, "asset": asset,
                 "visualScale": 1.0, "physicsScale": 0.9}
        else:
            variants = []
            for i, im in enumerate(imgs):
                fn = f"{name}_v{i}.png"
                im.save(out / fn)
                variants.append(f"levels_assets/{stem}/{fn}")
            t = {"id": item_id, "name": name, "asset": variants[0],
                 "visualScale": 1.0, "physicsScale": 0.9, "variants": variants}
        types.append(t)

    level = {
        "id": "hm3_" + stem.lower(),
        "name": display_name(stem),
        "totalTriplets": max(9, len(types) * 9),   # multiple of 3, scales with item count
        "types": types,
    }
    print(f"  {stem}: {len(types)} item(s)"
          + (f"  (variants: {[n for n,i in items if len(i)>1]})" if any(len(i) > 1 for _, i in items) else ""))
    return level


def main():
    psbs = sorted(LEVELS_DIR.glob("*.psb"))
    if not psbs:
        print("No .psb files in", LEVELS_DIR)
        return
    by_stem = {p.stem: p for p in psbs}
    ordered = [by_stem[s] for s in ORDER if s in by_stem]
    ordered += [p for p in psbs if p.stem not in ORDER]

    print(f"Extracting {len(ordered)} level(s) -> {OUT_DIR}")
    levels = [export_level(p) for p in ordered]

    js = "window.HM3_LEVELS = " + json.dumps(levels, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "levels-data.js").write_text(js, encoding="utf-8")
    print(f"Wrote levels-data.js ({len(levels)} levels)")


if __name__ == "__main__":
    main()
