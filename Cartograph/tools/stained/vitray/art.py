"""Finished glass for a staged vitray level, exactly on its final geometry.

python tools/stained/vitray/art.py guide <id>    # work/<id>.map.json -> guides/<id>.png/.labels.png/.svg (final guide for Astra)
python tools/stained/vitray/art.py finish <id>   # raw/<id>.png (Astra glass from that guide) -> assets/glass/<id>.webp/.json

The image model paints real rippled glass from the guide, but its lead never
sits exactly on the puzzle's seams. Keep the generated glass wherever it shows
the pane's own colour away from any seam (generated and exact), fill the rest
of each pane from seam-free patches of the same generated colour (the
reuse_glass.py quilting), then draw thin metallic lead on the exact boundaries.
Every pane is validated against the solution afterwards.
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import binary_erosion, distance_transform_edt, gaussian_filter

HERE = Path(__file__).resolve().parent
STAINED = HERE.parent
ROOT = STAINED.parents[1]
sys.path.insert(0, str(STAINED))
import make_maps  # noqa: E402
from generate_art import extract_palette, lab  # noqa: E402
from reuse_glass import labels, texture, validate  # noqa: E402

SCALE = 64  # px per canvas unit while registering: 27 x 36 -> 1728 x 2304
OUT_SCALE, OUT_QUALITY = 48, 78  # shipped glass: 1296 x 1728 (the Fugo zip must stay under 150 MB)


def save_glass(img, m, target):
    """Write the shipped glass at OUT_SCALE; returns the image as written."""
    size = (round(m['cols'] * OUT_SCALE), round(m['rows'] * OUT_SCALE))
    if img.size != size:
        img = img.resize(size, Image.Resampling.LANCZOS)
    img.save(target, 'WEBP', quality=OUT_QUALITY, method=6)
    return img


def staged(id):
    return json.loads((HERE / 'work' / f'{id}.map.json').read_text())


def guide(id):
    info = staged(id)
    m, sol = info['map'], info['solution']
    pal = [h for _, h in info['palette']]
    path = STAINED / 'guides' / f'{id}.png'
    make_maps.render(m, sol, pal, path)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {m["cols"]} {m["rows"]}"><title>{info["name"]}</title>'
    svg += ''.join(f'<path d="{d}" fill="{pal[sol[i]]}" fill-rule="evenodd"/>' for i, d in enumerate(m['paths']))
    svg += f'<path d="{m["edgePath"]}" fill="none" stroke="#222c36" stroke-width=".055" stroke-linejoin="round"/>'
    svg += f'<path d="{m["shape"]}" fill="none" stroke="#222c36" stroke-width=".075" stroke-linejoin="round"/></svg>'
    path.with_suffix('.svg').write_text(svg)
    print(f'{id}: guide {path.relative_to(ROOT)}')


def finish(id):
    info = staged(id)
    m, sol = info['map'], info['solution']
    pal = [h for _, h in info['palette']]
    size = (round(m['cols'] * SCALE), round(m['rows'] * SCALE))
    raw_path = HERE / 'raw' / f'{id}.png'
    raw = Image.open(raw_path).convert('RGB')
    if abs(raw.width / raw.height - size[0] / size[1]) > .03:
        raise ValueError(f'{id}: raw aspect {raw.size} differs from {size}')
    src = np.asarray(raw.resize(size, Image.Resampling.LANCZOS)).astype(np.float32)
    idx = labels(info, size)
    colours = np.full(idx.shape, -1)
    for r, c in enumerate(sol):
        colours[idx == r] = c
    # Generated colour of each glass colour: median over deep pane interiors.
    src_lab = np.stack([lab('#%02x%02x%02x' % tuple(int(v) for v in px)) for px in src[::8, ::8].reshape(-1, 3)]).reshape(src[::8, ::8].shape)
    full_lab = np.asarray(Image.fromarray(src_lab.astype(np.float32)[..., 0]).resize(size, Image.Resampling.BILINEAR))  # L only, for luminance gating
    rng = np.random.default_rng(int(hashlib.sha256(id.encode()).hexdigest()[:8], 16))
    output = np.full((*idx.shape, 3), (52, 52, 50), np.float32)
    stats = []
    small_lab = src_lab
    small_cols = colours[::8, ::8][:small_lab.shape[0], :small_lab.shape[1]]
    centres = [np.median(small_lab[binary_erosion(small_cols == c, iterations=2)], axis=0) for c in range(4)]
    for c in range(4):
        own = colours == c
        deep = binary_erosion(own, iterations=10)
        # A pixel is clean glass of colour c when it is nearer c than any other colour and not dark lead.
        d = [np.linalg.norm(small_lab - centres[k], axis=-1) for k in range(4)]
        near = (np.argmin(np.stack(d), 0) == c) & (small_lab[..., 0] > max(12, centres[c][0] * .35))
        near = np.asarray(Image.fromarray(near.astype(np.uint8) * 255).resize(size, Image.Resampling.NEAREST)) > 0
        valid = deep & binary_erosion(near, iterations=6)
        tex, st = texture(src.astype(np.uint8), valid, size, rng)
        alpha = np.clip(distance_transform_edt(valid) / 10, 0, 1)
        material = tex * (1 - alpha[..., None]) + src * alpha[..., None]
        output[own] = material[own]
        st.update(colour=c, preservedFraction=float(alpha[own].mean()))
        stats.append(st)
    # Exact thin metallic lead (reuse_glass.py look).
    k = 2
    seam = Image.new('L', (size[0] * k, size[1] * k))
    dr = ImageDraw.Draw(seam)
    for e in [*m['edges'], *m['rim']]:
        xy = [(e[0] * SCALE * k, e[1] * SCALE * k), (e[2] * SCALE * k, e[3] * SCALE * k)]
        w = round((.060 if len(e) == 6 else .085) * SCALE * k)
        dr.line(xy, fill=255, width=w)
        for x, y in xy:
            dr.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=255)
    seam = seam.resize(size, Image.Resampling.LANCZOS)
    mask = np.asarray(seam).astype(float) / 255
    shade = np.asarray(seam.filter(ImageFilter.GaussianBlur(2))).astype(float) / 255
    output *= 1 - .24 * shade[..., None]
    bevel = gaussian_filter(mask, .65)
    gy, gx = np.gradient(bevel)
    metal = np.clip(34 + (gx - gy) * 75, 20, 86)
    output = output * (1 - mask[..., None]) + metal[..., None] * mask[..., None]
    out_img = Image.fromarray(np.clip(output, 0, 255).astype(np.uint8))
    target = ROOT / 'assets' / 'glass' / f'{id}.webp'
    out_img = save_glass(out_img, m, target)
    gpath = STAINED / 'guides' / f'{id}.png'
    palette = extract_palette(target, gpath.with_suffix('.labels.png'))
    checked = validate(info, out_img, palette)
    meta = dict(id=id, tool='Astra (gpt-6-astra built-in image_gen) glass from the final guide, registered locally',
                generatedAt=datetime.now(timezone.utc).isoformat(), raw=str(raw_path.relative_to(ROOT)),
                rawSha256=hashlib.sha256(raw_path.read_bytes()).hexdigest(),
                method='keep generated glass of the right colour away from seams; quilt seam-free generated patches elsewhere; exact metallic lead',
                textureSamples=stats, size=list(out_img.size), guide=hashlib.sha256(gpath.read_bytes()).hexdigest(),
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(), palette=palette, paneColorCheck=checked)
    target.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(f'{id}: {checked["matched"]}/{checked["total"]} panes match, preserved '
          + ', '.join(f'{s["preservedFraction"]:.2f}' for s in stats))
    if not checked['valid']:
        raise SystemExit(f'{id}: pane colour mismatch {checked["mismatches"][:8]}')
    info.update(image=f'assets/glass/{id}.webp', artMetadata=f'assets/glass/{id}.json',
                vectorGuide=f'tools/stained/guides/{id}.svg', artworkStyle='stained-glass', artworkNeedsRefresh=False)
    (HERE / 'work' / f'{id}.map.json').write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('step', choices=['guide', 'finish'])
    ap.add_argument('ids', nargs='+')
    a = ap.parse_args()
    for id in a.ids:
        (guide if a.step == 'guide' else finish)(id)
