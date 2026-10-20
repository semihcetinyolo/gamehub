"""Restore source arcs individually while retaining already readable T junctions.
Only complete audit-clean steps are committed; simultaneous source restorations
can otherwise reintroduce overlapping panes far from the restored contour.
"""
import json,copy,math,argparse,traceback
from concurrent.futures import ProcessPoolExecutor,as_completed
from shapely.geometry import LineString,Point
from restore_subject_curves import curves,arc
from readable_junctions import Network,preserves_boundary
from shapely.ops import unary_union
from junction_pilot import drag,junctions
from contact_policy import from_lines
from make_maps import shape_poly,region_polys,color
from audit_geometry import inspect,fingerprint,VERSION
from silhouette_rollout import OUT

def run(ident):
 file=OUT/'maps'/f'{ident}.json';stage=json.loads(file.read_text())
 if stage.get('silhouetteRepair',{}).get('source')=='individual authored arcs with valid existing T topology':
  stage=json.loads((OUT/'before/maps'/file.name).read_text())
 elif stage.get('clueFocus',{}).get('prepared'):return dict(id=ident,prepared=True)
 valid=stage.get('geometryQuality',{}).get('valid')
 info=stage if valid else json.loads((OUT/'before/maps'/file.name).read_text())
 original=copy.deepcopy(info);m=info['map'];history=[];rejected=[];seen={fingerprint(m)};applied_targets=set()
 # Source curves are at unscaled design coordinates; this operation is for
 # unscaled archived geometry only. Exact reconstructed layouts are already locked.
 if info.get('silhouetteRepair',{}).get('source')=='exact authored curves':return dict(id=ident,exact=True)
 sources=curves(info)
 from shapely import make_valid
 source_zones=[make_valid(s.buffer(.003)) for s in sources]
 original_network=Network(m)
 immutable=unary_union([l for k,l in enumerate(original_network.pieces)
    if k not in original_network.rim and any(l.difference(zone).length<.015 for zone in source_zones)])
 for turn in range(80):
  progress=False;net=Network(m);proposals=[]
  for k,line in enumerate(net.pieces):
   if k in net.rim or line.length<.15:continue
   choices=[]
   for source in sources:
    if line.difference(source.buffer(.38)).length>line.length*.15:continue
    # Proximity alone can mistake a parallel background divider for a contour.
    # Most of the existing arc must already follow this exact source curve.
    if line.difference(source.buffer(.025)).length>line.length*.35:continue
    piece=arc(source,line.coords[0],line.coords[-1],line)
    if piece is None or not line.length*.55<piece.length<line.length*1.6:continue
    dist=piece.hausdorff_distance(line)
    if dist<.55:choices.append((dist+abs(piece.length-line.length)*.1,piece,dist))
   if choices:
    _,piece,dist=min(choices,key=lambda v:v[0])
    if dist>.015:proposals.append((k,piece,dist))
  for k,piece,dist in proposals:
   from shapely import normalize,set_precision
   target_key=normalize(set_precision(piece,.01)).wkb
   if target_key in applied_targets:continue
   # Rebuild from this iteration's unchanged topology. One accepted edit then
   # restarts the candidate list; avoids stale junction/region identities.
   line=net.pieces[k];targets={}
   for a,b in [(line.coords[0],piece.coords[0]),(line.coords[-1],piece.coords[-1])]:
    if math.dist(a,b)>.002:targets[a]=(round(b[0],3),round(b[1],3))
   lines=[]
   for j,other in enumerate(net.pieces):
    if j in net.rim:continue
    cs=list((piece if j==k else other).coords)
    a,b=other.coords[0],other.coords[-1]
    if a in targets:cs=([targets[a]]+cs[1:]) if j==k else drag(cs,targets[a])
    if b in targets:cs=(cs[:-1]+[targets[b]]) if j==k else drag(cs[::-1],targets[b])[::-1]
    if len(set(cs))>1:lines.append(LineString(cs))
   try:
    candidate=from_lines(shape_poly(m),lines,m['cols'],m['rows'],merge=False).to_map()
    if not preserves_boundary(candidate,immutable):continue
    if inspect(candidate):rejected.append(dict(deviation=round(dist,4)));continue
    # Maintain existing topology; an exact curve must not create/lose panes.
    if candidate['count']!=m['count']:continue
    from junction_pilot import reindex
    candidate=reindex(candidate,m)
    if sum(a.symmetric_difference(b).area for a,b in zip(region_polys(candidate),region_polys(m)))<.002:continue
    signature=fingerprint(candidate)
    if signature in seen:continue
    seen.add(signature)
    applied_targets.add(target_key)
    m=candidate;history.append(dict(method='restore full authored arc and attached background endpoints',deviation=dist));progress=True
    # Recalculate source candidates from the new topology next pass.
    break
   except (ValueError,AssertionError,RuntimeError):continue
  if not progress:break
  # Continue until all independently safe restorations have been attempted.
 return finish(ident,info,original,m,history,rejected,file)

def finish(ident,info,original,m,history,rejected,file):
 if history:
  sol=info['solution']
  if any(sol[i]==sol[j] for i,ns in enumerate(m['adj']) for j in ns):sol=color(m['adj'],sol,[p.area for p in region_polys(m)],241029)
  for k in ['area','preferred','clearance']:m.pop(k,None)
  for k in ['given','difficulty','clueFocus']:info.pop(k,None)
  info.update(map=m,solution=sol,geometryRevision=6,junctionStyle='subject-preserving-t',artworkNeedsRefresh=True)
  info['silhouetteRepair']=dict(source='individual authored arcs with valid existing T topology',repairs=history,remaining=[],immutablePreserved=True)
 info['geometryQuality']=dict(version=VERSION,valid=not inspect(m),issues=inspect(m),fingerprint=fingerprint(m))
 assert info['geometryQuality']['valid']
 # Existing junctions which cannot be removed without bringing the ambiguity
 # back are retained; this is not an approval to deform a new subject.
 info['contourReview']=dict(restoredArcs=len(history),constrainedArcs=len(rejected),pristineSourceArcsLocked=True,method='source arc projection with complete geometry audit')
 file.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
 return dict(id=ident,restored=len(history),constrained=len(rejected),valid=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('ids',nargs='+');p.add_argument('--jobs',type=int,default=4);a=p.parse_args()
 with ProcessPoolExecutor(max_workers=a.jobs) as pool:
  fs={pool.submit(run,i):i for i in a.ids}
  for f in as_completed(fs):
   try:print(json.dumps(f.result()),flush=True)
   except Exception as e:print(json.dumps(dict(id=fs[f],error=str(e),traceback=traceback.format_exc())),flush=True)
