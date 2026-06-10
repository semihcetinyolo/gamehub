#!/usr/bin/env python3
"""Extract a layered "Find The Cat" .psb into web assets for the playable.

Layer naming (this game is simpler than the triple-match build):
  Background        full-canvas background (bottom layer)
  Cats              a group whose children are each named "cat" — one hidden cat
                    per layer (clean cut-out). Stack order = draw/hit order.

Each level lands in its own folder under game/assets/<slug>/:
  bg.jpg, cat0.png .. catN.png, manifest.json   (normalized bboxes + z)

Usage:  python3 tools/extract.py [path/to.psb] [slug]
        slug defaults to the .psb filename stem (e.g. 0003.psb -> "0003").
Requires: psd-tools, Pillow.
"""
import json, re, sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

PSB = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "levels" / "0002psb"
SLUG = sys.argv[2] if len(sys.argv) > 2 else re.sub(r'\.psb$', '', PSB.name)
OUT = Path(__file__).resolve().parents[1] / "assets" / SLUG

BG_SIZE = 3072      # downscaled background (the scene art doesn't need 4096)
CAT_SCALE = 1.0     # full native res so cats stay crisp when zoomed in


def main():
    psd = PSDImage.open(str(PSB))
    canvas = psd.width
    layers = list(psd)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()

    def norm(bbox):
        l, t, r, b = bbox
        return {"x": l / canvas, "y": t / canvas, "w": (r - l) / canvas, "h": (b - t) / canvas}

    def empty(bbox):
        l, t, r, b = bbox
        return (r - l) <= 0 or (b - t) <= 0

    # ---- background ----
    bg_layer = None
    for l in layers:
        if l.name.lower() in ("background", "bg"):
            bg_layer = l
            break
    if bg_layer is None:
        # fall back to the first non-group layer
        bg_layer = next((l for l in layers if not l.is_group()), None)
    if bg_layer is not None:
        (bg_layer.composite().convert("RGB")
            .resize((BG_SIZE, BG_SIZE), Image.LANCZOS)
            .save(OUT / "bg.jpg", quality=85))

    # ---- cats ----
    cat_layers = []
    for l in layers:
        if l.is_group() and l.name.lower() in ("cats", "cat"):
            cat_layers = [c for c in l if c.name.lower() == "cat" and not empty(c.bbox)]
            break
    if not cat_layers:
        # no group? treat every "cat"-named top-level layer as a cat
        cat_layers = [l for l in layers if l.name.lower() == "cat" and not empty(l.bbox)]

    # z = position in the (bottom->top) stack; higher draws on top and is hit first.
    manifest = {"canvas": canvas, "cats": []}
    for k, c in enumerate(cat_layers):
        img = c.composite()
        img.resize((max(1, int(img.width * CAT_SCALE)), max(1, int(img.height * CAT_SCALE))),
                   Image.LANCZOS).save(OUT / f"cat{k}.png")
        rec = norm(c.bbox)
        rec["z"] = k + 1            # all cats sit above the background (z 0)
        rec["file"] = f"cat{k}.png"
        manifest["cats"].append(rec)

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"done [{SLUG}]: {len(manifest['cats'])} cats -> {OUT}")


if __name__ == "__main__":
    main()
