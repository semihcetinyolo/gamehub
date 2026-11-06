"""Asset/geometry acceptance checks and reproducible contact sheets."""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
import json
ROOT=Path(__file__).resolve().parents[1];UI=ROOT/'game/assets/ui';WF=ROOT/'game/assets/wireframes'
M=json.loads((ROOT/'docs/ui_asset_manifest.json').read_text());checks=[]
for name,row in M.items():
 im=Image.open(UI/row['file']);assert im.mode=='RGBA',(name,'RGBA required');assert im.size==tuple(row['size']),(name,'wrong size');a=im.getchannel('A');assert a.getextrema()==(0,255),(name,'real alpha required')
 assert all(a.getpixel(pt)==0 for pt in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]),(name,'transparent corners required')
 checks.append({'file':row['file'],'size':list(im.size),'mode':im.mode,'alpha_extrema':list(a.getextrema()),'bytes':(UI/row['file']).stat().st_size})
a=Image.open(UI/'card_frame.png').getchannel('A');assert a.crop((40,40,344,472)).getextrema()==(0,0),'hollow card window must be fully clear'
paths=sorted(WF.glob('*_wire.png'))+sorted(WF.glob('*_colour.png'));assert len(paths)==16,len(paths)
for p in paths:assert Image.open(p).size==(1080,1920),p.name
f=ImageFont.truetype(str(ROOT/'docs/fonts/Nunito.ttf'),23)
for suffix in ['wire','colour']:
 ps=sorted(WF.glob('*_'+suffix+'.png')); im=Image.new('RGB',(1440,1390),'#D2DAD6');d=ImageDraw.Draw(im)
 for i,p in enumerate(ps):
  a=Image.open(p).resize((324,576),Image.Resampling.LANCZOS);x=27+(i%4)*360;y=40+(i//4)*680;im.paste(a,(x,y));d.text((x,y+594),p.stem.replace('_'+suffix,'').replace('_',' '),fill='#3E4870',font=f)
 im.save(WF/('overview_'+suffix+'.jpg'),quality=92)
ps=sorted(UI.glob('*.png'));im=Image.new('RGB',(1200,((len(ps)+3)//4)*310),'#CCD4D6');d=ImageDraw.Draw(im)
for i,p in enumerate(ps):
 a=Image.open(p).convert('RGBA');a=ImageOps.contain(a,(270,240));x=(i%4)*300+(300-a.width)//2;y=(i//4)*310+20;im.paste(a,(x,y),a);d.text(((i%4)*300+15,(i//4)*310+273),p.name,fill='#283046',font=f)
im.save(WF/'ui_contact_sheet.jpg',quality=94)
def lum(h):
 v=[int(h[k:k+2],16)/255 for k in (1,3,5)];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v];return sum(x*y for x,y in zip(v,[.2126,.7152,.0722]))
def contrast(a,b):
 x,y=sorted([lum(a),lum(b)]);return round((y+.05)/(x+.05),2)
ratios={'ink_on_ivory':contrast('#3E4870','#FAF6EA'),'helper_on_background':contrast('#596B73','#E4EFEC'),'danger_on_ivory':contrast('#A34C46','#FAF6EA')}
assert min(ratios.values())>=4.5,ratios
report={'result':'PASS','rgba_assets':len(checks),'phone_pngs':len(paths),'phone_size':[1080,1920],'card_window_alpha_range':[0,0],'text_contrast_ratios':ratios,'assets':checks}
(ROOT/'docs/ui_validation.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='assets'},indent=2))
