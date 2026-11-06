#!/usr/bin/env python3
"""Extract a Hidden Word level PSB into game assets.

PSB layout (as built by ../psb_level_creator):
  BG                      clean background (bottom layer)
  Letters (group)         one layer per hidden letter, named L<2-digit index>_<char> = SCENE PATCH
                          (index = position in the phrase without spaces, 0- or 1-based);
                          optional HIDDEN layer L<idx>_<char>_glyph right above it = GLYPH (the letter
                          object only, real alpha): it flies to the slot and is the hit-test shape

Output: game/assets/<slug>/
  bg.jpg, L07_D.png (scene patch per letter, cropped to its alpha bbox), L07_D_glyph.png (when the
  PSB has glyphs), thumb.jpg, manifest.json

Phrase: --phrase "...", else "phrase" in the level.json next to the PSB
(<stem>_level.json or level.json). Fails loudly if layers and phrase do not match exactly.
Measured difficulty: level.json "difficulty" {"L01_B": "easy"|"medium"|"hard", ...} (plc labels) is copied to each
letter as "diff", and "difficulty_source" to the manifest (admin only: reveal colours + picker mix).

Usage:  python3 tools/extract.py <level.psb> <slug> [--phrase "..."] [--style name]
Requires: psd-tools, Pillow.
"""
import argparse, json, re, sys
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[1]
LABEL = re.compile(r'^L(\d{1,3})_(.+)$')
GLYPH = '_glyph'
THUMB_W = 360


def fail(msg):
    sys.exit(f'extract.py: ERROR: {msg}')


def find_level_json(psb: Path):
    for p in (psb.with_name(psb.stem + '_level.json'), psb.with_name('level.json')):
        if p.exists():
            return json.loads(p.read_text())
    return {}


def layer_rgba(l):
    """Pixels of one layer cropped to its alpha bbox -> (img, left, top). Rendered with composite() so layer
    masks and opacity apply (plc keeps the letter's alpha in a layer mask); hidden glyph layers included."""
    x0, y0, x1, y1 = l.bbox
    if x1 <= x0 or y1 <= y0:
        fail(f'layer {l.name} is empty')
    im = l.composite(viewport=(x0, y0, x1, y1), layer_filter=lambda _: True)
    if im is None:
        fail(f'layer {l.name} is empty')
    im = im.convert('RGBA')
    box = im.getchannel('A').getbbox()
    if not box:
        fail(f'layer {l.name} is fully transparent')
    return im.crop(box), x0 + box[0], y0 + box[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('psb')
    ap.add_argument('slug')
    ap.add_argument('--phrase')
    ap.add_argument('--style')
    a = ap.parse_args()

    if not re.fullmatch(r'[A-Za-z0-9_-]+', a.slug):
        fail(f'slug "{a.slug}" may only use letters, digits, _ and -')
    psb = Path(a.psb)
    if not psb.exists():
        fail(f'{psb} not found')
    meta = find_level_json(psb)
    phrase = (a.phrase or meta.get('phrase') or '').strip().upper()
    if not phrase:
        fail('no phrase: pass --phrase or put "phrase" in the level.json next to the PSB')
    phrase = re.sub(r'\s+', ' ', phrase)
    chars = [c for c in phrase if c != ' ']
    style = a.style or meta.get('style') or psb.stem

    psd = PSDImage.open(str(psb))
    W, H = psd.width, psd.height
    top = list(psd)

    bg = next((l for l in top if not l.is_group() and l.name.strip().lower() in ('bg', 'background')), None)
    if bg is None:
        fail('no BG layer')
    group = next((l for l in top if l.is_group() and l.name.strip().lower() == 'letters'), None)
    if group is None:
        fail('no "Letters" group')

    # stack order bottom -> top (psd_tools lists bottom first); z = 1.. above the BG (patches only)
    children = list(group)
    if any(l.is_group() for l in children):
        fail('nested group inside Letters')
    glyphs = {l.name.strip()[:-len(GLYPH)]: l for l in children if l.name.strip().endswith(GLYPH)}
    patches = [l for l in children if not l.name.strip().endswith(GLYPH)]
    stray = sorted(set(glyphs) - {l.name.strip() for l in patches})
    if stray:
        fail(f'glyph layers without a scene patch: {stray}')
    layers = []
    for z, l in enumerate(patches, start=1):
        m = LABEL.match(l.name.strip())
        if not m:
            fail(f'layer "{l.name}" is not named L<index>_<char>')
        layers.append((int(m.group(1)), m.group(2).upper(), l, z, glyphs.get(l.name.strip())))

    idx = sorted(t[0] for t in layers)
    base = idx[0] if idx else 0
    if base not in (0, 1):
        fail(f'letter indices start at {base}; expected 0 or 1')
    want = list(range(base, base + len(chars)))
    if idx != want:
        missing = sorted(set(want) - set(idx))
        dup = sorted({i for i in idx if idx.count(i) > 1})
        extra = sorted(set(idx) - set(want))
        fail(f'phrase "{phrase}" has {len(chars)} letters but layers do not match: '
             f'missing {missing}, duplicates {dup}, out of range {extra}')
    bad = [(f'L{t[0]:02d}_{t[1]}', chars[t[0] - base]) for t in layers if t[1] != chars[t[0] - base]]
    if bad:
        fail('wrong characters: ' + ', '.join(f'{n} should be {c}' for n, c in bad))

    out = ROOT / 'game' / 'assets' / a.slug
    out.mkdir(parents=True, exist_ok=True)
    for old in list(out.glob('L*.png')):  # (patches and glyphs)
        old.unlink()

    bgim = bg.composite().convert('RGB')
    if bgim.size != (W, H):  # BG layer smaller than the canvas: place it on a canvas
        full = Image.new('RGB', (W, H), (255, 255, 255))
        full.paste(bgim, (bg.left, bg.top))
        bgim = full
    bgim.save(out / 'bg.jpg', quality=93, subsampling=0)   # 4:4:4, sharp colour edges when zoomed in
    th = bgim.resize((THUMB_W, round(THUMB_W * H / W)), Image.LANCZOS)
    th.save(out / 'thumb.jpg', quality=82)

    diffs = meta.get('difficulty') if isinstance(meta.get('difficulty'), dict) else {}
    letters, no_glyph = [], []
    for i, ch, l, z, gl in sorted(layers, key=lambda t: t[0]):
        safe = ch if re.match(r'[A-Z0-9]', ch) else f'u{ord(ch):04x}'
        name = f'L{i - base:02d}_{safe}'
        im, left, top_ = layer_rgba(l)
        im.save(out / f'{name}.png', optimize=True)
        rec = {'i': i - base, 'ch': ch, 'file': f'{name}.png',
               'x': round(left / W, 6), 'y': round(top_ / H, 6),
               'w': round(im.width / W, 6), 'h': round(im.height / H, 6), 'z': z}
        if gl is not None:
            g, gx, gy = layer_rgba(gl)
            g.save(out / f'{name}_glyph.png', optimize=True)
            rec.update(glyph=f'{name}_glyph.png', gx=round(gx / W, 6), gy=round(gy / H, 6),
                       gw=round(g.width / W, 6), gh=round(g.height / H, 6))
        else:
            no_glyph.append(l.name)
        d = str(diffs.get(l.name.strip(), '')).strip().lower()
        if d in ('easy', 'medium', 'hard'):
            rec['diff'] = d
        letters.append(rec)

    manifest = {'phrase': phrase, 'style': style, 'canvas': {'w': W, 'h': H}, 'letters': letters}
    nd = sum('diff' in r for r in letters)
    if nd:
        manifest['difficulty_source'] = meta.get('difficulty_source') or 'level.json'
        if nd < len(letters):
            print(f'WARNING: difficulty for {nd}/{len(letters)} letters only')
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    mix = '/'.join(str(sum(r.get('diff') == k for r in letters)) for k in ('easy', 'medium', 'hard'))
    print(f'{a.slug}: {len(letters)} letters, {len(letters) - len(no_glyph)} glyphs, {W}x{H}'
          f'{f", difficulty {mix}" if nd else ""} -> {out.relative_to(ROOT)}')
    if no_glyph and len(no_glyph) < len(letters):
        print(f'WARNING: no glyph for {no_glyph} (the patch is used to fly and hit-test)')
    print(f'add "{a.slug}" to game/levels.js if it is new')


if __name__ == '__main__':
    main()
