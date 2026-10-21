"""Focus weights, glass transfer and publication for staged visible-contact repairs.

python tools/stained/visible_contact_assets.py focus fox
node tools/stained/visible_contact_clues.js fox
python tools/stained/visible_contact_assets.py art fox
python tools/stained/visible_contact_assets.py publish fox
then audit_geometry.py --stamp and build_levels.js.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from audit_geometry import fingerprint, inspect as geometry_inspect, VERSION
from repair_visible_contacts import OUT, ROOT, HERE, write
from visible_contacts import inspect as contact_inspect


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def staged(rows):
    for row in rows:
        file = OUT / 'maps' / f'{row["id"]}.json'
        info = json.loads(file.read_text())
        if info.get('visibleContactRepair'):
            yield row, file, info


def focus(rows):
    from focal_regions import priorities
    from creative_designs import catalog
    creative = {d['id']: d for d in catalog()}
    for _, file, info in staged(rows):
        if not info.get('clueFocus'):
            info['clueFocus'] = priorities(info, creative); write(file, info)


def transfer(ident):
    import reuse_glass
    reuse_glass.OUT = OUT
    result = reuse_glass.transfer(ident)
    for ext in ['.webp', '.json']:
        (OUT / 'art' / f'{ident}-restored{ext}').rename(OUT / 'art' / f'{ident}-contacts{ext}')
    file = OUT / 'maps' / f'{ident}.json'; info = json.loads(file.read_text())
    info.update(image=f'assets/glass/{ident}-contacts.webp', artMetadata=f'assets/glass/{ident}-contacts.json')
    write(file, info)
    return result


def art(rows, jobs=8):
    from concurrent.futures import ProcessPoolExecutor, as_completed
    ids = [row['id'] for row, _, info in staged(rows) if info.get('artworkNeedsRefresh')]
    failed = []
    with ProcessPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(transfer, ident): ident for ident in ids}
        for future in as_completed(futures):
            try:
                print(json.dumps(future.result()), flush=True)
            except Exception as error:
                failed.append(futures[future]); print(json.dumps(dict(id=futures[future], error=str(error)[:200])), flush=True)
    assert not failed, f'glass transfer failed: {failed}'


def publish(rows):
    for row, file, info in staged(rows):
        ident = row['id']
        if json.loads((HERE / 'maps' / file.name).read_text())['map'] == info['map']:
            continue  # already published (the audit stamp rewrites the file)
        assert sha(HERE / 'maps' / file.name) == row['mapSha256'], f'{ident}: source map changed since the snapshot'
        # A level whose remaining issues need a source change still ships its
        # automatic improvements; it must never get worse.
        before = json.loads((OUT / 'before/maps' / file.name).read_text())['map']
        after, earlier = len(contact_inspect(info['map'])), len(contact_inspect(before))
        rebuilt = info['visibleContactRepair'].get('rebuiltFromAuthored')
        assert not geometry_inspect(info['map']) and (after < earlier or (rebuilt and after <= earlier)), ident
        q = info['geometryQuality']; assert q['version'] == VERSION and q['valid'] and q['fingerprint'] == fingerprint(info['map']), ident
        assert info['clueFocus']['prepared'] and info['clueFocus']['geometry'] == q['fingerprint'], ident
        meta = json.loads((OUT / 'art' / Path(info['artMetadata']).name).read_text()); check = meta['paneColorCheck']
        assert not info.get('artworkNeedsRefresh') and check['valid'] and check['matched'] == check['total'] == info['map']['count'], ident
        assert meta['sha256'] == sha(OUT / 'art' / Path(info['image']).name), ident
        for key in ['image', 'artMetadata']:
            shutil.copy2(OUT / 'art' / Path(info[key]).name, ROOT / info[key])
        for ext in ['.png', '.labels.png', '.svg']:
            shutil.copy2(OUT / 'guides' / f'{ident}{ext}', HERE / 'guides' / f'{ident}{ext}')
        shutil.copy2(file, HERE / 'maps' / file.name)
        print('Published', ident)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['focus', 'art', 'publish']); parser.add_argument('ids', nargs='*')
    args = parser.parse_args(); rows = json.loads((OUT / 'before/manifest.json').read_text())
    if args.ids: rows = [r for r in rows if r['id'] in args.ids]
    dict(focus=focus, art=art, publish=publish)[args.action](rows)


if __name__ == '__main__':
    main()
