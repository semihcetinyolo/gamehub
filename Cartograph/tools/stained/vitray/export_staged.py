"""Write staged.js: every staged vitray level with clues, for the live level sheet.

python tools/stained/vitray/export_staged.py [--watch]
tools/sheet/index.html polls it next to stained-levels.js, so new levels show up
there while they are still being made (and after they are published).
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE / 'staged.js'


def export():
    levels = []
    for f in sorted((HERE / 'work').glob('*.map.json')):
        i = json.loads(f.read_text())
        if not i.get('given'):
            continue
        m = i['map']
        art = ROOT / i['artMetadata'] if i.get('artMetadata') else None
        palette = json.loads(art.read_text())['palette'] if art and art.exists() and not i.get('artworkNeedsRefresh') else [h for _, h in i['palette']]
        levels.append(dict(id=i['id'], name=i['name'], palette=palette, given=i['given'],
                           map={k: m[k] for k in ('cols', 'rows', 'count', 'shape', 'paths', 'edgePath')},
                           image=None if i.get('artworkNeedsRefresh') else i.get('image'),
                           canvasSize='large', staged=True,
                           **({'difficulty': i['difficulty']} if i.get('difficulty') else {})))
    body = 'window.CARTO_VITRAY_STAGED = ' + json.dumps(levels, ensure_ascii=False, separators=(',', ':')) + ';\n'
    if not OUT.exists() or OUT.read_text() != body:
        tmp = OUT.with_suffix('.tmp')
        tmp.write_text(body)
        tmp.replace(OUT)
        return len(levels)
    return None


if __name__ == '__main__':
    while True:
        n = export()
        if n is not None:
            print(f'staged.js: {n} levels', flush=True)
        if '--watch' not in sys.argv:
            break
        time.sleep(10)
