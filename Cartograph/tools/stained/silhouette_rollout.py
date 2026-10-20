"""Restore contour damage and resolve contacts without moving authored subject curves."""
import argparse,json,copy,hashlib,shutil,traceback
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely import affinity
from shapely.geometry import LineString,Polygon,Point
from shapely.ops import unary_union
from designs import DESIGNS,SYMMETRIC
from creative_designs import catalog
import pattern_designs,mass_designs
from make_maps import region_polys,color
from junction_pilot import junctions
from readable_junctions import repair,remove_divider,preserves_boundary,renumber_variable
from audit_geometry import inspect,fingerprint,VERSION
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tools/stained';OUT=ROOT/'output/silhouette-rollout';CREATIVE={x['id']:x for x in catalog()}
PATTERNS={x['id']:x for x in pattern_designs.catalog()}

def constraints(ident,m):
    soft=[];hard=[];mirror=m['cols']/2 if ident in SYMMETRIC else None
    if ident in DESIGNS:
        lines,_,p=DESIGNS[ident]['build']()
        soft=([p.boundary] if p is not None else [])+[l for l in lines if getattr(l,'is_ring',False)]
        if p is not None:hard=[p.boundary]
        if ident=='lighthouse':soft=list(lines[:3]);hard=list(lines[:3])
    elif ident in CREATIVE:
        d=CREATIVE[ident];parts=[affinity.scale(g,m['cols']/d['cols'],m['rows']/d['rows'],origin=(0,0)) for g,c in d['parts']]
        soft=[p.boundary for p in parts];hard=[unary_union(parts).boundary]
    elif ident in PATTERNS:
        d=PATTERNS[ident]
        if d['family']=='rings':
            _,lines,_,_=pattern_designs.rings(d['variant'])
            soft=[l for l in lines if len(l.coords)>3];hard=soft[:]
        elif d['family']=='spiral':
            _,lines,_,_=pattern_designs.spirals(d['variant'])
            soft=[l for l in lines if l.is_ring];hard=soft[:]
    elif ident.startswith('chapter_'):
        info=json.loads((OUT/'before/maps'/f'{ident}.json').read_text())
        family=(int(ident[8:])-51)%10
        lines,_,_=mass_designs._builder(info['generationSeed'],family)
        soft=[l for l in lines if getattr(l,'is_ring',False)]
        polygons=[Polygon(l) for l in soft]
        hard=[unary_union(polygons).boundary] if polygons else []
    # Isolated closed accents (eyes, windows, rings) are immutable.
    ps=region_polys(m)
    hard += [p.boundary for r,p in enumerate(ps) if len(m['adj'][r])==1]
    if not soft:return None,unary_union(hard),mirror
    soft=unary_union(soft)
    # Bind preservation to the actual clean baseline, including serialised curves.
    zone=unary_union(hard).buffer(.025) if hard else Polygon()
    critical=[LineString([e[:2],e[2:4]]) for e in m['edges'] if LineString([e[:2],e[2:4]]).difference(zone).length<.002]
    return soft,unary_union(critical),mirror

def snapshot():
    for name in ['before/maps','maps','guides','art','reports','review']: (OUT/name).mkdir(parents=True,exist_ok=True)
    if (OUT/'before/manifest.json').exists():return
    shutil.copy2(ROOT/'stained-levels.js',OUT/'before/stained-levels.js');s=(ROOT/'stained-levels.js').read_text();ls=json.JSONDecoder().raw_decode(s[s.index('['):])[0];rows=[]
    for n,l in enumerate(ls,1):
        p=HERE/'maps'/f'{l["id"]}.json';shutil.copy2(p,OUT/'before/maps'/p.name);shutil.copy2(p,OUT/'maps'/p.name)
        rows.append(dict(id=l['id'],level=n,name=l['name'],image=l['image'],hard=l.get('difficulty',{}).get('tier')=='hard',sha256=hashlib.sha256((ROOT/l['image']).read_bytes()).hexdigest(),mapSha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    (OUT/'before/manifest.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False))

def build(ident):
    current=json.loads((OUT/'before/maps'/f'{ident}.json').read_text())
    oldpath=ROOT/'output/junction-rollout/before/maps'/f'{ident}.json'
    # Also inspect the original eight pilot designs against their clean source.
    pilot=ROOT/'output/junction-pilot/before/maps'/f'{ident}.json'
    source=json.loads((pilot if pilot.exists() else oldpath).read_text())
    old=source['map'];soft,immutable,mirror=constraints(ident,old)
    # Maps with no contour displacement need no geometry or art refresh.
    if preserves_boundary(current['map'],immutable) and (soft is None or soft.is_empty):return dict(id=ident,retained=True)
    oldnet=unary_union([LineString([e[:2],e[2:4]]) for e in old['edges']]);newnet=unary_union([LineString([e[:2],e[2:4]]) for e in current['map']['edges']])
    protected=oldnet.intersection(soft.buffer(.03)) if soft is not None else immutable
    lost=protected.difference(newnet.buffer(.01)).length
    if lost<.08:return dict(id=ident,retained=True,missingAuthoredBoundary=round(lost,4))
    m=copy.deepcopy(old);sol=source['solution'];history=[]
    m,changes=repair(m,sol,soft,mirror,passes=2,immutable=immutable);history+=changes
    for _ in range(20):
        if not junctions(m):break
        changed=False
        for p,degree in junctions(m):
            if not any(q==p for q,_ in junctions(m)):continue
            result=remove_divider(m,sol,p,soft,mirror,minimum_count=60 if current.get('large') else 12,immutable=immutable)
            if result:
                m,sol,change=result;history.append(change);changed=True
                m,changes=repair(m,sol,soft,mirror,passes=1,immutable=immutable);history+=changes
        if not changed:break
    if any(sol[r]==sol[j] for r,ns in enumerate(m['adj']) for j in ns):sol=color(m['adj'],sol,[p.area for p in region_polys(m)],241023)
    for k in ['preferred','area','clearance']:m.pop(k,None)
    info=copy.deepcopy(current);info.update(map=m,solution=sol,geometryRevision=6,junctionStyle='subject-preserving-t',artworkNeedsRefresh=True)
    for key in ['given','difficulty','clueFocus']:info.pop(key,None)
    info['silhouetteRepair']=dict(missingAuthoredBoundaryBefore=lost,repairs=history,remaining=junctions(m),immutablePreserved=preserves_boundary(m,immutable))
    issues=inspect(m);info['geometryQuality']=dict(version=VERSION,valid=not issues,issues=issues,fingerprint=fingerprint(m))
    (OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return dict(id=ident,remaining=len(junctions(m)),issues=issues,count=m['count'],lostBefore=round(lost,3))

def main():
    a=argparse.ArgumentParser();a.add_argument('ids',nargs='*');a.add_argument('--jobs',type=int,default=4);args=a.parse_args();snapshot()
    ids=args.ids or [r['id'] for r in json.loads((OUT/'before/manifest.json').read_text())];report=[]
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        futures={pool.submit(build,id):id for id in ids}
        for f in as_completed(futures):
            try:r=f.result()
            except Exception as e:r=dict(id=futures[f],error=str(e),traceback=traceback.format_exc())
            print(json.dumps(r),flush=True);report.append(r)
    (OUT/'reports/geometry.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':main()
