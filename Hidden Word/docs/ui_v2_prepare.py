"""Mechanical alpha trim, padding and resampling only. Never paint generated artwork."""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
import json,shutil
R=Path(__file__).resolve().parents[1]; U=R/'game/assets/ui_v2'; M=R/'docs/ui_masters/v2'; SRC=R/'docs/ui_src/v2'
# dimensions, nine-slice TOP RIGHT BOTTOM LEFT in production bitmap pixels
SPECS={
 'logo':((840,450),None),
 'btn_play':((840,210),(60,90,66,90)),
 'btn_secondary':((840,180),(54,81,60,81)),
 'level_badge':((360,138),(42,60,48,60)),
 'counter_pill':((288,132),(42,60,48,60)),
 'panel':((384,512),(42,42,48,42)),
 'slot_empty':((96,102),(27,27,30,27)),
 'slot_filled':((96,102),(27,27,30,27)),
 'btn_settings':((144,144),None),
 'btn_home':((144,144),None),
 'btn_close':((144,144),None),
 'btn_back':((144,144),None),
 'btn_hint':((192,192),None),
 'ribbon_perfect':((900,252),None),
 'heart':((90,84),None),
 'heart_empty':((90,84),None),
}
def prepare():
 for d in (U,M,SRC):d.mkdir(parents=True,exist_ok=True)
 manifest={}
 for name,(size,insets) in SPECS.items():
  p=R/'clai-images'/('ui-v2-'+name+'.png')
  if name=='logo' and (R/'clai-images/ui-v2-logo-hidden-letters.png').exists():
   p=R/'clai-images/ui-v2-logo-hidden-letters.png'
  if not p.exists():raise FileNotFoundError(p)
  shutil.copy2(p,SRC/(name+'.png'));im=Image.open(p).convert('RGBA')
  alpha=im.getchannel('A');bbox=alpha.point(lambda a:255 if a>=8 else 0).getbbox()
  if not bbox:raise ValueError('Empty art '+name)
  # Remove only invisible alpha speckle, keeping painted edges and antialiasing.
  im.putalpha(alpha.point(lambda a:0 if a<=2 else a));im=im.crop(bbox)
  im.save(M/(name+'.png'))
  pad=3; inner=(size[0]-pad*2,size[1]-pad*2)
  # Flexible plates are normalized to their intended designed aspect ratio.
  if insets:scaled=im.resize(inner,Image.Resampling.LANCZOS)
  else:scaled=ImageOps.contain(im,inner,Image.Resampling.LANCZOS)
  out=Image.new('RGBA',size);out.alpha_composite(scaled,((size[0]-scaled.width)//2,(size[1]-scaled.height)//2));out.save(U/(name+'.png'),optimize=True)
  extrema=out.getchannel('A').getextrema()
  assert extrema==(0,255),(name,extrema)
  manifest[name]={'production':str((U/(name+'.png')).relative_to(R)),'size':size,'source':str(p.relative_to(R)),'source_size':Image.open(p).size,'alpha_crop':bbox,'master_size':im.size,'nine_slice_trbl':insets,'alpha_extrema':extrema,'runtime_text':name not in ['logo','btn_settings','btn_home','btn_close','btn_back','btn_hint','heart','heart_empty']}
 # Semantic alias to simplify current primary button integration.
 for target in [U,M,SRC]:shutil.copy2(target/'btn_play.png',target/'btn_primary.png')
 manifest['btn_primary']={**manifest['btn_play'],'production':'game/assets/ui_v2/btn_primary.png','alias_of':'btn_play'}
 for source,name in [('concept_storybook','bg_menu'),('concept_garden','bg_menu_garden')]:
  p=R/'clai-images'/('ui-v2-'+source+'.png');shutil.copy2(p,SRC/(name+'.png'));shutil.copy2(p,M/(name+'.png'))
  im=ImageOps.fit(Image.open(p).convert('RGB'),(1170,2532),Image.Resampling.LANCZOS);im.save(U/(name+'.png'),optimize=True)
  manifest[name]={'production':str((U/(name+'.png')).relative_to(R)),'size':im.size,'source':str(p.relative_to(R)),'nine_slice_trbl':None,'opaque':True}
 (R/'docs/ui_v2_manifest.json').write_text(json.dumps(manifest,indent=2))
 make_contact(manifest)
 print('Prepared',len(manifest),'production PNGs; manifest written.')
def make_contact(manifest):
 w=1200;cellw=300;cellh=270;n=len(manifest);im=Image.new('RGB',(w,((n+3)//4)*cellh),'#DDD8C9');d=ImageDraw.Draw(im)
 f=ImageFont.truetype(str(R/'docs/fonts/Nunito.ttf'),20)
 for i,(name,m) in enumerate(manifest.items()):
  x=(i%4)*cellw;y=(i//4)*cellh
  for yy in range(y,y+220,16):
   for xx in range(x,x+cellw,16):d.rectangle((xx,yy,xx+15,yy+15),fill='#EAE6DC' if ((xx-x)//16+(yy-y)//16)%2 else '#D8D4CA')
  tile=ImageOps.contain(Image.open(R/m['production']).convert('RGBA'),(276,202),Image.Resampling.LANCZOS);im.paste(tile,(x+(cellw-tile.width)//2,y+(220-tile.height)//2),tile)
  d.text((x+12,y+228),name,fill='#304B3B',font=f)
  d.text((x+12,y+249),' × '.join(map(str,m['size'])),fill='#6F725D',font=ImageFont.truetype(str(R/'docs/fonts/Nunito.ttf'),14))
 im.save(R/'docs/ui_v2_mockups/asset_contact_sheet.jpg',quality=94)
if __name__=='__main__':prepare()
