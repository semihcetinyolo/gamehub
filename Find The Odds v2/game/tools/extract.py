#!/usr/bin/env python3
"""Extract layered "Find The Strange" .psb levels into web assets.

For each level <name>.psb it produces, under game/assets/<name>/:
  - bg.jpg                downscaled background (opaque)
  - o1..oN.png            trimmed "odd" items the player must find
  - r1..rM.png            trimmed decoy items (tapping one costs a heart)
  - s1..sN.png            optional glow/effect for odd N — removed when oN is found
  - m1..mK.png            foreground masks/overlays — always shown, never interactive
  - manifest.json         normalized bboxes (0..1 of the canvas) + PSB draw order

and maintains game/assets/levels.json — the ordered list of playable levels.

Layer naming convention in the .psb (case-insensitive bg):
  bg / BG                  full-canvas background (bottom layer)
  oN                       a clean cut-out of an odd item to find (may sit in a group)
  rN                       a clean cut-out of a decoy item
  sN                       optional glow/effect for odd N (removed when oN is found)
  rsN                      static scene element — shown from the start, never
                           interactive, never removed (stays until the level ends)
  m                        a foreground mask/overlay — always shown, never interactive
                           (every mask layer is named exactly "m"; numbered on export)

Numbering need not be contiguous (gaps like r6/r29 are fine).

Requires: psd-tools, Pillow.
Usage:  python3 tools/extract.py [path/to.psb]   # default: every ../levels/*.psb
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]          # game/
ASSETS = ROOT / "assets"
LEVELS_DIR = ROOT.parent / "levels"

O_RE = re.compile(r"^o(\d+)$")
RS_RE = re.compile(r"^rs(\d+)$")   # check BEFORE R_RE (rs1 must not be read as r-something)
R_RE = re.compile(r"^r(\d+)$")
S_RE = re.compile(r"^s(\d+)$")


def export_level(psb_path):
    name = psb_path.stem.lower()
    out = ASSETS / name
    out.mkdir(parents=True, exist_ok=True)

    psd = PSDImage.open(str(psb_path))
    canvas = psd.width  # square canvas

    # flatten to leaf layers in PSB draw order (bottom -> top), descending into groups
    leaves = []

    def collect(node):
        for l in node:
            if l.is_group():
                collect(l)
            else:
                leaves.append(l)

    collect(psd)
    layers = {l.name: l for l in leaves}

    def norm(bbox):
        l, t, r, b = bbox
        return {"x": l / canvas, "y": t / canvas, "w": (r - l) / canvas, "h": (b - t) / canvas}

    # Keep everything at the PSB's native resolution (capped at 4K). The game lets
    # the player zoom in (up to MAX_SCALE), so the on-screen size can exceed the
    # canvas; the old 2048 / 3000px caps made big (4096) canvases blurry once
    # zoomed. We never upscale (no detail to invent) — just stop throwing it away.
    # The 4K cap only kicks in for an oversized PSB, keeping payloads sane.
    MAX_DIM = 4096
    bg_size = min(MAX_DIM, canvas)          # native background resolution, ≤4K (was 2048)
    item_scale = min(1.0, MAX_DIM / canvas) # items at native resolution, ≤4K (was 3000/canvas)

    def save_layer(layer, fname):
        img = layer.composite()
        if item_scale < 1.0:
            w = max(1, int(img.width * item_scale))
            h = max(1, int(img.height * item_scale))
            img = img.resize((w, h), Image.LANCZOS)
        img.save(out / fname)

    # background (case-insensitive)
    bg = next(l for l in leaves if l.name.lower() == "bg")
    bg.composite().convert("RGB").resize((bg_size, bg_size), Image.LANCZOS).save(out / "bg.jpg", quality=85)

    manifest = {"canvas": canvas, "odds": {}, "traps": {}, "shadows": {}, "statics": {}, "masks": [],
                "order": [l.name for l in leaves]}

    # shadows first, so odds can reference them
    shadow_by_num = {}
    for nm, layer in layers.items():
        m = S_RE.match(nm)
        if m:
            save_layer(layer, nm + ".png")
            manifest["shadows"][nm] = norm(layer.bbox)
            shadow_by_num[m.group(1)] = nm

    for nm, layer in layers.items():
        if O_RE.match(nm):
            save_layer(layer, nm + ".png")
            rec = norm(layer.bbox)
            num = O_RE.match(nm).group(1)
            if num in shadow_by_num:
                rec["shadow"] = shadow_by_num[num]
            manifest["odds"][nm] = rec
        elif R_RE.match(nm):
            save_layer(layer, nm + ".png")
            manifest["traps"][nm] = norm(layer.bbox)

    # statics: scene elements shown from the start, non-interactive, never removed
    # (stay until the level ends). Layers are named "rs" (or rsN), often colliding
    # like masks, so enumerate them and store an explicit z = running draw-order
    # rank so they sit at their natural depth among the items.
    # statics (rs) + masks (m): both use a colliding name, so enumerate them and
    # store an explicit z = the running draw-order rank — so each sits at its TRUE
    # PSB depth (a mask occludes only the items drawn below it, not everything).
    # Single pass keeps z consistent with the odds/traps/shadows rank.
    rank = si = mi = 0
    for layer in leaves:
        nl = (layer.name or "").strip().lower()
        if O_RE.match(nl) or R_RE.match(nl) or S_RE.match(nl):
            rank += 1
        elif nl == "rs" or RS_RE.match(nl):
            si += 1
            fn = "rs{}".format(si)
            save_layer(layer, fn + ".png")
            rec = norm(layer.bbox); rec["name"] = fn; rec["z"] = rank
            manifest["statics"][fn] = rec
        elif nl == "m":
            mi += 1
            fn = "m{}".format(mi)
            save_layer(layer, fn + ".png")
            rec = norm(layer.bbox); rec["name"] = fn; rec["z"] = rank
            manifest["masks"].append(rec)

    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return (name, len(manifest["odds"]), len(manifest["traps"]), len(manifest["shadows"]),
            len(manifest["masks"]), len(manifest["statics"]))


def main():
    psbs = [Path(sys.argv[1])] if len(sys.argv) > 1 else sorted(LEVELS_DIR.glob("*.psb"))
    if not psbs:
        sys.exit(f"no .psb found in {LEVELS_DIR}")

    names = []
    for p in psbs:
        nm, no, nr, ns, nm_masks, nrs = export_level(p)
        names.append(nm)
        print(f"{nm}: {no} odds, {nr} traps, {ns} shadows, {nm_masks} masks, {nrs} statics -> assets/{nm}/")

    # maintain levels.json (preserve existing order, append any new levels)
    lj = ASSETS / "levels.json"
    order = []
    if lj.exists():
        try:
            order = json.loads(lj.read_text())
        except Exception:
            order = []
    for nm in names:
        if nm not in order:
            order.append(nm)
    lj.write_text(json.dumps(order, indent=1))
    print(f"levels.json -> {order}")


if __name__ == "__main__":
    main()
