#!/usr/bin/env python3
"""
Extract the Furnish Master level from GamingRoom.psb.

Structure:
  BG                       -> empty room scene
  top groups '1','2','3'.. -> box clusters, in unpack order
    f<N>  -> the item's form that pops out of the box & is dragged   (required)
    s<N>  -> the item's shadow, revealed when it snaps home          (optional)
    m<N>  -> foreground/mask occluder, revealed when it snaps home   (optional)

The item's HOME (snap target) is f<N>'s own position in the canvas.
Outputs <out>/scene.png, <out>/layers/{f,s,m}<N>.png, <out>/manifest.json
"""
import os, re, json, sys
from collections import defaultdict
from psd_tools import PSDImage

SRC = sys.argv[1] if len(sys.argv) > 1 else 'levels/GamingRoom.psb'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'levels/gaming_room'
LAYER_RE = re.compile(r'^\s*([fsmFSM])\s*0*(\d+)\s*$')

def main():
    psd = PSDImage.open(SRC)
    W, H = psd.width, psd.height
    os.makedirs(os.path.join(OUT, 'layers'), exist_ok=True)

    tops = list(psd)                       # bottom -> top
    groups = [l for l in tops if l.is_group() and l.name.strip().isdigit()]
    bg = next((l for l in tops if not l.is_group() and l.name.strip().upper() == 'BG'), None)
    room_layer = next((l for l in tops if not l.is_group() and l.name.strip().lower() == 'room'), None)

    # global stacking z (bottom->top), used as CSS z-index so the assembled scene matches the PSB
    z = 0; zmap = {}
    def walk(node):
        nonlocal z
        for l in node:
            if l.is_group(): walk(l)
            else: zmap[id(l)] = z; z += 1
    walk(psd)

    # --- scene = the 'Room' layer on a transparent canvas; bgColor = the flat 'BG' layer fill ---
    from PIL import Image
    bgcol = (bg.composite().convert('RGBA').getpixel((2, 2)) if bg else (210, 195, 170, 255))
    bg_hex = '#%02x%02x%02x' % (bgcol[0], bgcol[1], bgcol[2])
    scene = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if room_layer:
        rb = room_layer.bbox
        scene.alpha_composite(room_layer.composite().convert('RGBA'), (rb[0], rb[1]))
        room_rect = {'x': rb[0], 'y': rb[1], 'w': rb[2]-rb[0], 'h': rb[3]-rb[1]}
    else:                                  # fallback: whole composite, room = non-bg bbox
        for g in groups: g.visible = False
        scene = psd.composite(force=True).convert('RGBA').crop((0, 0, W, H))
        for g in groups: g.visible = True
        room_rect = {'x': 0, 'y': 0, 'w': W, 'h': H}
    scene.save(os.path.join(OUT, 'scene.png'))
    print(f"scene.png  {W}x{H}   bgColor {bg_hex}   roomRect {room_rect}")

    def export(layer, fname):
        img = layer.composite()
        if img is None: return None
        img.convert('RGBA').save(os.path.join(OUT, 'layers', fname))
        b = layer.bbox
        return {'src': f'layers/{fname}', 'left': b[0], 'top': b[1],
                'w': b[2]-b[0], 'h': b[3]-b[1], 'z': zmap[id(layer)]}

    out_groups = []
    for g in sorted(groups, key=lambda l: int(l.name)):
        kinds = defaultdict(dict)          # N -> {f,s,m: layer}
        for l in g:
            if l.is_group(): continue
            mm = LAYER_RE.match(l.name or '')
            if not mm: print(f"  group {g.name}: skip '{l.name}'"); continue
            kinds[int(mm.group(2))][mm.group(1).lower()] = l
        items = []
        for n in sorted(kinds):
            k = kinds[n]
            if 'f' not in k: print(f"  item {n}: no f layer, skip"); continue
            f = export(k['f'], f'f{n}.png')
            s = export(k['s'], f's{n}.png') if 's' in k else None
            m = export(k['m'], f'm{n}.png') if 'm' in k else None
            cx = f['left'] + f['w']/2.0; cy = f['top'] + f['h']/2.0
            items.append({'key': str(n), 'f': f, 's': s, 'm': m,
                          'cx': round(cx,1), 'cy': round(cy,1)})
            print(f"  grp {g.name}  item {n:3d}  f{'+s' if s else '  '}{'+m' if m else ''}  home=({cx:.0f},{cy:.0f})")
        out_groups.append({'id': g.name, 'items': items})

    manifest = {'sceneW': W, 'sceneH': H, 'scene': 'scene.png',
                'bgColor': bg_hex, 'roomRect': room_rect, 'groups': out_groups}
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fp:
        json.dump(manifest, fp, indent=2)
    tot = sum(len(g['items']) for g in out_groups)
    print(f"\nmanifest.json  ->  {len(out_groups)} groups, {tot} items")

if __name__ == '__main__':
    main()
