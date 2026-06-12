#!/usr/bin/env python3
"""Extract a layered "Tidy Up" hidden-object .psb into web assets.

PSB layer convention (see the brief):
  bg                 full-canvas background (bottom layer)
  hiddens            group holding every collectible
    single           one collectible: an object layer "h" + its nestled shadow "s"
                     (a lone pixel child = object only, no shadow). When the two
                     are mislabelled (both "h"/both "s") the LARGER-area pixel is
                     the shadow, the tighter one is the object.
    multiple         a cluster of singles that share ONE common shadow "ss".
                     The ss only lifts once every collectible in the cluster is
                     gathered. Inner collectibles may be "single" groups or
                     arbitrarily named groups ("Group 10", ...) each h(+s).

Tray ordering (the brief): the collectible highest in the Photoshop stack sits
LEFT-most in the tray; walking DOWN the stack walks the tray RIGHTWARD. psd-tools
iterates bottom->top, so we walk children reversed (top->bottom) depth-first and
assign the tray id in that order.

Outputs under game/assets/<level>/:
  bg.jpg, item<id>_h.png, item<id>_s.png, group<g>_ss.png, manifest.json

Usage:  python3 tools/extract.py [path/to.psb]
Requires: psd-tools, Pillow.
"""
import json, sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

PSB = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "levels" / "level1.psb"
LEVEL = PSB.stem.lower()
OUT = Path(__file__).resolve().parents[1] / "assets" / LEVEL
BG_MAX = 2528  # bg longest side; this PSB is already ~2.5k so keep it crisp


def area(b):
    l, t, r, bo = b
    return max(0, r - l) * max(0, bo - t)


def empty(b):
    l, t, r, bo = b
    return (r - l) <= 0 or (bo - t) <= 0


def main():
    psd = PSDImage.open(str(PSB))
    cw, ch = psd.width, psd.height
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()

    def norm(b):
        l, t, r, bo = b
        return {"x": l / cw, "y": t / ch, "w": (r - l) / cw, "h": (bo - t) / ch}

    def save(layer, name):
        layer.composite().save(OUT / name)

    # ---- global stack z: walk the WHOLE psd bottom->top, leaf layers only ----
    zmap = {}  # id(layer) -> z
    def assign_z(layers):
        for l in layers:
            if l.is_group():
                assign_z(list(l))
            else:
                zmap[id(l)] = len(zmap)
    assign_z(list(psd))

    # ---- background ----
    bg = next((l for l in psd if l.name.strip().lower() == "bg"), None)
    if bg is not None and not empty(bg.bbox):
        bimg = bg.composite().convert("RGB")
        sc = BG_MAX / max(bimg.width, bimg.height)
        if sc < 1:
            bimg = bimg.resize((round(bimg.width * sc), round(bimg.height * sc)), Image.LANCZOS)
        bimg.save(OUT / "bg.jpg", quality=92, subsampling=0)

    hiddens = next(l for l in psd if l.name.strip().lower() == "hiddens")

    items = []    # collectibles, in tray (panel top->bottom) order
    groups = []   # shared-shadow clusters

    def pixel_children(group):
        return [c for c in group if not c.is_group()]

    def split_obj_shadow(group):
        """Return (object_layer, shadow_layer|None) for a leaf collectible group.
        Larger-area pixel child = shadow; tighter = object. Tolerates mislabels."""
        px = pixel_children(group)
        if not px:
            return None, None
        if len(px) == 1:
            return px[0], None
        px.sort(key=lambda l: area(l.bbox))
        return px[0], px[-1]  # smallest object, largest shadow

    def emit_item(group, group_id):
        obj, sha = split_obj_shadow(group)
        if obj is None or empty(obj.bbox):
            return
        iid = len(items)
        hfile = f"item{iid}_h.png"
        save(obj, hfile)
        rec = {"id": iid, "group": group_id,
               "h": {"file": hfile, "box": norm(obj.bbox), "z": zmap[id(obj)]},
               "s": None}
        if sha is not None and not empty(sha.bbox):
            sfile = f"item{iid}_s.png"
            save(sha, sfile)
            rec["s"] = {"file": sfile, "box": norm(sha.bbox), "z": zmap[id(sha)]}
        items.append(rec)
        return iid

    def is_collectible_group(group):
        """A leaf collectible group has only pixel children (h/s), no sub-groups."""
        return group.is_group() and all(not c.is_group() for c in group)

    def walk(layers):
        # panel top->bottom == reversed(bottom->top)
        for l in reversed(list(layers)):
            if not l.is_group():
                continue
            nm = l.name.strip().lower()
            if nm == "multiple":
                gid = len(groups)
                ss = next((c for c in l if not c.is_group() and c.name.strip().lower() == "ss"), None)
                grec = {"id": gid, "ss": None, "members": []}
                if ss is not None and not empty(ss.bbox):
                    sfile = f"group{gid}_ss.png"
                    save(ss, sfile)
                    grec["ss"] = {"file": sfile, "box": norm(ss.bbox), "z": zmap[id(ss)]}
                groups.append(grec)
                # collectibles inside, panel top->bottom (skip the ss pixel)
                for c in reversed(list(l)):
                    if c.is_group() and is_collectible_group(c):
                        iid = emit_item(c, gid)
                        if iid is not None:
                            grec["members"].append(iid)
                    elif c.is_group():
                        # nested non-collectible group: recurse defensively
                        walk([c])
            elif is_collectible_group(l):
                emit_item(l, None)
            else:
                # plain container (e.g. stray group) -> recurse
                walk([l])

    walk(hiddens)

    manifest = {
        "level": LEVEL,
        "canvas": [cw, ch],
        "frameAspect": cw / ch,
        "bg": "bg.jpg",
        "total": len(items),
        "items": items,
        "groups": groups,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"done [{LEVEL}]: {len(items)} collectibles, {len(groups)} shared-shadow clusters -> {OUT}")
    for g in groups:
        print(f"  cluster {g['id']}: members {g['members']} ss={'yes' if g['ss'] else 'NONE'}")


if __name__ == "__main__":
    main()
