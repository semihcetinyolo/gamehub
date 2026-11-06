#!/usr/bin/env python3
"""Make a test level from a lab background by drawing the phrase's letters onto it
as separate layers, then run extract.py on the result (same path as real levels).

Writes levels/fake/<slug>.psb + <slug>_level.json (BG + group Letters, layers L<idx>_<char> = scene
patch + hidden L<idx>_<char>_glyph above it, 1-based like psb_level_creator) and game/assets/<slug>/.

Usage:  python3 tools/fake_level.py            (cozy_porch, "YOUR DOOR IS ALWAYS OPEN")
        python3 tools/fake_level.py --slug small_fake --width 1086 --letter-px 50
                (every glyph scaled to a 50 px long side: tests the smallest letters on a small canvas)
Requires: psd-tools, Pillow, numpy.
"""
import argparse, json, random, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from psd_tools import PSDImage
from psd_tools.api.layers import Group, PixelLayer

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT.parent / 'psb_level_creator' / 'lab' / 'styles' / 'cozy_porch.png'
SLUG = 'cozy_porch_fake'
PHRASE = 'YOUR DOOR IS ALWAYS OPEN'
W = 1536
FONTS = '/System/Library/Fonts/Supplemental/'

# one entry per letter in phrase order: (x, y) centre in source px (896x1200), size px, font, rotation, look
# look: 'dark' / 'light' = contrast against the spot, 'faint' = barely visible
SPOTS = [
    ((258, 300), 74, 'Chalkduster.ttf', -8, 'dark'),            # Y  wreath
    ((334, 548), 30, 'Arial Rounded Bold.ttf', 0, 'light'),     # O  door handle
    ((232, 680), 62, 'Georgia Bold.ttf', 0, 'faint'),           # U  lower door panel (faint)
    ((450, 482), 48, 'Copperplate.ttc', 0, 'dark'),             # R  wooden plaque
    ((452, 626), 52, 'AmericanTypewriter.ttc', 4, 'dark'),      # D  board on the stone
    ((350, 1000), 120, 'Georgia Bold.ttf', -6, 'dark'),         # O  doormat
    ((782, 1040), 40, 'Futura.ttc', 0, 'light'),                # O  lantern
    ((660, 70), 50, 'Arial Black.ttf', 10, 'light'),            # R  ceiling beam
    ((790, 450), 64, 'Georgia Bold.ttf', 0, 'dark'),            # I  porch post
    ((640, 760), 54, 'Bradley Hand Bold.ttf', -4, 'faint'),     # S  blanket (faint)
    ((722, 965), 46, 'Arial Rounded Bold.ttf', 0, 'light'),     # A  terracotta pot
    ((52, 300), 58, 'Chalkduster.ttf', 12, 'light'),            # L  ivy left
    ((470, 1135), 58, 'Copperplate.ttc', -3, 'dark'),           # W  floor plank
    ((468, 770), 44, 'AmericanTypewriter.ttc', 0, 'dark'),      # A  stone pillar
    ((155, 965), 46, 'Futura.ttc', -14, 'dark'),                # Y  gloves
    ((500, 868), 34, 'Georgia Bold.ttf', 0, 'light'),           # S  amber jar
    ((690, 650), 52, 'Arial Rounded Bold.ttf', 0, 'dark'),      # O  chair back
    ((866, 790), 40, 'Arial Black.ttf', 6, 'light'),            # P  right pot
    ((48, 840), 48, 'Georgia Bold.ttf', -5, 'dark'),            # E  stone wall left
    ((700, 400), 50, 'Chalkduster.ttf', 0, 'light'),            # N  trees
]


def spot_colour(arr, cx, cy, r):
    patch = arr[max(0, cy - r):cy + r, max(0, cx - r):cx + r].reshape(-1, 3)
    return np.median(patch, axis=0)


def letter_layer(ch, size, font, rot, rgb, alpha):
    f = ImageFont.truetype(FONTS + font, size)
    pad = size
    im = Image.new('RGBA', (size * 2 + pad * 2, size * 2 + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((pad, pad), ch, font=f, fill=tuple(int(v) for v in rgb) + (alpha,),
           stroke_width=max(1, size // 30), stroke_fill=tuple(int(v * .7) for v in rgb) + (alpha,))
    im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    return im.crop(im.getbbox())


def main():
    global SLUG, W
    ap = argparse.ArgumentParser()
    ap.add_argument('--slug', default=SLUG)
    ap.add_argument('--width', type=int, default=W)
    ap.add_argument('--letter-px', type=int, help='scale every glyph to this long side (canvas px)')
    a = ap.parse_args()
    SLUG, W = a.slug, a.width
    random.seed(7)
    src = Image.open(SRC).convert('RGB')
    k = W / src.width
    H = round(src.height * k)
    bg = src.resize((W, H), Image.LANCZOS)
    arr = np.asarray(bg).astype(float)
    chars = [c for c in PHRASE if c != ' ']
    assert len(chars) == len(SPOTS), (len(chars), len(SPOTS))

    layers = []
    for n, (ch, ((sx, sy), size, font, rot, look)) in enumerate(zip(chars, SPOTS), start=1):
        cx, cy, s = round(sx * k), round(sy * k), round(size * k)
        base = spot_colour(arr, cx, cy, s // 2)
        lum = base.mean()
        if look == 'faint':
            rgb = np.clip(base * (0.80 if lum > 110 else 1.25), 0, 255)
            alpha = 190
        elif look == 'dark':
            rgb = np.clip(base * 0.38, 0, 255)
            alpha = 240
        else:
            rgb = np.clip(base + (255 - base) * 0.72, 0, 255)
            alpha = 240
        glyph = letter_layer(ch, s, font, rot, rgb, alpha)
        if a.letter_px:
            f = a.letter_px / max(glyph.size)
            glyph = glyph.resize((max(1, round(glyph.width * f)), max(1, round(glyph.height * f))), Image.LANCZOS)
            s = a.letter_px
        # scene patch = BG around the letter + soft shadow + the letter (like psb_level_creator's patches)
        pad = max(10, s // 5)
        gw, gh = glyph.size
        left = max(0, min(W - gw - 2 * pad, cx - gw // 2 - pad))
        top = max(0, min(H - gh - 2 * pad, cy - gh // 2 - pad))
        patch = Image.new('RGBA', (gw + 2 * pad, gh + 2 * pad), (0, 0, 0, 0))
        sh = Image.new('RGBA', patch.size, (0, 0, 0, 0))
        sh.paste((20, 12, 4, 120), (pad + 3, pad + 4), glyph.getchannel('A'))
        patch.alpha_composite(sh.filter(ImageFilter.GaussianBlur(4)))
        patch.alpha_composite(glyph.filter(ImageFilter.GaussianBlur(0.6)), (pad, pad))
        layers.append((f'L{n:02d}_{ch}', patch, left, top, glyph, left + pad, top + pad))

    outdir = ROOT / 'levels' / 'fake'
    outdir.mkdir(parents=True, exist_ok=True)
    psd = PSDImage.new('RGB', (W, H), color=(255, 255, 255))
    psd._record.header.version = 2  # PSB
    PixelLayer.frompil(bg, psd, 'BG', 0, 0)
    grp = Group.new(psd, 'Letters', open_folder=False)
    for name, im, left, top, glyph, gl, gt in reversed(layers):     # first label ends on top of the panel
        PixelLayer.frompil(im, grp, name, top, left)
        PixelLayer.frompil(glyph, grp, name + '_glyph', gt, gl).visible = False   # hidden, right above
    psb = outdir / f'{SLUG}.psb'
    psd.save(str(psb))
    (outdir / f'{SLUG}_level.json').write_text(json.dumps(
        {'canvas': {'w': W, 'h': H}, 'phrase': PHRASE, 'style': 'cozy_porch (fake letters)'}, indent=1))

    prev = bg.convert('RGBA')
    for _, im, left, top, *_ in layers:
        prev.alpha_composite(im, (left, top))
    prev.convert('RGB').save(outdir / f'{SLUG}_preview.jpg', quality=85)

    subprocess.run([sys.executable, str(ROOT / 'tools' / 'extract.py'), str(psb), SLUG], check=True)


if __name__ == '__main__':
    main()
