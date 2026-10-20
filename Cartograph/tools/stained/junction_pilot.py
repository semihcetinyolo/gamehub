"""Eight-level review only: separate ambiguous crossings into readable T joints.

Uses a fresh immutable snapshot. Build/art stage changes; explicit publish writes
only these eight production maps. The game catalogue builder follows publication.
"""
import argparse
import copy
import hashlib
import json
import math
import shutil
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union, substring

import geom
from shapely import affinity
from contact_policy import from_lines
from make_maps import region_polys, shape_poly, color
from audit_geometry import inspect as geometry_inspect, fingerprint, VERSION
from designs import DESIGNS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/junction-pilot'
IDS = ['fish', 'moon', 'turtle', 'rings_08', 'mountain', 'atlas_08', 'grand_06', 'spiral_04']


def inspect(m):
    return geometry_inspect(m,allow_junctions=True)


def levels():
    s = (OUT / 'before/stained-levels.js').read_text()
    return json.JSONDecoder().raw_decode(s[s.index('['):])[0]


def snapshot():
    if (OUT / 'before/manifest.json').exists():
        return
    (OUT / 'before/maps').mkdir(parents=True)
    for directory in ['maps', 'guides', 'art', 'review']:
        (OUT / directory).mkdir()
    shutil.copy2(ROOT / 'stained-levels.js', OUT / 'before/stained-levels.js')
    manifest = []
    for n, l in enumerate(levels(), 1):
        if l['id'] not in IDS:
            continue
        shutil.copy2(ROOT / 'tools/stained/maps' / (l['id'] + '.json'), OUT / 'before/maps' / (l['id'] + '.json'))
        manifest.append(dict(id=l['id'], level=n, name=l['name'], image=l['image'],
                             sha256=hashlib.sha256((ROOT / l['image']).read_bytes()).hexdigest(),
                             hard=l.get('difficulty', {}).get('tier') == 'hard'))
    (OUT / 'before/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


def junctions(m):
    nodes = defaultdict(set)
    for x,y,u,v,*_ in m['edges'] + m['rim']:
        a,b = (x,y),(u,v)
        nodes[a].add(b); nodes[b].add(a)
    return sorted((p, len(ns)) for p,ns in nodes.items() if len(ns) >= 4)


def reindex(m, old, minimum_overlap=.65):
    """Retain pane identities by maximum area overlap; no panes may disappear."""
    ps, before = region_polys(m), region_polys(old)
    if len(ps) != len(before):
        raise ValueError('Pane count changed')
    areas = np.array([[p.intersection(q).area for q in before] for p in ps])
    a,b = linear_sum_assignment(-areas)
    order = {int(x):int(y) for x,y in zip(a,b)}
    if any(areas[x,y] < before[y].area * minimum_overlap for x,y in zip(a,b)):
        raise ValueError('A pane changed too much')
    result = copy.deepcopy(m)
    for field in ['paths', 'anchors', 'area', 'clearance']:
        if field in m:
            result[field] = [None] * len(ps)
            for x,y in order.items(): result[field][y] = m[field][x]
    result['adj'] = [None] * len(ps)
    for x,y in order.items(): result['adj'][y] = sorted(order[z] for z in m['adj'][x])
    for field in ['edges', 'rim']:
        result[field] = [[*e[:4], *[order[r] for r in e[4:]]] for e in m[field]]
    result.pop('preferred', None)
    return result


def branches(m, p):
    outline = shape_poly(m)
    lines = [LineString([e[:2],e[2:4]]) for e in m['edges']]
    pieces = geom._pieces(outline, lines)
    ends = []
    for i,line in enumerate(pieces):
        cs = list(line.coords)
        if cs[0] == p: ends.append((i, cs, False))
        if cs[-1] == p: ends.append((i, cs[::-1], True))
    return outline, pieces, ends


def drag(cs, target):
    line=LineString(cs)
    if math.dist(cs[0],cs[-1])<.003:
        raise ValueError('Preserve closed eye/window loops; move the complete accent instead')
    # A straight background divider stays straight; do not insert a tiny S bend.
    if line.length/math.dist(cs[0],cs[-1]) < 1.004:
        return [target,cs[-1]]
    dense=list(geom.shapely.segmentize(line,.08).coords)
    radius=min(max(2.2,6*math.dist(cs[0],target)),line.length*.95)
    result=[];travel=0
    for i,(x,y) in enumerate(dense):
        if i:travel+=math.dist(dense[i-1],dense[i])
        w=geom._falloff(travel/radius)
        result.append((x+(target[0]-cs[0][0])*w,y+(target[1]-cs[0][1])*w))
    result[0]=target
    return result


def move_candidate(m, p, main, assignments, span, mirror=False):
    outline, pieces, ends = branches(m, p)
    if len(ends) != 4: raise ValueError('Not a four-way joint')
    targets = {}; changed={}
    for stem, along, fraction in assignments:
        line = LineString(ends[along][1])
        distance=span*fraction
        if line.length < distance+.28: raise ValueError('Next junction too close')
        q = line.interpolate(distance)
        targets[stem] = (round(q.x,3),round(q.y,3))
        # Explicitly insert the common rounded vertex into the through-line.
        # Merely rounding a point on a curve can otherwise leave a microscopic
        # dangling endpoint and silently merge two panes during polygonisation.
        cs=list(substring(line,0,distance).coords)[:-1]+[targets[stem]]+list(substring(line,distance,line.length).coords)[1:]
        idx,_,reverse=ends[along]
        changed[idx]=cs[::-1] if reverse else cs
    lines=[]
    for stem,target in targets.items():
        idx,cs,reverse=ends[stem]
        if outline.exterior.distance(LineString(cs).interpolate(min(.2,LineString(cs).length/2)))<.002:
            raise ValueError('Cannot bend the outer rim')
        new = drag(cs,target)
        changed[idx] = new[::-1] if reverse else new
    for i,line in enumerate(pieces):
        if line.within(outline.exterior.buffer(.002)): continue
        lines.append(LineString(changed.get(i,list(line.coords))))
    # Noding the moved stems against the untouched through-line creates two T's.
    candidate = from_lines(outline,lines,m['cols'],m['rows'],merge=False).to_map()
    candidate = reindex(candidate,m)
    return candidate, list(targets.values())


def repair_one(m, p, solution, span, protected=None):
    outline,pieces,ends=branches(m,p)
    if len(ends)!=4: return None
    vectors=[]
    for _,cs,_ in ends:
        q=LineString(cs).interpolate(min(.35,LineString(cs).length*.5))
        dx,dy=q.x-p[0],q.y-p[1];norm=math.hypot(dx,dy)
        vectors.append((dx/norm,dy/norm))
    options=[]
    protectedness=[]
    for _,cs,_ in ends:
        part=substring(LineString(cs),0,min(1,LineString(cs).length))
        protectedness.append(part.intersection(protected.buffer(.12)).length/part.length if protected is not None else 0)
    for a in range(4):
        for b in range(a+1,4):
            straight=-sum(x*y for x,y in zip(vectors[a],vectors[b]))
            if straight < .20 and protectedness[a]+protectedness[b]<1.8: continue
            c,d=[i for i in range(4) if i not in (a,b)]
            for swaps in [False,True]:
              for fractions in [(0.5,0.5),(0,1),(1,0)]:
                assignments=[(c,b if swaps else a,fractions[0]),(d,a if swaps else b,fractions[1])]
                try:
                    cm,targets=move_candidate(m,p,(a,b),assignments,span)
                    if len(junctions(cm))>=len(junctions(m)):continue
                    issues=inspect(cm)
                    if issues:continue
                    # A new nearby joint must not hide the short connecting border.
                    if math.dist(*targets)<span*.90:continue
                    beforepairs={tuple(sorted((i,j))) for i,ns in enumerate(m['adj']) for j in ns}
                    afterpairs={tuple(sorted((i,j))) for i,ns in enumerate(cm['adj']) for j in ns}
                    if beforepairs-afterpairs:continue
                    conflicts=sum(solution[i]==solution[j] for i,j in afterpairs)
                    # Prefer a straight unchanged through-line and keep existing colours.
                    ps,oldps=region_polys(cm),region_polys(m)
                    displacement=sum(x.symmetric_difference(y).area for x,y in zip(ps,oldps))
                    moved_protected=sum(protectedness[stem] for stem,along,fraction in assignments if fraction>0)
                    score=moved_protected*100 + conflicts*20 + (1-straight)*5 + displacement
                    options.append((score,cm,dict(point=p,ends=targets,span=span,newAdjacency=sorted(afterpairs-beforepairs))))
                except (ValueError,AssertionError,RuntimeError):
                    continue
    return min(options,key=lambda x:x[0])[1:] if options else None


def space_small_tree(m):
    """Move the crowded small tree intact instead of making a tab at its foot."""
    ps=region_polys(m);r=next(i for i,p in enumerate(ps) if p.covers(Point(3.8,12.4)))
    tree=ps[r];p=(2.984,13.386);dx=.65;q=(round(p[0]+dx,3),p[1])
    outline=shape_poly(m);pieces=geom._pieces(outline,[LineString([e[:2],e[2:4]]) for e in m['edges']])
    lines=[];zone=tree.boundary.buffer(.002)
    for line in pieces:
        if line.within(outline.exterior.buffer(.002)) or line.within(zone):continue
        cs=list(line.coords)
        for reverse in [False,True]:
            if reverse:cs=cs[::-1]
            if cs[0]!=p and tree.boundary.distance(Point(cs[0]))<.002:
                cs=drag(cs,(round(cs[0][0]+dx,3),cs[0][1]))
            if reverse:cs=cs[::-1]
        lines.append(LineString(cs))
    lines += [affinity.translate(tree.boundary,dx,0),LineString([p,q])]
    candidate=from_lines(outline,lines,m['cols'],m['rows'],merge=False).to_map()
    candidate=reindex(candidate,m,minimum_overlap=.3)
    assert not inspect(candidate),inspect(candidate)
    assert len(junctions(candidate))==len(junctions(m))-1
    return candidate,dict(point=p,ends=[p,q],span=dx,method='translate intact small tree; keep both large tree outlines')


def build(ids):
    snapshot()
    published={l['id']:l for l in levels()}
    for ident in ids or IDS:
        info=json.loads((OUT/'before/maps'/f'{ident}.json').read_text())
        m=info['map']; old=copy.deepcopy(m); sol=info['solution']; repairs=[]
        span=max(.52,m['cols']*10/300)
        protected=DESIGNS[ident]['build']()[2].boundary if ident in DESIGNS else None
        if ident=='mountain':
            # The union with the mountain hides the upper halves of the large
            # trees. Preserve both complete triangles; space the small one intact.
            trees=[[(.6,13.4),(1.8,10),(3,13.4)],[(8.9,13.4),(10.1,9.9),(11.3,13.4)],[(2.9,13.6),(3.8,11.3),(4.7,13.6)]]
            protected=unary_union([Polygon(t).boundary for t in trees[:2]])
            m,detail=space_small_tree(m);repairs.append(detail)
        if ident.startswith('grand_'):
            from creative_designs import catalog
            source=next(d for d in catalog() if d['id']==ident)
            protected=unary_union([affinity.scale(g.boundary,m['cols']/source['cols'],m['rows']/source['rows'],origin=(0,0)) for g,c in source['parts']])
        print(ident,'begin',len(junctions(m)),'joints',flush=True)
        # Only local eligible crossings; no blanket tip/bevel policy is installed.
        for p,degree in junctions(old):
            if degree!=4:continue
            if not any(q==p for q,_ in junctions(m)):continue
            result=repair_one(m,p,sol,span,protected)
            if result:
                m,detail=result;repairs.append(detail)
                print(ident,'split',p,'remaining',len(junctions(m)),flush=True)
            else:print(ident,'unresolved',p,flush=True)
        # Preserve authored colouring unless a newly explicit contact needs a change.
        if any(sol[i]==sol[j] for i,ns in enumerate(m['adj']) for j in ns):
            sol=color(m['adj'],sol,[p.area for p in region_polys(m)],24020)
        for field in ['preferred','area','clearance']:m.pop(field,None)
        info.update(map=m,solution=sol,geometryRevision=4,junctionStyle='separated-t-pilot',artworkNeedsRefresh=True)
        info.pop('given',None);info.pop('difficulty',None)
        info['geometryQuality']=dict(version=VERSION,valid=not inspect(m),fingerprint=fingerprint(m),issues=inspect(m))
        original_solution=json.loads((OUT/'before/maps'/f'{ident}.json').read_text())['solution']
        info['junctionPilot']=dict(before=len(junctions(old)),after=len(junctions(m)),repairs=repairs,
                                   remaining=junctions(m),span=span,recoloredPanes=sum(a!=b for a,b in zip(sol,original_solution)))
        (OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
        print(ident,'finished',len(repairs),'repairs',len(junctions(m)),'remaining',flush=True)


def art(ids):
    import reuse_glass
    reuse_glass.OUT=OUT
    for ident in ids or IDS:
        info=json.loads((OUT/'maps'/f'{ident}.json').read_text())
        assert info['junctionPilot'].get('logic',{}).get('solutions')==1,'Finish logic before artwork'
        assert not junctions(info['map']), 'Resolve crossings before artwork'
        result=reuse_glass.transfer(ident)
        info=json.loads((OUT/'maps'/f'{ident}.json').read_text())
        for ext in ['.webp','.json']:
            source=OUT/'art'/f'{ident}-restored{ext}'
            if source.exists():source.rename(OUT/'art'/f'{ident}-junction-pilot{ext}')
        info['image']=f'assets/glass/{ident}-junction-pilot.webp'
        info['artMetadata']=f'assets/glass/{ident}-junction-pilot.json'
        (OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
        print(json.dumps(result),flush=True)


def publish():
    rows=json.loads((OUT/'before/manifest.json').read_text())
    # Guard concurrent work and retain the previous images as immutable donors.
    assert (ROOT/'stained-levels.js').read_bytes()==(OUT/'before/stained-levels.js').read_bytes(), 'Catalogue changed since snapshot'
    checked=[]
    for row in rows:
        ident=row['id'];info=json.loads((OUT/'maps'/f'{ident}.json').read_text())
        original=OUT/'before/maps'/f'{ident}.json';live=ROOT/'tools/stained/maps'/f'{ident}.json'
        assert live.read_bytes()==original.read_bytes(),f'{ident}: live map changed'
        assert hashlib.sha256((ROOT/row['image']).read_bytes()).hexdigest()==row['sha256']
        assert not junctions(info['map']) and not inspect(info['map']),ident
        assert info['geometryQuality']['fingerprint']==fingerprint(info['map']),ident
        assert info['junctionPilot']['logic']['solutions']==1 and not info.get('artworkNeedsRefresh'),ident
        image=OUT/'art'/Path(info['image']).name;meta=json.loads(image.with_suffix('.json').read_text())
        assert meta['sourceSha256']==row['sha256'],ident
        assert meta['sha256']==hashlib.sha256(image.read_bytes()).hexdigest(),ident
        assert meta['guide']==hashlib.sha256((OUT/'guides'/f'{ident}.png').read_bytes()).hexdigest(),ident
        assert meta['paneColorCheck']['valid'] and meta['paneColorCheck']['matched']==info['map']['count'],ident
        checked.append((ident,info))
    for ident,info in checked:
        for key in ['image','artMetadata']:
            shutil.copy2(OUT/'art'/Path(info[key]).name,ROOT/info[key])
        for ext in ['.png','.labels.png','.svg']:
            shutil.copy2(OUT/'guides'/f'{ident}{ext}',ROOT/'tools/stained/guides'/f'{ident}{ext}')
        info['geometryHash']=hashlib.sha256(json.dumps(info['map']['paths']).encode()).hexdigest()
        (ROOT/'tools/stained/maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    p=ROOT/'tools/stained/pattern-catalog.json';patterns=json.loads(p.read_text());byid=dict(checked)
    for entry in patterns['assets']:
        if entry['id'] in byid:
            info=byid[entry['id']];entry.update(file=info['image'],vector=info['vectorGuide'])
    p.write_text(json.dumps(patterns,ensure_ascii=False,indent=2)+'\n')
    print('Published 8 pilot maps and sibling glass assets. Build the game catalogue next.')


def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['snapshot','build','art','publish']);p.add_argument('ids',nargs='*');a=p.parse_args()
    if a.command=='snapshot':snapshot()
    elif a.command=='art':art(a.ids)
    elif a.command=='publish':publish()
    else:build(a.ids)


if __name__=='__main__':main()
