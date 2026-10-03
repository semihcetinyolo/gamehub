"""Import built-in image_gen outputs saved as raw/<id>.png; no API calls.

python tools/stained/import_generated.py <id> [...]
Converts to game-sized WebP, samples the palette and checks each pane's colour.
The original generated PNG and the complete prompts are kept for reproducibility.
"""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from generate_art import extract_palette
from check_art import check

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def import_image(id):
    specs = json.loads((HERE / 'levels-26-50-prompts.json').read_text())
    spec = next(asset for asset in specs['assets'] if asset['id'] == id)
    raw = HERE / 'raw' / f'{id}.png'
    target = ROOT / spec['file']
    meta_path = target.with_suffix('.json')
    with Image.open(raw) as image:
        if abs(image.width / image.height - .75) > .025:
            raise ValueError(f'{id}: unexpected image aspect ratio {image.size}')
        image.convert('RGB').resize((768, 1024), Image.Resampling.LANCZOS).save(target, 'WEBP', quality=86, method=6)
    guide = HERE / 'guides' / f'{id}.png'
    palette = extract_palette(target, guide.with_suffix('.labels.png'))
    meta = dict(id=id, tool=specs['tool'], generatedAt=datetime.now(timezone.utc).isoformat(),
                prompt=spec['prompt'], references=spec['references'], size=[768, 1024],
                guide=hashlib.sha256(guide.read_bytes()).hexdigest(),
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(), palette=palette)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    n, bad, valid = check(id)
    print(f'{id}: {n - len(bad)}/{n} pane colours match, {target.stat().st_size // 1024} KB', flush=True)
    if bad or not valid:
        raise ValueError(f'{id}: artwork must be corrected before building: {bad}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit('Usage: import_generated.py <id> [...]')
    for id in sys.argv[1:]:
        import_image(id)
