"""Preserve authored borders; a point contact is not a shared-edge adjacency.

Earlier revisions added small circular patches at near/point contacts. Those
patches made straight seams and character outlines look like jigsaw tabs.
The common pipeline preserves closed loops and repairs ambiguous contacts with flat bevels.
"""
import math
import random
from collections import defaultdict
import shapely
from shapely.geometry import Point
from shapely.ops import unary_union, polygonize, nearest_points
from geom import circle, _cut


def _atoms(outline,lines,knots):
    # Simplifying individual noded arcs before polygonize can open eye/lens rings.
    # Preserve the shared vertices exactly; SVG path formatting handles size later.
    work=[outline.exterior,*lines,*[circle(x,y,r,20) for x,y,r,_ in knots]]
    net=shapely.unary_union(work,grid_size=.001)
    net=unary_union(net)
    atoms=list(polygonize(net))
    return [p for p in atoms if not p.is_empty and p.area>1e-7 and p.intersection(outline).area>.5*p.area]


def subdivide(builder,max_area,seed,protect):
    rand=random.Random(seed)
    for _ in range(30):
        big=[p for p in _atoms(builder.outline,builder.lines,[]) if p.area>max_area
             and not protect.buffer(.02).contains(p.representative_point())]
        if not big: break
        cuts=[_cut(p,rand) for p in big]
        builder.lines += [c for c in cuts if c is not None]
    return builder


def contacts(polygons,adj,edges):
    shared=defaultdict(float)
    for x1,y1,x2,y2,a,b in edges:
        shared[(a,b)]+=math.hypot(x2-x1,y2-y1)
    issues=[]
    for (a,b),length in shared.items():
        if length<.28:
            p,q=nearest_points(polygons[a],polygons[b]);issues.append(('short',a,b,length,(p.x,p.y)))
    tree=shapely.STRtree(polygons)
    for a,p in enumerate(polygons):
        for b in tree.query(p.buffer(.22)):
            b=int(b)
            if b<=a or b in adj[a]:continue
            dist=p.distance(polygons[b])
            if dist<.22:
                q,r=nearest_points(p,polygons[b]);issues.append(('near',a,b,dist,((q.x+r.x)/2,(q.y+r.y)/2)))
    return issues


def finish(builder, scale=1):
    """Use the shared-border-aware production pipeline in actual canvas units.

    Large scenes already have expanded geometry. The minimum readable distances
    use the same world units as the renderer's lead width, independent of family.
    """
    from contact_policy import finish_builder
    return finish_builder(builder)
