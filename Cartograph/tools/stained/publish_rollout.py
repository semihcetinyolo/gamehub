"""Publish a complete staged local glass/geometry rollout, retaining all originals."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tools/stained';OUT=ROOT/'output/geometry-rollout'
rows=json.loads((OUT/'before/manifest.json').read_text());manifest=[]
# Preflight every asset before the first catalogue map mutation.
for row in rows:
 id=row['id'];info=json.loads((OUT/'maps'/f'{id}.json').read_text())
 assert not info.get('artworkNeedsRefresh'),id
 changed=info.get('image','').endswith('-restored.webp')
 image=OUT/'art'/f'{id}-restored.webp' if changed else ROOT/row['image']
 meta=image.with_suffix('.json');art=json.loads(meta.read_text());check=art['paneColorCheck']
 assert check['valid'] and check['matched']==check['total']==info['map']['count'] and not check.get('mismatches'),id
 assert art['sha256']==hashlib.sha256(image.read_bytes()).hexdigest(),id
 if changed:
  assert art['sourceSha256']==row['sha256'],id
  assert art['guide']==hashlib.sha256((OUT/'guides'/f'{id}.png').read_bytes()).hexdigest(),id
  manifest.append(dict(level=row['level'],id=id,source=art['source'],sourceSha256=art['sourceSha256'],file=info['image'],metadata=info['artMetadata'],guide=f'tools/stained/guides/{id}.png',method=art['method']))
for row in rows:
 id=row['id'];info=json.loads((OUT/'maps'/f'{id}.json').read_text())
 if info.get('image','').endswith('-restored.webp'):
  for ext in ('.webp','.json'):shutil.copy2(OUT/'art'/f'{id}-restored{ext}',ROOT/'assets/glass'/f'{id}-restored{ext}')
  for ext in ('.png','.labels.png','.svg'):shutil.copy2(OUT/'guides'/f'{id}{ext}',HERE/'guides'/f'{id}{ext}')
 info['geometryHash']=hashlib.sha256(json.dumps(info['map']['paths']).encode()).hexdigest()
 (HERE/'maps'/f'{id}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
path=HERE/'pattern-catalog.json';catalog=json.loads(path.read_text())
for entry in catalog['assets']:
 info=json.loads((HERE/'maps'/f'{entry["id"]}.json').read_text());entry.update(file=info['image'],vector=info['vectorGuide'])
path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
(HERE/'glass-reuse-manifest.json').write_text(json.dumps(dict(tool='local existing glass texture reuse',assets=manifest),ensure_ascii=False,indent=2)+'\n')
print(f'Published {len(rows)} maps, {len(manifest)} refreshed glass assets; originals retained.')
