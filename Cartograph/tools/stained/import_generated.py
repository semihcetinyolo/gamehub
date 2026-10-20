"""Import built-in image_gen outputs saved as raw/<id>.png; no API calls.

python tools/stained/import_generated.py <id> [...]
Converts to game-sized WebP, samples the palette and checks each pane's colour.
The original generated PNG and the complete prompts are kept for reproducibility.
"""
import hashlib
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from generate_art import extract_palette
from check_art import check

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def import_image(id, manifest=HERE / 'levels-26-50-prompts.json'):
    specs = json.loads(Path(manifest).read_text())
    spec = next(asset for asset in specs['assets'] if asset['id'] == id)
    raw = ROOT / spec['raw'] if spec.get('raw') else HERE / 'raw' / f'{id}.png'
    target = ROOT / spec['file']
    meta_path = target.with_suffix('.json')
    guide = HERE / 'guides' / f'{id}.png'
    with Image.open(guide) as reference:
        size = reference.size
    with Image.open(raw) as image:
        if abs(image.width / image.height - size[0] / size[1]) > .025:
            raise ValueError(f'{id}: unexpected image aspect ratio {image.size}')
        image.convert('RGB').resize(size, Image.Resampling.LANCZOS).save(target, 'WEBP', quality=86, method=6)
    palette = extract_palette(target, guide.with_suffix('.labels.png'))
    meta = dict(id=id, tool=specs['tool'], generatedAt=datetime.now(timezone.utc).isoformat(),
                prompt=spec['prompt'], references=spec['references'], size=list(size),
                guide=hashlib.sha256(guide.read_bytes()).hexdigest(),
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(), palette=palette)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    n, bad, valid = check(id, target)
    meta['paneColorCheck'] = {'matched': n - len(bad), 'total': n, 'valid': bool(valid), 'mismatches': bad}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(f'{id}: {n - len(bad)}/{n} pane colours match, {target.stat().st_size // 1024} KB', flush=True)
    if bad or not valid:
        raise ValueError(f'{id}: artwork must be corrected before building: {bad}')
    map_path = HERE / 'maps' / f'{id}.json'
    info = json.loads(map_path.read_text())
    if info.pop('artworkNeedsRefresh', False):
        map_path.write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=HERE / 'levels-26-50-prompts.json')
    parser.add_argument('ids', nargs='+')
    args = parser.parse_args()
    for id in args.ids:
        import_image(id, args.manifest)
