#!/usr/bin/env python3
"""
Extract a "sticker matching" level from a layered PSB/PSD.

Layer naming convention inside the top group:
  BG       -> full scene background
  <N>S     -> the colored sticker for slot N  (goes in the bottom bar, draggable)
  <N>L     -> the white silhouette / outline for slot N (shown on the scene at start)
  <N>M     -> optional decor piece revealed when slot N is solved

Some numbers may appear twice in the source (asset bug); we disambiguate by
spatial clustering (each S sits inside its own L), so duplicates are kept as
"<N>a", "<N>b" rather than being merged.

Outputs into <out_dir>:
  scene.png
  slots/L_<key>.png, stickers/S_<key>.png, decor/M_<key>.png
  manifest.json
"""
import os, re, json, sys
from collections import defaultdict
from psd_tools import PSDImage

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    '/Users/semihcetin/Desktop/quest_projects/Find The Cat/levels/Level_01 copy.psb'
OUT = sys.argv[2] if len(sys.argv) > 2 else \
    '/Users/semihcetin/Desktop/quest_projects/Find The Cat/levels/level_01'

NAME_RE = re.compile(r'^\s*(\d+)\s*([SLMslm])\s*$')

def center(bbox):
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)

def dist(a, b):
    return ((a[0]-b[0])**2 + (a[1]-b[1])**2) ** 0.5

def main():
    psd = PSDImage.open(SRC)
    W, H = psd.width, psd.height
    os.makedirs(OUT, exist_ok=True)
    for sub in ('slots', 'stickers', 'decor'):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    # Flatten: walk every layer, keep pixel layers. Record stacking index (z):
    # psd-tools iterates bottom -> top, so enumerate order == z (higher = on top).
    flat = []
    z = 0
    def walk(node):
        nonlocal z
        for layer in node:
            if layer.is_group():
                walk(layer)
            else:
                flat.append((z, layer))
                z += 1
    walk(psd)

    bg_layer = None
    typed = defaultdict(lambda: {'S': [], 'L': [], 'M': []})  # number -> kind -> [(z,layer)]
    for zi, layer in flat:
        nm = (layer.name or '').strip()
        if nm.upper() == 'BG':
            bg_layer = (zi, layer)
            continue
        m = NAME_RE.match(nm)
        if not m:
            print(f"  skip unrecognised layer: '{nm}'")
            continue
        num, kind = m.group(1), m.group(2).upper()
        typed[num][kind].append((zi, layer))

    # --- scene ---
    if bg_layer is None:
        # fall back to a full-canvas composite
        scene = psd.composite()
    else:
        scene = bg_layer[1].composite()
    scene.convert('RGBA').save(os.path.join(OUT, 'scene.png'))
    print(f"scene.png  {W}x{H}")

    def export(layer, sub, fname):
        img = layer.composite()
        if img is None:
            return None
        img = img.convert('RGBA')
        img.save(os.path.join(OUT, sub, fname))
        b = layer.bbox
        return {'src': f'{sub}/{fname}', 'left': b[0], 'top': b[1],
                'w': b[2]-b[0], 'h': b[3]-b[1]}

    items = []
    for num in sorted(typed.keys(), key=lambda s: int(s)):
        g = typed[num]
        S_list, L_list, M_list = g['S'][:], g['L'][:], g['M'][:]
        if not S_list:
            print(f"  group {num}: no S layer, skipping (L={len(L_list)} M={len(M_list)})")
            continue
        # Pair each S with the nearest unused L (handles duplicate numbers spatially)
        n = len(S_list)
        suffixes = [''] if n == 1 else [chr(ord('a')+i) for i in range(n)]
        for si, (sz, sl) in enumerate(sorted(S_list, key=lambda t: t[0])):
            key = num + (suffixes[si] if n > 1 else '')
            sc = center(sl.bbox)
            # nearest L
            L = None
            if L_list:
                L_list.sort(key=lambda t: dist(center(t[1].bbox), sc))
                L = L_list.pop(0)
            # nearest M (only if reasonably close to the slot)
            M = None
            if M_list:
                cand = min(M_list, key=lambda t: dist(center(t[1].bbox), sc))
                if dist(center(cand[1].bbox), sc) < max(sl.bbox[2]-sl.bbox[0], sl.bbox[3]-sl.bbox[1]) * 2.0:
                    M = cand
                    M_list.remove(cand)

            sticker = export(sl, 'stickers', f'S_{key}.png')
            slot = export(L[1], 'slots', f'L_{key}.png') if L else None
            decor = export(M[1], 'decor', f'M_{key}.png') if M else None

            # landing target = slot centre if we have it, else sticker home centre
            ref = slot if slot else sticker
            cx = ref['left'] + ref['w']/2.0
            cy = ref['top'] + ref['h']/2.0

            items.append({
                'key': key,
                'z': sz,
                'sticker': sticker,           # colored art (bar + revealed)
                'slot': slot,                 # white silhouette (shown at start)
                'decor': decor,               # optional furniture revealed on solve
                'cx': round(cx, 1), 'cy': round(cy, 1),  # where sticker centre lands
            })
            print(f"  {key:4s}  S{'+L' if slot else '  '}{'+M' if decor else ''}  target=({cx:.0f},{cy:.0f})")

    manifest = {'sceneW': W, 'sceneH': H, 'scene': 'scene.png', 'items': items}
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\nmanifest.json  ->  {len(items)} stickers")

if __name__ == '__main__':
    main()
