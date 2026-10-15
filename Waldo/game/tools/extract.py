#!/usr/bin/env python3
"""Extract a layered Waldo .psb into web assets for the playable.

Layer naming (see ../../output/beach_waldo.psb):
  BG                clean background, no characters (bottom layer)
  <GroupName>       a group of layers all named "H" — one hidden character each.
                    Every group except the decoy group is a stage, played
                    top-of-the-layer-panel first. The stage label comes from
                    tools/labels.json (e.g. "Pandas With Red Balloons"), else the group name.
  D                 decoys: baked into the scene, never a target (a tap = miss).
  E / M             ignored.

H shapes live in their layer masks (read via ../../tools/cut_overlaps.layer_rgba), and
where two H's overlap each one's character is cut out of the other (cut_overlaps.py).

Each level lands in game/assets/<slug>/:
  bg.jpg            BG + decoys, flattened (BG is clean, so a removed target leaves nothing behind)
  <stage>/hN.png    each target's H layer (drawn over bg.jpg, removed when found; alpha = hit mask)
  <stage>/icon.png  cut-out of one target (HUD counter + stage card)
  manifest.json     {canvas, stages:[{name, label, icon, targets:[{x,y,w,h, cx,cy,cw,ch, z, file}]}]}
                    x/y/w/h = H-layer bbox, cx/cy/cw/ch = character bbox, all 0-1 of the canvas.

Usage:  python3 tools/extract.py path/to.psb [slug] [--icon=<stage>:<n> ...]
        slug defaults to the .psb filename stem minus a trailing "_waldo".
Requires: psd-tools, Pillow, numpy, scipy, opencv-python.
"""
import json, re, shutil, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from psd_tools import PSDImage
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from cut_overlaps import load_layers, cut_layers

ARGS = [a for a in sys.argv[1:] if not a.startswith('--icon=')]
# --icon=<stage slug>:<n> picks target n as that stage's icon (when the auto pick is partly hidden behind scenery)
ICON = dict(x.split('=', 1)[1].split(':') for x in sys.argv[1:] if x.startswith('--icon='))
PSB = Path(ARGS[0])
SLUG = ARGS[1] if len(ARGS) > 1 else re.sub(r'(_waldo)?\.ps[bd]$', '', PSB.name)
OUT = Path(__file__).resolve().parents[1] / "assets" / SLUG

DECOY = {"d", "decoy", "decoys"}
IGNORE = {"e", "m"}
ICON_H = 160        # px height of the stage icon


LABELS = json.loads((Path(__file__).resolve().parent / "labels.json").read_text())


def label(name):
    """Stage text from tools/labels.json (character + feature); falls back to the split group name."""
    if name in LABELS.get(SLUG, {}):
        return LABELS[SLUG][name]
    words = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|[_\-]+', ' ', name).split()
    return ' '.join(w[:1].upper() + w[1:] for w in words) + "'s"


def core_box(rgba, bg):
    """Bbox (in layer coords) of the character itself: pixels that differ from the clean bg."""
    a = rgba[..., 3] > 128
    d = np.abs(rgba[..., :3].astype(np.int16) - bg.astype(np.int16)).max(2)
    m = ndi.binary_opening((d > 40) & a, iterations=1)
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=5))
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        m = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= max(150, sizes.max() * 0.08)])
    ys, xs = np.nonzero(m if m.any() else a)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, m


def main():
    psd = PSDImage.open(str(PSB))
    W, H = psd.width, psd.height
    layers = list(psd)

    bg_layer = next((l for l in layers if not l.is_group() and l.name.lower() in ("bg", "background")), None)
    bg_layer = bg_layer or next(l for l in layers if not l.is_group())
    scene = Image.new("RGBA", (W, H))
    scene.paste(bg_layer.topil().convert("RGBA"), (bg_layer.left, bg_layer.top))
    bg_rgb = np.asarray(scene.convert("RGB"))

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    stages = []
    # psd-tools lists bottom -> top; stages play top-of-the-panel first, so walk it reversed
    groups = [g for g in layers if g.is_group() and g.name.lower() not in IGNORE]
    L = load_layers([(g.name, [h for h in g if h.width and h.height]) for g in groups], bg_rgb)
    cut_layers(L)
    by_layer = {}                                      # H layer -> (draw order, masked + cut RGBA)
    for k, l in enumerate(L):
        by_layer[id(l["layer"])] = (k + 1, l["rgba"])
        if l["group"].lower() in DECOY:
            scene.alpha_composite(Image.fromarray(l["rgba"], "RGBA"), l["box"][:2])

    for g in reversed(groups):
        if g.name.lower() in DECOY:
            continue
        slug = re.sub(r'[^a-z0-9]+', '-', g.name.lower()).strip('-')
        (OUT / slug).mkdir()
        targets, icon = [], None
        for k, h in enumerate(l for l in g if l.width and l.height):
            z, rgba = by_layer[id(h)]
            im = Image.fromarray(rgba, "RGBA")
            x0, y0, x1, y1, cm = core_box(rgba, bg_rgb[h.top:h.bottom, h.left:h.right])
            im.save(OUT / slug / f"h{k}.png", optimize=True)
            targets.append({
                "x": h.left / W, "y": h.top / H, "w": im.width / W, "h": im.height / H,
                "cx": (h.left + x0) / W, "cy": (h.top + y0) / H, "cw": (x1 - x0) / W, "ch": (y1 - y0) / H,
                "z": z, "file": f"{slug}/h{k}.png",
            })
            score = (y1 - y0) / (x1 - x0)   # the most upright (standing) character reads best as an icon
            if slug in ICON: score = 1e9 if str(k) == ICON[slug] else -1
            if icon is None or score > icon[0]:
                icon = (score, rgba, cm, (x0, y0, x1, y1))
        _, rgba, cm, (x0, y0, x1, y1) = icon
        alpha = Image.fromarray((ndi.binary_dilation(cm, iterations=3) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
        cut = Image.fromarray(rgba[..., :3]).convert("RGBA")
        cut.putalpha(alpha)
        cut = cut.crop((max(0, x0 - 4), max(0, y0 - 4), x1 + 4, y1 + 4))
        cut.resize((round(cut.width * ICON_H / cut.height), ICON_H), Image.LANCZOS).save(OUT / slug / "icon.png", optimize=True)
        stages.append({"name": g.name, "label": label(g.name), "icon": f"{slug}/icon.png", "targets": targets})

    # high quality + no chroma subsampling: at 5x zoom q84 shows 8x8 JPEG blocks in the flat sand
    scene.convert("RGB").save(OUT / "bg.jpg", quality=95, subsampling=0, optimize=True, progressive=True)
    (OUT / "manifest.json").write_text(json.dumps({"canvas": [W, H], "stages": stages}, indent=1))
    print(f"done [{SLUG}]: " + ", ".join(f"{s['label']} {len(s['targets'])}" for s in stages))


if __name__ == "__main__":
    main()
