#!/usr/bin/env python3
"""Extract a layered "Hidden Pairs" .psb into web assets for the playable.

The game is a spot-the-pair hidden-object scene: every item appears as TWO
copies somewhere in the picture and the player taps matching pairs.

PSB layer-name convention (case-insensitive):
  bg                 full-canvas background (bottom layer)
  P<pair>_<copy>     a tappable item   e.g. P1_1, P1_2  (pair P1, copies 1 & 2)
  P<pair>_<copy>_B   occluder drawn BEHIND that item (optional)
  P<pair>_<copy>_T   occluder drawn in FRONT (TOP) of that item (optional)
  M_<n>              a static mask / occluder region (optional)   e.g. M_0, M_1

Outputs under <game>/assets/<level>/:
  BG.png, P*_*.png, P*_*_B.png, P*_*_T.png, M_*.png, manifest.json
manifest = { canvas, background, layers[], pairs[], masks[] } matching the
shape the embedded level01 ships with.

Usage:  python3 tools/extract_psb.py <path/to.psb> [level_slug]
        (level_slug defaults to the psb stem, lowercased)
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]      # the "Hidden Pairs" game dir
ASSETS = ROOT / "assets"

BG_RE   = re.compile(r"^bg$", re.I)
MASK_RE = re.compile(r"^m_?(\d+)$", re.I)             # M_0 / M0
MAIN_RE = re.compile(r"^p(\d+)_(\d+)$", re.I)         # P1_2
BEH_RE  = re.compile(r"^p(\d+)_(\d+)_b$", re.I)       # P1_2_B
TOP_RE  = re.compile(r"^p(\d+)_(\d+)_t$", re.I)       # P1_2_T

BG_MAX = 2048          # cap the background's longest side
ITEM_MAX_CANVAS = 3000  # downscale item PNGs only when the canvas is huge


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: extract_psb.py <psb> [level_slug]")
    psb_path = Path(sys.argv[1])
    level = (sys.argv[2] if len(sys.argv) > 2 else psb_path.stem).lower()
    out = ASSETS / level
    out.mkdir(parents=True, exist_ok=True)

    psd = PSDImage.open(str(psb_path))
    cw, ch = psd.width, psd.height

    # flatten to leaf layers in draw order (bottom -> top), descending into groups
    leaves = []

    def collect(node):
        for l in node:
            if l.is_group():
                collect(l)
            else:
                leaves.append(l)

    collect(psd)

    def empty(bbox):
        l, t, r, b = bbox
        return r <= l or b <= t

    item_scale = min(1.0, ITEM_MAX_CANVAS / max(cw, ch))

    def save(layer, fname, is_bg=False):
        img = layer.composite()
        if is_bg:
            sc = min(1.0, BG_MAX / max(img.width, img.height))
        else:
            sc = item_scale
        if sc < 1.0:
            img = img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))),
                             Image.LANCZOS)
        img.save(out / fname)

    layers = []            # manifest layer records, in draw order
    pairs = {}             # pid -> {copy -> {"main":id,"behind":id|None,"top":id|None}}
    masks = []
    skipped = []
    z = 0

    def rec(layer, lid, role, **extra):
        nonlocal z
        l, t, r, b = layer.bbox
        fname = lid + ".png"
        save(layer, fname, is_bg=(role == "background"))
        entry = {"id": lid, "file": fname, "x": l, "y": t, "w": r - l, "h": b - t,
                 "z": z, "role": role}
        entry.update(extra)
        layers.append(entry)
        z += 1
        return lid

    def slot(pid, copy):
        return pairs.setdefault(pid, {}).setdefault(copy, {"main": None, "behind": None, "top": None})

    for layer in leaves:
        name = (layer.name or "").strip()
        if empty(layer.bbox):
            if name:
                skipped.append(name + " (empty)")
            continue
        if BG_RE.match(name):
            rec(layer, "BG", "background")
            continue
        m = MAIN_RE.match(name)
        if m:
            p, c = int(m.group(1)), int(m.group(2))
            pid, lid = f"P{p}", f"P{p}_{c}"
            rec(layer, lid, "main", pair=pid, copy=c)
            slot(pid, c)["main"] = lid
            continue
        m = BEH_RE.match(name)
        if m:
            p, c = int(m.group(1)), int(m.group(2))
            pid, lid = f"P{p}", f"P{p}_{c}_B"
            rec(layer, lid, "behind", pair=pid, copy=c)
            slot(pid, c)["behind"] = lid
            continue
        m = TOP_RE.match(name)
        if m:
            p, c = int(m.group(1)), int(m.group(2))
            pid, lid = f"P{p}", f"P{p}_{c}_T"
            rec(layer, lid, "top", pair=pid, copy=c)
            slot(pid, c)["top"] = lid
            continue
        m = MASK_RE.match(name)
        if m:
            lid = f"M_{int(m.group(1))}"
            rec(layer, lid, "mask")
            masks.append(lid)
            continue
        skipped.append(name + " (unrecognised)")

    # assemble pairs[] in numeric order; only keep complete pairs (2 copies w/ a main)
    pairs_out, dropped = [], []
    for pid in sorted(pairs, key=lambda x: int(x[1:])):
        copies = [{"copy": c, "main": pairs[pid][c]["main"],
                   "behind": pairs[pid][c]["behind"], "top": pairs[pid][c]["top"]}
                  for c in sorted(pairs[pid])]
        mains = [c for c in copies if c["main"]]
        if len(mains) == 2:
            pairs_out.append({"id": pid, "copies": copies})
        else:
            dropped.append(f"{pid} (has {len(mains)} of 2 copies)")

    if not any(l["role"] == "background" for l in layers):
        sys.exit("ERROR: no 'bg' layer found — the level needs a full-canvas background layer named 'bg'.")
    if not pairs_out:
        sys.exit("ERROR: no complete pairs found. Items must be named P<pair>_<copy>, "
                 "e.g. P1_1 and P1_2. Skipped: " + ", ".join(skipped[:20]))

    manifest = {"canvas": {"width": cw, "height": ch}, "background": "BG",
                "layers": layers, "pairs": pairs_out, "masks": masks}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))

    print(f"done [{level}]: {len(pairs_out)} pairs, {len(masks)} masks, {len(layers)} layers -> {out}")
    if dropped:
        print("  dropped incomplete pairs:", "; ".join(dropped))
    if skipped:
        print("  skipped layers:", "; ".join(skipped[:20]))


if __name__ == "__main__":
    main()
