#!/usr/bin/env python3
"""Extract a layered hidden-object .psb into web assets for the playable.

Layer naming:
  bg                 full-canvas background (bottom layer)
  hN                 hidden item N (clean cut-out)
  hN ro<deg>         item N, rotated <deg> in the scene (negative = left/CCW).
                     The bar shows it upright via CSS rotate(barRot).
  sN                 glow/halo behind item N (paired by stack adjacency,
                     tolerating mislabels/missing shadows)
  m                  foreground occluder layers — ignored

Outputs under game/assets/<level>/:
  bg.jpg, hN.png, sN.png, manifest.json   (normalized bboxes + barRot)

The <level> subfolder is the PSB filename stem, lowercased (Garden.psb ->
garden, Elvan.psb -> elvan), so each level keeps its own asset set and the
playable can switch between them.

Usage:  python3 tools/extract.py [path/to.psb]
Requires: psd-tools, Pillow.
"""
import json, re, sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

PSB = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "levels" / "Garden.psb"
LEVEL = PSB.stem.lower()
OUT = Path(__file__).resolve().parents[1] / "assets" / LEVEL

BG_SIZE = 3072
ITEM_SCALE = 1.0   # full native res so items stay crisp when zoomed in on HiDPI

# Layer-name matching is case-insensitive (PSBs ship mixed case: bg/BG, hN/HN, sN/SN).
H_RE = re.compile(r'^h(\d+)(?:ro(-?\d+))?$', re.I)
S_RE = re.compile(r'^s(\d+)$', re.I)
is_bg = lambda n: n.strip().lower() == "bg"
is_m  = lambda n: n.strip().lower() == "m"

# Bar-token rotation (deg, CSS: +=clockwise) that seats each rotated item upright.
# Default = -V (the asset is stored pre-rotated to the scene). Exceptions are items
# whose pixels were NOT baked-rotated (composited upright) -> need 0.
# Keyed per level (by PSB stem, lowercased).
BAR_ROT_OVERRIDE = {
    "garden": { 34: 0 },   # h34 rocket composites upright
}


def main():
    psd = PSDImage.open(str(PSB))
    canvas = psd.width
    layers = list(psd)
    bar_rot_override = BAR_ROT_OVERRIDE.get(LEVEL, {})

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"): old.unlink()

    def empty(bbox):
        l, t, r, b = bbox
        return (r-l) <= 0 or (b-t) <= 0

    def area(bbox):
        l, t, r, b = bbox
        return max(0, r-l) * max(0, b-t)

    # Repair mislabels: an item whose clean cut-out 'hN' is missing while two
    # 'sN' layers exist (PSB convention: h below + s on top) -> rename the lower
    # (smaller, drawn-first) 'sN' to 'hN'. Mutates a name list, not the PSB.
    names = [l.name for l in layers]
    s_idx = {}   # num -> [stack indices of layers literally named sN]
    h_nums = set()
    for idx, l in enumerate(layers):
        hm = H_RE.match(l.name)
        if hm: h_nums.add(int(hm.group(1)))
        sm = S_RE.match(l.name)
        if sm: s_idx.setdefault(int(sm.group(1)), []).append(idx)
    for num, idxs in s_idx.items():
        if num not in h_nums and len(idxs) >= 2:
            lower = min(idxs, key=lambda i: area(layers[i].bbox))  # clean cut-out = tighter bbox
            names[lower] = f"h{num}"
            print(f"repair: relabeled duplicate s{num} (layer #{lower}) -> h{num}")

    # The CANVAS is the level frame. The bg layer is often painted slightly
    # larger than the canvas (overscan/bleed past the edges) and some items poke
    # out past it too; the playable clips the board to the canvas so that bleed —
    # and any item overflowing the edge — appears cut off at the frame.
    cw, ch = psd.width, psd.height

    bg_layer = next((l for i, l in enumerate(layers) if is_bg(names[i])), None)
    if bg_layer is not None and not empty(bg_layer.bbox):
        bl, bt, br, bb = bg_layer.bbox
        # store the bg at its native aspect (longest side = BG_SIZE), no squishing
        bimg = bg_layer.composite().convert("RGB")
        scale = BG_SIZE / max(bimg.width, bimg.height)
        bimg.resize((max(1,round(bimg.width*scale)), max(1,round(bimg.height*scale))), Image.LANCZOS).save(OUT/"bg.jpg", quality=85)
    else:
        bl, bt, br, bb = 0, 0, cw, ch   # fallback: whole canvas
    # where the bg image sits within the canvas frame (negative / >1 = it bleeds out)
    bg_box = {"x": bl/cw, "y": bt/ch, "w": (br-bl)/cw, "h": (bb-bt)/ch}

    # all bboxes are normalized to the canvas frame (0..1); coords outside that
    # range belong to pixels that bleed past the frame and get clipped.
    def norm(bbox):
        l, t, r, b = bbox
        return {"x": l/cw, "y": t/ch, "w": (r-l)/cw, "h": (b-t)/ch}

    # locate h layers (with optional rotation) in stack order
    hlist = []  # (idx, num, deg|None)
    for idx, l in enumerate(layers):
        m = H_RE.match(names[idx])
        if m:
            hlist.append((idx, int(m.group(1)), int(m.group(2)) if m.group(2) is not None else None))

    # shadows paired strictly by number: s_i <-> h_i (the PSB convention)
    slayers = {}
    for idx, l in enumerate(layers):
        sm = S_RE.match(names[idx])
        if sm:
            slayers[int(sm.group(1))] = l

    # z = index in the bottom->top layer stack (higher = drawn on top)
    # frameAspect = canvas w/h (the board is sized to it); bg = where the bg image
    # is placed within that frame.
    manifest = {"canvas": canvas, "frameAspect": cw/ch, "bg": bg_box,
                "items": {}, "shadows": {}, "foreground": [], "order": names}

    for k, (idx, num, deg) in enumerate(hlist):
        h = layers[idx]
        shadow = slayers.get(num)   # s_i pairs with h_i, always

        himg = h.composite()
        himg.resize((max(1,int(himg.width*ITEM_SCALE)), max(1,int(himg.height*ITEM_SCALE))), Image.LANCZOS).save(OUT/f"h{num}.png")

        bar_rot = bar_rot_override.get(num, (-deg if deg is not None else 0))
        item = norm(h.bbox); item["barRot"] = bar_rot; item["z"] = idx
        manifest["items"][f"h{num}"] = item

        if shadow is not None and not empty(shadow.bbox):
            simg = shadow.composite()
            simg.resize((max(1,int(simg.width*ITEM_SCALE)), max(1,int(simg.height*ITEM_SCALE))), Image.LANCZOS).save(OUT/f"s{num}.png")
            manifest["shadows"][f"s{num}"] = norm(shadow.bbox)

        tag = f" ro{deg}->bar{bar_rot}" if deg is not None else ""
        print(f"h{num}{tag}  shadow={'yes' if f's{num}' in manifest['shadows'] else 'NONE'}")

    # foreground 'm' layers: static occluders rendered at their stack position
    mk = 0
    for idx, l in enumerate(layers):
        if is_m(names[idx]) and not empty(l.bbox):
            mimg = l.composite()
            mimg.resize((max(1,int(mimg.width*ITEM_SCALE)), max(1,int(mimg.height*ITEM_SCALE))), Image.LANCZOS).save(OUT/f"m{mk}.png")
            fg = norm(l.bbox); fg["z"] = idx; fg["file"] = f"m{mk}.png"
            manifest["foreground"].append(fg)
            mk += 1

    (OUT/"manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"done [{LEVEL}]: {len(hlist)} items, {len(manifest['shadows'])} shadows, {mk} foreground -> {OUT}")


if __name__ == "__main__":
    main()
