"""Staged catalogue rollout of the approved readable-junction policy."""
import argparse,copy,hashlib,json,traceback
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely import affinity
from shapely.ops import unary_union
from designs import DESIGNS,SYMMETRIC
from creative_designs import catalog
from make_maps import region_polys,color
from junction_pilot import junctions
from readable_junctions import repair
from audit_geometry import inspect,fingerprint,VERSION

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/junction-rollout'


def build(ident):
    source=OUT/'before/maps'/f'{ident}.json';info=json.loads(source.read_text());old=copy.deepcopy(info['map']);sol=info['solution'][:]
    if not junctions(old):return dict(id=ident,retained=True)
    protected=None;mirror=None
    if ident in DESIGNS:
        authored,_,p=DESIGNS[ident]['build']()
        barriers=([p.boundary] if p is not None else [])+[l for l in authored if getattr(l,'is_ring',False)]
        protected=unary_union(barriers) if barriers else None
        if ident=='lighthouse':protected=unary_union(authored[:3])
        if ident in SYMMETRIC:mirror=old['cols']/2
    elif ident.startswith(('grand_','motif_','story_')):
        d=next(x for x in catalog() if x['id']==ident)
        protected=unary_union([affinity.scale(g.boundary,old['cols']/d['cols'],old['rows']/d['rows'],origin=(0,0)) for g,c in d['parts']])
    m,history=repair(old,sol,protected,mirror,passes=3)
    if any(sol[i]==sol[j] for i,ns in enumerate(m['adj']) for j in ns):
        sol=color(m['adj'],sol,[p.area for p in region_polys(m)],241020)
    for key in ['preferred','area','clearance']:m.pop(key,None)
    info.update(map=m,solution=sol,geometryRevision=5,junctionStyle='readable-t',artworkNeedsRefresh=True)
    info.pop('difficulty',None);info.pop('given',None)
    original=json.loads(source.read_text())['solution']
    info['junctionRollout']=dict(before=junctions(old),remaining=junctions(m),repairs=history,recoloredPanes=sum(a!=b for a,b in zip(sol,original)))
    info['geometryQuality']=dict(version=VERSION,valid=not inspect(m),fingerprint=fingerprint(m),issues=inspect(m))
    (OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return dict(id=ident,before=len(junctions(old)),remaining=len(junctions(m)),repairs=len(history),issues=inspect(m))


def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');p.add_argument('--jobs',type=int,default=6);a=p.parse_args()
    rows=json.loads((OUT/'before/manifest.json').read_text());ids=a.ids or [r['id'] for r in rows if r['junctions']];report=[]
    with ProcessPoolExecutor(max_workers=a.jobs) as pool:
        futures={pool.submit(build,ident):ident for ident in ids}
        for f in as_completed(futures):
            try:r=f.result()
            except Exception as e:r=dict(id=futures[f],error=str(e),traceback=traceback.format_exc())
            report.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
    (OUT/'reports/first-pass.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
