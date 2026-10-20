"""Refine crowded junctions which a single-divider move could not resolve."""
import json,traceback,argparse
from concurrent.futures import ProcessPoolExecutor,as_completed
from pathlib import Path
from shapely import affinity
from shapely.ops import unary_union
from designs import DESIGNS,SYMMETRIC
from creative_designs import catalog
from make_maps import region_polys,color
from junction_pilot import junctions,repair_one
from readable_junctions import repair,remove_divider
from audit_geometry import inspect,fingerprint,VERSION
from junction_rollout import OUT


def refine(ident):
    file=OUT/'maps'/f'{ident}.json';info=json.loads(file.read_text());m=info['map'];sol=info['solution'];history=info['junctionRollout']['repairs']
    protected=None;mirror=None
    if ident in DESIGNS:
        authored,_,p=DESIGNS[ident]['build']()
        barriers=([p.boundary] if p is not None else [])+[l for l in authored if getattr(l,'is_ring',False)]
        protected=unary_union(barriers) if barriers else None
        if ident=='lighthouse':protected=unary_union(authored[:3])
        if ident in SYMMETRIC:mirror=m['cols']/2
    elif ident.startswith(('grand_','motif_','story_')):
        d=next(x for x in catalog() if x['id']==ident)
        protected=unary_union([affinity.scale(g.boundary,m['cols']/d['cols'],m['rows']/d['rows'],origin=(0,0)) for g,c in d['parts']])
    before=len(junctions(m))
    m,details=repair(m,sol,protected,mirror,passes=3);history.extend(details)
    # The approved balanced two-stem variant can preserve more room in a tight X.
    if mirror is None:
        for p,degree in junctions(m):
            if degree!=4:continue
            result=repair_one(m,p,sol,max(.52,m['cols']*10/300),protected)
            if result:
                m,detail=result;history.append(detail)
    for iteration in range(30):
        remaining=junctions(m)
        if not remaining:break
        progressed=False
        for p,degree in remaining:
            if not any(q==p for q,_ in junctions(m)):continue
            result=remove_divider(m,sol,p,protected,mirror,minimum_count=60 if info.get('large') else 12)
            if result:
                m,sol,detail=result;history.append(detail);progressed=True
                m,details=repair(m,sol,protected,mirror,passes=2);history.extend(details)
        if not progressed:break
    if any(sol[i]==sol[j] for i,ns in enumerate(m['adj']) for j in ns):sol=color(m['adj'],sol,[p.area for p in region_polys(m)],241021)
    for key in ['preferred','area','clearance']:m.pop(key,None)
    info.update(map=m,solution=sol,artworkNeedsRefresh=True)
    info['junctionRollout'].update(remaining=junctions(m),repairs=history)
    info['geometryQuality']=dict(version=VERSION,valid=not inspect(m),fingerprint=fingerprint(m),issues=inspect(m))
    file.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return dict(id=ident,before=before,remaining=len(junctions(m)),count=m['count'],issues=inspect(m))


def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');p.add_argument('--jobs',type=int,default=6);a=p.parse_args()
    ids=a.ids
    if not ids:
        for f in (OUT/'maps').glob('*.json'):
            info=json.loads(f.read_text())
            if info.get('junctionRollout',{}).get('remaining'):ids.append(info['id'])
    report=[]
    with ProcessPoolExecutor(max_workers=a.jobs) as pool:
        fs={pool.submit(refine,id):id for id in ids}
        for f in as_completed(fs):
            try:r=f.result()
            except Exception as e:r=dict(id=fs[f],error=str(e),traceback=traceback.format_exc())
            report.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
    (OUT/'reports/refinement.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
