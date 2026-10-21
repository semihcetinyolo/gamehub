"""Write stained-levels-v1.js: the earlier drawing of every level that changed.

The game's Settings > SÜRÜM > V1 loads it on demand and swaps these entries in
by id. Source: the visible-contact snapshot taken before the rollout.
python tools/stained/build_v1_levels.py   (after build_levels.js)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BEFORE = ROOT / 'output/visible-contacts/before/stained-levels.js'


def levels(file):
    text = file.read_text()
    return json.JSONDecoder().raw_decode(text[text.index('['):])[0]


def main():
    current = {l['id']: l for l in levels(ROOT / 'stained-levels.js')}
    older = {l['id']: l for l in levels(BEFORE) if l['id'] in current and l != current[l['id']]}
    for l in older.values():
        assert (ROOT / l['image']).exists(), l['image']
    body = json.dumps(older, ensure_ascii=False, separators=(',', ':'))
    (ROOT / 'stained-levels-v1.js').write_text(f'window.CARTO_STAINED_V1 = {body};\n')
    print(f'stained-levels-v1.js: {len(older)} levels, {len(body) // 1024} KB')


if __name__ == '__main__':
    main()
