"""Re-encode the V2 glass at the shipped size (art.OUT_SCALE / OUT_QUALITY).

python tools/stained/vitray/compact_glass.py
The Fugo zip must stay under 150 MB; the registered 1728 x 2304 glass made it
~294 MB. Each full-size original is kept in output/glass-full/ (not shipped);
the pane colours are validated again and the art metadata hash is updated.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

from art import ROOT, HERE, OUT_SCALE, save_glass, validate

FULL = ROOT / 'output' / 'glass-full'


def main():
    FULL.mkdir(parents=True, exist_ok=True)
    text = (ROOT / 'stained-levels-v2.js').read_text()
    levels = json.JSONDecoder().raw_decode(text[text.index('['):])[0]
    before = after = 0
    for L in levels:
        work = HERE / 'work' / f"{L['id']}.map.json"
        info = json.loads(work.read_text())
        image = ROOT / info['image']
        meta_file = ROOT / info['artMetadata']
        meta = json.loads(meta_file.read_text())
        m = info['map']
        img = Image.open(image)
        if img.size == (round(m['cols'] * OUT_SCALE), round(m['rows'] * OUT_SCALE)):
            continue
        before += image.stat().st_size
        backup = FULL / image.name
        if not backup.exists():
            backup.write_bytes(image.read_bytes())
        out = save_glass(img.convert('RGB'), m, image)
        checked = validate(info, out, meta['palette'])
        assert checked['valid'], f"{L['id']}: pane colours after re-encoding {checked['mismatches'][:5]}"
        meta.update(size=list(out.size), sha256=hashlib.sha256(image.read_bytes()).hexdigest(), paneColorCheck=checked,
                    fullSize=str(backup.relative_to(ROOT)))
        meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
        after += image.stat().st_size
    print(f'{before / 1048576:.0f} MB -> {after / 1048576:.0f} MB')


if __name__ == '__main__':
    main()
