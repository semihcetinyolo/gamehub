"""Stage ten motif-preserving geometry revisions; never write active maps/artwork.

This pilot implements the user's revised rule: sharp tips with clear shared
borders are kept. Only genuinely short shared borders are collapsed to explicit
point junctions. No general bevel, steepen or tip-trimming pass is used.
Run from the project root with a Python environment containing Shapely/Pillow.
"""
import argparse
import hashlib
import json
import math
import random
from collections import defaultdict
from pathlib import Path

import shapely
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union, linemerge

import geom
import designs
from creative_designs import catalog, compose
from make_maps import color, region_polys, shape_poly

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/geometry-pilot'
IDS = ['lotus', 'heart', 'moon', 'rosewindow', 'snowflake', 'kaleido',
       'medallion', 'motif_carouselhorse', 'story_swan', 'motif_elephant']


def classic_lines(ident):
    d = designs.DESIGNS[ident]
    lines, prefer, protect = d['build']()
    if ident == 'rosewindow':
        # Tangent petal tips used to create subpixel shared edges. Give the
        # complete repeated motif breathing room, using the same dimensions
        # for all eight petals and twelve roundels.
        c = (6, 8)
        petals = [geom.petal_poly((6 + 1.42*math.cos(math.radians(a)),
                                  8 + 1.42*math.sin(math.radians(a))), a, 1.45, .66)
                  for a in range(-90, 270, 45)]
        rounds = [Polygon(geom.circle(6+4.1*math.cos(math.radians(a)),
                                     8+4.1*math.sin(math.radians(a)), .55).coords)
                  for a in range(-90, 270, 30)]
        lines = [geom.circle(6,8,r) for r in (1.1,3.2,5)]
        lines += [p.exterior for p in petals+rounds]
        lines += designs.rays(c,8,-67.5,1.1,3.2)
        lines += designs.rays(c,12,-75,3.2,7)
    elif ident == 'lotus':
        # Resolve overlapping petals as symmetric layers, retaining each
        # original authored curve instead of producing sliver intersections.
        base=(6,10.4)
        petals=[geom.petal_poly(base,a,l,w) for a,l,w in
                [(-90,4.6,.95),(-123,4,.85),(-57,4,.85),(-155,3.2,.75),(-25,3.2,.75)]]
        flower=unary_union(petals)
        pad=Polygon(geom.ellipse(6,11.9,4.2,.95).coords)
        occupied=Polygon(); lines=[]
        for p in petals:
            visible=p.difference(occupied)
            for g in getattr(visible,'geoms',[visible]):
                if g.geom_type=='Polygon': lines.extend([g.exterior,*g.interiors])
            occupied=unary_union([occupied,p])
        lines += [pad.exterior,geom.ellipse(6,13,2.8,.6)]
        lines += geom.clipout(designs.burst(base,10,[5],-180,0,9),flower,pad)
        lines += geom.clipout([geom.seg((-1,11.9),(13,11.9))],pad)
    return d['outline'], lines, prefer


def from_lines(outline, lines, cols, rows, merge=True):
    b=geom.Build(outline,lines,min_r=.18,min_area=.25,cols=cols,rows=rows)
    b.atoms=geom._atoms(b.outline,b.lines,[],exact=True)
    b.groups=b._group(b.atoms,[],merge=merge)
    return b


def short_pairs(m, threshold=.28):
    shared=defaultdict(list)
    for x,y,u,v,a,b in m['edges']:
        shared[tuple(sorted((a,b)))].append(LineString([(x,y),(u,v)]))
    return [(pair,unary_union(lines)) for pair,lines in shared.items()
            if sum(l.length for l in lines)<threshold]


def collapse_short_contacts(builder):
    """A short edge becomes a single clear node, not a new decorative notch.

    Process all short borders together so mirrored contacts receive equivalent
    treatment. Move only adjoining seam ends, with a smooth falloff.
    """
    history=[]
    for iteration in range(8):
        m=builder.to_map(); bad=short_pairs(m)
        if not bad:break
        clusters=[]
        for pair,edge in bad:
            # A pair can have separate contacts far apart. Never collapse
            # those distinct junctions into one distant midpoint.
            connected=linemerge(edge) if edge.geom_type=='MultiLineString' else edge
            for component in getattr(connected,'geoms',[connected]):
                nodes={tuple(p) for p in component.coords}
                for previous in list(clusters):
                    if previous & nodes:
                        nodes |= previous; clusters.remove(previous)
                clusters.append(nodes)
        targets={}
        for nodes in clusters:
            x=sum(p[0] for p in nodes)/len(nodes); y=sum(p[1] for p in nodes)/len(nodes)
            rim=[p for p in nodes if builder.outline.exterior.distance(Point(p))<.003]
            if rim:
                q=builder.outline.exterior.interpolate(builder.outline.exterior.project(Point(x,y)))
                x,y=q.x,q.y
            target=(round(x,3),round(y,3))
            targets.update({p:target for p in nodes})
        lead=[LineString([e[:2],e[2:4]]) for e in m['edges']]
        pieces=geom._pieces(builder.outline,lead)
        lines=[]
        for p in pieces:
            if p.within(builder.outline.exterior.buffer(.002)):continue
            cs=list(p.coords)
            if all(tuple(v) in targets for v in cs) and len({targets[tuple(v)] for v in cs})==1:continue
            if tuple(cs[0]) in targets:cs=geom._drag(cs,targets[tuple(cs[0])])
            if tuple(cs[-1]) in targets:cs=geom._drag(cs[::-1],targets[tuple(cs[-1])])[::-1]
            if len(set(cs))>1:lines.append(LineString(cs))
        candidate=from_lines(builder.outline,lines,builder.cols,builder.rows,merge=False)
        cm=candidate.to_map()
        history.append({'iteration':iteration+1,'shortBordersBefore':len(bad),'shortBordersAfter':len(short_pairs(cm))})
        if len(short_pairs(cm))>=len(bad):break
        builder=candidate
    return builder,history


def inspect(m):
    polys=region_polys(m);whole=unary_union(polys);outline=shape_poly(m)
    # Intentional point contacts are reported separately, not called failures.
    points=[];gaps=[]
    for a,p in enumerate(polys):
        for b in range(a+1,len(polys)):
            if b in m['adj'][a]:continue
            distance=p.distance(polys[b])
            if distance<=.003:points.append([a,b])
            elif distance<.219:gaps.append([a,b,round(distance,4)])
    return {'validPolygons':all(p.is_valid and p.geom_type=='Polygon' for p in polys),
            'overlapArea':sum(p.area for p in polys)-whole.area,
            'coverageDifference':whole.symmetric_difference(outline).area,
            'shortSharedBorders':len(short_pairs(m)), 'pointContacts':points,
            'nearGaps':gaps, 'minimumPaneArea':min(p.area for p in polys)}


def clear_background_gaps(builder, protected, mirror=False):
    """Remove a dispensable background seam instead of denting the subject."""
    removed=0
    for _ in range(30):
        m=builder.to_map();polys=region_polys(m);gaps=inspect(m)['nearGaps']
        locked=[protected(p.representative_point()) for p in polys]
        options=[]
        for a,c,_ in gaps:
            for middle in set(m['adj'][a]) & set(m['adj'][c]):
                for side in (a,c):
                    if locked[middle] or locked[side]:continue
                    length=polys[middle].boundary.intersection(polys[side].boundary).length
                    if length>.01:options.append((length,middle,side))
        if not options:break
        _,a,b=min(options)
        pairs=[(a,b)]
        if mirror:
            matches=[]
            for r in (a,b):
                reflected=affinity.scale(polys[r],-1,1,origin=(builder.cols/2,0))
                matches.append(max(range(len(polys)),key=lambda s:reflected.intersection(polys[s]).area))
            if not any(locked[s] for s in matches):pairs.append(tuple(matches))
        owner=list(range(m['count']))
        def root(a):
            while owner[a]!=a:a=owner[a]
            return a
        for a,b in pairs:owner[root(b)]=root(a)
        mapped=[root(g) for g in builder.groups];renumber={v:i for i,v in enumerate(sorted(set(mapped)))}
        builder.groups=[renumber[v] for v in mapped]
        removed+=len(pairs)
    return builder,removed


def main():
    parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*');args=parser.parse_args()
    OUT.mkdir(exist_ok=True,parents=True)
    (OUT/'maps').mkdir(exist_ok=True);(OUT/'before').mkdir(exist_ok=True)
    text=(ROOT/'stained-levels.js').read_text();levels=json.JSONDecoder().raw_decode(text[text.index('['):])[0]
    byid={l['id']:(i+1,l) for i,l in enumerate(levels)}
    creative={d['id']:d for d in catalog()}; report=[]
    for ident in args.ids or IDS:
        number,before=byid[ident]
        original=json.loads((ROOT/'tools/stained/maps'/f'{ident}.json').read_text())
        om=original['map']
        if ident in designs.DESIGNS:
            outline,lines,prefer=classic_lines(ident)
            original_protect=designs.DESIGNS[ident]['build']()[2]
            protected=lambda p: (original_protect.covers(p) if original_protect is not None else len(prefer(p.x,p.y))==1)
        else:
            d=creative[ident];parts=list(d['parts'])
            # Eye/leg spacing is now part of the authored source definitions.
            lines,pr=compose(parts,d['cols'],d['rows'])
            sx,sy=om['cols']/d['cols'],om['rows']/d['rows']
            lines=[affinity.scale(l,sx,sy,origin=(0,0)) for l in lines]
            prefer=lambda x,y:pr(x/sx,y/sy)
            protected=lambda p:len(prefer(p.x,p.y))==1
            outline=shape_poly(om)
        b=from_lines(outline,lines,om['cols'],om['rows'])
        b,history=collapse_short_contacts(b)
        b,removed=clear_background_gaps(b,protected,ident in designs.SYMMETRIC)
        if removed:history.append({'backgroundSeamsRemoved':removed})
        if ident=='moon':
            # Keep several playable background regions after removing the old
            # crowded seams; cuts never enter the crescent or stars.
            rand=random.Random(814)
            for _ in range(8):
                current=b.to_map();polys=region_polys(current)
                candidates=[p for p in polys if p.area>8 and not protected(p.representative_point())]
                if not candidates:break
                cut=geom._cut(max(candidates,key=lambda p:p.area),rand)
                if cut is None:break
                lead=[LineString([e[:2],e[2:4]]) for e in current['edges']]
                candidate=from_lines(b.outline,[*lead,cut],b.cols,b.rows,merge=False)
                candidate,_=collapse_short_contacts(candidate)
                candidate,_=clear_background_gaps(candidate,protected)
                b=candidate
        m=b.to_map(prefer)
        solution=color(m['adj'],m.pop('preferred'),m.pop('area'),7)
        m.pop('clearance',None)
        audit=inspect(m)
        after={'id':ident,'name':before['name'],'level':number,'palette':before['palette'],
               'map':m,'solution':solution,'artworkNeedsRefresh':True,
               'pilot':{'policy':'shared-border-aware','source':'authored curves','audit':audit,'repairs':history}}
        (OUT/'before'/f'{ident}.json').write_text(json.dumps(before,ensure_ascii=False,separators=(',',':')))
        (OUT/'maps'/f'{ident}.json').write_text(json.dumps(after,ensure_ascii=False,separators=(',',':')))
        row={'id':ident,'level':number,'name':before['name'],'panesBefore':before['map']['count'],'panesAfter':m['count'],**audit,'repairs':history}
        report.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
    (OUT/'geometry-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (OUT/'source.sha256').write_text(hashlib.sha256((ROOT/'stained-levels.js').read_bytes()).hexdigest()+'\n')


if __name__=='__main__':main()
