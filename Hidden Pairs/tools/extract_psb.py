#!/usr/bin/env python3
"""Extract a layered "Hidden Pairs" .psb into web assets (H-group convention).

The game is a spot-the-pair scene: every item appears twice and the player taps
matching pairs.

PSB layer convention (case-insensitive; separators / \\ space - . _ are ignored):
  BG                          full-canvas background (bottom layer)
  H   (group, one per pair)   holds the two items of ONE pair, plus optional
                              companions/masks:
       H1                     first item of the pair  (copy 1)
       H2                     second item of the pair (copy 2)
       S1  (optional)         companion of H1 — a shadow/hint shown while H1 is
                              in the scene. It hides when H1 is picked up, comes
                              back if H1 is put down, and is removed for good
                              once the pair is matched.
       S2  (optional)         companion of H2 (same behaviour)
       M   (optional)         a static mask — always shown, never removed
  M   (group and/or layers)   static masks — always shown, never removed

20 H groups  ->  20 pairs  ->  40 items.

Outputs under <game>/assets/<level>/:
  BG.jpg, P<n>_1.png, P<n>_2.png, P<n>_1_S.png, P<n>_2_S.png, M_*.png, manifest.json
manifest = { canvas, background, layers[], pairs[], masks[] } — the shape the
game loads. Each pair copy may carry a `companion` id; masks are the always-on
layers.

Usage:  python3 tools/extract_psb.py <path/to.psb> [level_slug]
        (level_slug defaults to the psb stem, lowercased)
Requires: psd-tools, Pillow.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]      # the "Hidden Pairs" game dir
ASSETS = ROOT / "assets"


def norm(name):
    """Lower-case a layer name with separators stripped (e.g. 'H 1' -> 'h1')."""
    return re.sub(r"[\s\\/.\-_]+", "", (name or "").strip()).lower()


def is_empty(bbox):
    l, t, r, b = bbox
    return r <= l or b <= t


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: extract_psb.py <psb> [level_slug]")
    psb_path = Path(sys.argv[1])
    level = (sys.argv[2] if len(sys.argv) > 2 else psb_path.stem).lower()
    out = ASSETS / level
    out.mkdir(parents=True, exist_ok=True)

    psd = PSDImage.open(str(psb_path))

    layers = []            # manifest layer records, in draw order
    pairs_out = []         # [{id, copies:[{copy, main, companion}]}]
    masks = []             # mask layer ids (always shown)
    skipped = []
    state = {"z": 0}

    def save(layer, fname):
        # Save at native bbox size (the game renders at the texture's native px).
        # Opaque backgrounds go out as JPG — a full-res PNG bg is huge.
        img = layer.composite()
        if fname.lower().endswith((".jpg", ".jpeg")):
            img.convert("RGB").save(out / fname, quality=88)
        else:
            img.save(out / fname)

    def rec(layer, lid, role, ext="png", **extra):
        if is_empty(layer.bbox):
            if layer.name:
                skipped.append(f"{layer.name} (empty)")
            return None
        l, t, r, b = layer.bbox
        save(layer, f"{lid}.{ext}")
        entry = {"id": lid, "file": f"{lid}.{ext}", "x": l, "y": t,
                 "w": r - l, "h": b - t, "z": state["z"], "role": role}
        entry.update(extra)
        layers.append(entry)
        state["z"] += 1
        return lid

    def add_mask(layer):
        lid = rec(layer, f"M_{len(masks)}", "mask")   # masks are all "M"; number them
        if lid:
            masks.append(lid)

    def classify_in_pair(layer, pid, found):
        if layer.is_group():
            for sub in layer:
                classify_in_pair(sub, pid, found)
            return
        n = norm(layer.name)
        if n in ("h1", "h2"):
            c = int(n[1])
            found[c]["main"] = rec(layer, f"{pid}_{c}", "main", pair=pid, copy=c)
        elif n in ("s1", "s2"):
            c = int(n[1])
            lid = rec(layer, f"{pid}_{c}_S", "companion", pair=pid, copy=c)
            if lid:
                found[c]["companion"] = lid
        elif re.fullmatch(r"m\d*", n):
            add_mask(layer)
        elif n:
            skipped.append(f"{layer.name} (in {pid}, unrecognised)")

    def emit_pair_group(group):
        pid = f"P{len(pairs_out) + 1}"
        found = {1: {}, 2: {}}
        for layer in group:            # draw order within the group
            classify_in_pair(layer, pid, found)
        copies = [{"copy": c, "main": found[c]["main"],
                   "companion": found[c].get("companion")}
                  for c in (1, 2) if found[c].get("main")]
        if len(copies) == 2:
            pairs_out.append({"id": pid, "copies": copies})
        else:
            skipped.append(f"H group -> {pid} incomplete ({len(copies)}/2 items)")

    def emit_mask_group(group):
        for layer in group:
            emit_mask_group(layer) if layer.is_group() else add_mask(layer)

    # walk the top level in draw order (bottom -> top)
    for node in psd:
        n = norm(node.name)
        if node.is_group():
            if n == "h":
                emit_pair_group(node)
            elif re.fullmatch(r"m\d*", n):
                emit_mask_group(node)
            else:                       # unknown group: descend, sort by child type
                for sub in node:
                    if sub.is_group() and norm(sub.name) == "h":
                        emit_pair_group(sub)
                    elif sub.is_group():
                        emit_mask_group(sub)
                    else:
                        add_mask(sub)
        else:
            if n == "bg":
                rec(node, "BG", "background", ext="jpg")
            elif re.fullmatch(r"m\d*", n):
                add_mask(node)
            elif n:
                skipped.append(f"{node.name} (top-level, unrecognised)")

    if not any(l["role"] == "background" for l in layers):
        sys.exit("ERROR: no 'BG' layer found — the level needs a full-canvas background named 'BG'.")
    if not pairs_out:
        sys.exit("ERROR: no complete pairs found. Each pair is an 'H' group holding "
                 "'H1' and 'H2' layers. Skipped: " + ", ".join(skipped[:20]))

    # Canvas = exact scene bounds, shifted so content starts at (0,0).
    minx = min(l["x"] for l in layers)
    miny = min(l["y"] for l in layers)
    maxx = max(l["x"] + l["w"] for l in layers)
    maxy = max(l["y"] + l["h"] for l in layers)
    for l in layers:
        l["x"] -= minx
        l["y"] -= miny

    manifest = {"canvas": {"width": maxx - minx, "height": maxy - miny},
                "background": "BG", "layers": layers, "pairs": pairs_out, "masks": masks}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))

    companions = sum(1 for l in layers if l["role"] == "companion")
    print(f"done [{level}]: {len(pairs_out)} pairs ({len(pairs_out) * 2} items), "
          f"{companions} companions, {len(masks)} masks, {len(layers)} layers -> {out}")
    if skipped:
        print("  skipped:", "; ".join(skipped[:20]))


if __name__ == "__main__":
    main()
