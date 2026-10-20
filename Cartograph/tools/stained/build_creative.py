"""Build the authored replacement, normal and large maps without touching retained maps."""
import argparse
import contextlib
import io
import json
import hashlib
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from shapely import affinity
from shapely.ops import unary_union
from shapely.errors import GEOSException
from geom import Build, o_round_arch, o_oval, o_octagon
from make_maps import color, render
from creative_designs import catalog, compose
from figurative_geometry import finish, subdivide

HERE=Path(__file__).resolve().parent


def build(d):
    target=HERE/'maps'/f'{d["id"]}.json'
    if target.exists():
        previous=json.loads(target.read_text())
        if previous.get('geometryRevision',0)>=2:return previous
    scale=1.5 if d['large'] else 1
    w,h=d['cols']*scale,d['rows']*scale
    parts=[(affinity.scale(g,scale,scale,origin=(0,0)),c) for g,c in d['parts']]
    outline=affinity.scale([o_round_arch(),o_oval(),o_octagon(2)][d['level']%3],w/12,h/16,origin=(0,0))
    # Scale the complete composition, including its background network.
    source_lines,source_prefer=compose(d['parts'],d['cols'],d['rows'])
    lines=[affinity.scale(line,scale,scale,origin=(0,0)) for line in source_lines]
    prefer=lambda x,y:source_prefer(x/scale,y/scale)
    for attempt in range(20):
        try:
            # Large scenes have substantially more connected panes, not enlarged copies.
            max_area=((8.0 if d['large'] else 9.0)-(attempt%8)*.25)*scale*scale
            protected=unary_union([g for g,c in parts if g.area<(30 if d['large'] else 65)*scale*scale])
            with contextlib.redirect_stdout(io.StringIO()):
                b=Build(outline,lines,min_r=(.28+attempt*.003)*scale,min_area=(.5+attempt*.01)*scale*scale,cols=w,rows=h,protect=protected)
                b=finish(subdivide(b,max_area,9000+d['level']+attempt,protected), scale=scale)
                m=b.to_map(prefer)
            if b.issues:
                print(f'{d["id"]}: {len(b.issues)} contacts on attempt {attempt+1}: {b.issues[:2]}',flush=True)
                continue
            if d['large'] and m['count']<60: continue
            solution=color(m['adj'],m.pop('preferred'),m.pop('area'),7)
            if len(set(solution))!=4: continue
            info={k:d[k] for k in ('id','name','level','scene','large')}
            info.update(catalogVersion=3,geometryRevision=2,cornerRevision=1,junctionStyle='flat-readable',palette=[(f'glass colour {i+1}',c) for i,c in enumerate(d['palette'])],
                        map=m,solution=solution,geometryHash=hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest(),
                        generation=dict(seed=9000+d['level']+attempt,maxArea=max_area,minRadius=(.28+attempt*.003)*scale,minArea=(.5+attempt*.01)*scale*scale))
            if d.get('replaces'): info['replaces']=d['replaces']
            render(m,solution,d['palette'],HERE/'guides'/f'{d["id"]}.png')
            target.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
            print(f'{d["level"]} {d["name"]}: {m["count"]} panes, {w}x{h}',flush=True)
            return info
        except (ValueError,RuntimeError,AssertionError,AttributeError,GEOSException) as e:
            print(f'{d["id"]} attempt {attempt+1}: {str(e)[:160]}',flush=True)
    raise RuntimeError(f'{d["id"]}: could not build readable geometry')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*');a=parser.parse_args()
    ds=catalog()
    selection=[d for d in ds if not a.ids or d['id'] in a.ids]
    failed=[]
    with ProcessPoolExecutor(max_workers=4) as pool:
        jobs={pool.submit(build,d):d for d in selection}
        for job in as_completed(jobs):
            try: job.result()
            except Exception as e:
                failed.append(jobs[job]['id']);print(str(e),flush=True)
    if failed: print('NEEDS_DESIGN_FIX: '+','.join(failed),flush=True)
    # This manifest also fixes catalog slots; replaced maps cannot accidentally return.
    manifest={'tool':'built-in image_gen','assets':[]}
    overrides_path=HERE/'creative-prompt-overrides.json'
    overrides=json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    for d in ds:
        prompt=(f'Use case: style-transfer. Subject: {d["scene"]}. Transform this exact geometric colour guide into a luminous photographic artisan stained-glass panel. '
                'Preserve every pane, boundary, silhouette, margin and all four existing hues exactly. Add gentle handmade translucent glass ripples, tiny bubbles, subtle backlighting and thin dark metallic lead on existing seams. '
                'No extra lines, cracks, objects, frames, letters or decorations. Do not shift, stretch, zoom, rotate, merge or subdivide any part. '
                'Match the 3:4 portrait reference pixel-for-pixel; neutral dark grey outside the panel. Colour fidelity and precise registration matter more than dramatic lighting. '
                'All small and large panes keep exactly the reference hue. Use clean seam junctions without round tabs or decorative bumps. Output resolution '+('1728x2304.' if d['large'] else '768x1024.'))
        saved=HERE/'maps'/f'{d["id"]}.json'
        info=json.loads(saved.read_text()) if saved.exists() else {}
        image=info.get('image', f'assets/glass/{d["id"]}.webp')
        entry={k:d[k] for k in ('id','level','name','large')}
        entry.update(file=image,raw=f'tools/stained/raw/{Path(image).stem}.png',prompt=overrides.get(d['id'],prompt),
                     references=[f'tools/stained/guides/{d["id"]}.png'])
        if d.get('replaces'):entry['replaces']=d['replaces']
        manifest['assets'].append(entry)
    (HERE/'creative-prompts.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    if failed:
        raise SystemExit(1)

if __name__=='__main__':main()
