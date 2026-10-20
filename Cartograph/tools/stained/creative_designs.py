"""Hand-authored figurative subjects and narrative scenes, catalog revision 3.

No lattice/rosette variants. Each entry has its own subject silhouette. Parts are
front-to-back; scenery uses flowing contours, and the large scenes use an 18x24 map.
"""
import math
import colorsys
import shapely
from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union
from geom import ellipse, spline, seg, petal_poly, o_round_arch, o_oval, o_octagon
from extra_designs import oval, soft, poly


def stroke(points, width=.45):
    return spline(points).buffer(width, cap_style=1, join_style=1)


def move(parts, x, y, scale=1, flip=False):
    return [(affinity.translate(affinity.scale(g, -scale if flip else scale, scale, origin=(6, 8)), x-6, y-8), c) for g,c in parts]


def eye(x,y,r=.6):
    return oval(x,y,r,r)


def mountain(x,y,w=5,h=5):
    return [(poly([(x,y-h),(x-w*.3,y-h*.45),(x,y-h*.6),(x+w*.25,y-h*.4)]),1),
            (poly([(x-w,y),(x,y-h),(x+w,y)]),2)]


def pine(x,y,s=1):
    return [(box(x-.32*s,y-3*s,x+.32*s,y),0),
            (poly([(x,y-6*s),(x-1.6*s,y-3.5*s),(x-.8*s,y-3.5*s),(x-2.1*s,y-1.4*s),(x+2.1*s,y-1.4*s),(x+.8*s,y-3.5*s),(x+1.6*s,y-3.5*s)]),2)]


def cloud(x,y,s=1):
    return unary_union([oval(x-1.2*s,y,1.5*s,.7*s),oval(x,y-.4*s,1.5*s,1*s),oval(x+1.4*s,y,.95*s,.7*s)])


def house(x,y,s=1):
    return [(box(x-.4*s,y-1.7*s,x+.4*s,y),3),(eye(x,y-3*s,.6*s),1),
            (poly([(x-2.4*s,y-2.4*s),(x,y-4.6*s),(x+2.4*s,y-2.4*s)]),0),
            (box(x-1.8*s,y-2.5*s,x+1.8*s,y),1)]


def boat(x,y,s=1):
    return [(poly([(x,y-5*s),(x,y-1.4*s),(x+2.5*s,y-1.4*s)]),1),
            (poly([(x-.5*s,y-4*s),(x-.5*s,y-1.4*s),(x-2.5*s,y-1.4*s)]),0),
            (poly([(x-3*s,y-.8*s),(x+3*s,y-.8*s),(x+1.8*s,y+.7*s),(x-1.8*s,y+.7*s)]),2)]


def balloon(x,y,s=1):
    return [(oval(x,y-1.5*s,.75*s,2.3*s),1),(oval(x,y-1.8*s,2*s,2.5*s),0),
            (poly([(x-.9*s,y+.2*s),(x+.9*s,y+.2*s),(x+.6*s,y+2*s),(x-.6*s,y+2*s)]),2)]


def octopus():
    body=oval(6,5.7,2.7,3)
    arms=[stroke(pts,.55) for pts in [
        [(4,7),(2.5,7.7),(1.1,6.6)],[(3.8,8),(2,9.7),(1.2,9.3)],
        [(4.4,8.5),(3.3,12),(1.9,12.5)],[(5.5,8.5),(5,13.7),(4.2,14.2)],
        [(6.5,8.5),(7,13.7),(7.8,14.2)],[(7.6,8.5),(8.7,12),(10.1,12.5)],
        [(8.2,8),(10,9.7),(10.8,9.3)],[(8,7),(9.5,7.7),(10.9,6.6)]]]
    return [(eye(4.9,5.7,.65),1),(eye(7.1,5.7,.65),1),(unary_union([body,*arms]),0)]


def chameleon():
    tail=stroke([(4,9),(2,10),(2,12),(4,13),(5,11.5),(3.7,11)],.6)
    return [(eye(8.4,6.2,.7),1),(poly([(8.3,7),(10.7,7),(9.4,8)]),0),
            (oval(6,8,3.5,2.3),2),(oval(8.3,6.8,1.7,1.8),2),(tail,2),
            (stroke([(5,9),(5.5,11),(6.5,10.8)],.45),0),(stroke([(7.8,9),(8.6,11),(9.5,10.8)],.45),0),
            (stroke([(.5,12),(6,11.2),(11.5,12)],.5),0)]


def flamingo():
    return [(eye(7.8,3.3,.5),3),(poly([(8.5,3.5),(10.1,4),(9,5)]),3),
            (oval(7.8,3.6,1.2,1.3),0),(stroke([(7.7,4),(6,5.4),(7.2,7),(6.6,8.4)],.65),0),
            (oval(4.7,8.6,3,2),0),(oval(4,8.5,1.8,.9,-20),1),
            (stroke([(4.6,10),(4.6,14.3),(6,14.3)],.32),2),
            (stroke([(6,10),(7.1,12),(5.5,13)],.34),2)]


def toucan():
    return [(eye(4.5,4.9,.65),1),(oval(8.4,5.1,2.8,1.35),0),
            (oval(8.8,5.1,1.1,.8),1),(oval(5,6.8,2.1,3.3),3),
            (oval(5.2,8,1.1,1.8),1),(petal_poly((4.8,8),110,4.5,1.5),2),
            (poly([(3.7,9),(4.6,13.9),(6.3,13.5),(5.7,9)]),3),
            (stroke([(1,12),(6,11.6),(11,12.5)],.5),0)]


def elephant():
    return [(eye(7.9,6.3,.6),3),(oval(5.4,7.4,1.7,2.5),1),
            (stroke([(8.4,6),(9.7,8),(9.8,11.7),(10.7,12)],.85),0),
            (oval(5.6,8,3.9,3.5),0),(box(2.6,9.35,4,13.5),0),(box(6.2,9.35,7.7,13.5),0),
            (stroke([(2.5,7),(1.3,9),(1.4,10.5)],.4),2)]


def koala():
    return [(oval(6,7.6,.6,.9),3),(eye(4.4,6.3,.6),3),(eye(7.6,6.3,.6),3),
            (oval(3.1,4.8,1.1,1.2),1),(oval(9,4.8,1.1,1.2),1),
            (oval(6,6.7,3,2.9),0),(oval(3,4.8,1.8,1.8),0),(oval(9,4.8,1.8,1.8),0),
            (oval(6,11,2.4,3),0),(oval(6,10.7,1.1,1.6),1),
            (stroke([(8,2),(8.6,8),(9.2,15)],.65),2)]


def hedgehog():
    spikes=[(1,11),(1,8),(2.2,8),(1.8,5.7),(3.4,6.3),(4,3.8),(5.2,5),(6.8,3.5),(7.2,5.5),(9.3,4.8),(9,7),(10.6,7.5),(9.8,9.4),(11,11.4),(8.5,13),(3,13)]
    return [(eye(8.8,10,.6),3),(oval(10.5,11.5,.7,.6),3),(oval(7.7,11,2.9,1.8),1),
            (oval(5.2,9.1,2.3,2.6),0),(poly(spikes),2),(oval(4,13.1,1,.6),0)]


def squirrel():
    return [(eye(7.8,5.5,.6),3),(oval(8.8,7,.6,.5),3),
            (oval(7,6,2,2),0),(poly([(5.9,5),(5.8,2.7),(7.4,4.4)]),0),
            (oval(6,10.2,2.5,3.3),0),(oval(6.4,10.2,1.2,2),1),
            (oval(3,7.7,2.2,4.4,-22),0),(oval(2.6,6.2,1.1,2.2,-20),1),
            (oval(8.7,10,1.1,1.3),2),(oval(8.7,9.1,1.3,.7),3)]


def seal():
    return [(eye(4.8,5.7,.6),3),(eye(7.3,5.7,.6),3),(oval(6,7.1,.8,.65),3),
            (oval(6,6.2,2.6,2.4),1),(oval(6,10,3,4),0),
            (petal_poly((4.5,9),155,3.5,1),2),(petal_poly((7.5,9),25,3.5,1),2),
            (oval(4.6,13.7,1.7,.8,-20),1),(oval(7.6,13.7,1.7,.8,20),1)]


def seahorse():
    body=soft([(5,3),(7,3.2),(7.6,4.6),(9.8,5),(9.6,6.2),(7.2,6.3),(6.7,8),(8,10),(7,12),(5,13.7),(3.4,12.9),(3.2,11.1),(4.7,10.8),(5.3,11.9),(6,11),(4.6,9),(4,6)])
    return [(eye(6.4,4.5,.55),3),(oval(6.7,8.6,1,1.8,-20),1),(body,0),
            (petal_poly((5,7.4),175,3,1.25),2),(poly([(4.6,3.5),(4.3,1.8),(6,3)]),2)]


def crab():
    parts=[(eye(4.7,6.8,.55),3),(eye(7.4,6.8,.55),3),(oval(6,9,3.1,2.4),0)]
    for flip in [False,True]:
        p=[(soft([(3.3,8.5),(1,6.4),(.9,4.6),(2,3.4),(2.1,5.1),(3.4,4.1),(3.4,6.1)]),0)]
        p += [(stroke([(3.7,9.2+i*.8),(1.4,10+i*.8),(1.2,11+i*.8)],.4),2) for i in range(3)]
        parts+=move(p,6,8,1,flip)
    return parts


def frog():
    return [(eye(3.8,5.2,.6),3),(eye(8.2,5.2,.6),3),(oval(6,7.5,2.1,.7),1),
            (oval(3.8,5.3,1.25,1.25),2),(oval(8.2,5.3,1.25,1.25),2),
            (oval(6,7,3.3,2.5),2),(oval(6,10,2.3,2.8),0),
            (oval(2.9,11,1.4,2,-30),2),(oval(9.1,11,1.4,2,30),2),
            (oval(6,13.8,5,1.1),1)]


def dachshund():
    return [(eye(8.7,6.2,.55),3),(oval(10.5,7.4,.6,.6),3),
            (oval(8.2,7.5,.9,2.2,-15),3),(oval(9,6.8,1.7,1.7),0),
            (oval(5.2,9,4,1.7),0),(box(2.3,9,3.4,12.5),0),(box(7,9,8.1,12.5),0),
            (stroke([(2,9),(1.1,7),(1.6,5.7)],.45),0),(oval(5.3,9.1,2,1.1),1)]


def raccoon():
    return [(eye(4.6,6,.55),1),(eye(7.5,6,.55),1),(oval(6,7.8,.65,.6),3),
            (oval(4.5,6.2,1.3,1.1,-15),3),(oval(7.5,6.2,1.3,1.1,15),3),
            (oval(6,6.7,3.1,2.9),0),(poly([(2.7,5.2),(2.8,2.4),(5,4.2)]),0),
            (poly([(7,4.2),(9.2,2.4),(9.3,5.2)]),0),(oval(6,11,2.5,3),0),
            (oval(9.2,11.9,1.5,2.3,-35),3),(oval(9.5,12.2,.9,1),1)]


def swan():
    return [(eye(7.9,3.7,.31),3),(poly([(8.4,4),(10,4.6),(8.4,5)]),0),
            (stroke([(7.6,4),(5.9,5.2),(7.4,7.2),(6.5,10)],.8),1),
            (oval(7.5,4,1.1,1.1),1),(soft([(1,9),(3,9.8),(4,8.3),(7.3,9),(9.3,11),(7.6,12.2),(3.6,12.4),(1.8,11.2)]),1),
            (petal_poly((7,11),-155,4.8,1.6),2)]


def gramophone():
    return [(oval(7.8,5.4,2.8,2.3,-25),1),(oval(7.8,5.4,1.9,1.5,-25),3),
            (poly([(7,6.4),(4,8.6),(3.8,6.8),(6.2,4.6)]),0),
            (stroke([(4.3,7.4),(3.5,9),(5.4,10)],.5),0),
            (oval(6,10.7,3.7,1.1),3),(oval(6,10.7,.7,.5),1),
            (poly([(2.3,10.6),(9.7,10.6),(9.2,14),(2.8,14)]),0)]


def camera():
    return [(eye(6,8.5,1.45),3),(eye(6,8.5,2.3),1),(eye(9,6.4,.65),1),
            (box(2,5.7,10,11.7).buffer(.4),0),(box(4,4.1,7,6),2),
            (stroke([(2.1,7),(1,3.7),(5,2),(10.7,3.5),(10,7)],.35),3)]


def typewriter():
    return [(box(3.8,3,8.2,6.7),1),(box(3,5.8,9,7.2),3),
            (poly([(3,6),(9,6),(10.5,12.8),(1.5,12.8)]),0),
            *[(oval(x,y,.58,.48),1) for y in (9,10.8) for x in (3.5,5.9,8.3)],
            (box(4.5,12,7.5,12.7),2)]


def violin():
    body=soft([(5.2,6),(3.3,6.5),(3,8.5),(4.3,9.2),(3.4,10.2),(2.9,12.5),(4.2,14),(7.5,14),(9,12.5),(8.4,10.3),(7.1,9.2),(8.3,8.4),(8,6.5),(6.7,6)])
    return [(box(5.55,3,6.45,11),3),(oval(6,2.6,1,.8),0),(oval(6,11.8,1.3,1.6),1),
            (body,0),(stroke([(9.5,2),(10,8),(10.5,14)],.3),2)]


def umbrella():
    canopy=soft([(1,7.5),(2.5,3.9),(6,2.7),(9.5,3.9),(11,7.5),(8.5,6.8),(6,7.5),(3.5,6.8)])
    return [(canopy.intersection(box(4.6,0,7.4,8)),1),(canopy,0),
            (stroke([(6,7),(6,12.7),(7.4,13.5),(8.2,12.3)],.48),2)]


def boots():
    return [(box(2,3.7,5,5.1),1),(box(6.8,5.1,9.8,6.5),1),
            (soft([(2,4.5),(5,4.5),(4.8,10.5),(5.8,11.8),(5.7,13),(1.2,13),(1,11.8),(2,10.8)]),0),
            (soft([(6.8,6),(9.8,6),(9.6,11.5),(11,12.7),(10.8,14),(6.2,14),(6,12.6),(6.8,11.8)]),2)]


def cupcake():
    cream=soft([(2,7.5),(2.8,5.4),(4.6,5),(4.9,3.4),(7,3.4),(7.6,5),(9.4,5.8),(10,7.5)])
    return [(eye(6,2.9,.8),0),(cream,1),(poly([(2,8),(10,8),(8.5,13.5),(3.5,13.5)]),0),
            (poly([(5.2,8),(6.8,8),(6.6,13.5),(5.4,13.5)]),2)]


def moka():
    return [(box(5.4,2.5,6.6,3.6),3),(poly([(3.5,4),(8.5,4),(7.4,3),(4.6,3)]),1),
            (poly([(3.4,4.4),(8.6,4.4),(7.7,8.2),(4.3,8.2)]),0),
            (box(4.3,8.2,7.7,9.4),3),(poly([(4.3,9.4),(7.7,9.4),(8.8,13.5),(3.2,13.5)]),1),
            (stroke([(8.4,5),(10.2,5.2),(10,8),(8,8.5)],.55),3),
            (poly([(3.6,5),(1.8,4.6),(3.7,7)]),0)]


def bicycle():
    return [(eye(3,10.5,2.1),3),(eye(3,10.5,1.35),1),(eye(9,10.5,2.1),3),(eye(9,10.5,1.35),1),
            (stroke([(3,10.5),(4.7,6.8),(6.5,10.5),(3,10.5)],.36),0),
            (stroke([(4.7,6.8),(8,6.8),(6.5,10.5)],.36),0),
            (stroke([(9,10.5),(7.8,5.3),(9,5.1)],.4),2),(box(3.5,6,5.6,6.7),2)]


def airship():
    return [(oval(6,6.8,4.7,1),1),(oval(6,6.8,4.8,2.7),0),
            (poly([(2.2,5.5),(.6,3.8),(.8,7.3),(2.2,7.5)]),2),
            (poly([(4.5,9),(7.6,9),(7,11.8),(5,11.8)]),2)]


def giraffe():
    return [(eye(7.1,3.8,.55),3),(oval(7.4,5.3,1.4,.75),1),
            (oval(6.5,4.3,2,1.8),0),(poly([(5,4),(7,4.8),(6.3,11.8),(3.8,12.5)]),0),
            (oval(3.9,12.3,2.6,1.6),0),(box(2.1,12,3.2,15),0),(box(5,12,6,15),0),
            *[(oval(x,y,.65,.8),2) for x,y in [(5.8,7),(5,9.6),(3.3,12)]],
            (stroke([(5.2,3),(4.6,1.5)],.4),2),(stroke([(7,3),(7.2,1.4)],.4),2)]


def panda():
    return [(eye(4.6,6.4,.55),1),(eye(7.4,6.4,.55),1),(oval(6,8,.7,.6),3),
            (oval(4.4,6.4,1,1.2,20),3),(oval(7.6,6.4,1,1.2,-20),3),
            (oval(6,6.8,3,3),1),(oval(3.2,4,1.3,1.3),3),(oval(8.8,4,1.3,1.3),3),
            (oval(6,11.2,2.8,3),3),(oval(6,10.8,1.8,1.8),1),
            (box(9.5,6,10.3,15),2)]


def sloth():
    return [(eye(4.5,6,.55),3),(eye(7.1,6,.55),3),(oval(5.8,7.3,.65,.5),3),
            (oval(5.8,6.3,2.3,1.8),1),(oval(5.8,6.5,3,2.6),0),
            (oval(6.6,10.2,2.8,3),0),(stroke([(4,10),(2.4,8),(2.6,3)],.7),0),
            (stroke([(8,10),(9.5,7.5),(9.1,3)],.7),0),(stroke([(1,3),(6,2.7),(11,3.1)],.6),2)]


def otter():
    return [(eye(4.8,4.9,.55),3),(eye(7.2,4.9,.55),3),(oval(6,6.3,.8,.6),3),
            (oval(6,5.2,2.5,2.2),0),(oval(6,10,2.7,4),0),(oval(6,10,1.7,2.6),1),
            (oval(6,9.5,1,1.2),2),(oval(3.8,9,1.3,.7,20),0),(oval(8.2,9,1.3,.7,-20),0)]


def duck():
    return [(eye(7.8,5.5,.6),3),(oval(9.8,6.7,1.4,.65),0),
            (oval(7.4,6,2.1,2.2),2),(oval(5.4,10,4.1,2.7),1),(oval(4.5,10,2.1,1.3,-15),0),
            (poly([(2.5,9),(.5,7.6),(1.5,11)]),1)]


def rooster():
    return [(eye(7.5,5.1,.5),3),(poly([(8.5,5),(10.2,5.9),(8.5,6.4)]),1),
            (soft([(6.4,4.2),(5.6,2.9),(6.8,2.4),(7.6,3),(8.5,2.5),(9,3.8),(8.2,4.5)]),0),
            (oval(7.4,5.7,1.8,2),1),(oval(6,9.3,2.9,3),1),(oval(5.5,9,1.7,1.6),0),
            (petal_poly((4.5,9),-130,5,1.5),2),(petal_poly((4.5,9),-170,4.2,1.3),3),
            (stroke([(5,11.8),(4.5,14),(3.3,14)],.35),0),(stroke([(7,11.8),(7,14),(8.2,14)],.35),0)]


def bat():
    wing=poly([(5.5,7),(3.3,3),(1,4.5),(.5,8),(2.5,7.5),(3.5,10),(4.9,9)])
    return [(eye(5.4,6.6,.35),1),(eye(6.6,6.6,.35),1),(oval(6,8,1.3,3),3),
            (poly([(4.8,6),(4.6,3.8),(6,5),(7.4,3.8),(7.2,6)]),3),
            (wing,0),(affinity.scale(wing,-1,1,origin=(6,8)),2)]


def stingray():
    return [(eye(4.8,6.5,.55),3),(eye(7.2,6.5,.55),3),
            (soft([(6,3.2),(8,5),(11.2,8),(8,10),(6,11),(4,10),(.8,8),(4,5)]),0),
            (oval(6,7.5,1.5,2.5),1),(stroke([(6,10),(6.4,13),(8,14.7)],.45),2)]


def lobster():
    return [(eye(5.3,5.4,.5),3),(eye(6.7,5.4,.5),3),(oval(6,8.7,1.7,3.3),0),
            (oval(6,12.4,2.1,1.4),1),(oval(2.3,5.3,1.5,2,-20),0),(oval(9.7,5.3,1.5,2,20),0),
            (stroke([(3,6),(3.5,8),(4.7,8)],.5),2),(stroke([(9,6),(8.5,8),(7.3,8)],.5),2),
            *[(stroke([(6,8+i),(3,9+i),(2.5,10+i)],.32),2) for i in (0,1.4)],
            *[(stroke([(6,8+i),(9,9+i),(9.5,10+i)],.32),2) for i in (0,1.4)]]


def iguana():
    return [(eye(8.4,5.6,.55),1),(oval(8.3,6,2.1,1.3),2),(oval(5.6,8.5,3.3,1.8,-30),2),
            (stroke([(4,9),(2,11),(1.2,13.8),(3.3,14)],.6),2),
            (stroke([(5.5,8),(5.8,11),(7.2,11.7)],.45),0),(stroke([(7.4,6.8),(9,8.3),(9.8,9.5)],.45),0),
            (poly([(3.8,8),(4,5.7),(5.3,6.8),(5.8,4.4),(7,5.7)]),1)]


def alpaca():
    return [(eye(6.9,4.8,.55),3),(oval(8.3,5.7,1.1,.6),1),(oval(6.9,5,1.8,2),0),
            (oval(5.7,2.6,.65,1.6,-15),0),(oval(7.8,2.6,.65,1.6,15),0),
            (stroke([(6.8,6),(6.5,9.5)],1),0),(oval(5.1,10,3.1,2.1),0),
            (box(2.6,10.5,3.7,14.3),0),(box(6,10.5,7.1,14.3),0),(oval(5,9.7,1.6,1.3),2)]


def narwhal():
    return [(eye(7.3,7.9,.6),3),(poly([(8.4,7.5),(11.4,3),(9.3,8.6)]),1),
            (oval(5.7,9,3.4,2.1,-15),0),(petal_poly((5,9.7),65,2.8,1),2),
            (soft([(3,9.3),(.8,8.3),(1.1,10.3),(.8,12),(3.5,11)]),0)]


def puffin():
    return [(eye(5.7,5,.55),3),(poly([(7,5),(10,6.3),(7,7.6)]),0),
            (oval(5.4,5.8,2.1,2.2),1),(oval(5,9.2,3,4.5),3),(oval(5.5,10,1.8,2.8),1),
            (petal_poly((3.8,8),100,4,1.3),2),(oval(4,13.8,1.3,.6),0),(oval(7,13.8,1.3,.6),0)]


def deer():
    return [(eye(4.7,7.4,.55),3),(eye(7.3,7.4,.55),3),(oval(6,10,.9,.7),3),
            (soft([(3.6,6),(6,5.5),(8.4,6),(8,9.5),(6,11.8),(4,9.5)]),0),
            (oval(2.8,6,1.5,.7,25),1),(oval(9.2,6,1.5,.7,-25),1),
            (stroke([(4.5,6),(3.5,3.8),(2.7,1.5)],.4),2),(stroke([(3.7,4),(1.6,3.2)],.4),2),
            (stroke([(7.5,6),(8.5,3.8),(9.3,1.5)],.4),2),(stroke([(8.3,4),(10.4,3.2)],.4),2),
            (oval(6,13,2.4,2.3),0)]


def guitar():
    return [(eye(6,9.5,1),3),(box(5.6,2.5,6.4,9),2),(box(5.1,1.8,6.9,3.5),0),
            (soft([(5,6),(3.2,6.5),(3,8.3),(4,9.4),(2.5,11),(2.6,13.1),(4.5,14.2),(7.5,14.2),(9.4,13.1),(9.5,11),(8,9.4),(9,8.3),(8.8,6.5),(7,6)]),0),
            (box(4.7,12,7.3,12.7),1)]


def saxophone():
    return [(oval(8.2,9.6,2.5,1.5,-25),1),(oval(8.2,9.6,1.6,.85,-25),3),
            (stroke([(7.6,10),(7,13),(4,13.6),(3,11),(4.3,4.5),(6,3.4)],.85),0),
            (stroke([(5.8,3.5),(6.3,2.5),(7.5,2.8)],.4),3),
            *[(eye(4.1+i*.15,7.1+i*1.6,.55),1) for i in range(3)]]


def telescope():
    return [(poly([(2.2,6.7),(3.5,4.7),(9.7,7.8),(8.6,10)]),0),
            (oval(2.8,5.7,.8,1.2,30),1),(oval(9.2,8.9,.65,1.2,30),3),
            (stroke([(6,8),(6,14.5)],.4),2),(stroke([(6,10),(3,14.5)],.4),2),
            (stroke([(6,10),(9,14.5)],.4),2)]


def rocket():
    return [(eye(6,6.2,1),1),(soft([(6,1.6),(8,4.4),(8,10),(4,10),(4,4.4)]),0),
            (poly([(4.3,7.5),(2.2,10.5),(2.2,12.8),(4.5,11)]),2),
            (poly([(7.7,7.5),(9.8,10.5),(9.8,12.8),(7.5,11)]),2),
            (petal_poly((6,10.2),90,4.5,1.3),1)]


def astronaut():
    return [(oval(6,5,2.1,1.6),3),(oval(6,5,3,2.7),1),(box(4.6,8.6,7.4,10.3),2),
            (box(3.7,7.2,8.3,12).buffer(.5),1),
            (stroke([(3.8,8),(2,9.6),(1.3,8)],.7),1),(stroke([(8,8),(9.7,6.8),(10.5,5.6)],.7),1),
            (stroke([(4.4,11),(4,14.6)],.7),1),(stroke([(7.6,11),(8.2,14.6)],.7),1)]


def submarine():
    return [*[(eye(x,8.3,.8),1) for x in (3.7,6,8.3)],
            (oval(6,8.8,4.8,2.9),0),(stroke([(6,6),(6,3.8),(7.8,3.8)],.5),2),
            (poly([(1.6,8),(.6,6.4),(.6,11.5),(1.6,10)]),2)]


def locomotive():
    return [*[(eye(x,11.5,1.2),3) for x in (3,6,9)],(box(2,7.7,9.5,10.9),0),
            (box(6.4,4.9,9.5,8.2),2),(box(7.1,5.5,8.8,7),1),
            (box(2.6,5.8,3.8,8),3),(oval(3.1,3.6,1.2,.8),1),(oval(4.8,2.4,1,.7),1)]


def windmilltoy():
    return [(eye(6,7,1),1),(box(5.6,7,6.4,15),2),
            (poly([(6,7),(1.4,6.2),(2.7,2.4),(6,4.5)]),0),
            (poly([(6,7),(6.8,2.4),(10.6,3.7),(8.5,7)]),2),
            (poly([(6,7),(10.6,7.8),(9.3,11.6),(6,9.5)]),0),
            (poly([(6,7),(5.2,11.6),(1.4,10.3),(3.5,7)]),3)]


def kite():
    return [(poly([(6,2),(6,9),(2,6)]),0),(poly([(6,2),(10,6),(6,9)]),1),
            (stroke([(6,9),(7.6,11),(5.8,13),(7,15)],.3),3),
            (poly([(6,11),(4.3,10.4),(4.3,12)]),2),(poly([(6,11),(7.9,10.4),(7.9,12)]),2)]


def treasure():
    return [(box(5.3,8.3,6.7,10.7),1),(box(2,8,10,12.8),0),
            (soft([(2,7.8),(2.6,4.8),(6,3.7),(9.4,4.8),(10,7.8)]),2),
            *[(eye(x,7,.65),1) for x in (3.4,5.2,7,8.8)],
            (box(3,8,3.8,12.8),1),(box(8.2,8,9,12.8),1)]


def carouselhorse():
    return [(eye(8,5,.22),3),(oval(8,5.8,1.9,1.4,-20),0),
            (stroke([(7.2,6),(6.3,8.5)],.9),0),(oval(5.2,9,3,1.8),0),
            (oval(5,8.4,1.1,.8),2),(stroke([(3.4,10),(2.6,12.4),(1.5,12.4)],.45),0),
            (stroke([(7,10),(8.5,11.3),(9.4,10.4)],.45),0),
            (stroke([(2.8,8.5),(1.3,7.7),(1.2,10)],.65),1),(box(5.7,1,6.3,15.5),1)]


SUBJECTS = [
 ('octopus','Ahtapot',octopus),('chameleon','Bukalemun',chameleon),('flamingo','Flamingo',flamingo),
 ('toucan','Tukan',toucan),('elephant','Fil',elephant),('koala','Koala',koala),('hedgehog','Kirpi',hedgehog),
 ('squirrel','Sincap',squirrel),('seal','Fok',seal),('seahorse','Denizatı',seahorse),('crab','Yengeç',crab),
 ('frog','Kurbağa',frog),('dachshund','Sosis Köpek',dachshund),('raccoon','Rakun',raccoon),('swan','Kuğu',swan),
 ('gramophone','Gramofon',gramophone),('camera','Fotoğraf Makinesi',camera),('typewriter','Daktilo',typewriter),
 ('violin','Keman',violin),('umbrella','Şemsiye',umbrella),('boots','Yağmur Çizmeleri',boots),
 ('cupcake','Kapkek',cupcake),('moka','Moka Pot',moka),('bicycle','Bisiklet',bicycle),('airship','Zeplin',airship),
 ('giraffe','Zürafa',giraffe),('panda','Panda',panda),('sloth','Tembel Hayvan',sloth),('otter','Su Samuru',otter),
 ('duck','Ördek',duck),('rooster','Horoz',rooster),('bat','Yarasa',bat),('stingray','Vatoz',stingray),
 ('lobster','Istakoz',lobster),('iguana','İguana',iguana),('alpaca','Alpaka',alpaca),('narwhal','Deniz Gergedanı',narwhal),
 ('puffin','Deniz Papağanı',puffin),('deer','Geyik',deer),('guitar','Gitar',guitar),('saxophone','Saksafon',saxophone),
 ('telescope','Teleskop',telescope),('rocket','Roket',rocket),('astronaut','Astronot',astronaut),
 ('submarine','Denizaltı',submarine),('locomotive','Buharlı Lokomotif',locomotive),
 ('pinwheel','Rüzgâr Gülü',windmilltoy),('kite','Uçurtma',kite),('treasure','Hazine Sandığı',treasure),
 ('carouselhorse','Atlıkarınca Atı',carouselhorse),
]

# Each replacement tells a small story around a recognizable subject.
STORIES = [
 ('Mercanların Bekçisi','reef'),('Yağmur Ormanında Kamuflaj','jungle'),('Tuz Gölünde Sabah','lake'),
 ('Tropik Meyve Ziyafeti','jungle'),('Savanda Gün Batımı','savanna'),('Okaliptüs Molası','forest'),
 ('Sonbahar Yaprakları','forest'),('Kışlık Palamutlar','forest'),('Buzda Dinlenme','arctic'),
 ('Yosunların Arasında','reef'),('Kumsalda Yürüyüş','beach'),('Nilüfer Göleti','lake'),
 ('Parkta Gezinti','park'),('Gece Pikniği','camp'),('Ay Işığında Göl','lake'),
 ('Plakçı Köşesi','music'),('Fotoğraf Gezisi','mountain'),('Yazarın Penceresi','study'),
 ('Sokak Konseri','music'),('Yağmurlu Sokak','rain'),('Su Birikintisi','rain'),
 ('Pastane Vitrini','bakery'),('Sabah Kahvesi','cafe'),('Sahil Bisikleti','beach'),
 ('Bulutların Üstünde','sky'),('Akasya Gölgesi','savanna'),('Bambu Kahvaltısı','jungle'),
 ('Daldaki Siesta','jungle'),('Nehirde Oyun','river'),('Sazlık Ailesi','lake'),
 ('Çiftlikte Şafak','farm'),('Mağaradan Uçuş','cave'),('Derin Mavi','reef'),
 ('Deniz Tabanı','reef'),('Volkanik Kayalar','mountain'),('And Dağları','mountain'),
 ('Kutup Yolculuğu','arctic'),('Falez Yuvası','cliff'),('Orman Açıklığı','forest'),
 ('Kamp Ateşi Müziği','camp'),('Caz Gecesi','music'),('Yıldız Gözlemi','space'),
 ('Ay Yolculuğu','space'),('Uzay Yürüyüşü','space'),('Batık Keşfi','reef'),
 ('Dağ Geçidi','mountain'),('Rüzgârlı Çayır','park'),('Uçurtma Şenliği','sky'),
 ('Korsan Koyu','beach'),('Lunapark Akşamı','fair'),
]


def scenery(kind,w=12,h=16):
    """Purposeful landscape layers. No radial template behind the subjects."""
    p=[]
    if kind in ('reef','river','lake','beach','arctic'):
        if kind=='arctic':
            p+=mountain(w*.25,h*.78,w*.28,h*.24)+mountain(w*.8,h*.8,w*.23,h*.18)
        elif kind in ('lake','river'):
            p+=pine(w*.14,h*.73,.7)+pine(w*.88,h*.65,.6)
        elif kind=='reef':
            for x in (w*.12,w*.88):
                p += [(stroke([(x,h*.95),(x-.6,h*.8),(x+.3,h*.67)],.4),2)]
            p += [(oval(w*.2,h*.9,1.6,.8),0),(oval(w*.8,h*.92,1.8,.9),1)]
        elif kind=='beach':
            p += [(eye(w*.78,h*.2,1.3),1)]
        for i in range(3):
            yy=h*(.72+i*.11)
            p.append((soft([(-1,yy),(w*.27,yy-.45),(w*.65,yy+.45),(w+1,yy-.3),(w+1,h+1),(-1,h+1)]),[3,1,2][i]))
    elif kind in ('forest','jungle','savanna','park','farm','mountain','cliff','camp'):
        if kind in ('mountain','cliff'):
            p += mountain(w*.23,h*.65,w*.32,h*.35)+mountain(w*.78,h*.6,w*.4,h*.38)
        elif kind in ('forest','camp'):
            p += pine(w*.15,h*.82,.85)+pine(w*.87,h*.76,.7)
        elif kind=='jungle':
            for x,a in [(w*.1,-35),(w*.9,-145)]:
                p += [(petal_poly((x,h*.9),a,h*.45,w*.16),2)]
        elif kind=='savanna':
            p += [(box(w*.1,h*.45,w*.16,h*.85),0),(oval(w*.15,h*.45,w*.25,1.2),2)]
        elif kind=='farm': p+=house(w*.82,h*.76,.65)
        p += [(eye(w*.76,h*.19,1.4),1)]
        p += [(soft([(-1,h*.79),(w*.3,h*.71),(w*.7,h*.81),(w+1,h*.73),(w+1,h+1),(-1,h+1)]),2)]
    elif kind in ('space','sky','cave'):
        p += [(eye(w*.23,h*.24,1.5),1),(eye(w*.82,h*.7,1.2),2)]
        if kind=='sky': p += [(cloud(w*.25,h*.75,.9),1),(cloud(w*.8,h*.25,.8),1)]
        elif kind=='space': p += [(eye(w*.8,h*.18,.6),0),(eye(w*.15,h*.8,.65),1)]
        else: p += [(poly([(-1,-1),(w+1,-1),(w+1,h*.35),(w*.75,h*.18),(w*.5,h*.3),(w*.25,h*.12),(-1,h*.4)]),0)]
    else:
        # Indoor/small urban compositions use an arched window and a curved tabletop.
        p += [(eye(w*.18,h*.18,1.1),1),(cloud(w*.82,h*.16,.6),2)]
        p += [(soft([(-1,h*.82),(w*.5,h*.77),(w+1,h*.82),(w+1,h+1),(-1,h+1)]),0)]
        if kind=='rain':
            p += [(petal_poly((x,h*.22),90,1.4,.45),2) for x in (w*.18,w*.82)]
    return p


def compose(parts,w,h):
    occupied=Polygon(); visible=[]; lines=[]
    frame=box(0,0,w,h)
    for shape,c in parts:
        shape=shapely.set_precision(shape.buffer(0).intersection(frame),.001)
        if shape.is_empty: continue
        region=shape.difference(occupied)
        if not region.is_empty: visible.append((region,c))
        occupied=unary_union([occupied,shape])
    for region,_ in visible:
        for g in getattr(region,'geoms',[region]):
            if g.geom_type=='Polygon': lines.extend([g.exterior,*g.interiors])
    network=[]
    for k in range(1,5):
        yy=h*k/5
        network.append(spline([(-1,yy),(w*.25,yy-1),(w*.6,yy+.8),(w+1,yy-.4)]))
    for x in (w*.23,w*.76):
        network.append(spline([(x-1,-1),(x+.8,h*.35),(x-.8,h*.65),(x+1,h+1)]))
    for line in network:
        clipped=line.difference(occupied)
        lines += [g for g in getattr(clipped,'geoms',[clipped]) if g.geom_type=='LineString' and g.length>.1]
    def prefer(x,y):
        pt=Point(x,y)
        for g,c in visible:
            if g.covers(pt): return (c,) if isinstance(c,int) else c
        return (3,1,2,0)
    # Protect subjects, allow sky/ground panes to be split organically.
    return lines,prefer


def palette(i):
    bases=[['#d86d42','#edc66f','#448d7c','#304a73'],['#ac5c8c','#f1c783','#418e98','#334460'],
           ['#c97256','#ece0b4','#7c9f51','#325d72'],['#ca8150','#f3d58a','#5f91b2','#354769'],
           ['#cb6370','#ecd8a3','#58968a','#3d557c']]
    base=bases[i%len(bases)];out=[]
    for c in base:
        rgb=[int(c[k:k+2],16)/255 for k in (1,3,5)];h,s,v=colorsys.rgb_to_hsv(*rgb)
        rgb=colorsys.hsv_to_rgb((h+(i//5)*.0017)%1,s,v)
        out.append('#'+''.join(f'{round(x*255):02x}' for x in rgb))
    return out


REPLACEMENT_SLOTS=[51+v for v in range(50,150) if v%10 in (1,4,5,8,9)]


def normal_catalog():
    out=[]
    for i,(id,name,fn) in enumerate(SUBJECTS):
        story,kind=STORIES[i]
        out.append(dict(id='story_'+id, name=story, level=REPLACEMENT_SLOTS[i], cols=12,rows=16,
                        parts=move(sorted(fn(),key=lambda p:p[0].area),6,8.3,.88)+scenery(kind), palette=palette(i), scene=story,
                        replaces=f'chapter_{REPLACEMENT_SLOTS[i]:03}', large=False))
        out.append(dict(id='motif_'+id,name=name,level=201+i,cols=12,rows=16,parts=sorted(fn(),key=lambda p:p[0].area),
                        palette=palette(50+i),scene=name,large=False))
    return out


def large_parts(i):
    w,h=18,24
    if i==0: # Railway journey: train, viaduct, snowy summits, steam.
        p=move(locomotive(),8,12,.95)+mountain(4,10,6,8)+mountain(14,11,7,9)
        p += [(box(0,16,18,17),0)]
        for x in (2.3,7,11.7,16.4): p += [(oval(x,21,1.5,3.2),3)]
        p += [(box(0,17,18,24),1),(cloud(4,3),1)]
    elif i==1: # Camp
        tent=[(poly([(9,12),(9,19),(5,19)]),3),(poly([(9,12),(14,19),(4,19)]),0)]
        fire=[(petal_poly((8,22),-90,3,1),0),(petal_poly((8,22),-80,1.7,.7),1)]
        p=fire+tent+move(guitar(),14.5,17,.35)+pine(2.4,20,1.25)+pine(15,13,1.1)+scenery('forest',w,h)
    elif i==2: # Undersea domed city
        p=move(submarine(),6,5.5,.55)+move(stingray(),14,8,.45)
        for x,y,s in [(4,20,1),(10,21,1.3),(15.5,20,.8)]:
            p += [(oval(x,y-3*s,1.7*s,1.2*s),1),(box(x-1.5*s,y-3*s,x+1.5*s,y),0),(eye(x,y-1.2*s,.6*s),2)]
        p+=scenery('reef',w,h)
    elif i==3: # Harbor
        p=boat(6,18,1.3)+boat(14,12,.8)+house(3,9,.9)+house(8,8,1.1)+scenery('beach',w,h)
    elif i==4: # Pagoda
        p=[]
        for y,half in [(8,3),(12,4),(17,5.5)]:
            p += [(poly([(9,y-3),(9-half,y),(9-half-1,y+.3),(9+half+1,y+.3),(9+half,y)]),0),
                  (box(9-half*.65,y,9+half*.65,y+3.7),1),(box(8.3,y+.8,9.7,y+2.5),3)]
        p+=pine(2.5,20,1.1)+mountain(14,9,7,7)+scenery('lake',w,h)
    elif i==5: # Observatory
        p=move(telescope(),6,15,.65)+[(oval(12,11,4,3.6),1),(box(8,11,16,19),0),(box(10.7,13,13.3,17),3)]
        p+=move(rocket(),3,5,.3)+scenery('space',w,h)
    elif i==6: # Library
        p=move(typewriter(),6,17,.65)+[(soft([(8,16),(11,14.5),(14,15),(16,17),(13,18),(10,17.5)]),1)]
        for y in (5,9):
            for j,x in enumerate((3,5,7,10,12,14)):
                p += [(box(x,y-2.7,x+1.3,y),j%3)]
            p += [(box(1,y,17,y+.6),0)]
        p+=scenery('study',w,h)
    elif i==7: # Balloon festival
        p=balloon(5,8,1.2)+balloon(13,13,1)+balloon(12,3.7,.55)+house(5,22,.8)+scenery('sky',w,h)
    elif i==8: # Desert caravan
        camel=[(oval(5,9,3,1.5),0),(oval(4,7.8,1.5,1.6),0),(stroke([(7,9),(8,5.5),(9.5,5.6)],.7),0),
               (box(2.5,9,3.5,13),0),(box(6,9,7,13),0),(oval(5,8.6,1.3,.7),2)]
        p=move(camel,6,14,.9)+move(camel,13,17,.6)
        p += [(eye(12,4,2.4),1),(poly([(0,15),(5,7),(10,16)]),0)]
        p+=scenery('beach',w,h)
    elif i==9: # Arctic bay
        p=move(narwhal(),11,17,.8)+move(seal(),4.5,11,.55)+move(puffin(),14.5,7,.4)+scenery('arctic',w,h)
    elif i==10: # Jungle ruins
        p=move(toucan(),4,6,.65)+move(chameleon(),13,18,.65)
        p += [(poly([(4,18),(4,15),(6,15),(6,12),(8,12),(8,9),(11,9),(11,12),(13,12),(13,15),(15,15),(15,18)]),0),
              (box(8,13,11,18),3)]
        p+=scenery('jungle',w,h)
    elif i==11: # Autumn cabin
        p=house(10,17,1.7)+move(squirrel(),4,18,.5)+move(hedgehog(),14,21,.4)+pine(3,13,1)+scenery('forest',w,h)
    elif i==12: # Orbital station
        p=move(astronaut(),13,15,.7)+move(rocket(),4,6,.6)
        p += [(eye(6,15,2.4),1),(eye(6,15,1.2),3),(box(0,13,3,17),2),(box(9,13,12,17),2)]
        p+=scenery('space',w,h)
    elif i==13: # Reef
        p=move(octopus(),6,15,.85)+move(seahorse(),13,10,.65)+move(crab(),13,21,.4)+scenery('reef',w,h)
    elif i==14: # Tram city
        tram=[(box(3,6,9,11),0),(box(3.6,6.6,5.3,8.5),1),(box(6.7,6.6,8.4,8.5),1),
              (eye(4,11,1),3),(eye(8,11,1),3),(poly([(5,6),(4,4),(7,2.7),(8,4),(5,6)]),2)]
        p=move(tram,9,16,1.4)+house(3,9,.9)+house(14,8,1.2)+scenery('park',w,h)
    elif i==15: # Bakery
        p=move(cupcake(),5,16,.7)+move(moka(),13,16,.65)
        p += [(soft([(3,8),(4,5),(7,4),(10,5),(9,8),(7,6.8),(5,7)]),0),
              (oval(13,5.5,2.6,2),1),(eye(13,5.5,1),3)]
        p+=scenery('bakery',w,h)
    elif i==16: # Floating islands
        p=move(airship(),7,5,.65)
        for x,y,s in [(5,14,1),(13,21,1.2),(13.5,11,.7)]:
            p+=house(x,y-1,s*.65)+[(oval(x,y,3*s,1*s),2),(poly([(x-3*s,y),(x+3*s,y),(x+.5*s,y+4*s)]),0)]
        p+=scenery('sky',w,h)
    elif i==17: # Ski chalet and cable car
        p=house(6,20,1.4)+mountain(12,14,8,11)+pine(14,23,1.3)
        p += [(stroke([(0,7),(8,6),(18,3)],.28),3),(box(8,7,12,10).buffer(.4),0),(box(8.7,7.6,11.3,9),1),
              (box(9.6,5.7,10.3,7),3)]
    elif i==18: # Savannah watering hole
        p=move(giraffe(),12,10,.9)+move(elephant(),5,17,.75)+move(flamingo(),14,20,.4)+scenery('savanna',w,h)
        p += [(oval(9,22,7,2),3)]
    elif i==19: # Pirate cove
        p=move(treasure(),5,19,.65)+boat(12,14,1.3)+move(toucan(),4,6,.5)+scenery('beach',w,h)
    elif i==20: # Canal town
        p=boat(9,20,1.1)+house(3,13,1.2)+house(14.8,11,1.4)
        p += [(soft([(-1,15),(5,12),(12,12),(19,15),(19,17),(12,14),(5,14),(-1,17)]),0)]
        p+=scenery('river',w,h)
    elif i==21: # Windy coast
        p=move(kite(),5,5,.6)+move(bicycle(),6,19,.65)+house(13,18,.9)
        for x,y in [(4,13),(13,10)]:
            p += [(box(x-.35,y,x+.35,21),3),(eye(x,y,.7),1)]
            for a in (-90,30,150):p += [(petal_poly((x,y),a,3.5,.7),2)]
        p+=scenery('beach',w,h)
    elif i==22: # Fairground
        p=move(carouselhorse(),5,17,.7)+balloon(13,6,.6)
        p += [(eye(11.5,14,4),0),(eye(11.5,14,3),1)]
        for a in range(0,360,60):
            x=11.5+4*math.cos(math.radians(a));y=14+4*math.sin(math.radians(a))
            p.insert(0,(oval(x,y,.85,.85),2))
        p+=scenery('fair',w,h)
    elif i==23: # Canyon river
        p=boat(10,20,.8)+move(deer(),4,11,.5)
        p += [(poly([(0,3),(5,5),(7,12),(4,18),(0,20)]),0),
              (poly([(18,2),(12,5),(11,12),(15,17),(18,19)]),1),
              (soft([(9,10),(11,14),(8,18),(11,24),(4,24),(5,18),(8,13)]),3)]
        p+=scenery('mountain',w,h)
    else: # Dragon above a mountain temple
        dragon=move(iguana(),10,10,1.15)
        wings=[(poly([(8,9),(3,3),(1,8),(4,7),(5,11)]),0),
               (poly([(10,9),(15,2),(17,7),(14,6),(13,10)]),2)]
        p=dragon+wings+house(8,22,1.1)+mountain(4,19,7,8)+mountain(15,20,6,10)
    return p


LARGE_NAMES=['Dağ Ekspresi','Yıldızlı Kamp','Sualtı Şehri','Akdeniz Limanı','Göl Kenarı Pagoda',
             'Dağ Rasathanesi','Eski Kütüphane','Balon Vadisi','Çöl Kervanı','Kutup Koyu',
             'Ormandaki Kayıp Tapınak','Sonbahar Kulübesi','Yörünge İstasyonu','Mercan Krallığı',
             'Nostaljik Tramvay','Mahalle Pastanesi','Uçan Adalar','Karlı Dağ Evi','Savanda Buluşma',
             'Korsan Hazinesi','Kanallar Şehri','Rüzgârlı Sahil','Işıklı Lunapark','Kanyon Yolculuğu','Ejderha Dağı']


def catalog():
    out=normal_catalog()
    for i,name in enumerate(LARGE_NAMES):
        out.append(dict(id=f'grand_{i+1:02}',name=name,level=251+i,cols=18,rows=24,
                        parts=sorted(large_parts(i),key=lambda p:p[0].area),palette=palette(100+i),scene=name,large=True))
    return sorted(out,key=lambda d:d['level'])
