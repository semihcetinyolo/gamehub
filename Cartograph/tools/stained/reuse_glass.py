"""Transfer real existing glass material to final puzzle geometry, locally.
Samples only seam-free interior patches from each of the four source colours.
Blends overlapping randomly transformed samples; retains matching source interiors.
Old lead is excluded from donors/preserved pixels, new lead follows exact paths.
No image model, synthetic noise, solution changes or flat replacement glass.
"""
import argparse,hashlib,json,math,traceback
from concurrent.futures import ProcessPoolExecutor,as_completed
from datetime import datetime,timezone
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from scipy.ndimage import distance_transform_edt,binary_erosion,gaussian_filter
from make_maps import region_polys,shape_poly,render
from generate_art import extract_palette,lab
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/geometry-rollout'

def labels(info,size):
    m=info['map'];im=Image.new('I',size,-1);sx,sy=size[0]/m['cols'],size[1]/m['rows']
    for r,p in enumerate(region_polys(m)):
        mask=Image.new('L',size);d=ImageDraw.Draw(mask)
        xy=lambda cs:[(x*sx,y*sy) for x,y in cs]
        d.polygon(xy(p.exterior.coords),fill=255)
        for hole in p.interiors:d.polygon(xy(hole.coords),fill=0)
        im.paste(r,mask=mask)
    return np.asarray(im)

def texture(source,valid,size,rng):
    # Extract varied crops at their real pixel resolution (no fake noise).
    dist=cv2.distanceTransform(valid.astype('uint8'),cv2.DIST_L2,5)
    side=min(144,int(dist.max()*1.35));side=max(12,side)
    centers=np.argwhere(dist>side/math.sqrt(2)+1)
    while len(centers)<8 and side>16:
        side=int(side*.85);centers=np.argwhere(dist>side/math.sqrt(2)+1)
    if not len(centers):raise ValueError('No seam-free glass sample for colour')
    patches=[]
    for n in rng.choice(len(centers),size=min(96,len(centers)),replace=False):
        y,x=centers[n];r=side//2;p=source[y-r:y-r+side,x-r:x-r+side]
        if p.shape[:2]!=(side,side):continue
        patches.append(p)
    h,w=size[1],size[0];overlap=max(5,side//3);stride=side-overlap
    result=np.zeros((h+side,w+side,3),np.float32);weights=np.zeros((h+side,w+side),np.float32)
    taper=np.ones(side,np.float32);taper[:overlap]=np.linspace(.01,1,overlap);taper[-overlap:]=taper[:overlap][::-1]
    weight=taper[:,None]*taper[None,:]
    for y in range(0,h,stride):
        for x in range(0,w,stride):
            patch=np.rot90(patches[int(rng.integers(len(patches)))],int(rng.integers(4)))
            if rng.random()<.5:patch=patch[:,::-1]
            result[y:y+side,x:x+side]+=patch*weight[:,:,None];weights[y:y+side,x:x+side]+=weight
    return result[:h,:w]/np.maximum(weights[:h,:w,None],.001),dict(patchSize=side,donorPatches=len(patches))

def validate(info,image,palette):
    idx=labels(info,image.size);arr=np.asarray(image);medians=[]
    for r in range(info['map']['count']):
        mask=binary_erosion(idx==r,iterations=6)
        if mask.sum()<30:mask=idx==r
        if not mask.any():raise ValueError(f'Pane {r} has no pixels')
        medians.append(np.median(arr[mask],axis=0))
    hexes=['#'+''.join(f'{int(v):02x}' for v in c) for c in medians]
    pl=np.array([lab(c) for c in hexes]);centers=np.array([lab(c) for c in palette])
    for _ in range(12):
        got=np.argmin(np.linalg.norm(pl[:,None,:]-centers[None,:,:],axis=2),axis=1)
        for c in range(4):
            if np.any(got==c):centers[c]=np.median(pl[got==c],axis=0)
    bad=[(r,int(info['solution'][r]),int(got[r])) for r in range(len(got)) if got[r]!=info['solution'][r]]
    valid=len(set(got))==4 and not bad and all(got[r]!=got[j] for r in range(len(got)) for j in info['map']['adj'][r])
    return dict(valid=bool(valid),matched=len(got)-len(bad),total=len(got),mismatches=bad)

def transfer(id):
    file=OUT/'maps'/f'{id}.json';info=json.loads(file.read_text())
    if not info.get('artworkNeedsRefresh'):return dict(id=id,retained=True)
    text=(OUT/'before/stained-levels.js').read_text();ls=json.JSONDecoder().raw_decode(text[text.index('['):])[0];old=next(l for l in ls if l['id']==id)
    sourcepath=ROOT/old['image'];sourceim=Image.open(sourcepath).convert('RGB');source=np.asarray(sourceim)
    m=info['map'];pixel_scale=min(64,2304/max(m['cols'],m['rows']));size=(round(m['cols']*pixel_scale),round(m['rows']*pixel_scale))
    oldidx=labels(old,sourceim.size);oldcolors=np.full(oldidx.shape,-1)
    for r,c in enumerate(old['solution']):oldcolors[oldidx==r]=c
    idx=labels(info,size);newcolors=np.full(idx.shape,-1)
    for r,c in enumerate(info['solution']):newcolors[idx==r]=c
    # Uniform outside fill removes every obsolete silhouette/rim pixel.
    bg=source[oldcolors<0];bg=np.median(bg,axis=0) if len(bg) else np.array([56,56,54])
    output=np.broadcast_to(bg,(*idx.shape,3)).copy().astype(np.float32)
    rng=np.random.default_rng(int(hashlib.sha256(id.encode()).hexdigest()[:8],16))
    resized=np.asarray(sourceim.resize(size,Image.Resampling.LANCZOS)).astype(np.float32)
    statistics=[]
    for c in range(4):
        cmask=oldcolors==c
        valid=binary_erosion(cmask,iterations=14)
        luminance=source.mean(axis=2);mid=np.median(luminance[valid])
        valid &= luminance>max(12,mid*.32)
        tex,stats=texture(source,valid,size,rng)
        # Keep source glass where the old and new colour coincide; suppress all
        # old lead plus its shadow before feathering the transition.
        safe=np.asarray(Image.fromarray(valid.astype('uint8')*255).resize(size,Image.Resampling.NEAREST))>0
        alpha=np.clip(distance_transform_edt(safe)/14,0,1)
        material=tex*(1-alpha[:,:,None])+resized*alpha[:,:,None]
        mask=newcolors==c;output[mask]=material[mask]
        stats.update(colour=c,preservedFraction=float(np.mean(alpha[mask])));statistics.append(stats)
    # Thin metallic lead on the *new* exact boundaries, with a gentle edge shade.
    scale=2;seam=Image.new('L',(size[0]*scale,size[1]*scale));d=ImageDraw.Draw(seam)
    for e in [*m['edges'],*m['rim']]:
        xy=[(e[0]*pixel_scale*scale,e[1]*pixel_scale*scale),(e[2]*pixel_scale*scale,e[3]*pixel_scale*scale)]
        width=round((.060 if len(e)==6 else .085)*pixel_scale*scale)
        d.line(xy,fill=255,width=width)
        rr=width/2
        for x,y in xy:d.ellipse((x-rr,y-rr,x+rr,y+rr),fill=255)
    seam=seam.resize(size,Image.Resampling.LANCZOS)
    mask=np.asarray(seam).astype(float)/255
    shade=np.asarray(seam.filter(ImageFilter.GaussianBlur(2))).astype(float)/255
    output*=1-.24*shade[:,:,None]
    # Highlight is derived from the seam edge, without adding decorative marks.
    bevel=gaussian_filter(mask,.65);gy,gx=np.gradient(bevel)
    metal=np.clip(34+(gx-gy)*75,20,86)
    output=output*(1-mask[:,:,None])+metal[:,:,None]*mask[:,:,None]
    im=Image.fromarray(np.clip(output,0,255).astype('uint8'))
    target=OUT/'art'/f'{id}-restored.webp';target.parent.mkdir(exist_ok=True)
    im.save(target,'WEBP',quality=91,method=4)
    guide=OUT/'guides'/f'{id}.png';guide.parent.mkdir(exist_ok=True)
    palette=[p if isinstance(p,str) else p[1] for p in info['palette']]
    import make_maps
    previous_scale=make_maps.S;make_maps.S=pixel_scale
    try:render(m,info['solution'],palette,guide)
    finally:make_maps.S=previous_scale
    pal=extract_palette(target,guide.with_suffix('.labels.png'))
    checked=validate(info,Image.open(target).convert('RGB'),pal)
    meta=dict(id=id,tool='local reuse of existing stained-glass interiors',generatedAt=datetime.now(timezone.utc).isoformat(),
        source=old['image'],sourceSha256=hashlib.sha256(sourcepath.read_bytes()).hexdigest(),
        sourceGeometrySha256=hashlib.sha256(json.dumps(old['map']['paths']).encode()).hexdigest(),
        method='seam-excluded source texture quilting; preserve matching glass; exact new metallic lead',
        textureSamples=statistics,size=list(size),guide=hashlib.sha256(guide.read_bytes()).hexdigest(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),palette=pal,paneColorCheck=checked)
    target.with_suffix('.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
    if not checked['valid']:raise ValueError(f'Pane colour mismatch: {checked}')
    info['geometryHash']=hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest()
    info.update(image=f'assets/glass/{target.name}',artMetadata=f'assets/glass/{target.stem}.json',artworkStyle='stained-glass',artworkNeedsRefresh=False)
    # An editable guide always accompanies remapped art.
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {m["cols"]} {m["rows"]}">'
    svg+=''.join(f'<path d="{p}" fill="{palette[info["solution"][r]]}" fill-rule="evenodd"/>' for r,p in enumerate(m['paths']))
    svg+=f'<path d="{m["edgePath"]}" fill="none" stroke="#222c36" stroke-width=".06"/><path d="{m["shape"]}" fill="none" stroke="#222c36" stroke-width=".085"/></svg>'
    guide.with_suffix('.svg').write_text(svg);info['vectorGuide']=f'tools/stained/guides/{id}.svg'
    file.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return dict(id=id,**checked)

def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');p.add_argument('--jobs',type=int,default=2);a=p.parse_args()
    ids=a.ids or [r['id'] for r in json.loads((OUT/'before/manifest.json').read_text())];rows=[]
    with ProcessPoolExecutor(max_workers=a.jobs) as pool:
        jobs={pool.submit(transfer,id):id for id in ids}
        for f in as_completed(jobs):
            try:r=f.result()
            except Exception as e:r=dict(id=jobs[f],error=str(e),traceback=traceback.format_exc())
            rows.append(r);print(json.dumps(r),flush=True)
    (OUT/'art-report.json').write_text(json.dumps(rows,indent=2))
    if any(r.get('error') for r in rows):raise SystemExit(1)
if __name__=='__main__':main()
