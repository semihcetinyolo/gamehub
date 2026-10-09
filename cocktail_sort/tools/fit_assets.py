#!/usr/bin/env python3
"""Fit raw image-model output to the exact sizes the game expects.

Put the PNGs from Astra in assets/raw/ (named as in assets/ASTRA_PROMPTS.md),
then run:  python3 tools/fit_assets.py
Results go to assets/img/. Already-correct files are copied as they are.

  bottle*, mixer*  trim transparent margin, stretch to 400x860 (silhouette fills the canvas)
  customer_*       trim, fit into 512x512, bottom-centred (shoulders on the bottom edge)
  icons            trim, fit into 208x208, centred on 256x256
  win/lose art     trim, fit into 600x400, centred
  bg_*             cover-crop to 1080x1920 (centre)
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "assets" / "img"
ICONS = {"heart_full", "heart_empty", "clock", "coin", "check_badge", "icon_pause"}


def trim(im):
    box = im.getchannel("A").getbbox()
    return im.crop(box) if box else im


def fit(im, w, h, anchor="center"):
    im = trim(im)
    s = min(w / im.width, h / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = (w - im.width) // 2
    y = h - im.height if anchor == "bottom" else (h - im.height) // 2
    canvas.paste(im, (x, y), im)
    return canvas


def cover(im, w, h):
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def process(src):
    name = src.stem
    im = Image.open(src)
    if name.startswith("bg_"):
        return cover(im.convert("RGB"), 1080, 1920)
    im = im.convert("RGBA")
    if name.startswith(("bottle", "mixer")):
        return trim(im).resize((400, 860), Image.LANCZOS)
    if name.startswith("customer_"):
        return fit(im, 512, 512, "bottom")
    if name in ICONS:
        return fit(im, 208, 208).crop((-24, -24, 232, 232))
    if name in ("win_art", "lose_art"):
        return fit(im, 600, 400)
    print(f"  ? {src.name}: unknown name, copied as is")
    return im


def main():
    if not RAW.is_dir():
        sys.exit(f"put raw PNGs in {RAW.relative_to(ROOT)}/ first")
    OUT.mkdir(parents=True, exist_ok=True)
    for src in sorted(RAW.glob("*.png")):
        out = process(src)
        out.save(OUT / f"{src.stem}.png")
        print(f"  {src.name} -> assets/img/{src.stem}.png {out.width}x{out.height}")
        if src.stem.startswith(("bottle", "mixer")) and out.getchannel("A").getextrema()[0] > 0:
            print("    ! bottle has no transparent pixels — the background was not removed")


if __name__ == "__main__":
    main()
