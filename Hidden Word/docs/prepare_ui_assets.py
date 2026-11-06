"""Mechanical asset preparation: alpha-bound crop, scale, pad; no painted edits.
Preserves generated masters in docs/ui_masters and writes integration-ready PNGs.
"""
from PIL import Image, ImageOps, ImageDraw
from pathlib import Path
import json, shutil
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'game/assets/ui'; MASTER=ROOT/'docs/ui_src';MASTER.mkdir(exist_ok=True)
SPECS={
'logo':((864,459),10,None), 'icon':((192,192),6,None),
'slot_empty':((192,224),6,[48,48,48,48]),'slot_filled':((192,224),6,[48,48,48,48]),
'counter_pill':((384,132),5,[51,75,51,75]),
'btn_hint':((192,192),5,None),'btn_settings':((192,192),5,None),'btn_home':((192,192),5,None),
'heart':((96,96),4,None),'heart_empty':((96,96),4,None),
'ribbon_perfect':((864,243),7,None),'btn_primary':((768,180),6,[45,66,51,66]),
'panel':((384,512),5,[40,40,44,40]),'card_frame':((384,512),5,[40,40,44,40])}
report={}
for name,(size,pad,slices) in SPECS.items():
 p=OUT/(name+'.png'); master=MASTER/p.name
 if not master.exists():shutil.copy2(p,master)
 im=Image.open(master).convert('RGBA');a=im.getchannel('A');bbox=a.point(lambda x:255 if x>=8 else 0).getbbox()
 cropped=im.crop(bbox)
 # Only plates are resized to their specified rectangle; symbols preserve aspect.
 if name in ['slot_empty','slot_filled','counter_pill','panel','card_frame']:
  thumb=cropped.resize((size[0]-pad*2,size[1]-pad*2),Image.Resampling.LANCZOS)
 else:thumb=ImageOps.contain(cropped,(size[0]-pad*2,size[1]-pad*2),Image.Resampling.LANCZOS)
 ready=Image.new('RGBA',size,(0,0,0,0));ready.alpha_composite(thumb,((size[0]-thumb.width)//2,(size[1]-thumb.height)//2));ready.putalpha(ready.getchannel('A').point(lambda x:0 if x<=2 else x));ready=ready.quantize(colors=128,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).convert('RGBA');ready.putalpha(ready.getchannel('A').point(lambda x:0 if x<=2 else 255 if x>=240 else x));ready.save(p,optimize=True)
 aa=ready.getchannel('A');hist=aa.histogram()
 report[name]={'file':p.name,'size':list(size),'source_size':list(im.size),'source_crop_bbox':list(bbox),'slice_insets_trbl':slices,'alpha_range':list(aa.getextrema()),'fully_transparent_pixels':hist[0],'fully_opaque_pixels':hist[255],'center_alpha':ready.getpixel((size[0]//2,size[1]//2))[3]}
# Optional native background: simple neutral fill has no independent art prompt.
bg=Image.new('RGB',(1080,1920),'#E4EFEC');bg.save(OUT/'bg_menu.png',optimize=True)
(ROOT/'docs/ui_asset_manifest.json').write_text(json.dumps(report,indent=2))
print('Prepared',len(report),'RGBA assets + neutral background.')
