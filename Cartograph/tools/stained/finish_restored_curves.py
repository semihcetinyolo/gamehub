"""Finish restored source arcs using background-only simplification."""
import json,traceback,argparse,math
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely import affinity
from silhouette_rollout import OUT,constraints
from authored_clean import cleanup
from readable_junctions import repair,remove_divider,preserves_boundary
from silhouette_authored import scaled
from make_maps import region_polys,color
from audit_geometry import inspect,fingerprint,VERSION
from junction_pilot import junctions

def finish(id):
 p=OUT/'restored'/f'{id}.json'
 if not p.exists():return dict(id=id,missing=True)
 x=json.loads(p.read_text());m=x['map'];soft,critical,mirror=constraints(id,m);m,history=cleanup(m,critical,60 if x.get('large') else 12)
 # Safe enlargement preserves all restored contours and label positions.
 issues=inspect(m,allow_junctions=True);factor=1
 if issues and all(i[0] in ['short','near-gap'] for i in issues):
  factor=max([1]+[(.3 if i[0]=='short' else .235)/i[3] for i in issues]);factor=math.ceil(factor*10)/10
  if factor<=3:
   m=scaled(m,factor);critical=affinity.scale(critical,factor,factor,origin=(0,0));soft=affinity.scale(soft,factor,factor,origin=(0,0)) if soft is not None else None;mirror=mirror*factor if mirror is not None else None;history.append(dict(method='enlarge whole composition',factor=factor))
  else:factor=1
 sol=[0]*m['count'];m,h=repair(m,sol,soft,mirror,passes=2,immutable=critical);history+=h
 for _ in range(15):
  if not junctions(m):break
  changed=False
  for pt,_ in junctions(m):
   if not any(q==pt for q,_ in junctions(m)):continue
   result=remove_divider(m,sol,pt,soft,mirror,60 if x.get('large') else 12,critical)
   if result:m,sol,h=result;history.append(h);changed=True
  if not changed:break
 issues=inspect(m)
 if not issues:
  oldps=region_polys(x['map']);newps=region_polys(m)
  if factor!=1:oldps=[affinity.scale(p,factor,factor,origin=(0,0)) for p in oldps]
  preference=[x['solution'][max(range(len(oldps)),key=lambda j:p.intersection(oldps[j]).area)] for p in newps]
  sol=color(m['adj'],preference,[p.area for p in newps],241027)
  for k in ['preferred','area','clearance']:m.pop(k,None)
  x.update(map=m,solution=sol);x['silhouetteRepair']['repairs']+=history;x['silhouetteRepair'].update(remaining=[],immutablePreserved=preserves_boundary(m,critical),scale=factor);x['geometryQuality']=dict(version=VERSION,valid=True,issues=[],fingerprint=fingerprint(m))
  (OUT/'maps'/f'{id}.json').write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')))
 return dict(id=id,issues=issues,count=m['count'],factor=factor)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='+');p.add_argument('--jobs',type=int,default=3);a=p.parse_args()
 with ProcessPoolExecutor(max_workers=a.jobs) as pool:
  fs={pool.submit(finish,i):i for i in a.ids}
  for f in as_completed(fs):
   try:print(json.dumps(f.result()),flush=True)
   except Exception as e:print(json.dumps(dict(id=fs[f],error=str(e),traceback=traceback.format_exc())),flush=True)
