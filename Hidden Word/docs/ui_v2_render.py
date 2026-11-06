"""Exact 1170x2532 layout proofs. Only composes art; does not retouch generated art."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import math,json,sys
from ui_v2_prepare import SPECS
R=Path(__file__).resolve().parents[1]; O=R/'docs/ui_v2_mockups'; U=R/'game/assets/ui_v2'
S=3; W=390; H=844
C=dict(bg='#F7F0DF',paper='#FFF8E8',ink='#304B3B',muted='#6F725D',green='#39814B',sage='#D6E4C6',line='#C8B795',gold='#E9B85F',shadow='#D8C9A9')
def font(n,w=800):
 f=ImageFont.truetype(str(R/'docs/fonts/Nunito.ttf'),round(n*S));f.set_variation_by_axes([w]);return f
class Canvas:
 def __init__(self):self.im=Image.new('RGBA',(W*S,H*S),C['bg']);self.d=ImageDraw.Draw(self.im)
 def box(self,b,c='paper',r=16,outline=None,width=1):self.d.rounded_rectangle(tuple(round(v*S) for v in b),round(r*S),fill=C.get(c,c),outline=C.get(outline,outline),width=round(width*S))
 def txt(self,x,y,t,n=18,c='ink',w=800,a='mm'):self.d.text((round(x*S),round(y*S)),t,font=font(n,w),fill=C.get(c,c),anchor=a)
 def art(self,name,b):
  p=U/(name+'.png')
  if not p.exists():return False
  im=Image.open(p).convert('RGBA'); im=im.crop(im.getchannel('A').getbbox());im=ImageOps.contain(im,(round((b[2]-b[0])*S),round((b[3]-b[1])*S)),Image.Resampling.LANCZOS)
  self.im.alpha_composite(im,(round((b[0]+b[2])*S/2-im.width/2),round((b[1]+b[3])*S/2-im.height/2)));return True
 def plate(self,b,asset='panel',c='paper',r=16):
  # Exact stretchable layout representation until final production plates exist.
  p=U/(asset+'.png')
  if p.exists():
   im=Image.open(p).convert('RGBA');tw,th=round((b[2]-b[0])*S),round((b[3]-b[1])*S);ins=SPECS.get(asset,(None,None))[1]
   if ins:
    top,right,bottom,left=ins;dst=Image.new('RGBA',(tw,th));xs=[0,left,im.width-right,im.width];ys=[0,top,im.height-bottom,im.height];xd=[0,left,tw-right,tw];yd=[0,top,th-bottom,th]
    for i in range(3):
     for j in range(3):
      part=im.crop((xs[i],ys[j],xs[i+1],ys[j+1])).resize((xd[i+1]-xd[i],yd[j+1]-yd[j]),Image.Resampling.LANCZOS);dst.alpha_composite(part,(xd[i],yd[j]))
    im=dst
   else:im=im.resize((tw,th),Image.Resampling.LANCZOS)
   self.im.alpha_composite(im,(round(b[0]*S),round(b[1]*S)))
  else:
   self.box((b[0],b[1]+3,b[2],b[3]+3),'shadow',r);self.box(b,c,r,'line')
 def button(self,b,t,primary=True):
  self.plate(b,'btn_play' if primary else 'btn_secondary','green' if primary else 'paper',18)
  self.txt((b[0]+b[2])/2,(b[1]+b[3])/2,t,25 if primary else 19,'#FFFFFF' if primary else 'ink',900)
 def icon(self,k,x,y,size=44):
  if self.art('btn_'+k,(x,y,x+size,y+size)):return
  self.box((x,y,x+size,y+size),'paper',size/2,'line');cx=(x+size/2)*S;cy=(y+size/2)*S;rr=size*S/2;d=self.d;ink=C['ink'];lw=round(2.8*S)
  if k=='settings':
   for i in range(8):
    a=i*math.pi/4;d.line((cx+math.cos(a)*rr*.35,cy+math.sin(a)*rr*.35,cx+math.cos(a)*rr*.59,cy+math.sin(a)*rr*.59),fill=ink,width=round(5*S))
   d.ellipse((cx-rr*.45,cy-rr*.45,cx+rr*.45,cy+rr*.45),fill=ink);d.ellipse((cx-rr*.18,cy-rr*.18,cx+rr*.18,cy+rr*.18),fill=C['paper'])
  elif k=='hint':
   d.ellipse((cx-rr*.3,cy-rr*.47,cx+rr*.3,cy+rr*.1),fill=C['gold'],outline=ink,width=round(S));d.rounded_rectangle((cx-rr*.14,cy+rr*.05,cx+rr*.14,cy+rr*.38),4*S,fill=ink)
  elif k=='close':
   for s in [-1,1]:d.line((cx-rr*.25,cy-s*rr*.25,cx+rr*.25,cy+s*rr*.25),fill=ink,width=lw)
  elif k=='back':d.line((cx+rr*.14,cy-rr*.3,cx-rr*.14,cy,cx+rr*.14,cy+rr*.3),fill=ink,width=lw)
 def scene(self,slug,b,letters=False,found=()):
  p=R/'game/assets'/slug; im=Image.open(p/'bg.jpg').convert('RGBA')
  if letters:
   m=json.loads((p/'manifest.json').read_text())
   for l in sorted(m['letters'],key=lambda l:l.get('z',0)):
    if l['i'] in found:continue
    tile=Image.open(p/l['file']).convert('RGBA').resize((round(l['w']*im.width),round(l['h']*im.height)),Image.Resampling.LANCZOS)
    im.alpha_composite(tile,(round(l['x']*im.width),round(l['y']*im.height)))
  im=ImageOps.fit(im,(round((b[2]-b[0])*S),round((b[3]-b[1])*S)),Image.Resampling.LANCZOS)
  mask=Image.new('L',im.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,im.width,im.height),14*S,fill=255);im.putalpha(mask);self.im.alpha_composite(im,(round(b[0]*S),round(b[1]*S)))
 def save(self,n):self.im.convert('RGB').save(O/(n+'.png'))
def menu(direction='storybook'):
 c=Canvas();p=R/'clai-images'/('ui-v2-concept_'+direction+'.png')
 if p.exists():c.im=ImageOps.fit(Image.open(p).convert('RGBA'),(W*S,H*S),Image.Resampling.LANCZOS);c.d=ImageDraw.Draw(c.im)
 c.icon('settings',326,51)
 if not c.art('logo',(56,194,334,341)):
  c.txt(195,237,'Hidden',57,w=900);c.txt(195,295,'Word',62,w=900)
 c.plate((135,448,255,494),'level_badge');c.txt(195,471,'Level 9',18,w=900)
 c.button((58,520,332,588),'PLAY')
 c.button((95,612,295,664),'Levels',False)
 return c
def game(completed=False):
 c=Canvas();c.plate((18,54,121,94),'level_badge');c.txt(69.5,74,'Level 9',16,w=900)
 c.plate((151,54,239,94),'counter_pill','ink');c.txt(195,74,'13 / 13' if completed else '3 / 13',18,'#FFFFFF',900)
 c.icon('settings',328,52,44)
 for y,words in [(116,['ONCE','UPON']),(159,['A','TIME'])]:
  width=sum(len(w)*30+(len(w)-1)*4 for w in words)+(len(words)-1)*16;x=(W-width)/2
  for word in words:
   for ch in word:
    filled=completed or (y==116 and x<156)
    c.plate((x,y,x+30,y+32),'slot_filled' if filled else 'slot_empty','sage' if filled else 'paper',7)
    if filled:c.txt(x+15,y+16,ch,19,w=900)
    x+=34
   x+=12
 c.scene('upon_storybook_attic',(20,211,370,680),True,tuple(range(13)) if completed else (0,1,2))
 c.icon('hint',165,691,60)
 c.box((0,760,390,844),'#E9E3D5',0)
 # 760..810 is exactly 50 logical px; 810..844 reserved device bottom inset.
 return c
def tabs(c,active='Levels'):
 c.box((0,762,390,844),'paper',0)
 c.box((202 if active=='Levels' else 24,772,366 if active=='Levels' else 188,818),'sage',15)
 c.txt(105,795,'Home',17);c.txt(285,795,'Levels',17)
def levels():
 c=Canvas();c.icon('back',20,52);c.txt(195,74,'Levels',26,w=900);c.txt(359,75,'28',16,'muted')
 c.txt(24,142,'Watercolor',20,a='lm',w=900)
 def card(x,y,slug,no,title,done=False):
  c.plate((x,y,x+164,y+264));c.scene(slug,(x+7,y+7,x+157,y+208));c.txt(x+13,y+227,'Level '+str(no),17,a='lm',w=900);c.txt(x+13,y+249,title,12,'muted',700,a='lm')
  if done:
   c.box((x+123,y+16,x+149,y+42),'green',13);c.d.line([(round((x+130)*S),round((y+29)*S)),(round((x+134)*S),round((y+33)*S)),(round((x+142)*S),round((y+25)*S))],fill='#FFFFFF',width=3*S)
 card(24,168,'galley_watercolor_r2',6,'Galley',True);card(202,168,'puppet_watercolor_r2',7,'Puppet theatre')
 c.txt(24,480,'Cartoon',20,a='lm',w=900)
 card(24,507,'racers_cartoon_r2',10,'Race day');card(202,507,'camper_cartoon_r2',20,'Camping')
 tabs(c);return c
def win():
 c=game(True);c.im.alpha_composite(Image.new('RGBA',c.im.size,(35,49,38,115)))
 c.plate((24,164,366,702),'panel');
 if not c.art('ribbon_perfect',(47,197,343,280)):c.box((47,207,343,267),'gold',15)
 c.txt(195,237,'Perfect',32,w=900)
 c.scene('upon_storybook_attic',(92,291,298,509))
 c.txt(195,539,'ONCE UPON A TIME',21,w=900)
 c.button((59,580,331,642),'Next Level');c.txt(195,674,'Main menu',17)
 return c
def settings():
 c=menu();c.im.alpha_composite(Image.new('RGBA',c.im.size,(35,49,38,110)))
 c.plate((24,218,366,652),'panel');c.txt(195,263,'Settings',28,w=900);c.icon('close',306,232,40)
 def toggle(y,on):
  c.box((277,y-15,335,y+15),'green' if on else '#B7B5A3',15);c.box((307 if on else 280,y-12,331 if on else 304,y+12),'paper',12)
 c.txt(54,332,'Sound',20,a='lm');toggle(332,True)
 c.txt(54,398,'Hearts',20,a='lm');toggle(398,False)
 c.txt(54,431,'3 hearts · a wrong tap costs one',13,'muted',700,a='lm')
 c.button((54,468,336,520),'Main menu',False)
 c.txt(195,554,'Admin',16);c.txt(195,608,'Reset progress',15,'#9D5141',800)
 return c
def main():
 O.mkdir(exist_ok=True)
 pairs=[('01_menu_storybook',menu()),('02_menu_garden',menu('garden')),('03_gameplay',game()),('04_levels',levels()),('05_perfect',win()),('06_settings',settings())]
 for n,c in pairs:c.save(n)
 contact=Image.new('RGB',(1170,2*900),'#DED8C8');d=ImageDraw.Draw(contact)
 for k,(n,c) in enumerate(pairs):
  im=c.im.convert('RGB').resize((370,801),Image.Resampling.LANCZOS);x=(k%3)*390+10;y=(k//3)*900+55;contact.paste(im,(x,y));d.text((x,y-36),n.replace('_',' '),font=font(7),fill=C['ink'])
 contact.save(O/'contact_sheet.jpg',quality=92)
 print('Rendered six 1170x2532 mockups and contact sheet',flush=True)
if __name__=='__main__':main()
