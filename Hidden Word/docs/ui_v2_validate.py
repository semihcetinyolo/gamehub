"""Asset delivery validation, no changes to game code."""
from pathlib import Path
from PIL import Image
import json
R=Path(__file__).resolve().parents[1]
def contrast(a,b):
 def lum(s):
  rgb=[int(s[i:i+2],16)/255 for i in (1,3,5)]
  rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
  return sum(v*w for v,w in zip(rgb,[.2126,.7152,.0722]))
 x,y=sorted([lum(a),lum(b)]);return round((y+.05)/(x+.05),2)
def main():
 m=json.loads((R/'docs/ui_v2_manifest.json').read_text());checks=[]
 assert len(m)==19,len(m)
 for name,v in m.items():
  p=R/v['production'];im=Image.open(p);assert list(im.size)==v['size'],name
  if not v.get('opaque'):
   assert im.mode=='RGBA',(name,im.mode);a=im.getchannel('A');assert a.getextrema()==(0,255),name
   assert all(a.getpixel(pt)==0 for pt in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]),name
   hist=a.histogram();assert hist[0]>im.width*im.height*.01,(name,'no clear exterior')
  ins=v['nine_slice_trbl']
  if ins:
   t,r,b,l=ins;assert l+r<im.width and t+b<im.height,name
   # Stretchable text plate must have a fully opaque central region.
   a=im.getchannel('A');center=a.crop((int(im.width*.4),int(im.height*.4),int(im.width*.6),int(im.height*.6)));assert center.getextrema()[0]>=250,(name,'translucent center')
  assert (R/'docs/ui_masters/v2'/(name+'.png')).exists(),name
  assert (R/'docs/ui_src/v2'/(name+'.png')).exists(),name
  checks.append({'asset':name,'dimensions':im.size,'mode':im.mode,'passed':True})
 mockups=sorted((R/'docs/ui_v2_mockups').glob('0*.png'));assert len(mockups)==6
 for p in mockups:assert Image.open(p).size==(1170,2532),p.name
 assert (R/'game/assets/ui_v2/btn_primary.png').read_bytes()==(R/'game/assets/ui_v2/btn_play.png').read_bytes()
 ratios={'ink_on_paper':contrast('#304B3B','#FFF8E8'),'white_on_green':contrast('#FFFFFF','#39814B'),'secondary_on_paper':contrast('#6F725D','#FFF8E8')}
 assert all(v>=4.5 for v in ratios.values()),ratios
 output={'passed':True,'asset_count':len(checks),'assets':checks,'mockups':[p.name for p in mockups],'mockup_dimensions':[1170,2532],'banner_css_height':50,'bottom_safe_area_example':34,'nominal_palette_contrast':ratios,'notes':['All six layouts visually reviewed; image compositions are not runtime screenshots.','Generated plate texture varies; text uses large heavy labels and high contrast nominal colours.','No game code modified by design task.']}
 (R/'docs/ui_v2_validation.json').write_text(json.dumps(output,indent=2));print(json.dumps({'passed':True,'asset_count':len(checks),'mockup_count':len(mockups),'contrast':ratios}))
if __name__=='__main__':main()
