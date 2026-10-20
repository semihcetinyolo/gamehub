"""Resolve remaining joins by deleting dispensable seams, never protected curves."""
import json,argparse,traceback,copy
from concurrent.futures import ProcessPoolExecutor,as_completed
from silhouette_rollout import OUT,ROOT,constraints
from readable_junctions import repair,remove_divider,preserves_boundary
from junction_pilot import junctions
from make_maps import color,region_polys
from audit_geometry import inspect,fingerprint,VERSION

def refine(ident):
 file=OUT/'maps'/f'{ident}.json';info=json.loads(file.read_text());m=info['map'];sol=info['solution'];history=info['silhouetteRepair']['repairs']
 original=ROOT/'output/junction-rollout/before/maps'/file.name;pilot=ROOT/'output/junction-pilot/before/maps'/file.name
 baseline=json.loads((pilot if pilot.exists() else original).read_text())['map'];soft,immutable,mirror=constraints(ident,baseline)
 m,h=repair(m,sol,soft,mirror,passes=3,immutable=immutable);history+=h
 for _ in range(15):
  if not junctions(m):break
  changed=False
  for p,n in junctions(m):
   if not any(q==p for q,_ in junctions(m)):continue
   result=remove_divider(m,sol,p,soft,mirror,60 if info.get('large') else 12,immutable)
   if result:m,sol,h=result;history.append(h);changed=True
  if not changed:break
 if any(sol[r]==sol[j] for r,ns in enumerate(m['adj']) for j in ns):sol=color(m['adj'],sol,[p.area for p in region_polys(m)],241024)
 for key in ['preferred','area','clearance']:m.pop(key,None)
 info.update(map=m,solution=sol);info['silhouetteRepair'].update(remaining=junctions(m),repairs=history,immutablePreserved=preserves_boundary(m,immutable));issues=inspect(m);info['geometryQuality']=dict(version=VERSION,valid=not issues,issues=issues,fingerprint=fingerprint(m));file.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
 return dict(id=ident,remaining=len(junctions(m)),issues=issues,count=m['count'])

if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('ids',nargs='*');args=a.parse_args();ids=args.ids
 with ProcessPoolExecutor(max_workers=3) as pool:
  fs={pool.submit(refine,i):i for i in ids}
  for f in as_completed(fs):
   try:print(json.dumps(f.result()),flush=True)
   except Exception as e:print(json.dumps(dict(id=fs[f],error=str(e),traceback=traceback.format_exc())),flush=True)
