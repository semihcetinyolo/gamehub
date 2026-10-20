"""Production contact policy: preserve authored shapes, repair measured ambiguity only.

Long shared borders and acute tips do not warrant blanket bevels.
Short contacts are local connected components; distant junctions never collapse
into one midpoint. Tight non-neighbour gaps get local spacing, not jigsaw tabs.
"""
import math
from collections import defaultdict
import numpy as np
import shapely
from shapely import affinity
from shapely.geometry import LineString,Point
from shapely.ops import unary_union,linemerge,nearest_points
import geom
from make_maps import region_polys,shape_poly

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



def stretch_gaps(b,target=.235):
    m=b.to_map();ps=region_polys(m);gaps=inspect(m)['nearGaps']
    if not gaps:return b,False
    fields=[]
    for a,c,d in gaps:
        p,q=nearest_points(ps[a],ps[c]);dx,dy=q.x-p.x,q.y-p.y;dist=math.hypot(dx,dy)
        if dist<=.003:continue
        fields.append(((p.x+q.x)/2,(p.y+q.y)/2,dx/dist,dy/dist,dist))
    # One global coordinate transform preserves every shared vertex and point.
    def warp(cs):
        xy=np.asarray(cs);shift=np.zeros_like(xy)
        for x,y,nx,ny,d in fields:
            u=(xy[:,0]-x)*nx+(xy[:,1]-y)*ny
            v=-(xy[:,0]-x)*ny+(xy[:,1]-y)*nx
            amount=(target-d)*.8*np.tanh(u/(d*.55))*np.exp(-np.minimum((u/1.2)**4+(v/1.1)**4,60))
            shift+=amount[:,None]*[nx,ny]
        # Retain the existing outer silhouette exactly.
        rim=np.array([b.outline.exterior.distance(Point(p)) for p in xy])
        result=xy+shift
        for k in np.flatnonzero(rim<.003):
            q=b.outline.exterior.interpolate(b.outline.exterior.project(Point(result[k])))
            result[k]=[q.x,q.y]
        return np.round(result,3)
    lead=[LineString([e[:2],e[2:4]]) for e in m['edges']]
    lines=[]
    for l in geom._pieces(b.outline,lead):
        if l.within(b.outline.exterior.buffer(.002)):continue
        coords=warp(shapely.segmentize(l,.09).coords)
        if len(set(map(tuple,coords)))>1:lines.append(LineString(coords))
    candidate=from_lines(b.outline,lines,b.cols,b.rows,merge=True)
    cm=candidate.to_map()
    if cm['count']<m['count']*.85:return b,False
    return candidate,True

def fix_short(b):
    # Individual connected short borders, processed from shortest first.
    # Unlike the pilot, allow a transitional equal count if total length falls.
    for iteration in range(25):
        m=b.to_map();bad=short_pairs(m)
        if not bad:break
        candidate,h=collapse_short_contacts(b)
        if len(short_pairs(candidate.to_map()))<len(bad):b=candidate;continue
        # Remove only a genuinely tiny contact pane, rather than carve a notch.
        ps=region_polys(m);options=[]
        for (a,c),edge in bad:
            for r in (a,c):
                for j in m['adj'][r]:
                    length=ps[r].boundary.intersection(ps[j].boundary).length
                    if length>.28:
                        # Deleting the shortest dispensable seam keeps most of the motif.
                        score=ps[r].area+length*.2
                        options.append((score,r,j))
        if not options:break
        _,r,j=min(options)
        owner=[j if k==r else k for k in range(m['count'])]
        groups=[owner[g] for g in b.groups];renum={g:i for i,g in enumerate(sorted(set(groups)))}
        b.groups=[renum[g] for g in groups]
    return b

def remove_slivers(b):
    m=b.to_map();ps=region_polys(m)
    if all(p.area>=.12 and geom._clearance(p)>=.10 for p in ps):return b
    b=from_lines(b.outline,[LineString([e[:2],e[2:4]]) for e in m['edges']],b.cols,b.rows,merge=False)
    b.min_r=.10;b.min_area=.12;b.groups=b._group(b.atoms,[],merge=True)
    return b


def finish_builder(builder):
    """Lock source contours; simplify background or reject crowded source layouts."""
    protect=builder.protect
    mirror_axis=getattr(builder,'mirror_x',None)
    authored=unary_union(([protect.boundary] if protect is not None else [])+
                        [l for l in builder.lines if getattr(l,'is_ring',False)])
    builder.preserve_authored=True
    builder.atoms=geom._atoms(builder.outline,builder.lines,[],exact=True)
    builder.groups=builder._group(builder.atoms,[],merge=False)
    initial=builder.to_map()
    zone=authored.buffer(.003)
    immutable=unary_union([LineString([e[:2],e[2:4]]) for e in initial['edges']
        if LineString([e[:2],e[2:4]]).difference(zone).length<.002])
    from authored_clean import cleanup
    from readable_junctions import finish_map,preserves_boundary
    minimum=60 if builder.cols>=27 and builder.rows>=36 else min(12,initial['count'])
    cleaned,history=cleanup(initial,immutable,minimum_count=minimum)
    final,repairs=finish_map(cleaned,authored,mirror_axis,minimum,immutable)
    history.extend(repairs)
    from audit_geometry import inspect as audit
    issues=audit(final)
    if issues or not preserves_boundary(final,immutable):
        raise ValueError('Source layout needs spacing or whole-part repositioning; '
                         'subject deformation is forbidden: '+str(issues[:6]))
    result=from_lines(shape_poly(final),[LineString([e[:2],e[2:4]]) for e in final['edges']],
                      final['cols'],final['rows'],merge=False)
    result.protect=protect;result.preserve_authored=True;result.mirror_x=mirror_axis
    result.issues=[];result.contact_repairs=history
    return result
