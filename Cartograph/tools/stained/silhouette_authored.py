"""Reconstruct exact authored curves; simplify background and enlarge crowded drawings."""
import json,copy,math,re,traceback,argparse
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely import affinity
from shapely.geometry import Polygon,LineString
from shapely.ops import unary_union
from silhouette_rollout import ROOT,OUT,DESIGNS,CREATIVE,PATTERNS,constraints
from pilot_geometry import classic_lines
from creative_designs import compose
import pattern_designs,mass_designs
from contact_policy import from_lines
from authored_clean import cleanup
from readable_junctions import repair,remove_divider,renumber_variable,preserves_boundary
from junction_pilot import junctions
from make_maps import shape_poly,region_polys,color
from audit_geometry import inspect,fingerprint,VERSION

def scaled(m,s):
 m=copy.deepcopy(m)
 def path(t):return re.sub(r'-?\d+(?:\.\d+)?',lambda q:f'{float(q.group())*s:.3f}'.rstrip('0').rstrip('.'),t)
 for k in ['shape','edgePath']:m[k]=path(m[k])
 m['paths']=[path(p) for p in m['paths']]
 for k in ['edges','rim']:m[k]=[[*[round(v*s,3) for v in e[:4]],*e[4:]] for e in m[k]]
 m['anchors']=[[round(v*s,3) for v in p] for p in m['anchors']];m['cols']*=s;m['rows']*=s
 for k in ['preferred','area','clearance','outlines']:m.pop(k,None)
 return m

def build(ident,layout_scale=1):
 current=json.loads((OUT/'before/maps'/f'{ident}.json').read_text());old=current['map'];cols,rows=old['cols'],old['rows'];outline=shape_poly(old);hard=[];soft=[];mirror=None
 if ident in DESIGNS:
  if layout_scale!=1:
   # Proportional changes to complete layered parts, never a local contour warp.
   import extra_designs
   original_compose=extra_designs.compose
   def spaced(parts,style=0):
    return original_compose([(affinity.scale(g,layout_scale,layout_scale,origin='centroid'),c) for g,c in parts],style)
   extra_designs.compose=spaced
  outline,lines,prefer=classic_lines(ident);authored,_,protect=DESIGNS[ident]['build']()
  if layout_scale!=1:extra_designs.compose=original_compose
  soft=([protect.boundary] if protect is not None else [])+[l for l in lines if getattr(l,'is_ring',False)]
  hard=[protect.boundary] if protect is not None else []
  hard += [l for l in lines if getattr(l,'is_ring',False) and Polygon(l).area<5]
  if ident=='heart':hard.append(lines[0])
  if ident=='lighthouse':hard=list(authored[:3])
  mirror=cols/2 if ident in __import__('designs').SYMMETRIC else None
 elif ident in CREATIVE:
  d=CREATIVE[ident];sourceparts=[(affinity.scale(g,layout_scale,layout_scale,origin='centroid'),c) for g,c in d['parts']];lines,pr=compose(sourceparts,d['cols'],d['rows']);sx,sy=cols/d['cols'],rows/d['rows']
  lines=[affinity.scale(l,sx,sy,origin=(0,0)) for l in lines];parts=[affinity.scale(g,sx,sy,origin=(0,0)) for g,c in sourceparts];subject=unary_union(parts)
  soft=[p.boundary for p in parts];hard=[subject.boundary]+[p.boundary for p in parts if p.area<3*sx*sy]
  prefer=lambda x,y:pr(x/sx,y/sy)
  if current.get('large'):
   # Keep the spacious original background divisions around the authored figures.
   source=json.loads((ROOT/'output/junction-rollout/before/maps'/f'{ident}.json').read_text())['map']
   for e in source['edges']:
    part=LineString([e[:2],e[2:4]]).difference(subject)
    lines += [g for g in getattr(part,'geoms',[part]) if g.geom_type=='LineString' and g.length>.003]
 elif ident in PATTERNS:
  d=PATTERNS[ident];fn={'rings':pattern_designs.rings,'spiral':pattern_designs.spirals,'atlas':pattern_designs.atlas}[d['family']]
  if d['family']=='atlas':return dict(id=ident,skip='map boundaries are authored irregular contours')
  outline,lines,cols,rows=fn(d['variant']);soft=[l for l in lines if len(l.coords)>3];hard=soft[:];prefer=lambda x,y:(int(x+y)%4,)
 elif ident.startswith('chapter_'):
  v=int(ident[8:])-51;family=v%10;lines,prefer,protect=mass_designs._builder(current['generationSeed'],family);soft=[l for l in lines if getattr(l,'is_ring',False)];polys=[Polygon(l) for l in soft];hard=([unary_union(polys).boundary] if polys else [])+[l for l in soft if Polygon(l).area<6]
 else:return dict(id=ident,skip=True)
 m=from_lines(outline,lines,cols,rows,merge=False).to_map();soft=unary_union(soft);zone=unary_union(hard).buffer(.005)
 critical=unary_union([LineString([e[:2],e[2:4]]) for e in m['edges'] if LineString([e[:2],e[2:4]]).difference(zone).length<.002])
 m,history=cleanup(m,critical,minimum_count=60 if current.get('large') else 12,steps=45)
 # Scale the whole composition if spacing remains tight; never bend a tip.
 spacing=inspect(m,allow_junctions=True);factor=1
 if spacing and all(i[0] in ['short','near-gap','tiny-pane'] for i in spacing):
  for kind,a,b,val,p in spacing:
   if kind=='short':factor=max(factor,.30/max(val,.001))
   elif kind=='near-gap':factor=max(factor,.235/max(val,.001))
   else:
    poly=region_polys(m)[a];factor=max(factor,math.sqrt(.14/poly.area),.115/max(__import__('geom')._clearance(poly),.001))
  factor=math.ceil(factor*10)/10
  if factor<=4:
   m=scaled(m,factor);critical=affinity.scale(critical,factor,factor,origin=(0,0));soft=affinity.scale(soft,factor,factor,origin=(0,0));mirror=mirror*factor if mirror is not None else None;history.append(dict(method='enlarge complete composition',factor=factor))
  else:factor=1
 sol=[0]*m['count'];m,h=repair(m,sol,soft,mirror,passes=2,immutable=critical);history+=h
 for _ in range(12):
  if not junctions(m):break
  changed=False
  for p,_ in junctions(m):
   if not any(q==p for q,_ in junctions(m)):continue
   result=remove_divider(m,sol,p,soft,mirror,60 if current.get('large') else 12,critical)
   if result:m,sol,h=result;history.append(h);changed=True
  if not changed:break
 issues=inspect(m)
 result=dict(id=ident,count=m['count'],factor=factor,remaining=len(junctions(m)),issues=issues,immutablePreserved=preserves_boundary(m,critical))
 info=copy.deepcopy(current)
 preferences=[prefer(p.representative_point().x/factor,p.representative_point().y/factor) for p in region_polys(m)]
 try:solution=color(m['adj'],preferences,[p.area for p in region_polys(m)],241025)
 except Exception as e:return dict(**result,colorError=str(e))
 for k in ['preferred','area','clearance']:m.pop(k,None)
 info.update(map=m,solution=solution,geometryRevision=6,junctionStyle='subject-preserving-t',artworkNeedsRefresh=True)
 for k in ['given','difficulty','clueFocus']:info.pop(k,None)
 info['silhouetteRepair']=dict(source='exact authored curves',layoutScale=layout_scale,repairs=history,remaining=junctions(m),immutablePreserved=result['immutablePreserved'],scale=factor)
 info['geometryQuality']=dict(version=VERSION,valid=not issues,issues=issues,fingerprint=fingerprint(m))
 (OUT/'candidates').mkdir(exist_ok=True);(OUT/'candidates'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
 if not issues and result['immutablePreserved']:(OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
 return result

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='+');p.add_argument('--jobs',type=int,default=3);a=p.parse_args()
 with ProcessPoolExecutor(max_workers=a.jobs) as pool:
  fs={pool.submit(build,i):i for i in a.ids}
  for f in as_completed(fs):
   try:print(json.dumps(f.result()),flush=True)
   except Exception as e:print(json.dumps(dict(id=fs[f],error=str(e),traceback=traceback.format_exc())),flush=True)
