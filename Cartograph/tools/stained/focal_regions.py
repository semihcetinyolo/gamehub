"""Annotate clue priorities from authored subject shapes without changing geometry."""
import json,hashlib,shutil
from pathlib import Path
from shapely import affinity
from shapely.geometry import Point,Polygon
from shapely.ops import unary_union
from designs import DESIGNS
from creative_designs import catalog,SUBJECTS,move
from make_maps import region_polys
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tools/stained';OUT=ROOT/'output/focal-clues'

def priorities(info,creative):
 m=info['map'];ident=info['id'];ps=region_polys(m);focus=None;primary=None;method='central prominent panes'
 if ident in DESIGNS:
  lines,_,focus=DESIGNS[ident]['build']();method='authored subject overlap'
  scale=m['cols']/12
  if focus is not None:focus=affinity.scale(focus,scale,scale,origin=(0,0))
  if ident=='heart':primary=affinity.scale(Polygon(lines[0]),scale,scale,origin=(0,0))
  if focus is None:
   closed=[affinity.scale(Polygon(l),scale,scale,origin=(0,0)) for l in lines if getattr(l,'is_ring',False)]
   center=Point(m['cols']/2,m['rows']/2)
   candidates=[p for p in closed if p.area<m['cols']*m['rows']*.45 and p.distance(center)<2]
   if candidates:focus=unary_union(candidates)
 elif ident in creative:
  d=creative[ident];parts=d['parts']
  if ident.startswith('story_'):
   name=ident[6:];fn=next(fn for key,_,fn in SUBJECTS if key==name)
   parts=move(sorted(fn(),key=lambda p:p[0].area),6,8.3,.88)
  layout=info.get('silhouetteRepair',{}).get('layoutScale',1)
  parts=[(affinity.scale(g,layout,layout,origin='centroid'),c) for g,c in parts]
  focus=unary_union([affinity.scale(g,m['cols']/d['cols'],m['rows']/d['rows'],origin=(0,0)) for g,_ in parts]);method='authored foreground parts'
 weights=[]
 for p in ps:
  ratio=p.intersection(focus).area/p.area if focus is not None else 0
  central=1-min(1,p.centroid.distance(Point(m['cols']/2,m['rows']/2))/(m['cols']*.55))
  w=(2+min(8,p.area**.5))*ratio if ratio>.55 else 0
  if focus is None:w=(1+min(5,p.area**.5))*central if central>.5 else 0
  if primary is not None and p.intersection(primary).area/p.area>.7:w=1000
  weights.append(round(w,3))
 return dict(version=1,geometry=info['geometryQuality']['fingerprint'],weights=weights,primary=[i for i,w in enumerate(weights) if w>=1000],method=method)

def main():
 OUT.mkdir(exist_ok=True);(OUT/'before/maps').mkdir(parents=True,exist_ok=True);(OUT/'maps').mkdir(exist_ok=True)
 if not (OUT/'before/stained-levels.js').exists():shutil.copy2(ROOT/'stained-levels.js',OUT/'before/stained-levels.js')
 s=(OUT/'before/stained-levels.js').read_text();levels=json.JSONDecoder().raw_decode(s[s.index('['):])[0];creative={d['id']:d for d in catalog()};report=[]
 for n,l in enumerate(levels,1):
  source=HERE/'maps'/f'{l["id"]}.json';backup=OUT/'before/maps'/source.name
  if not backup.exists():shutil.copy2(source,backup)
  info=json.loads(backup.read_text());info['given']=l['given'];info['clueFocus']=priorities(info,creative)
  (OUT/'maps'/source.name).write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
  report.append(dict(id=l['id'],level=n,focus=[i for i,w in enumerate(info['clueFocus']['weights']) if w>0],primary=info['clueFocus']['primary']))
 (OUT/'focus-regions.json').write_text(json.dumps(report,indent=2));print('Annotated',len(report),'levels; geometry untouched')
if __name__=='__main__':main()
