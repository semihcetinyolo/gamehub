"""Give fixed contours space by enlarging a complete composition before retrying T joins."""
import json,argparse,traceback
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely import affinity
from silhouette_rollout import OUT,ROOT,constraints
from silhouette_authored import scaled
from readable_junctions import repair,remove_divider,preserves_boundary
from junction_pilot import junctions
from audit_geometry import inspect,fingerprint,VERSION
from make_maps import color,region_polys

def fix(id):
 file=OUT/'maps'/f'{id}.json';original=json.loads(file.read_text())
 if original['geometryQuality']['valid']:return dict(id=id,alreadyValid=True)
 baseline=ROOT/'output/junction-rollout/before/maps'/file.name;pilot=ROOT/'output/junction-pilot/before/maps'/file.name
 before=json.loads((pilot if pilot.exists() else baseline).read_text())['map'];soft,critical,mirror=constraints(id,before)
 for factor in [1.5,2,3]:
  m=scaled(original['map'],factor);sol=original['solution'][:];hard=affinity.scale(critical,factor,factor,origin=(0,0));protect=affinity.scale(soft,factor,factor,origin=(0,0)) if soft is not None else None;axis=mirror*factor if mirror is not None else None
  m,history=repair(m,sol,protect,axis,passes=2,immutable=hard)
  for _ in range(8):
   if not junctions(m):break
   changed=False
   for p,_ in junctions(m):
    if not any(q==p for q,_ in junctions(m)):continue
    result=remove_divider(m,sol,p,protect,axis,60 if original.get('large') else 12,hard)
    if result:m,sol,h=result;history.append(h);changed=True
   if not changed:break
  issues=inspect(m)
  if issues:continue
  sol=color(m['adj'],sol,[p.area for p in region_polys(m)],241028)
  for key in ['preferred','area','clearance']:m.pop(key,None)
  original.update(map=m,solution=sol);original['silhouetteRepair']['repairs']+=history+[dict(method='enlarge whole scene',factor=factor)];original['silhouetteRepair'].update(remaining=[],scale=factor,immutablePreserved=preserves_boundary(m,hard));original['geometryQuality']=dict(version=VERSION,valid=True,issues=[],fingerprint=fingerprint(m));file.write_text(json.dumps(original,ensure_ascii=False,separators=(',',':')))
  return dict(id=id,factor=factor,count=m['count'],issues=[])
 return dict(id=id,unresolved=True,remaining=len(junctions(m)))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='+');p.add_argument('--jobs',type=int,default=3);a=p.parse_args()
 with ProcessPoolExecutor(max_workers=a.jobs) as pool:
  fs={pool.submit(fix,i):i for i in a.ids}
  for f in as_completed(fs):
   try:print(json.dumps(f.result()),flush=True)
   except Exception as e:print(json.dumps(dict(id=fs[f],error=str(e))),flush=True)
