"""Preserve the compass hub as one closed circle; remove its dispensable spokes."""
import json,math
from shapely.geometry import LineString
from shapely.ops import unary_union
from junction_rollout import OUT
from contact_policy import from_lines
from readable_junctions import renumber_variable,finish_map
from make_maps import shape_poly,region_polys,color
from designs import DESIGNS
from junction_pilot import junctions
from audit_geometry import inspect,fingerprint,VERSION
p=OUT/'maps/compass.json';old=json.loads((OUT/'before/maps/compass.json').read_text());m=old['map']
lines=[]
for e in m['edges']:
    midpoint=((e[0]+e[2])/2,(e[1]+e[3])/2)
    if math.dist(midpoint,(6,8))<.79:continue
    lines.append(LineString([e[:2],e[2:4]]))
cm=from_lines(shape_poly(m),lines,m['cols'],m['rows'],merge=False).to_map()
authored,_,protect=DESIGNS['compass']['build']();protect=unary_union([protect.boundary]+[l for l in authored if l.is_ring])
cm,history=finish_map(cm,protect,6)
assert not junctions(cm) and not inspect(cm),(junctions(cm),inspect(cm))
cm,preferences=renumber_variable(cm,m,old['solution']);sol=color(cm['adj'],preferences,[x.area for x in region_polys(cm)],241022)
for key in ['preferred','area','clearance']:cm.pop(key,None)
old.update(map=cm,solution=sol,geometryRevision=5,junctionStyle='readable-t',artworkNeedsRefresh=True)
old.pop('given',None);old.pop('difficulty',None)
old['junctionRollout']=dict(before=junctions(m),remaining=[],repairs=[dict(point=[6,8],method='remove internal hub spokes; preserve complete circle')]+history)
old['geometryQuality']=dict(version=VERSION,valid=True,fingerprint=fingerprint(cm),issues=[])
p.write_text(json.dumps(old,ensure_ascii=False,separators=(',',':')))
print('Compass',cm['count'],'panes; closed hub retained')
