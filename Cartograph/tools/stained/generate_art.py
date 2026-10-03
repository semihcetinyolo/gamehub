"""Turn each colour guide into AI stained-glass artwork and read the four glass colours back.

python3 tools/stained/generate_art.py --env <.env with CLAIFACE_API_KEY_IMAGE> [ids…] [--force]
  → assets/glass/<id>.webp + <id>.json (prompt, sha256, palette sampled per guide colour)
Each new image is registered onto its guide (align_art.py) before its colours are read.
Existing artwork is kept (only its palette is re-read) unless --force.
Then: python3 tools/stained/check_art.py (every pane's art colour = solution colour), node tools/stained/build_levels.js
"""
import argparse
import asyncio
import base64
import colorsys
import hashlib
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
from dotenv import load_dotenv
from PIL import Image
from scipy.ndimage import binary_erosion

from align_art import align

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
OUT = ROOT / 'assets' / 'glass'

PROMPT = """Generate a NEW, exquisite PHOTOGRAPHIC ARTWORK of a real artisan-made stained-glass panel depicting {scene}.
Image 1 is the exact pane layout and colour plan. Image 2 is only a real-world material reference. The output must NOT look like image 1's flat vector drawing: turn every flat area into stunning, convincingly real, richly textured handmade translucent glass — organic ripples, hammered dimples, tiny trapped bubbles, light refracting inside the coloured glass, glowing sunlight transmitted from behind, delicate dark aged metal solder seams. A high-end Tiffany-style art object, photographed perfectly straight-on. Deep and jewel-like, not a cartoon, not paint, not paper.
CRITICAL STRUCTURE: every flat-coloured area of image 1 is exactly ONE glass pane and every black line is a lead seam. Keep all seams exactly where they are — same positions, same curves, same silhouette and proportions — so the artwork aligns with image 1 when superimposed. Do not add, remove, subdivide, merge or move any pane or seam. Do not paint extra details (no eyes, veins, faces, stripes, text) onto the glass beyond what the panes already show. The flat light-grey area outside the panel's silhouette is not glass: render it as plain dark neutral grey.
FOUR COLOURS ONLY, PANE BY PANE: the glass uses exactly these four colours: {colors}. Every pane keeps the colour image 1 gives it. Make them rich, luminous, translucent versions of those same hues, with natural light and texture variation inside each hue, but no fifth glass colour. Neutral lead seams and specular highlights do not count as colours.
COMPOSITION: exactly 3:4 portrait, frontal/orthographic, the panel filling the frame as in image 1. No frame, no wall, no room, no hanging chain, no perspective, no mockup, no vignette, no border. NO TEXT, NO LETTERING, NO LOGOS. Deliver only the finished raster artwork."""


def data_url(path):
    with Image.open(path) as image:
        image = image.convert('RGB')
        image.thumbnail((1024, 1024))
        buf = io.BytesIO()
        image.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def extract_palette(target, labels_path):
    with Image.open(target) as image:
        rgb = np.asarray(image.convert('RGB')).astype(float)
    with Image.open(labels_path) as image:
        labels = np.asarray(image.convert('L').resize((rgb.shape[1], rgb.shape[0]), Image.Resampling.NEAREST))
    palette = []
    for c in range(4):
        mask = binary_erosion(labels == c * 60, iterations=12)
        samples = rgb[mask]
        if len(samples) < 200:
            raise RuntimeError(f'{target.name}: too few samples for colour {c}')
        v = samples.max(axis=1)
        lo, hi = np.percentile(v, 20), np.percentile(v, 92)
        samples = samples[(v >= lo) & (v <= hi)]
        median = np.median(samples, axis=0).astype(int)
        palette.append('#' + ''.join(f'{x:02x}' for x in median))
    return palette


def lab(hex_):
    rgb = np.array([int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    rgb = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    xyz = rgb @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz /= [0.9505, 1.0, 1.089]
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def min_gap(palette):
    return min(np.linalg.norm(lab(a) - lab(b)) for i, a in enumerate(palette) for b in palette[i + 1:])


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env', type=Path)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('ids', nargs='*')
    args = parser.parse_args()
    if args.env:
        load_dotenv(args.env)
    key = os.environ.get('CLAIFACE_API_KEY_IMAGE')
    base_url = os.environ.get('CLAIFACE_BASE_URL', 'https://63.189.88.172/v1/api')
    reference = data_url(ROOT / 'vitray example' / 'vitray3.jpg')
    maps = {p.stem: json.loads(p.read_text()) for p in sorted((HERE / 'maps').glob('*.json'))}
    ids = args.ids or list(maps)
    gate = asyncio.Semaphore(args.jobs)

    async def generate(id):
        info = maps[id]
        target, meta_path = OUT / f'{id}.webp', OUT / f'{id}.json'
        guide, labels = HERE / 'guides' / f'{id}.png', HERE / 'guides' / f'{id}.labels.png'
        if info.get('keepArt') or (target.exists() and not args.force and meta_path.exists() and json.loads(meta_path.read_text()).get('guide') == hashlib.sha256(guide.read_bytes()).hexdigest()):
            meta = json.loads(meta_path.read_text())
            if not info.get('keepArt'):
                meta['palette'] = extract_palette(target, labels)
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
            print(f'{id}: kept, palette {meta["palette"]}', flush=True)
            return
        if not key:
            raise RuntimeError('CLAIFACE_API_KEY_IMAGE is required')
        colors = ', '.join(f'{name} ({hex_})' for name, hex_ in info['palette'])
        prompt = PROMPT.format(scene=info['scene'], colors=colors)
        body = {'prompt': prompt, 'images': [{'image_url': data_url(guide)}, {'image_url': reference}],
                'size': '768x1024', 'quality': 'high', 'output_format': 'png'}
        async with gate:
            for attempt in range(3):
                try:
                    async with httpx.AsyncClient(timeout=900) as client:
                        response = await client.post(base_url.rstrip('/') + '/images/edits', json=body, headers={'Authorization': f'Bearer {key}'})
                    if response.status_code == 200 and (response.json().get('data') or [{}])[0].get('b64_json'):
                        break
                    print(f'{id}: HTTP {response.status_code}, retrying', flush=True)
                except httpx.HTTPError as error:
                    print(f'{id}: {type(error).__name__}, retrying', flush=True)
                await asyncio.sleep(5)
            else:
                raise RuntimeError(f'{id}: image generation failed')
        raw = base64.b64decode(response.json()['data'][0]['b64_json'])
        (HERE / 'raw').mkdir(exist_ok=True)
        (HERE / 'raw' / f'{id}.png').write_bytes(raw)
        with Image.open(io.BytesIO(raw)) as image:
            image = image.convert('RGB')
            if abs(image.width / image.height - .75) > .025:
                raise RuntimeError(f'{id}: unexpected aspect ratio {image.size}; raw saved')
            image = image.resize((768, 1024), Image.Resampling.LANCZOS)
            image.save(target, format='WEBP', quality=86, method=6)
        palette = extract_palette(target, labels)
        meta = {'id': id, 'model': 'gpt-image-2', 'generatedAt': datetime.now(timezone.utc).isoformat(), 'prompt': prompt,
                'guide': hashlib.sha256(guide.read_bytes()).hexdigest(), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                'size': [768, 1024], 'palette': palette}
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
        align(id)  # the model may shift/scale the layout a little; warp it back onto the guide
        meta = json.loads(meta_path.read_text())
        meta['palette'] = palette = extract_palette(target, labels)
        meta['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
        print(f'{id}: saved ({target.stat().st_size // 1024} KB), palette {palette}, min ΔE {min_gap(palette):.0f}', flush=True)

    results = await asyncio.gather(*(generate(id) for id in ids), return_exceptions=True)
    for id, r in zip(ids, results):
        if isinstance(r, Exception):
            print(f'{id}: FAILED {r}', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
