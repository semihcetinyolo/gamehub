"""Prepare, review and publish the visible-pane repair snapshot."""
import argparse
import hashlib
import json
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from repair_visible_panes import OUT, ROOT, HERE, write
from audit_geometry import inspect, fingerprint, VERSION


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def transfer(ident):
    import reuse_glass
    reuse_glass.OUT = OUT
    row = reuse_glass.transfer(ident)
    file = OUT / 'maps' / f'{ident}.json'; info = json.loads(file.read_text())
    for ext in ['.webp', '.json']:
        (OUT / 'art' / f'{ident}-restored{ext}').rename(OUT / 'art' / f'{ident}-panes{ext}')
    info.update(image=f'assets/glass/{ident}-panes.webp', artMetadata=f'assets/glass/{ident}-panes.json')
    write(file, info)
    return row


def publish(rows):
    assert sha(ROOT / 'stained-levels.js') == sha(OUT / 'before/stained-levels.js'), 'Catalogue changed'
    pending = []
    for row in rows:
        ident = row['id']; file = OUT / 'maps' / f'{ident}.json'; info = json.loads(file.read_text())
        assert sha(HERE / 'maps' / file.name) == row['mapSha256'], f'{ident}: source changed'
        assert sha(ROOT / row['image']) == row['sha256'], f'{ident}: source glass changed'
        q = info['geometryQuality']; assert q['version'] == VERSION and q['valid'] and not q['issues'], ident
        assert q['fingerprint'] == fingerprint(info['map']), ident
        assert info['clueFocus']['prepared'] and info['clueFocus']['geometry'] == q['fingerprint'], ident
        assert info['clueFocus']['solution'] == hashlib.sha256(json.dumps(info['solution'], separators=(',', ':')).encode()).hexdigest(), ident
        changed = bool(info.get('visiblePaneRepair'))
        base = OUT / 'art' if changed else ROOT / 'assets/glass'
        image = base / Path(info['image']).name
        meta = json.loads((base / Path(info['artMetadata']).name).read_text())
        check = meta['paneColorCheck']
        assert not info.get('artworkNeedsRefresh') and check['valid'] and check['matched'] == check['total'] == info['map']['count'], ident
        assert not check.get('mismatches') and meta['sha256'] == sha(image), ident
        guide = (OUT if changed else HERE) / 'guides' / f'{ident}.png'
        assert meta['guide'] == sha(guide), ident
        pending.append((file, info, changed))
    for file, info, changed in pending:
        if changed:
            for key in ['image', 'artMetadata']:
                shutil.copy2(OUT / 'art' / Path(info[key]).name, ROOT / info[key])
            for ext in ['.png', '.labels.png', '.svg']:
                shutil.copy2(OUT / 'guides' / f'{info["id"]}{ext}', HERE / 'guides' / f'{info["id"]}{ext}')
        shutil.copy2(file, HERE / 'maps' / file.name)
    file = HERE / 'pattern-catalog.json'; catalog = json.loads(file.read_text())
    for item in catalog['assets']:
        info = json.loads((HERE / 'maps' / f'{item["id"]}.json').read_text())
        item.update(file=info['image'], vector=info['vectorGuide'])
    file.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print('Published', len(pending), 'maps;', sum(r[2] for r in pending), 'refreshed glass assets')


def review(rows):
    entries = []
    for row in rows:
        info = json.loads((OUT / 'maps' / f'{row["id"]}.json').read_text())
        if not info.get('visiblePaneRepair'):
            continue
        before = json.loads((OUT / 'before/maps' / f'{row["id"]}.json').read_text())
        entries.append(dict(**row, before=before, after=info))
    write(OUT / 'review/data.json', entries)
    # Embed data so the comparison also works directly from a local file.
    html = '''<!doctype html><html lang="tr"><meta charset="utf-8"><title>Bölge ayrımları — önce / sonra</title>
<style>body{margin:24px;background:#f3f0e6;color:#26362e;font:16px system-ui}header{display:flex;gap:16px;align-items:center;flex-wrap:wrap}select,button{font:inherit;padding:9px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{min-width:0}svg,img{display:block;width:100%;max-height:78vh;object-fit:contain;background:#e2dfd5}h2{font-size:18px}.region{cursor:pointer}p{line-height:1.5}</style>
<header><h1>Bağımsız boyanabilir bölgeler</h1><select id="level"></select><select id="mode"><option value="start">Başlangıç</option><option value="fill">Tam renkler</option><option value="regions">Bölge kimlikleri</option><option value="glass">Vitray</option></select></header>
<p>Önce ve sonra aynı ölçekte gösterilir. Bölgeleri tıklayarak tek başına boyandığını karşılaştırabilirsin. Yenilemek için bölüm veya görünüm seçimini değiştir.</p><main><article><h2>Önce</h2><div id="before"></div></article><article><h2>Sonra</h2><div id="after"></div></article></main>
<script>const data=DATA;const select=document.querySelector('#level'),mode=document.querySelector('#mode');for(const r of data)select.add(new Option(`${r.level}. ${r.name}`,r.id));select.value='lotus';
function draw(info,side){const m=info.map,box=document.querySelector('#'+side),colors=info.palette.map(p=>Array.isArray(p)?p[1]:p);if(mode.value==='glass'){box.innerHTML=`<img src="${side==='before'?'../../'+info.image:'art/'+info.image.split('/').pop()}">`;return}box.innerHTML=`<svg viewBox="0 0 ${m.cols} ${m.rows}" xmlns="http://www.w3.org/2000/svg"><g>${m.paths.map((d,r)=>`<path class="region" data-r="${r}" d="${d}" fill-rule="evenodd" fill="${mode.value==='regions'?`hsl(${r*137.508%360} 62% 68%)`:mode.value==='start'&&info.given[r]<0?'#efeddc':colors[info.solution[r]]}"/>`).join('')}</g><path d="${m.edgePath}" fill="none" stroke="#30332c" stroke-width="3.2" vector-effect="non-scaling-stroke" pointer-events="none"/><path d="${m.shape}" fill="none" stroke="#44483a" stroke-width="4.5" vector-effect="non-scaling-stroke" pointer-events="none"/></svg>`;box.querySelectorAll('.region').forEach(p=>{p.onclick=()=>p.setAttribute('fill',p.getAttribute('fill')==='#ef7791'?'#efeddc':'#ef7791');p.innerHTML=`<title>Bölge ${+p.dataset.r+1}</title>`})}function render(){const r=data.find(r=>r.id===select.value);draw(r.before,'before');draw(r.after,'after')}select.onchange=mode.onchange=render;render();</script></html>'''
    (OUT / 'index.html').write_text(html.replace('DATA', json.dumps(entries, ensure_ascii=False)))
    print('Comparison:', OUT / 'index.html')


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['focus', 'art', 'publish', 'review']); parser.add_argument('ids', nargs='*'); parser.add_argument('--jobs', type=int, default=3)
    args = parser.parse_args(); rows = json.loads((OUT / 'before/manifest.json').read_text())
    if args.ids: rows = [r for r in rows if r['id'] in args.ids]
    if args.action == 'focus':
        from focal_regions import priorities
        from creative_designs import catalog
        creative = {d['id']: d for d in catalog()}
        for row in rows:
            file = OUT / 'maps' / f'{row["id"]}.json'; info = json.loads(file.read_text())
            if info.get('visiblePaneRepair'):
                info['clueFocus'] = priorities(info, creative); write(file, info)
    elif args.action == 'art':
        ids = [r['id'] for r in rows if json.loads((OUT / 'maps' / f'{r["id"]}.json').read_text()).get('artworkNeedsRefresh')]
        report = []
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            futures = {pool.submit(transfer, ident): ident for ident in ids}
            for future in as_completed(futures):
                try: result = future.result()
                except Exception as error: result = dict(id=futures[future], error=str(error))
                report.append(result); print(json.dumps(result), flush=True)
        write(OUT / 'reports/art.json', report)
        assert not any('error' in r for r in report), 'Unresolved artwork'
    elif args.action == 'publish': publish(rows)
    else: review(rows)


if __name__ == '__main__': main()
