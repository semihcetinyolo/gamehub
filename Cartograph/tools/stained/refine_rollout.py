"""Open only measured narrow gaps with a smooth local stretch; keep shared vertices.
No acute-angle processing. Four-way point contacts remain exact points.
"""
import argparse, contextlib, io, json, math, traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points
import geom
from make_maps import region_polys,shape_poly,color
from contact_policy import from_lines,collapse_short_contacts,inspect,short_pairs,stretch_gaps,fix_short,remove_slivers
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/geometry-rollout'

def repair(id):
    f=OUT/'maps'/f'{id}.json';info=json.loads(f.read_text());original=info['map']
    audit=inspect(original)
    tiny=any(p.area<.12 or geom._clearance(p)<.10 for p in region_polys(original))
    if not audit['nearGaps'] and not audit['shortSharedBorders'] and not tiny:return dict(id=id,changed=False)
    b=from_lines(shape_poly(original),[LineString([e[:2],e[2:4]]) for e in original['edges']],original['cols'],original['rows'],merge=False)
    history=[]
    for i in range(12):
        before=inspect(b.to_map())
        with contextlib.redirect_stdout(io.StringIO()):
            b=fix_short(remove_slivers(b))
            b,changed=stretch_gaps(b)
            b=remove_slivers(b)
        after=inspect(b.to_map());history.append(dict(short=after['shortSharedBorders'],gaps=len(after['nearGaps'])))
        if not after['shortSharedBorders'] and not after['nearGaps']:break
        if not changed and before==after:break
    m=b.to_map();audit=inspect(m)
    if audit['shortSharedBorders'] or audit['nearGaps']:return dict(id=id,failed=True,audit=audit,history=history)
    ps=region_polys(m);oldps=region_polys(original)
    pref=[(info['solution'][max(range(len(oldps)),key=lambda j:p.intersection(oldps[j]).area)],) for p in ps]
    sol=color(m['adj'],pref,m.pop('area'),812);m.pop('preferred',None);m.pop('clearance',None)
    info.update(map=m,solution=sol,artworkNeedsRefresh=True);info.pop('given',None);info.pop('difficulty',None)
    info['geometryPolicy']['repairs'].append(dict(localGapSpacing=history));info['geometryPolicy']['audit']=audit
    f.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return dict(id=id,changed=True,panes=m['count'],audit=audit)

def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');a=p.parse_args();ids=a.ids or [r['id'] for r in json.loads((OUT/'before/manifest.json').read_text())]
    rows=[]
    with ProcessPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(repair,id):id for id in ids}
        for f in as_completed(jobs):
            try:r=f.result()
            except Exception as e:r=dict(id=jobs[f],error=str(e),traceback=traceback.format_exc())
            rows.append(r);print(json.dumps(r),flush=True)
    (OUT/'refine-report.json').write_text(json.dumps(rows,indent=2))
if __name__=='__main__':main()
