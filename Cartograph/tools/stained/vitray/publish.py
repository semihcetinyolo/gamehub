"""Publish finished vitray levels into the game catalogue.

python tools/stained/vitray/publish.py <id> [...]
  work/<id>.map.json -> tools/stained/maps/<id>.json, adds the id to vitray/catalog.json
  (hard levels keep difficulty.tier == 'hard' from clues.js --hard), then
  node vitray/insert_order.js and node build_levels.js.
Refuses a level whose glass, clues or geometry approval is missing or stale.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAINED = HERE.parent
ROOT = STAINED.parents[1]
sys.path.insert(0, str(STAINED))
from audit_geometry import fingerprint, inspect, VERSION  # noqa: E402
import visible_contacts  # noqa: E402


def check(id):
    info = json.loads((HERE / 'work' / f'{id}.map.json').read_text())
    m = info['map']
    assert not inspect(m), f'{id}: geometry audit issues'
    assert not visible_contacts.inspect(m), f'{id}: visible-contact issues'
    q = info['geometryQuality']
    assert q['version'] == VERSION and q['valid'] and q['fingerprint'] == fingerprint(m), f'{id}: stale geometry approval'
    assert info.get('given') and info['clueFocus'].get('prepared'), f'{id}: run clues.js'
    assert info['clueFocus']['solution'] == hashlib.sha256(json.dumps(info['solution'], separators=(',', ':')).encode()).hexdigest(), \
        f'{id}: clues were prepared for another solution'
    assert not info.get('artworkNeedsRefresh'), f'{id}: run art.py finish'
    art = json.loads((ROOT / info['artMetadata']).read_text())
    assert art['paneColorCheck']['valid'], f'{id}: glass colour check failed'
    return info


def main(ids):
    catalog_file = HERE / 'catalog.json'
    catalog = json.loads(catalog_file.read_text()) if catalog_file.exists() else {'levels': []}
    known = {l['id']: l for l in catalog['levels']}
    for id in ids:
        info = check(id)
        (STAINED / 'maps' / f'{id}.json').write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
        known[id] = dict(id=id, name=info['name'], hard=info.get('difficulty', {}).get('tier') == 'hard',
                         panes=info['map']['count'], source=json.loads((HERE / 'refs' / 'sources.json').read_text()).get(id))
        print(f'{id}: staged into maps/ ({info["map"]["count"]} panes)')
    catalog['levels'] = list(known.values())
    catalog_file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    subprocess.run(['node', str(HERE / 'insert_order.js')], check=True)
    subprocess.run(['node', str(STAINED / 'build_levels.js')], check=True, stdout=subprocess.DEVNULL)
    print('stained-levels.js rebuilt')


if __name__ == '__main__':
    main(sys.argv[1:])
