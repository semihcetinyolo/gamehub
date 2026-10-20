"""Produce 75 reference-inspired vector puzzles and exact artwork guides.

Existing completed maps are retained. Generate photographic completion artwork
from the guides with image_gen, then import it with import_generated.py.
"""
import argparse
import contextlib
import hashlib
import io
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Point
from shapely.errors import GEOSException

from geom import Build
from figurative_geometry import finish
from make_maps import color, region_polys
from pattern_designs import atlas, catalog, rings, spirals

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]


def artwork(info):
    """Render exact guides; never overwrite completion art with a flat render."""
    m,sol,pal=info['map'],info['solution'],info['palette']
    ident=info['id'];scale=128
    size=(round(m['cols']*64),round(m['rows']*64))
    hires=(size[0]*2,size[1]*2)
    image=Image.new('RGB',hires,'#f4f0e5');labels=Image.new('L',hires,255)
    polys=region_polys(m)
    px=lambda pts:[(round(x*scale),round(y*scale)) for x,y in pts]
    for i,p in enumerate(polys):
        mask=Image.new('L',hires);draw=ImageDraw.Draw(mask)
        for g in getattr(p,'geoms',[p]):
            if g.geom_type!='Polygon':continue
            draw.polygon(px(g.exterior.coords),fill=255)
            for interior in g.interiors:draw.polygon(px(interior.coords),fill=0)
        image.paste(pal[sol[i]],mask=mask);labels.paste(sol[i]*60,mask=mask)
    draw=ImageDraw.Draw(image)
    for x1,y1,x2,y2,*_ in [*m['edges'],*m['rim']]:
        draw.line(px([(x1,y1),(x2,y2)]),fill='#222c36',width=7)
        for x,y in px([(x1,y1),(x2,y2)]):draw.ellipse((x-3,y-3,x+3,y+3),fill='#222c36')
    image=image.resize(size,Image.Resampling.LANCZOS)
    guide=HERE/'guides'/f'{ident}.png'
    image.save(guide);labels.resize(size,Image.Resampling.NEAREST).save(guide.with_suffix('.labels.png'))
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {m["cols"]} {m["rows"]}"><title>{escape(info["name"])}</title>'
    svg+=''.join(f'<path d="{d}" fill="{pal[sol[i]]}" fill-rule="evenodd"/>' for i,d in enumerate(m['paths']))
    svg+=f'<path d="{m["edgePath"]}" fill="none" stroke="#222c36" stroke-width=".055" stroke-linejoin="round"/>'
    svg+=f'<path d="{m["shape"]}" fill="none" stroke="#222c36" stroke-width=".075" stroke-linejoin="round"/></svg>'
    guide.with_suffix('.svg').write_text(svg)
    info['vectorGuide']=str(guide.with_suffix('.svg').relative_to(ROOT))
    info['artworkStyle']='stained-glass'
    info.setdefault('image',f'assets/glass/{ident}-vitray.webp')
    info.setdefault('artMetadata',str(Path(info['image']).with_suffix('.json')))
    info['artworkNeedsRefresh']=True
    (HERE/'maps'/f'{ident}.json').write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))


def build(d):
    ident=d['id'];file=HERE/'maps'/f'{ident}.json'
    if file.exists() and json.loads(file.read_text()).get('geometryRevision',0)>=2:
        info=json.loads(file.read_text())
        target=ROOT/info.get('artMetadata', f'assets/glass/{ident}.json')
        if info.get('artworkNeedsRefresh') or not target.exists() or not json.loads(target.read_text()).get('paneColorCheck',{}).get('valid'):artwork(info)
        return info
    failures=[]
    for attempt in range(10):
        try:
            fn={'rings':rings,'spiral':spirals,'atlas':atlas}[d['family']]
            outline,lines,w,h=fn(d['variant'],attempt) if d['family']=='atlas' else fn(d['variant'])
            with contextlib.redirect_stdout(io.StringIO()):
                b=finish(Build(outline,lines,min_r=.3+attempt*.012,min_area=.55+attempt*.05,cols=w,rows=h))
                m=b.to_map(lambda x,y: ((int(x*1.7+y*.9)+d['variant'])%4,))
            if not 16<=m['count']<=100:raise ValueError(f'pane count {m["count"]}')
            sol=color(m['adj'],m.pop('preferred'),m.pop('area'),731+d['level'])
            if len(set(sol))!=4:raise ValueError('four colours required')
            info={**d,'catalogVersion':4,'geometryRevision':2,'cornerRevision':1,'junctionStyle':'flat-readable','map':m,'solution':sol,
                  'geometryHash':hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest(),
                  'references':[f'tools/stained/references/{dict(rings="38.webp",spiral="16.webp",atlas="usa.gif")[d["family"]]}'],
                  'description':dict(rings='Overlapping circular bands with staggered divisions.',
                                     spiral='Connected angular spiral ribbons and long stepped corridors.',
                                     atlas='Fictional regional map with distinct coastline and shared provincial borders.')[d['family']],
                  'generation':dict(attempt=attempt,minRadius=.3+attempt*.012,minArea=.55+attempt*.05)}
            file.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
            artwork(info)
            print(f'{ident}: {d["name"]}, {m["count"]} panes, {w}×{h}',flush=True)
            return info
        except (ValueError,RuntimeError,AssertionError,AttributeError,GEOSException) as e:
            failures.append(str(e)[:180])
    raise RuntimeError(f'{ident}: {failures[-3:]}')


def sheet(infos):
    # Review completed artwork, falling back to the guide for pending assets.
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
    for family in ('rings','spiral','atlas'):
        rows=[d for d in infos if d['family']==family]
        out=Image.new('RGB',(1000,5*240),'#f4f0e5');draw=ImageDraw.Draw(out)
        for i,d in enumerate(sorted(rows,key=lambda x:x['variant'])):
            source=ROOT/d.get('image', f'assets/glass/{d["id"]}.webp')
            if d.get('artworkNeedsRefresh') or not source.exists():source=HERE/'guides'/f'{d["id"]}.png'
            im=Image.open(source);im.thumbnail((188,202))
            x=(i%5)*200;y=(i//5)*240
            out.paste(im,(x+(200-im.width)//2,y+(202-im.height)//2))
            draw.text((x+5,y+204),d['id'],font=font,fill='#22303a')
            draw.text((x+5,y+222),d['name'],font=font,fill='#22303a')
        out.save(HERE/'guides'/f'{family}-catalog.png')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*');args=parser.parse_args()
    specs=catalog();selection=[d for d in specs if not args.ids or d['id'] in args.ids]
    results=[];failed=[]
    with ProcessPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(build,d):d for d in selection}
        for job in as_completed(jobs):
            try:results.append(job.result())
            except Exception as e:failed.append(jobs[job]['id']);print(str(e),flush=True)
    images={};vectors={}
    for d in specs:
        saved=HERE/'maps'/f'{d["id"]}.json'
        info=json.loads(saved.read_text()) if saved.exists() else {}
        images[d['id']]=info.get('image', f'assets/glass/{d["id"]}.webp')
        vectors[d['id']]=info.get('vectorGuide',str(Path(images[d['id']]).with_suffix('.svg')))
    manifest={'tool':'exact vector guides + built-in image_gen stained glass','assets':[
        {k:d[k] for k in ('id','name','level','replaces','family','variant','large')}
        |dict(file=images[d['id']],vector=vectors[d['id']]) for d in specs]}
    (HERE/'pattern-catalog.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    if len(results)==75:sheet(results)
    if failed:raise SystemExit('NEEDS_FIX: '+','.join(failed))


if __name__=='__main__':main()
