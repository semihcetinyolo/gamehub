"""Render reviewable 1080x1920 layout proofs, not game screenshots.
Uses the project's own test scene and generated UI assets. Run from any directory.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
import json, math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'game/assets/wireframes'; UI=ROOT/'game/assets/ui'
W,H=1080,1920
C={'bg':'#E4EFEC','ink':'#3E4870','muted':'#596B73','paper':'#FAF6EA','mint':'#B7E1D2','gold':'#EEBF62','coral':'#E27D70','danger':'#A34C46','line':'#C7D6D1','white':'#FFFFFF'}
def font(size,weight=700):
 f=ImageFont.truetype(str(ROOT/'docs/fonts/Nunito.ttf'),size)
 try:f.set_variation_by_axes([weight])
 except Exception:pass
 return f
class Canvas:
 def __init__(self,colour=True):
  self.colour=colour; self.im=Image.new('RGBA',(W,H),C['bg'] if colour else '#F8F8F8'); self.d=ImageDraw.Draw(self.im)
 def col(self,c):
  if self.colour:return C.get(c,c)
  return {'bg':'#F8F8F8','ink':'#343434','muted':'#797979','paper':'#FFFFFF','mint':'#E2E2E2','gold':'#DEDEDE','coral':'#AAAAAA','danger':'#555555','line':'#A8A8A8','white':'#FFFFFF'}.get(c,c)
 def box(self,b,fill='paper',radius=34,line=None,width=3):self.d.rounded_rectangle(b,radius,fill=self.col(fill),outline=self.col(line) if line else None,width=width)
 def text(self,xy,txt,size=42,weight=700,fill='ink',anchor='mm'):self.d.text(xy,txt,font=font(size,weight),fill=self.col(fill),anchor=anchor)
 def img(self,name,b,trim=True):
  p=UI/(name+'.png')
  if not self.colour or not p.exists():return False
  im=Image.open(p).convert('RGBA')
  if trim:im=im.crop(im.getchannel('A').getbbox())
  im=ImageOps.contain(im,(int(b[2]-b[0]),int(b[3]-b[1])),Image.Resampling.LANCZOS)
  self.im.alpha_composite(im,(int((b[0]+b[2]-im.width)/2),int((b[1]+b[3]-im.height)/2)))
  self.d=ImageDraw.Draw(self.im);return True
 def button(self,b,txt,primary=True):
  if not(primary and self.img('btn_primary',b)):
   self.box((b[0],b[1]+9,b[2],b[3]+9),'line',44)
   self.box(b,'ink' if primary else 'paper',44,line=None if primary else 'line')
  self.text(((b[0]+b[2])/2,(b[1]+b[3])/2-1),txt,54 if primary else 43,900,'paper' if primary else 'ink')
 def glyph(self,kind,cx,cy,r=56):
  ink=self.col('ink'); lw=8; d=self.d
  if kind=='home':
   d.line([(cx-r*.55,cy),(cx,cy-r*.5),(cx+r*.55,cy)],fill=ink,width=lw,joint='curve');d.line([(cx-r*.36,cy-r*.08),(cx-r*.36,cy+r*.44),(cx+r*.36,cy+r*.44),(cx+r*.36,cy-r*.08)],fill=ink,width=lw);d.rectangle((cx-8,cy+10,cx+8,cy+26),fill=ink)
  elif kind=='settings':
   for i in range(8):
    a=i*math.pi/4; d.line((cx+math.cos(a)*r*.37,cy+math.sin(a)*r*.37,cx+math.cos(a)*r*.57,cy+math.sin(a)*r*.57),fill=ink,width=14)
   d.ellipse((cx-r*.43,cy-r*.43,cx+r*.43,cy+r*.43),fill=ink);d.ellipse((cx-r*.18,cy-r*.18,cx+r*.18,cy+r*.18),fill=self.col('paper'))
  elif kind=='hint':
   d.ellipse((cx-r*.35,cy-r*.57,cx+r*.35,cy+r*.12),fill=self.col('gold'),outline=ink,width=5); d.rounded_rectangle((cx-r*.17,cy+r*.05,cx+r*.17,cy+r*.4),radius=6,fill=ink)
  elif kind=='close':
   d.line((cx-14,cy-14,cx+14,cy+14),fill=ink,width=6);d.line((cx-14,cy+14,cx+14,cy-14),fill=ink,width=6)
  elif kind=='back':d.line([(cx+10,cy-20),(cx-10,cy),(cx+10,cy+20)],fill=ink,width=6)
 def icon(self,name,b):
  if not self.img('btn_'+name,b):
   self.box(b,'paper',int((b[2]-b[0])/2),'line',2)
   self.glyph(name,(b[0]+b[2])/2,(b[1]+b[3])/2,(b[2]-b[0])*.43)
 def heart(self,x,y,size=48,empty=False):
  if self.img('heart_empty' if empty else 'heart',(x,y,x+size,y+size)):return
  self.d.polygon([(x+size/2,y+size*.92),(x+size*.06,y+size*.42),(x+size*.1,y+size*.18),(x+size*.3,y+size*.1),(x+size/2,y+size*.25),(x+size*.7,y+size*.1),(x+size*.9,y+size*.18),(x+size*.94,y+size*.42)],fill=self.col('paper' if empty else 'coral'),outline=self.col('muted') if empty else None,width=2)
 def scene(self,b,letters=True,exclude=()):
  if not self.colour:
   self.box(b,'mint',26,'line',3)
   self.d.line((b[0]+40,b[1]+40,b[2]-40,b[3]-40),fill='#C4C4C4',width=2);self.d.line((b[2]-40,b[1]+40,b[0]+40,b[3]-40),fill='#C4C4C4',width=2)
   self.box((b[0]+100,(b[1]+b[3])/2-100,b[2]-100,(b[1]+b[3])/2+100),'paper',22)
   self.text(((b[0]+b[2])/2,(b[1]+b[3])/2-25),'LEVEL SCENE',40,800)
   self.text(((b[0]+b[2])/2,(b[1]+b[3])/2+35),'Pan · pinch · tap letters',30,600,'muted');return
  src=ROOT/'game/assets/cozy_porch_fake'; bg=src/'bg.jpg'
  if bg.exists():
   im=Image.open(bg).convert('RGBA')
   if letters and (src/'manifest.json').exists():
    data=json.loads((src/'manifest.json').read_text())
    for l in data['letters']:
     if l['i'] in exclude:continue
     tile=Image.open(src/l['file']).convert('RGBA'); tile=tile.resize((round(l['w']*im.width),round(l['h']*im.height)),Image.Resampling.LANCZOS)
     im.alpha_composite(tile,(round(l['x']*im.width),round(l['y']*im.height)))
   im=ImageOps.fit(im,(int(b[2]-b[0]),int(b[3]-b[1])),Image.Resampling.LANCZOS)
  else:
   im=Image.new('RGBA',(int(b[2]-b[0]),int(b[3]-b[1])),self.col('mint'))
   dd=ImageDraw.Draw(im); w,h=im.size
   dd.rectangle((0,int(h*.58),w,h),fill=self.col('paper'))
   dd.rounded_rectangle((int(w*.28),int(h*.15),int(w*.72),int(h*.8)),30,fill=self.col('ink'))
   dd.ellipse((int(w*.08),int(h*.18),int(w*.30),int(h*.4)),fill=self.col('gold'))
   dd.polygon([(int(w*.08),h),(int(w*.28),int(h*.42)),(int(w*.42),h)],fill=self.col('coral'))
  mask=Image.new('L',im.size);ImageDraw.Draw(mask).rounded_rectangle((0,0,im.width,im.height),26,fill=255);im.putalpha(mask)
  self.im.alpha_composite(im,(int(b[0]),int(b[1])));self.d=ImageDraw.Draw(self.im)
 def shade(self):
  self.im.alpha_composite(Image.new('RGBA',(W,H),(30,39,57,100)));self.d=ImageDraw.Draw(self.im)
 def panel(self,b):
  # Native 9-slice layout representation; production panel PNG shown in asset contact sheet.
  self.box((b[0],b[1]+14,b[2],b[3]+14),'muted',52);self.box(b,'paper',52,'line',3)
 def save(self,n):self.im.convert('RGB').save(OUT/n)

def home(c):
 # Main menu: no level preview or slogan; keep logo and actions in a calm thumb-friendly stack.
 c.icon('settings',(896,90,1014,208))
 if not c.img('logo',(130,250,950,610)):
  c.text((540,390),'Hidden',120,900);c.text((540,505),'Word',120,900)
 c.button((130,925,950,1115),'PLAY · LEVEL 1')
 c.button((325,1210,755,1330),'Levels',False)
 c.box((250,1430,830,1630),'paper',30,'line',2)
 c.text((540,1490),'LEVEL 1 READY',36,900)
 # Neutral empty-slot motif uses the freed space without previewing level art or phrase text.
 for i in range(8):
  xx=322+i*55;c.box((xx,1545,xx+42,1595),'mint' if i in [1,5] else 'paper',9,'line',2)

def phrase(c,mode='empty'):
 rows=[['YOUR','DOOR','IS'],['ALWAYS','OPEN']]; idx=0; targets={}
 for r,words in enumerate(rows):
  sw,sh,gap,wgap=66,82,9,32; roww=sum(len(w)*sw+(len(w)-1)*gap for w in words)+(len(words)-1)*wgap; x=(1080-roww)/2;y=270+r*102
  for word in words:
   for ch in word:
    filled=mode=='complete' or(mode=='fly' and idx in [0,2,3,4,7,8])
    b=(x,y,x+sw,y+sh)
    if not c.img('slot_filled' if filled else 'slot_empty',b):c.box(b,'mint' if filled else 'paper',13,'line',2)
    if filled:c.text((x+sw/2,y+sh/2),ch,48,900)
    targets[idx]=(x+sw/2,y+sh/2)
    idx+=1;x+=sw+gap
   x+=wgap-gap
 return targets

def banner(c):
 # Reserved mobile banner strip, shown in proofs as a grey 320x50 ad-safe box.
 y=1845
 c.box((380,y,700,y+50),'line',10,'muted',2)
 c.text((540,y+25),'Banner 320x50',22,800,'muted')

def game(c,hearts=False,fly=False):
 # New gameplay HUD: level left, optional hearts after it, counter centre, settings right.
 c.text((50,112),'Level 1',42,900,anchor='lm')
 if hearts:
  for i in range(3):c.heart(260+i*58,88,48,i==2)
 c.box((440,70,640,157),'ink',40);c.text((540,114),'6 / 20' if fly else '0 / 20',38,900,'paper')
 c.icon('settings',(900,55,1030,185))
 targets=phrase(c,'fly' if fly else 'empty')
 c.scene((32,485,1048,1610),True,exclude=[0,1,2,3,4,7,8] if fly else [])
 c.icon('hint',(435,1635,645,1805))
 banner(c)
 if fly:
  tx,ty=targets[1];start=(411,1030);end=(tx,ty);pts=[]
  for i in range(40):
   t=i/39; xx=(1-t)**2*start[0]+2*(1-t)*t*1050+t*t*end[0];yy=(1-t)**2*start[1]+2*(1-t)*t*520+t*t*end[1];pts.append((xx,yy))
  for j in range(0,len(pts)-2,3):c.d.line(pts[j:j+2],fill=c.col('gold'),width=7)
  x,y=pts[18]
  if c.colour and (ROOT/'game/assets/cozy_porch_fake/L01_O.png').exists():
   cut=Image.open(ROOT/'game/assets/cozy_porch_fake/L01_O.png').convert('RGBA');cut=ImageOps.contain(cut,(92,110),Image.Resampling.LANCZOS);c.im.alpha_composite(cut,(int(x-cut.width/2),int(y-cut.height/2)));c.d=ImageDraw.Draw(c.im)
  else:c.text((x,y),'O',72,900)
  c.box((tx-38,ty-46,tx+38,ty+46),'paper',15,'gold',6)
  c.d.ellipse((start[0]-35,start[1]-35,start[0]+35,start[1]+35),outline=c.col('gold'),width=5)
  if not c.colour:
   c.box((95,1440,985,1565),'paper',22,'line',2);c.text((540,1480),'O to first empty O slot',34,800);c.text((540,1525),'Next tap remains active',30,600,'muted')
 return targets

def levels(c):
 c.icon('home',(45,80,150,185));c.text((540,135),'Levels',62,900);c.text((960,135),'2 / 6',32,800,'muted')
 cards=[('1','YOUR DOOR IS','ALWAYS OPEN',True),('2','A QUIET','MORNING',True),('3','', '',False),('4','','',False),('5','','',False),('6','','',False)]
 for i,(num,line1,line2,done) in enumerate(cards):
  x=55+(i%2)*505;y=260+(i//2)*525
  c.box((x,y,x+465,y+480),'paper',29,'line',3);c.scene((x+12,y+12,x+453,y+342),False)
  c.box((x+25,y+25,x+120,y+110),'paper',26);c.text((x+72,y+68),num,42,900)
  if done:
   c.box((x+350,y+25,x+435,y+110),'mint',42);c.d.line([(x+373,y+67),(x+388,y+82),(x+414,y+50)],fill=c.col('ink'),width=6,joint='curve')
   c.text((x+232,y+390),line1,29,900);c.text((x+232,y+430),line2,29,900)
  else:c.text((x+232,y+411),'Level '+num,38,800)
 if not c.colour:c.text((540,1875),'Top-left home returns to the menu',28,600,'muted')

def perfect(c):
 if not c.img('ribbon_perfect',(60,145,1020,460)):
  c.box((100,210,980,405),'gold',40);c.text((540,310),'Perfect',110,900)
 c.box((125,500,955,1305),'paper',32);c.scene((143,518,937,1287),False)
 c.text((540,1385),'YOUR DOOR IS',55,900);c.text((540,1455),'ALWAYS OPEN',55,900)
 c.button((125,1635,955,1815),'Next Level')

def settings(c):
 # In-game settings now owns hearts/sound and explicit Main menu/Admin actions.
 game(c);c.shade();c.panel((55,260,1025,1710));c.text((540,375),'Settings',65,900);c.glyph('close',930,365,40)
 for i,(title,sub,on) in enumerate([('Can / Hearts','3 hearts when enabled',False),('Sound','Game sounds',True)]):
  y=545+i*190;c.text((135,y),title,43,800,anchor='lm');c.text((135,y+55),sub,27,600,'muted','lm')
  c.box((800,y-40,950,y+42),'mint' if on else 'line',42); cx=905 if on else 845;c.d.ellipse((cx-32,y-32,cx+32,y+32),fill=c.col('paper'));c.text((875,y+78),'ON' if on else 'OFF',24,800,'muted')
 c.button((135,970,505,1090),'Main menu',False);c.button((575,970,945,1090),'Admin',False)
 c.d.line((135,1200,945,1200),fill=c.col('line'),width=2);c.text((540,1290),'Reset progress',40,800,'danger');c.button((190,1430,890,1570),'Done')

def admin(c):
 game(c);c.shade();c.panel((75,260,1005,1740));c.text((540,365),'Admin',65,900);c.glyph('close',910,350,40)
 for i,txt in enumerate(['Restart level','Reveal all letters','Solve level']):c.button((145,475+i*145,935,590+i*145),txt,False)
 c.button((145,940,520,1065),'Previous',False);c.button((560,940,935,1065),'Next',False)
 c.text((145,1160),'Level picker',33,800,anchor='lm');c.box((145,1200,935,1310),'white',24,'line',2);c.text((185,1255),'1 · Cozy porch',36,700,anchor='lm');c.d.line([(865,1248),(880,1263),(895,1248)],fill=c.col('ink'),width=5,joint='curve')
 c.box((145,1370,935,1480),'white',24,'line',2);c.text((185,1425),'Banner placeholder',34,800,anchor='lm');c.text((780,1425),'on / off',30,800,'muted',anchor='mm')
 c.text((540,1540),'Banner slot is reserved at the bottom of gameplay',27,600,'muted')

FUNCTIONS=[('01_main_menu',home),('02_level_list',levels),('03_game_screen',game),('04_letter_flying',lambda c:game(c,fly=True)),('05_perfect',perfect),('06_settings',settings),('07_admin_popup',admin),('08_game_hearts_on',lambda c:game(c,hearts=True))]
if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 for n,fn in FUNCTIONS:
  for colour in [False,True]:
   c=Canvas(colour);fn(c);c.save(n[:2]+'b_'+n[3:]+'_colour.png' if colour else n+'_wire.png')
 print('Rendered 16 screens at 1080x1920')
