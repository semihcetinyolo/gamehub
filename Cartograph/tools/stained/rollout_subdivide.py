"""Add spacious background panes when restored geometry needs logical entry points."""
import json,sys,random
from pathlib import Path
from shapely.geometry import LineString
from shapely import affinity
import geom
from creative_designs import catalog,compose
from make_maps import color,region_polys,shape_poly
from contact_policy import from_lines,collapse_short_contacts,clear_background_gaps,inspect
from refine_rollout import stretch_gaps,fix_short
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/geometry-rollout';ds={d['id']:d for d in catalog()}
for id in sys.argv[1:]:
 f=OUT/'maps'/f'{id}.json';info=json.loads(f.read_text());m=info['map'];oldps=region_polys(m);oldsol=info['solution'];rand=random.Random(99184)
 d=ds[id];_,pr=compose(d['parts'],d['cols'],d['rows']);sx=m['cols']/d['cols'];sy=m['rows']/d['rows']
 protected=lambda p:len(pr(p.x/sx,p.y/sy))==1
 b=from_lines(shape_poly(m),[LineString([e[:2],e[2:4]]) for e in m['edges']],m['cols'],m['rows'],merge=False)
 for step in range(10):
  m=b.to_map();candidates=[p for p in region_polys(m) if p.area>3 and not protected(p.representative_point())]
  if not candidates:break
  cut=geom._cut(max(candidates,key=lambda p:p.area),rand)
  if cut is None:continue
  b=from_lines(b.outline,[*[LineString([e[:2],e[2:4]]) for e in m['edges']],cut],b.cols,b.rows)
  b=fix_short(b)
  for _ in range(8):
   if not inspect(b.to_map())['nearGaps']:break
   b,_=stretch_gaps(b);b=fix_short(b)
 m=b.to_map();pref=[(oldsol[max(range(len(oldps)),key=lambda j:p.intersection(oldps[j]).area)],) for p in region_polys(m)]
 sol=color(m['adj'],pref,m.pop('area'),817);m.pop('preferred',None);m.pop('clearance',None)
 info.update(map=m,solution=sol,artworkNeedsRefresh=True);info.pop('difficulty',None);info.pop('given',None)
 info['geometryPolicy']['audit']=inspect(m);info['geometryPolicy']['repairs'].append({'backgroundCutsForLogic':10})
 f.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')));print(id,m['count'],inspect(m))
