"""Audit shared borders, readable junctions and spacing without blanket bevels.

Version 4 also rejects panes whose hidden necks disappear beneath game seams.
Version 3 rejects four-or-more-way crossings, including the outer rim.
Sharpness alone remains valid. Construction may opt into intermediate junctions;
published map stamps always require the complete policy.
"""
import argparse,hashlib,json,math
from pathlib import Path
from collections import defaultdict
from shapely.geometry import LineString,Point
from shapely.ops import unary_union
from make_maps import region_polys,shape_poly
from geom import _clearance
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];VERSION=4

def fingerprint(m):
    edges=';'.join(','.join([*(f'{v:.3f}' for v in e[:4]),*(str(v) for v in e[4:])]) for e in m['edges'])
    body=f'{m["cols"]:.3f},{m["rows"]:.3f}\n'+'\n'.join(m['paths'])+'\n'+m['shape']+'\n'+';'.join(','.join(map(str,a)) for a in m['adj'])+'\n'+edges
    return hashlib.sha256(body.encode()).hexdigest()

def inspect(m,large=False,allow_junctions=False):
    ps=region_polys(m);outline=shape_poly(m);issues=[];shared=defaultdict(float)
    if not allow_junctions:
        nodes=defaultdict(set)
        for e in [*m['edges'],*m['rim']]:
            a,b=tuple(e[:2]),tuple(e[2:4]);nodes[a].add(b);nodes[b].add(a)
        for p,branches in nodes.items():
            if len(branches)>=4:issues.append(('ambiguous-junction',-1,-1,len(branches),p))
    boundaryZones=[p.boundary.buffer(.002) for p in ps]
    if len(ps)!=m['count'] or len(m['adj'])!=m['count']:return [('count',-1,-1,0,(0,0))]
    for x,y,u,v,a,b in m['edges']:
        shared[tuple(sorted((a,b)))]+=math.hypot(u-x,v-y)
        edge=LineString([(x,y),(u,v)])
        if not (0<=a<len(ps) and 0<=b<len(ps)) or a==b:
            issues.append(('edge-owner',a,b,0,(x,y)));continue
        # Serialised boundaries may differ by at most a coordinate grid step.
        if edge.difference(boundaryZones[a]).length>.003 or edge.difference(boundaryZones[b]).length>.003:
            issues.append(('edge-boundary',a,b,edge.length,(x,y)))
    for i,p in enumerate(ps):
        if not p.is_valid or p.geom_type!='Polygon' or p.is_empty:
            issues.append(('invalid',i,-1,0,(0,0)));continue
        if p.area<.12 or _clearance(p)<.10:
            issues.append(('tiny-pane',i,-1,round(p.area,6),tuple(p.representative_point().coords)[0]))
        if not p.buffer(.002).covers(Point(m['anchors'][i])):
            issues.append(('anchor-outside',i,-1,0,tuple(m['anchors'][i])))
        for j in range(i+1,len(ps)):
            declared=j in m['adj'][i]
            if declared != (i in m['adj'][j]):issues.append(('asymmetric',i,j,0,(0,0)))
            length=shared.get((i,j),0)
            actual=p.boundary.intersection(ps[j].boundary).length
            if declared != (length>0) or (actual>.01 and not declared):
                issues.append(('adjacency',i,j,round(actual,5),(0,0)))
            if declared and length<.28-1e-6:
                issues.append(('short',i,j,round(length,5),(0,0)))
            if not declared:
                distance=p.distance(ps[j])
                if .003<distance<.219:
                    issues.append(('near-gap',i,j,round(distance,5),(0,0)))
    if all(p.is_valid and p.geom_type=='Polygon' for p in ps):
        from visible_panes import inspect as visible_inspect
        issues.extend(visible_inspect(m,ps))
        covered=unary_union(ps);overlap=sum(p.area for p in ps)-covered.area;missing=outline.symmetric_difference(covered).area
        if overlap>1e-5:issues.append(('overlap',-1,-1,round(overlap,6),(0,0)))
        if missing>outline.length*.001:issues.append(('coverage',-1,-1,round(missing,6),(0,0)))
    return issues

def active_ids():
    text=(ROOT/'stained-levels.js').read_text();return [l['id'] for l in json.JSONDecoder().raw_decode(text[text.index('['):])[0]]

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('ids',nargs='*');p.add_argument('--stamp',action='store_true');p.add_argument('--report',type=Path);p.add_argument('--maps',type=Path,default=HERE/'maps');a=p.parse_args();rows=[]
    for n,id in enumerate(active_ids(),1):
        if a.ids and id not in a.ids:continue
        f=a.maps/f'{id}.json';info=json.loads(f.read_text());issues=inspect(info['map'],info.get('large',False))
        rows.append(dict(level=n,id=id,issues=issues))
        if a.stamp:
            info['geometryQuality']=dict(version=VERSION,valid=not issues,fingerprint=fingerprint(info['map']),issues=issues)
            f.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
        if issues:print(f'{n} {id}: {len(issues)} issues {issues[:3]}',flush=True)
    if a.report:a.report.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    failed=sum(bool(r['issues']) for r in rows);print(f'Geometry: {len(rows)-failed}/{len(rows)} clear; {failed} need repair',flush=True)
    raise SystemExit(bool(failed))
if __name__=='__main__':main()
