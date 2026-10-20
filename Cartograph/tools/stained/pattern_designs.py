"""75 authored layouts inspired by the user's rings, spiral and regional-map references.

Atlas silhouettes are fictional: these are colour puzzles, not administrative maps.
All geometry is native to the game, including the finished vector artwork.
"""
import colorsys
import math
import random

import shapely
from shapely import affinity
from shapely.geometry import LineString, MultiPoint, Point, Polygon, box
from shapely.ops import unary_union

from geom import circle, ellipse

RING_NAMES = [
    'Dört Yankı', 'Yağmur Damlaları', 'Çift Yörünge', 'Üçlü Rezonans', 'Halka Bahçesi',
    'Güneş Ufku', 'Ayın Yankısı', 'Köşe Dalgaları', 'Gelgit', 'Kesişen Ufuklar',
    'Eliptik Dans', 'Uzun Yörüngeler', 'Eğimli Halkalar', 'İkiz Gezegenler', 'Oval Akış',
    'İç İçe Akıntı', 'Merkezkaç', 'Dönen Çemberler', 'Halka Pusulası', 'Yankı Kuyusu',
    'İnci Dizisi', 'Daireler Korosu', 'Kabarcık Zinciri', 'Dalgaların Buluşması', 'Ritim Halkaları',
]
SPIRAL_NAMES = [
    'Merkeze Yolculuk', 'Dik Açılı Girdap', 'İç Kale', 'Spiral Avlu', 'Köşeli Akıntı',
    'İkiz Labirent', 'Karşılıklı Dönüş', 'Çift Sarmal', 'İki Merkez', 'Ayna Koridorları',
    'Basamaklı Yol', 'Dağ Geçidi', 'Kıvrımlı Sokaklar', 'Merdiven Şehri', 'Yukarı Aşağı',
    'Dört Avlu', 'Dönen Odalar', 'Kavşak', 'Dört Kapı', 'Birleşen Yollar',
    'Köşeden Merkeze', 'Çengel Geçit', 'Uzun Koridor', 'Zikzak Rotası', 'Kilitli Geçitler',
]
ATLAS_NAMES = [
    'Batı Kıyıları', 'Doğu Yarımadası', 'Kuzey Diyarı', 'Güney Burnu', 'İki Körfez',
    'Uzun Kıyı', 'Hilal Ülkesi', 'İç Deniz Kıyısı', 'Çifte Yarımada', 'Yeşil Vadi',
    'Dağ Eyaletleri', 'Geniş Ova', 'Kanyon Bölgesi', 'Göl Kıyısı', 'Kıyı Şeridi',
    'Büyük Burun', 'Kuzey Geçidi', 'Batı Yaylası', 'Yedi Tepe', 'Nehir Ülkesi',
    'Güneş Toprakları', 'Sahil Birliği', 'Güney Vadileri', 'Yüksek Yayla', 'Yeni Kıta',
]


def components(g):
    if g.geom_type in ('LineString', 'LinearRing'):
        return [LineString(g.coords)]
    return [line for part in getattr(g, 'geoms', []) for line in components(part)]


def rings(v):
    """Five compositions: overlapping discs, horizon arcs, ellipses, central rings, chains."""
    family, variant = divmod(v, 5)
    frame = box(.2, .2, 11.8, 11.8)
    if family == 0:
        layouts = [
            [(2.4, 3.2, 4), (8.9, 3, 4.2), (6, 9.8, 4.6)],
            [(3, 2, 3.9), (9, 5, 4.3), (2.5, 9, 4.1)],
            [(2.5, 6, 5.3), (9.5, 6.4, 5.4)],
            [(6, 2.5, 4.5), (1.8, 10, 5), (10.4, 9, 4.7)],
            [(1.3, 1.4, 4), (10, 2.3, 4), (3.3, 8.4, 4.4), (10, 11, 4)],
        ]
        centers = layouts[variant]
    elif family == 1:
        centers = [
            [(6, 12.5, 13)], [(-1, 6, 14)], [(-.5, -.5, 13), (12.5, 12.5, 7)],
            [(4, 13, 11), (10, -1, 7)], [(-1, 9, 10), (12.5, 2, 10)],
        ][variant]
    elif family == 2:
        centers = [[(6, 6, 7)], [(3, 6, 6), (10, 6, 5)], [(5, 5, 8)],
                   [(2.5, 4, 6), (9, 9, 6)], [(6, 6, 8)]][variant]
    elif family == 3:
        centers = [(6 + (variant - 2) * .3, 6 + (variant % 2) * .5, 9)]
    else:
        centers = [
            [(2, 2, 3.3), (6, 6, 3.7), (10, 10, 3.4)],
            [(2, 3, 3.5), (9, 3, 4), (6, 10, 4)],
            [(3, 1, 3.6), (8, 5.5, 3.7), (3, 10.5, 3.8)],
            [(1, 7, 4.5), (6, 2, 4), (11, 8, 4.5)],
            [(2.5, 2.5, 3.7), (9.5, 2.5, 3.7), (2.5, 9.5, 3.7), (9.5, 9.5, 3.7)],
        ][variant]
    lines, occupied = [], Polygon()
    for ci, (cx, cy, maximum) in enumerate(centers):
        local = []
        step = 1.05 if maximum < 6 else 1.2
        radii = [.8 + k * step for k in range(int((maximum - .8) / step) + 1)]
        stretch = (1.25, .8) if family == 2 else (1, 1)
        angle = (variant * 19 - 30) if family == 2 else 0
        def transform(g):
            return affinity.rotate(affinity.scale(g, *stretch, origin=(cx, cy)), angle, origin=(cx, cy))
        for k, r in enumerate(radii):
            local.append(circle(cx, cy, r, max(40, round(r * 35))))
            if k:
                # Staggered joins make T junctions rather than four-way point contacts.
                count = 2 + (k + variant + ci) % 3
                for j in range(count):
                    a = math.radians(j * 360 / count + k * 37 + variant * 21 + ci * 19)
                    local.append(LineString([(cx + (radii[k-1]-.02)*math.cos(a), cy + (radii[k-1]-.02)*math.sin(a)),
                                             (cx + (r+.02)*math.cos(a), cy + (r+.02)*math.sin(a))]))
        mask = transform(Point(cx, cy).buffer(radii[-1], quad_segs=80))
        for line in local:
            lines += components(transform(line).difference(occupied))
        occupied = unary_union([occupied, mask])
    # Broad arcs in the negative space join the composition without a square lattice.
    for x, y in [(-3, -3), (15, 15)]:
        for r in (6, 9, 12, 15):
            lines += components(circle(x, y, r, 160).difference(occupied))
    return frame, lines, 12, 12


def spiral_path(bounds, step, reverse=False):
    l, t, r, b = bounds
    points = [(l, t)]
    while r-l > step*.8 and b-t > step*.8:
        points += [(r, t), (r, b), (l+step, b), (l+step, t+step)]
        l += step; t += step; r -= step; b -= step
    if reverse:
        cx = (bounds[0]+bounds[2])/2
        points = [(2*cx-x, y) for x,y in points]
    return LineString(points)


def corridor_parts(path, width, phase):
    """Cut a continuous squared ribbon into long L/U-shaped regions."""
    out = [path.buffer(width/2, cap_style='square', join_style='mitre').boundary]
    distance = 2.3 + phase*.24
    while distance < path.length-1.2:
        at = path.interpolate(distance)
        a, b = path.interpolate(max(0, distance-.025)), path.interpolate(min(path.length, distance+.025))
        dx,dy=b.x-a.x,b.y-a.y
        length=math.hypot(dx,dy)
        if length:
            nx,ny=-dy/length*(width/2+.02),dx/length*(width/2+.02)
            out.append(LineString([(at.x-nx,at.y-ny),(at.x+nx,at.y+ny)]))
        distance += 4.5 + (int(distance)+phase)%4*.7
    return out


def spirals(v):
    family, variant=divmod(v,5)
    frame=box(.2,.2,11.8,11.8); lines=[]
    if family==0:
        p=spiral_path((.8,.8,11.2,11.2),1.9+variant*.07,variant%2)
        lines=corridor_parts(p,.88,variant)
    elif family==1:
        if variant%2:
            bounds=[(.8,.8,11.2,5.5),(.8,6.5,11.2,11.2)]
        else:
            bounds=[(.8,.8,5.5,11.2),(6.5,.8,11.2,11.2)]
        for k,b in enumerate(bounds):lines+=corridor_parts(spiral_path(b,1.7, bool(k)),.86,variant+k)
    elif family==2:
        # Offset stepped ribbons; no repeating square cells.
        for k in range(4):
            y=1+k*2.8
            pts=[(-1,y),(2+variant*.2,y),(2+variant*.2,y+1),(5.4,y+1),(5.4,y-.4),(8.6,y-.4),(8.6,y+.8),(13,y+.8)]
            lines+=corridor_parts(LineString(pts),1.1,variant+k)
    elif family==3:
        for k,b in enumerate([(.9,.9,5.3,5.3),(6.7,.9,11.1,5.3),(.9,6.7,5.3,11.1),(6.7,6.7,11.1,11.1)]):
            lines+=corridor_parts(spiral_path(b,1.65,bool((k+variant)%2)),.85,variant+k)
        lines += [LineString([(6,.2),(6,4.8)]),LineString([(6,7.2),(6,11.8)]),
                  LineString([(.2,6),(4.8,6)]),LineString([(7.2,6),(11.8,6)])]
    else:
        paths=[
            [(-1,1),(10.5,1),(10.5,10.5),(2,10.5),(2,3),(8.5,3),(8.5,8.5),(4,8.5),(4,5),(6.5,5),(6.5,7)],
            [(1,-1),(1,10),(4,10),(4,2),(7,2),(7,10),(10,10),(10,-1)],
            [(-1,2),(10,2),(10,5),(2,5),(2,8),(10,8),(10,11),(-1,11)],
            [(-1,1),(4,1),(4,3),(8,3),(8,5),(11,5),(11,10),(7,10),(7,8),(3,8),(3,6),(-1,6)],
            [(1,13),(1,2),(5,2),(5,10),(9,10),(9,2),(13,2)],
        ]
        lines=corridor_parts(LineString(paths[variant]),1.15,variant)
        for x,y in [(3,6),(8,6)]:
            lines += components(box(x-1,y-1,x+1,y+1).boundary.difference(LineString(paths[variant]).buffer(.7)))
    # Split the spaces between ribbons too, avoiding one huge background pane.
    ribbons=unary_union([Polygon(line) for line in lines if line.geom_type=='LineString' and line.is_ring])
    for x in (2.7+variant*.13,7.6-variant*.17):
        lines+=components(LineString([(x,-1),(x,13)]).difference(ribbons))
    for y in (3.7+variant*.11,8.8-variant*.12):
        lines+=components(LineString([(-1,y),(13,y)]).difference(ribbons))
    rotation=(variant%4)*90
    lines=[affinity.rotate(l,rotation,origin=(6,6)) for l in lines]
    return frame,lines,12,12


# Distinct coastline silhouettes, all hand-authored in a normalized 12 × 12 frame.
COASTS = [
    [(1,1),(5,1.4),(8,.8),(11,2),(10.6,5),(11.5,7),(9,7.5),(8,10),(5,11),(3,9),(2,6)],
    [(2,1),(7,1),(9,2),(8,4),(11,4),(11.5,6),(8,7),(9,9),(7,11),(5,9),(2,10),(.8,6)],
    [(1,3),(3,1),(4,2),(6,.6),(8,2),(10,1),(11,4),(9,6),(10,9),(7,11),(4,10),(3,7),(1,6)],
    [(1,1),(6,.7),(10,2),(11,5),(8,7),(7,11.5),(5,11),(4,8),(2,7),(.7,4)],
    [(1,1),(5,.8),(6,3),(8,3),(9,1),(11,2),(11,6),(8,7),(9,10),(7,11),(4,9),(3,6),(1,7)],
    [(2,.6),(5,1),(8,3),(9,5),(11,6),(10,8),(7,8),(6,11),(4,11.5),(3,8),(1,6),(2,3)],
    [(9,1),(5,.6),(2,2),(.5,5),(1,9),(4,11),(9,11),(11,9),(7,9),(4,7),(4,4),(7,3),(11,3)],
    [(1,1),(9,1),(11,4),(8,4),(6,3),(4,4),(5,7),(8,7),(11,6),(10,10),(6,11),(2,10),(.6,6)],
    [(1,2),(4,1),(7,2),(10,1),(11,4),(8,5),(8,8),(11,10),(9,11),(6,8),(3,10),(1,9),(3,6)],
    [(1,4),(4,1),(7,2),(10,1),(11,5),(9,8),(6,11),(3,10),(2,7)],
    [(1,2),(3,1),(5,2),(7,.7),(10,2),(11,5),(9,7),(10,10),(6,11),(4,9),(1,10),(.6,6)],
    [(1,1),(7,.8),(11,2),(11,7),(9,10),(5,11),(1,10),(.5,6)],
    [(1,1),(4,2),(7,1),(10,3),(9,5),(11,7),(9,11),(6,10),(5,7),(3,8),(1,6)],
    [(1,1),(9,1),(11,4),(9,6),(7,4),(5,5),(6,8),(9,9),(10,11),(5,11),(2,9),(.6,5)],
    [(1,1),(5,1),(7,3),(9,3),(11,6),(9,8),(8,11),(5,10),(4,7),(2,5)],
    [(2,1),(7,.8),(11,3),(10,6),(7,7),(6,10),(3,11.5),(1,10),(3,7),(1,5)],
    [(1,2),(4,1),(5,4),(7,4),(8,1),(11,2),(10,6),(8,8),(9,11),(5,10),(2,11),(1,7)],
    [(.5,3),(3,1),(7,2),(10,1),(11,5),(8,6),(9,9),(6,11),(3,10),(1,7)],
    [(1,3),(3,1),(5,2),(7,1),(9,2),(11,4),(10,7),(8,9),(5,11),(2,9),(.5,6)],
    [(1,1),(4,2),(6,1),(10,2),(11,5),(8,7),(9,10),(6,11),(3,9),(2,6),(.7,4)],
    [(1,2),(5,.6),(9,1),(11,4),(10,8),(7,11),(4,10),(1,11),(.6,6)],
    [(1,1),(5,2),(8,1),(11,2),(9,5),(10,8),(8,10),(5,9),(3,11),(1,8),(2,4)],
    [(2,1),(7,.6),(10,3),(11,7),(9,11),(6,10),(5,7),(3,9),(1,7),(.7,4)],
    [(1,2),(4,1),(8,1.5),(11,4),(10,8),(7,10),(4,11),(1,9),(.5,5)],
    [(1,1),(5,1.5),(8,1),(11,3),(10,6),(11,8),(8,9),(6,11),(3,10),(2,7),(.6,5)],
]


def atlas(v, attempt=0):
    rand=random.Random(5317+v*277+attempt*19)
    coast=Polygon(COASTS[v]).buffer(.16,quad_segs=3).buffer(-.16,quad_segs=3)
    # Fine irregular coastline offsets are shared by every adjacent province.
    coords=list(coast.exterior.coords); fine=[]
    for a,b in zip(coords,coords[1:]):
        length=math.dist(a,b); steps=max(1,int(length/.45))
        for i in range(steps):
            t=i/steps; wobble=rand.uniform(-.11,.11)*math.sin(math.pi*t)
            fine.append((a[0]*(1-t)+b[0]*t-(b[1]-a[1])/length*wobble,
                         a[1]*(1-t)+b[1]*t+(b[0]-a[0])/length*wobble))
    outline=Polygon(fine)
    # Variable spacing avoids a regular honeycomb. Provincial density varies by coast.
    points=[]
    for _ in range(12000):
        x,y=rand.uniform(.5,11.5),rand.uniform(.5,11.5)
        spacing=1.05+.45*(x/12 if v%2 else y/12)
        if outline.contains(Point(x,y)) and all(math.hypot(x-a,y-b)>spacing for a,b in points):
            points.append((x,y))
        if len(points)>=28+v%9:break
    cells=list(shapely.voronoi_polygons(MultiPoint(points),extend_to=box(-2,-2,14,14)).geoms)
    if v%5 in (0,2):
        # Surveyed provinces: staggered recursive divisions, like western US borders.
        cells=[box(-1,-1,13,13)]
        for k in range(37):
            selected=max(range(len(cells)),key=lambda i:cells[i].intersection(outline).area)
            p=cells.pop(selected);l,t,r,b=p.bounds
            ratio=rand.uniform(.36,.64)
            vertical=(r-l)>(b-t)*rand.uniform(.8,1.2)
            if vertical:
                x=l+(r-l)*ratio;cells.extend([box(l,t,x,b),box(x,t,r,b)])
            else:
                y=t+(b-t)*ratio;cells.extend([box(l,t,r,y),box(l,y,r,b)])
        # Node first: two adjacent provinces can share only part of a survey line.
        net=unary_union([p.boundary for p in cells])
        cells=None
    lines=[];seen=set()
    boundaries=[cell.exterior for cell in cells] if cells else components(net)
    for boundary in boundaries:
        for a,b in zip(boundary.coords,list(boundary.coords)[1:]):
            a,b=sorted([tuple(round(q,5) for q in a),tuple(round(q,5) for q in b)])
            if (a,b) in seen:continue
            seen.add((a,b));length=math.dist(a,b)
            if length<.01:continue
            # A mix of survey lines and gently wandering natural borders.
            amp=0 if v%5==0 else min(.12,length*.08)*rand.choice([-1,1])
            pts=[]
            for k in range(7):
                t=k/6;off=amp*math.sin(t*math.pi)*math.sin(t*math.pi*2+.6)
                pts.append((a[0]+(b[0]-a[0])*t-(b[1]-a[1])/length*off,
                            a[1]+(b[1]-a[1])*t+(b[0]-a[0])/length*off))
            lines.append(LineString(pts))
    # Landscape and portrait regional maps both fit the game's dynamic canvas.
    sx,sy=[(1.15,.85),(.9,1.1),(1,1),(1,1.15),(1.15,1)][v%5]
    outline=affinity.scale(outline,sx,sy,origin=(0,0))
    lines=[affinity.scale(l,sx,sy,origin=(0,0)) for l in lines]
    return outline,lines,12*sx,12*sy


def palette(i):
    bases=[['#187bad','#f0df57','#169974','#b979a0'],['#d86723','#efd956','#1778a7','#1b9876'],
           ['#4eb0cf','#d5577a','#cfb969','#508d50'],['#cf755c','#edce73','#519d91','#38668e'],
           ['#8a64aa','#e9bd63','#4c9c91','#4c78a8']]
    out=[]
    for c in bases[i%5]:
        h,s,v=colorsys.rgb_to_hsv(*[int(c[j:j+2],16)/255 for j in (1,3,5)])
        rgb=colorsys.hsv_to_rgb((h+(i//5)*.0019)%1,s,v)
        out.append('#'+''.join(f'{round(q*255):02x}' for q in rgb))
    return out


def catalog():
    from creative_designs import REPLACEMENT_SLOTS
    remaining=[n for n in range(51,201) if n not in REPLACEMENT_SLOTS]
    # Keep 25 evenly distributed old designs; replace the other 75 in-place.
    retired=[n for i,n in enumerate(remaining) if i%4!=0]
    out=[]
    for i,slot in enumerate(retired):
        family=['rings','spiral','atlas'][i%3];v=i//3
        name={'rings':RING_NAMES,'spiral':SPIRAL_NAMES,'atlas':ATLAS_NAMES}[family][v]
        out.append(dict(id=f'{family}_{v+1:02}',name=name,level=slot,replaces=f'chapter_{slot:03}',
                        family=family,variant=v,palette=palette(i),large=False))
    return out
