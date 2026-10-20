"""Remove dispensable seams instead of denting exact authored subject boundaries."""
import math
from collections import defaultdict
from shapely.geometry import LineString,Point
from shapely.ops import unary_union
from contact_policy import from_lines
from make_maps import shape_poly,region_polys
from audit_geometry import inspect
from readable_junctions import preserves_boundary

def cleanup(m,immutable,minimum_count=12,steps=60):
 history=[]
 for step in range(steps):
  issues=inspect(m,allow_junctions=True)
  if not issues:return m,history
  ps=region_polys(m);pairs=defaultdict(list)
  affected={r for issue in issues for r in issue[1:3] if r>=0}
  for e in m['edges']:pairs[tuple(sorted(e[4:]))].append(LineString([e[:2],e[2:4]]))
  options=[]
  for pair,segments in pairs.items():
   if not set(pair)&affected:continue
   seam=unary_union(segments)
   if immutable is not None and seam.intersection(immutable).length>.015:continue
   lines=[LineString([e[:2],e[2:4]]) for e in m['edges'] if tuple(sorted(e[4:]))!=pair]
   try:
    cm=from_lines(shape_poly(m),lines,m['cols'],m['rows'],merge=False).to_map()
    if cm['count']>=m['count'] or cm['count']<minimum_count or not preserves_boundary(cm,immutable):continue
    ci=inspect(cm,allow_junctions=True)
    if len(ci)>=len(issues):continue
    score=(len(ci),seam.length+min(ps[r].area for r in pair)*.1)
    options.append((score,cm,dict(method='remove background seam beside authored contour',pair=pair,issuesBefore=len(issues),issuesAfter=len(ci))))
   except (ValueError,AssertionError,RuntimeError):continue
  if not options:break
  _,m,detail=min(options,key=lambda x:x[0]);history.append(detail)
 return m,history
