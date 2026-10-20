"""Rebuild the active catalogue from authored curves under the approved contact policy.
Staging only: output/geometry-rollout/maps. Original game order/art are snapshotted.
"""
import argparse, contextlib, io, json, traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from shapely import affinity
from shapely.geometry import LineString
from shapely.ops import unary_union
import geom, designs, pattern_designs, mass_designs
from creative_designs import catalog, compose
from figurative_geometry import subdivide
from make_maps import color, region_polys, shape_poly
from pilot_geometry import classic_lines, IDS
from contact_policy import from_lines, collapse_short_contacts, clear_background_gaps, inspect

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/geometry-rollout'
CREATIVE={d['id']:d for d in catalog()}
PATTERNS={d['id']:d for d in pattern_designs.catalog()}

def build(ident):
    info=json.loads((OUT/'before/maps'/f'{ident}.json').read_text())
    old=info['map']; history=[]
    if ident in IDS:
        pilot=json.loads((ROOT/'output/geometry-pilot/maps'/f'{ident}.json').read_text())
        info.update(map=pilot['map'],solution=pilot['solution'],given=pilot['given'])
        history=pilot['pilot']['repairs'];source='approved pilot'
    elif ident in ('cat','brain'):
        # Their broad lesson/brain regions have no contour damage; retain them.
        source='retained readable authored geometry'
    else:
        cols,rows=old['cols'],old['rows'];outline=shape_poly(old);mirror=False
        if ident in designs.DESIGNS:
            outline,lines,prefer=classic_lines(ident)
            d=designs.DESIGNS[ident];prot=d['build']()[2]
            protected=lambda p:prot.covers(p) if prot is not None else len(prefer(p.x,p.y))==1
            mirror=ident in designs.SYMMETRIC
        elif ident in CREATIVE:
            d=CREATIVE[ident];lines,pr=compose(d['parts'],d['cols'],d['rows'])
            sx,sy=cols/d['cols'],rows/d['rows']
            lines=[affinity.scale(l,sx,sy,origin=(0,0)) for l in lines]
            prefer=lambda x,y:pr(x/sx,y/sy)
            protected=lambda p:len(prefer(p.x,p.y))==1
            if info.get('large'):
                # Reproduce the original background subdivision, without bevels.
                prot=unary_union([affinity.scale(g,sx,sy,origin=(0,0)) for g,c in d['parts'] if g.area<30])
                base=geom.Build(outline,lines,min_r=.18,min_area=.25,cols=cols,rows=rows)
                generation=info.get('generation',{})
                base=subdivide(base,generation.get('maxArea',8*sx*sy),generation.get('seed',9000+d['level']),prot)
                lines=base.lines
        elif ident in PATTERNS:
            d=PATTERNS[ident];fn={'rings':pattern_designs.rings,'spiral':pattern_designs.spirals,'atlas':pattern_designs.atlas}[d['family']]
            args=[d['variant']]+([info.get('generation',{}).get('attempt',0)] if d['family']=='atlas' else [])
            outline,lines,cols,rows=fn(*args)
            prefer=lambda x,y:((int(x*1.7+y*.9)+d['variant'])%4,)
            protected=lambda p:False
        elif ident.startswith('chapter_'):
            v=int(ident[8:])-51;family=v%10
            lines,prefer,prot=mass_designs._builder(info['generationSeed'],family)
            outline=mass_designs.OUTLINES[(v+family)%len(mass_designs.OUTLINES)]
            protected=lambda p:prot.covers(p) if prot is not None else False
        else:raise ValueError('Unknown source '+ident)
        with contextlib.redirect_stdout(io.StringIO()):
            b=from_lines(outline,lines,cols,rows)
            b,history=collapse_short_contacts(b)
            b,removed=clear_background_gaps(b,protected,mirror)
            if removed:history.append({'backgroundSeamsRemoved':removed})
            b,h=collapse_short_contacts(b);history+=h
            m=b.to_map(prefer)
        solution=color(m['adj'],m.pop('preferred'),m.pop('area'),7)
        m.pop('clearance',None)
        info.update(map=m,solution=solution)
        info.pop('given',None);info.pop('difficulty',None)
        source='authored curves'
    audit=inspect(info['map'])
    info.update(geometryRevision=3,junctionStyle='shared-border-aware',geometryPolicy=dict(version=2,source=source,repairs=history,audit=audit))
    changed=info['map']['paths']!=old['paths'] or info['solution']!=json.loads((OUT/'before/maps'/f'{ident}.json').read_text())['solution']
    if changed:info['artworkNeedsRefresh']=True
    (OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return dict(id=ident,changed=changed,panes=info['map']['count'],**audit)

def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');a=p.parse_args()
    ids=a.ids or [r['id'] for r in json.loads((OUT/'before/manifest.json').read_text())]
    rows=[]
    with ProcessPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(build,ident):ident for ident in ids}
        for f in as_completed(jobs):
            try:r=f.result()
            except Exception as e:r=dict(id=jobs[f],error=str(e),traceback=traceback.format_exc())
            rows.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
    (OUT/'stage-report.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
