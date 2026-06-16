#!/usr/bin/env python3
"""Extract a layered sticker-placement .psb into web assets for the playable.

Layer convention (bottom -> top):
  bg                  full-canvas background (bottom layer)
  slots               the "empty slot" guide drawn over the bg — silhouettes /
                      outlines showing where every sticker belongs
  stickers            a group holding the sticker layers, each named "si"
    si                one sticker, positioned at its true home on the canvas

All sticker layers share the name "si"; they are told apart by stack order and
by their bbox (which IS the slot the player must drop them onto). The game shows
bg + slots, hands the player 3 stickers at a time, and they drag each onto its
matching silhouette.

Outputs under game/assets/<level>/:
  bg.jpg, slots.png, s1.png .. sN.png, manifest.json

<level> is the PSB filename stem (the level files are named 0001, 0002).

Usage:
  python3 tools/extract.py                # every level file in ../levels
  python3 tools/extract.py ../levels/0001 # one level
Requires: psd-tools, Pillow.
"""
import json, sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

LEVELS_DIR = Path(__file__).resolve().parents[2] / "levels"
ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"

BG_SIZE = 2048        # longest side of the exported bg/slots images
STICKER_MAX = 1024    # cap a single sticker's longest side (keeps PNGs sane)

is_named = lambda layer, name: layer.name.strip().lower() == name


def export(layer, path, size_cap, mode):
    """Composite a layer, downscale so its longest side <= size_cap, save."""
    img = layer.composite()
    if mode == "RGB":
        img = img.convert("RGB")
    longest = max(img.width, img.height)
    if longest > size_cap:
        s = size_cap / longest
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    if mode == "RGB":
        img.save(path, quality=88)
    else:
        img.save(path)


def process(psb_path):
    psd = PSDImage.open(str(psb_path))
    level = psb_path.stem
    out = ASSETS_DIR / level
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()

    cw, ch = psd.width, psd.height

    def norm(bbox):
        l, t, r, b = bbox
        return {"x": l / cw, "y": t / ch, "w": (r - l) / cw, "h": (b - t) / ch}

    def empty(bbox):
        l, t, r, b = bbox
        return (r - l) <= 0 or (b - t) <= 0

    top = list(psd)  # bottom -> top
    bg_layer    = next((l for l in top if is_named(l, "bg")), None)
    slots_layer = next((l for l in top if is_named(l, "slots")), None)
    group       = next((l for l in top if l.is_group()), None)
    if group is None:
        # stickers might sit ungrouped at the top level
        stickers = [l for l in top if is_named(l, "si")]
    else:
        stickers = [l for l in group if is_named(l, "si")]

    # z = paint order across the whole stack (bottom..top). bg=0, slots next,
    # then each sticker — so placed stickers overlap exactly as in the PSB.
    z = 0
    manifest = {"level": level, "canvas": cw, "frameAspect": cw / ch,
                "bg": None, "slots": None, "stickers": []}

    if bg_layer is not None and not empty(bg_layer.bbox):
        export(bg_layer, out / "bg.jpg", BG_SIZE, "RGB")
        manifest["bg"] = norm(bg_layer.bbox)
    else:
        manifest["bg"] = {"x": 0, "y": 0, "w": 1, "h": 1}
    manifest["bg"]["z"] = z; z += 1

    if slots_layer is not None and not empty(slots_layer.bbox):
        export(slots_layer, out / "slots.png", BG_SIZE, "RGBA")
        s = norm(slots_layer.bbox); s["z"] = z; manifest["slots"] = s
    z += 1

    for i, layer in enumerate(stickers, start=1):
        if empty(layer.bbox):
            continue
        export(layer, out / f"s{i}.png", STICKER_MAX, "RGBA")
        rec = norm(layer.bbox)
        rec["file"] = f"s{i}.png"
        rec["z"] = z; z += 1
        manifest["stickers"].append(rec)

    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"done [{level}]: {len(manifest['stickers'])} stickers, "
          f"slots={'yes' if manifest['slots'] else 'NONE'} -> {out}")


def main():
    if len(sys.argv) > 1:
        targets = [Path(p) for p in sys.argv[1:]]
    else:
        targets = []
        for p in sorted(LEVELS_DIR.iterdir()):
            if p.is_dir() or p.name.startswith("."):
                continue
            try:
                with open(p, "rb") as f:
                    if f.read(4) == b"8BPS":
                        targets.append(p)
            except OSError:
                pass
    if not targets:
        print("no PSB level files found in", LEVELS_DIR)
        return
    for t in targets:
        process(t)


if __name__ == "__main__":
    main()
