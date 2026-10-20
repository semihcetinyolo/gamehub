"""Complete clues/focal hints/art for finished immutable staging maps."""
import json,sys,subprocess
from pathlib import Path
from silhouette_rollout import OUT,CREATIVE
from focal_regions import priorities
ids=sys.argv[1:]
if not ids:
 for line in (OUT/'incremental-locked.log').read_text().replace('\0','').splitlines():
  if not line.startswith('{'):continue
  try:r=json.loads(line)
  except ValueError:continue
  if r.get('valid') and r.get('restored',0)<80:ids.append(r['id'])
 ids=list(dict.fromkeys(ids))
ids=[id for id in ids if not json.loads((OUT/'maps'/f'{id}.json').read_text()).get('clueFocus',{}).get('prepared')]
if not ids:print('No new prepared geometry');raise SystemExit()
print('Finishing',len(ids),ids,flush=True)
subprocess.run(['node','tools/stained/silhouette_clues.js',*ids],check=True)
for id in ids:
 p=OUT/'maps'/f'{id}.json';d=json.loads(p.read_text());d['clueFocus']=priorities(d,CREATIVE);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
subprocess.run(['node','tools/stained/silhouette_focus.js',*ids],check=True)
subprocess.run([sys.executable,'tools/stained/silhouette_art.py',*ids,'--jobs','2'],check=True)
