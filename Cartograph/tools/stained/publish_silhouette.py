"""Publish the approved full junction rollout after complete staged preflight."""
import hashlib,json,shutil
from pathlib import Path
from audit_geometry import fingerprint,VERSION
from junction_pilot import junctions
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tools/stained';OUT=ROOT/'output/silhouette-rollout'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
rows=json.loads((OUT/'before/manifest.json').read_text());manifest=[];prepared=[]
assert (ROOT/'stained-levels.js').read_bytes()==(OUT/'before/stained-levels.js').read_bytes(),'Catalogue changed since snapshot'
for row in rows:
    ident=row['id'];file=OUT/'maps'/f'{ident}.json';info=json.loads(file.read_text())
    assert sha(HERE/'maps'/f'{ident}.json')==row['mapSha256'],f'{ident}: concurrent map change'
    assert sha(ROOT/row['image'])==row['sha256'],f'{ident}: donor changed'
    q=info['geometryQuality'];assert q['version']==VERSION==3 and q['valid'] and not q['issues'] and q['fingerprint']==fingerprint(info['map']),ident
    assert info['clueFocus']['prepared'] and info['clueFocus']['geometry']==q['fingerprint'],ident
    assert info['clueFocus']['solution']==hashlib.sha256(json.dumps(info['solution'],separators=(',',':')).encode()).hexdigest(),ident
    assert not junctions(info['map']) and not info.get('artworkNeedsRefresh'),ident
    changed=info['image'].endswith('-silhouette.webp');image=OUT/'art'/Path(info['image']).name if changed else ROOT/info['image']
    metadata=OUT/'art'/Path(info['artMetadata']).name if changed else ROOT/info['artMetadata']
    art=json.loads(metadata.read_text());check=art['paneColorCheck']
    assert check['valid'] and check['matched']==check['total']==info['map']['count'] and not check.get('mismatches'),ident
    assert art['sha256']==sha(image),ident
    guide=(OUT if changed else HERE)/'guides'/f'{ident}.png';assert art['guide']==sha(guide),ident
    if changed:
        assert info['clueFocus']['prepared'] and art['sourceSha256']==row['sha256'],ident
        assert image.name==f'{ident}-silhouette.webp',ident
        for ext in ['.png','.labels.png','.svg']:assert (OUT/'guides'/f'{ident}{ext}').exists(),ident
        manifest.append(dict(level=row['level'],id=ident,source=art['source'],sourceSha256=art['sourceSha256'],file=info['image'],metadata=info['artMetadata'],method=art['method']))
    if changed:
        expected=hashlib.sha256(json.dumps(info['map']['paths']).encode()).hexdigest();assert info['geometryHash']==expected,ident
    prepared.append((row,info))
for row,info in prepared:
    ident=row['id']
    if info['image'].endswith('-silhouette.webp'):
        for key in ['image','artMetadata']:shutil.copy2(OUT/'art'/Path(info[key]).name,ROOT/info[key])
        for ext in ['.png','.labels.png','.svg']:shutil.copy2(OUT/'guides'/f'{ident}{ext}',HERE/'guides'/f'{ident}{ext}')
    (HERE/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
p=HERE/'pattern-catalog.json';catalog=json.loads(p.read_text())
for entry in catalog['assets']:
    info=json.loads((HERE/'maps'/f'{entry["id"]}.json').read_text());entry.update(file=info['image'],vector=info['vectorGuide'])
p.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
(OUT/'publication-manifest.json').write_text(json.dumps(dict(tool='local existing glass texture reuse',assets=manifest),ensure_ascii=False,indent=2)+'\n')
print(f'Published {len(rows)} map records and {len(manifest)} refreshed glass assets; source assets retained.')
