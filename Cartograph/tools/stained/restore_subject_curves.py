"""Project bent subject arcs back to authored curves while retaining separated T positions."""
import math,json,copy,traceback,argparse
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely.geometry import LineString,Point
from shapely.ops import substring,unary_union
from shapely import affinity
import shapely
from silhouette_rollout import ROOT,OUT,DESIGNS,CREATIVE,PATTERNS
from creative_designs import compose
from pilot_geometry import classic_lines
from readable_junctions import Network,renumber_variable
from junction_pilot import drag,junctions
from make_maps import shape_poly,region_polys,color
from contact_policy import from_lines
from authored_clean import cleanup
from audit_geometry import inspect,fingerprint,VERSION
import pattern_designs,mass_designs

def curves(info):
 ident=info['id'];m=info['map']
 if ident in DESIGNS:
  _,lines,_=classic_lines(ident)
  return [LineString(l) for l in lines if getattr(l,'is_ring',False)]
 if ident in CREATIVE:
  d=CREATIVE[ident];lines,_=compose(d['parts'],d['cols'],d['rows'])
  return [affinity.scale(LineString(l),m['cols']/d['cols'],m['rows']/d['rows'],origin=(0,0)) for l in lines if getattr(l,'is_ring',False)]
 if ident in PATTERNS:
  d=PATTERNS[ident]
  if d['family']=='atlas':return []
  _,lines,_,_=getattr(pattern_designs,'rings' if d['family']=='rings' else 'spirals')(d['variant'])
  return [LineString(l) for l in lines if len(l.coords)>3]
 if ident.startswith('chapter_'):
  lines,_,_=mass_designs._builder(info['generationSeed'],(int(ident[8:])-51)%10)
  return [LineString(l) for l in lines if getattr(l,'is_ring',False)]
 return []

def arc(line,a,b,reference):
 d1,d2=line.project(Point(a)),line.project(Point(b));options=[]
 piece=substring(line,min(d1,d2),max(d1,d2))
 if piece.geom_type=='LineString':
  cs=list(piece.coords)
  if d1>d2:cs=cs[::-1]
  options.append(LineString(cs))
 if line.is_ring:
  tail=substring(line,max(d1,d2),line.length);head=substring(line,0,min(d1,d2))
  cs=list(tail.coords)+list(head.coords)[1:]
  if len(cs)>1:
   if d1<d2:cs=cs[::-1]
   options.append(LineString(cs))
 if not options:return None
 return min(options,key=lambda p:p.hausdorff_distance(reference)+abs(p.length-reference.length)*.1)

def restore(ident):
 info=json.loads((OUT/'before/maps'/f'{ident}.json').read_text());m=info['map'];sources=curves(info)
 if not sources:return dict(id=ident,skip=True)
 net=Network(m);selected={};targets={};candidates=[]
 for k,line in enumerate(net.pieces):
  if k in net.rim or line.length<.15:continue
  choices=[]
  for src in sources:
   if line.difference(src.buffer(.38)).length>line.length*.15:continue
   piece=arc(src,line.coords[0],line.coords[-1],line)
   if piece is None or piece.length<line.length*.55 or piece.length>line.length*1.6:continue
   distance=piece.hausdorff_distance(line)
   if distance>.55:continue
   choices.append((distance+abs(piece.length-line.length)*.1,piece))
  if not choices:continue
  _,piece=min(choices,key=lambda x:x[0]);error=piece.hausdorff_distance(line)
  if error<.015:continue
  candidates.append((k,line,piece,error))
 for k,line,piece,error in candidates:
  selected[k]=piece
  for old,new in [(line.coords[0],piece.coords[0]),(line.coords[-1],piece.coords[-1])]:
   if math.dist(old,new)>.002:targets[old]=(round(new[0],3),round(new[1],3))
 # Rebuild all incident lines using the same shared endpoint; foreground arcs
 # stay on source, while a background stem follows its corrected endpoint.
 lines=[]
 for k,line in enumerate(net.pieces):
  if k in net.rim:continue
  if k in selected:cs=list(selected[k].coords)
  else:cs=list(line.coords)
  a,b=line.coords[0],line.coords[-1]
  if a in targets:
   if k in selected:cs[0]=targets[a]
   else:cs=drag(cs,targets[a])
  if b in targets:
   if k in selected:cs[-1]=targets[b]
   else:cs=drag(cs[::-1],targets[b])[::-1]
  lines.append(LineString(cs))
 if not candidates:return dict(id=ident,retained=True)
 cm=from_lines(shape_poly(m),lines,m['cols'],m['rows'],merge=False).to_map()
 issues=inspect(cm)
 # Store unsuccessful candidates for focused source-spacing repair.
 oldps,newps=region_polys(m),region_polys(cm)
 sol=color(cm['adj'],[(info['solution'][max(range(len(oldps)),key=lambda j:p.intersection(oldps[j]).area)],) for p in newps],[p.area for p in newps],241026)
 for key in ['preferred','area','clearance']:cm.pop(key,None)
 info.update(map=cm,solution=sol,geometryRevision=6,junctionStyle='subject-preserving-t',artworkNeedsRefresh=True)
 for key in ['given','difficulty','clueFocus']:info.pop(key,None)
 info['silhouetteRepair']=dict(source='restore authored arcs at existing T positions',repairs=[dict(piece=k,deviation=e) for k,_,_,e in candidates],remaining=junctions(cm),immutablePreserved=True)
 info['geometryQuality']=dict(version=VERSION,valid=not issues,issues=issues,fingerprint=fingerprint(cm))
 (OUT/'restored').mkdir(exist_ok=True);(OUT/'restored'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
 if not issues:(OUT/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
 return dict(id=ident,repairedArcs=len(candidates),issues=issues,count=cm['count'])

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='+');p.add_argument('--jobs',type=int,default=3);a=p.parse_args()
 with ProcessPoolExecutor(max_workers=a.jobs) as pool:
  fs={pool.submit(restore,i):i for i in a.ids}
  for f in as_completed(fs):
   try:print(json.dumps(f.result()),flush=True)
   except Exception as e:print(json.dumps(dict(id=fs[f],error=str(e),traceback=traceback.format_exc())),flush=True)
