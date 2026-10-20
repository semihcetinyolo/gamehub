"""A compact four-colour brain silhouette based on the user's brain.png reference."""
import hashlib
import json
from pathlib import Path
from shapely.geometry import LineString
from geom import Build
from figurative_geometry import finish
from make_maps import path_poly, color
from build_patterns import artwork

HERE=Path(__file__).resolve().parent


def main():
    existing=HERE/'maps/brain.json'
    if existing.exists() and json.loads(existing.read_text()).get('cornerRevision') == 1:
        print('brain: retaining audited corner geometry')
        return
    outline=path_poly('M2.9 7.5 C1 7.6 .6 6.7 .85 5.1 C1.1 3.1 2.9 1.1 5.6 .8 '
        'C8.6 .2 10.8 2.1 11.1 4.5 C12.2 6.7 11.4 8.5 10.2 9.3 '
        'C9.2 10 8.1 9.8 7.9 9.8 L8.2 11.5 C7.7 12.2 7.2 11.7 6.9 10.9 '
        'L5.9 8.9 C4.4 9.2 3.5 8.7 2.9 7.5 Z')
    a,b,c,d,e,f=(4.95,3.15),(6.8,4.65),(5.15,6.5),(6.7,8.35),(9.2,7.3),(9.5,5.5)
    left=(3.2,5)
    lines=[LineString(p) for p in [
        [(-1,3.9),left,a,(6.5,.6)], [a,b,(9.3,1.5)], [b,f,(11.6,4.6)],
        [f,e,(11.4,8)], [e,d,(7.9,9.8)], [d,c,left], [b,c], [c,(2.9,7.5)],
        [left,(1.8,7.8)], [d,(5.9,8.9)], [a,(2.3,1.3)],
    ]]
    builder=finish(Build(outline,lines,min_r=.25,min_area=.5,cols=12.4,rows=12.4))
    if builder.issues:
        raise ValueError(f'brain: ambiguous contacts {builder.issues}')
    m=builder.to_map(lambda x,y:((int(x+y*1.4))%4,))
    sol=color(m['adj'],m.pop('preferred'),m.pop('area'),812)
    info=dict(id='brain',name='Renkli Beyin',level=276,large=False,catalogVersion=4,
              geometryRevision=2,cornerRevision=1,junctionStyle='flat-readable',map=m,solution=sol,
              palette=['#f23e31','#eee044','#128ce2','#16bb4d'],
              references=['tools/stained/references/brain.png'],
              description='Brain silhouette with broad, straight-sided four-colour regions and a brainstem.',
              geometryHash=hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest())
    (HERE/'maps/brain.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    artwork(info)
    print(f'brain: {m["count"]} panes')


if __name__=='__main__':main()
