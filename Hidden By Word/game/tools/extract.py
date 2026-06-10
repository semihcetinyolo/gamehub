#!/usr/bin/env python3
"""Extract the "Hidden By Word" .psb into web assets for the playable.

PSB structure (Terrace):
  BG                         full-canvas clean background (bottom layer)
  h1-h20 / h21-h30 / ...     GROUPS, each holding the hidden items for that band
    hN/Name                  one hidden item: number N + display name "Name"
                             (a couple are mislabelled, e.g. "h/3Kite" -> 3 / Kite;
                              the parser tolerates that)

There are no shadow ('s') or foreground ('m') layers in this file — every item
is a clean cut-out drawn on top of the clean BG plate, so fading a found item
reveals the background beneath it.

Outputs under game/assets/:
  bg.jpg, hN.png, manifest.json   (normalized bboxes + display names + groups)

Usage:  python3 tools/extract.py [path/to.psb]
Requires: psd-tools, Pillow.
"""
import json, re, sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

PSB = Path(sys.argv[1]) if len(sys.argv) > 1 else \
      Path(__file__).resolve().parents[2] / "levels" / "HBW - Terrace 2.psb"
OUT = Path(__file__).resolve().parents[1] / "assets"

BG_SIZE    = 2048   # native canvas size
ITEM_SCALE = 1.0    # full native res so items stay crisp when zoomed in


def parse_item(name):
    """'h1/Watering Can' -> (1, 'Watering Can'); 'h/3Kite' -> (3, 'Kite').
    Returns None for non-item layers."""
    if not re.match(r'^\s*h', name, re.I):
        return None
    m = re.search(r'(\d+)', name)
    if not m:
        return None
    num = int(m.group(1))
    display = name[m.end():].strip(' /').strip()
    # if the name slipped before the number (e.g. 'h/3Kite'), salvage trailing text
    if not display:
        display = re.sub(r'^\s*h\s*/?\s*\d*\s*', '', name, flags=re.I).strip(' /').strip()
    return num, display


def main():
    psd = PSDImage.open(str(PSB))
    canvas = psd.width
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()

    def norm(bbox):
        l, t, r, b = bbox
        return {"x": l / canvas, "y": t / canvas, "w": (r - l) / canvas, "h": (b - t) / canvas}

    manifest = {"canvas": canvas, "items": {}, "groups": {}, "order": []}

    z = 0  # global bottom->top stack index; higher = drawn on top
    for layer in psd:                      # top-level, bottom -> top
        if layer.name.strip().upper() == "BG":
            layer.composite().convert("RGB").resize((BG_SIZE, BG_SIZE), Image.LANCZOS)\
                 .save(OUT / "bg.jpg", quality=88)
            z += 1
            continue

        if layer.kind == "group":
            gname = layer.name.strip()
            manifest["groups"].setdefault(gname, [])
            for child in layer:            # items within the band, bottom -> top
                z += 1
                parsed = parse_item(child.name)
                if not parsed:
                    continue
                num, display = parsed
                img = child.composite()
                img.resize((max(1, int(img.width * ITEM_SCALE)),
                            max(1, int(img.height * ITEM_SCALE))), Image.LANCZOS)\
                   .save(OUT / f"h{num}.png")
                rec = norm(child.bbox)
                rec["z"] = z
                rec["name"] = display
                rec["group"] = gname
                manifest["items"][f"h{num}"] = rec
                manifest["groups"][gname].append(num)
                manifest["order"].append(f"h{num}")
                print(f"  h{num:<3} {display:<22} group={gname}")
        else:
            z += 1

    for g in manifest["groups"]:
        manifest["groups"][g].sort()

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"\ndone: {len(manifest['items'])} items, "
          f"{len(manifest['groups'])} groups -> {OUT}")


if __name__ == "__main__":
    main()
