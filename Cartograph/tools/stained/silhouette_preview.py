"""Contact sheets and a zoomable local review of every production geometry/art pair."""
import json,html
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from pilot_preview import raster,svg
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/silhouette-rollout'
rows=json.loads((OUT/'before/manifest.json').read_text());font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
(OUT/'sheets').mkdir(exist_ok=True)
for base in range(0,len(rows),24):
 sheet=Image.new('RGB',(1680,4*420),'#f4efe3');d=ImageDraw.Draw(sheet)
 for j,row in enumerate(rows[base:base+24]):
  info=json.loads((OUT/'maps'/f'{row["id"]}.json').read_text());x=j%6*280;y=j//6*420
  sheet.paste(raster(info,(274,380)),(x+3,y+32));d.text((x+8,y+8),f'{row["level"]}. {info["name"]}',font=font,fill='#273c32')
 sheet.save(OUT/'sheets'/f'geometry-{base//24+1:02}.jpg',quality=92)
print('12 complete geometry sheets saved.')

# Exact line SVGs and existing/new glass images use the same normalized pan/zoom.
(OUT/'review').mkdir(exist_ok=True)
oldtext=(OUT/'before/stained-levels.js').read_text();oldlevels=json.JSONDecoder().raw_decode(oldtext[oldtext.index('['):])[0];oldby={l['id']:l for l in oldlevels};data=[]
for row in rows:
 id=row['id'];before=oldby[id];after=json.loads((OUT/'maps'/f'{id}.json').read_text())
 for label,level in [('before',before),('after',after)]:
  (OUT/'review'/f'{id}-{label}.svg').write_text(svg(level))
  m=level['map'];palette=[c if isinstance(c,str) else c[1] for c in level['palette']]
  givens=level.get('given',level['solution'])
  start=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {m["cols"]} {m["rows"]}">'
  start+=''.join(f'<path d="{path}" fill="{palette[givens[r]] if givens[r]>=0 else "#f1eedf"}" fill-rule="evenodd"/>' for r,path in enumerate(m['paths']))
  start+=f'<path d="{m["edgePath"]}" fill="none" stroke="#344139" stroke-width=".04"/><path d="{m["shape"]}" fill="none" stroke="#344139" stroke-width=".05"/></svg>'
  (OUT/'review'/f'{id}-{label}-start.svg').write_text(start)
 afterpath='art/'+Path(after['image']).name if after['image'].endswith('-silhouette.webp') else '../../'+after['image']
 data.append(dict(id=id,level=row['level'],name=after['name'],hard=row['hard'],before='../../'+before['image'],after=afterpath,oldcount=before['map']['count'],newcount=after['map']['count']))
for base in range(0,len(rows),24):
 sheet=Image.new('RGB',(1440,4*340),'#f4efe3');d=ImageDraw.Draw(sheet)
 for j,row in enumerate(rows[base:base+24]):
  item=data[base+j];source=OUT/item['after'];im=Image.open(source).convert('RGB');im.thumbnail((230,300))
  x=j%6*240;y=j//6*340;sheet.paste(im,(x+(240-im.width)//2,y+34+(300-im.height)//2));d.text((x+5,y+8),f'{row["level"]}. {item["name"]}',font=font,fill='#273c32')
 sheet.save(OUT/'sheets'/f'glass-{base//24+1:02}.jpg',quality=91)
page='''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartograph — önce / sonra</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f5f0e5;color:#273c32;font:16px system-ui}main{max-width:1400px;margin:auto;padding:24px}h1{font-size:30px;margin:8px 0}p{line-height:1.5;color:#657067}.tools{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0;align-items:center}button,select{font:inherit;padding:10px 14px;background:#fffcf5;border:1px solid #bec9b9;border-radius:9px;color:#273c32}button{cursor:pointer}button.active{background:#274f40;color:white}select{max-width:390px}.panels{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{border:1px solid #d5d9ca;border-radius:14px;overflow:hidden;background:#eae4d6}.label{padding:12px 16px;background:#fffcf5;display:flex;justify-content:space-between;font-size:14px}.viewport{height:650px;overflow:hidden;touch-action:none;cursor:grab}.viewport img{width:100%;height:100%;object-fit:contain;display:block;user-select:none;pointer-events:none}.zoom{margin-left:auto}a{color:#275d48}.small{font-size:13px}#hard{color:#a5322d;font-weight:600}@media(max-width:750px){main{padding:14px}.panels{gap:8px}.viewport{height:420px}.label{padding:10px;font-size:12px}.zoom{margin-left:0}h1{font-size:24px}}</style>
<main><span class="small">CARTOGRAPH · 276 BÖLÜM</span><h1>Düzeltilmiş çizgiler ve vitraylar</h1><p>Figür uçlarındaki gereksiz çentikler ve bükülmeler düzeltildi. Arka plan çizgileri sadeleştirildi; tamamlanma görselleri mevcut cam dokularıyla yeni sınırlara uyarlandı. Bölüm sırası ve kedi eğitimi korundu.</p>
<div class="tools"><button id="prev">←</button><select id="level" aria-label="Bölüm"></select><button id="next">→</button><button id="glass" class="active">Vitray</button><button id="lines">Çizgiler</button><button id="start">Başlangıç renkleri</button><button id="reset">Tamamını göster</button><label class="zoom">Yakınlaştır <input id="zoom" type="range" min="1" max="6" step=".1" value="1"></label></div>
<div class="panels"><section class="panel"><div class="label">ÖNCESİ <span id="oldcount"></span></div><div class="viewport" id="left"><img id="before" alt="Önceki bölüm"></div></section><section class="panel"><div class="label">SONRASI <span id="newcount"></span></div><div class="viewport" id="right"><img id="after" alt="Düzeltilmiş bölüm"></div></section></div><p id="hard"></p><p class="small">İki görünüm birlikte yakınlaşır ve sürüklenir. Bölüm numaraları oyundaki sıradır. <a href="comparison.jpg">Seçilmiş bölümlerin önce/sonra karşılaştırması</a></p><details><summary>Tüm bölümlerin toplu görselleri</summary><div id="sheets"></div></details></main>
<script>const data=__DATA__;let index=56,mode='glass',z=1,tx=0,ty=0,drag=null;const $=id=>document.getElementById(id);data.forEach((d,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${d.level}. ${d.name}${d.hard?' · Zor':''}`;$('level').append(o)});function transform(){for(const id of ['before','after'])$(id).style.transform=`translate(${tx*100}%,${ty*100}%) scale(${z})`;$('zoom').value=z}function reset(){z=1;tx=ty=0;transform()}function show(){const d=data[index];$('level').value=index;for(const key of ['before','after'])$(key).src=mode==='glass'?d[key]:`review/${d.id}-${key}${mode==='start'?'-start':''}.svg`;$('oldcount').textContent=d.oldcount+' parça';$('newcount').textContent=d.newcount+' parça';$('hard').textContent=d.hard?'Zor bölüm':'';$('glass').classList.toggle('active',mode==='glass');$('lines').classList.toggle('active',mode==='lines');$('start').classList.toggle('active',mode==='start');transform()}function select(n){index=(n+data.length)%data.length;reset();show()}$('level').onchange=e=>select(+e.target.value);$('prev').onclick=()=>select(index-1);$('next').onclick=()=>select(index+1);$('reset').onclick=reset;$('glass').onclick=()=>{mode='glass';show()};$('lines').onclick=()=>{mode='lines';show()};$('start').onclick=()=>{mode='start';show()};$('zoom').oninput=e=>{z=+e.target.value;transform()};for(const id of ['left','right']){const el=$(id);el.onpointerdown=e=>{el.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,tx,ty}};el.onpointermove=e=>{if(!drag)return;tx=drag.tx+(e.clientX-drag.x)/el.clientWidth;ty=drag.ty+(e.clientY-drag.y)/el.clientHeight;transform()};el.onpointerup=el.onpointercancel=()=>drag=null;el.onwheel=e=>{e.preventDefault();z=Math.max(1,Math.min(6,z*(e.deltaY>0?.9:1.1)));transform()}}for(let i=1;i<=12;i++){const p=document.createElement('p'),n=String(i).padStart(2,'0');p.innerHTML=`${(i-1)*24+1}–${Math.min(i*24,276)}: <a href="sheets/glass-${n}.jpg">Vitraylar</a> · <a href="sheets/geometry-${n}.jpg">Çizgiler</a>`;$('sheets').append(p)}show();</script></html>'''
(OUT/'index.html').write_text(page.replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('</','<\\/')))
selected=['iris','heart','bird','grand_01'];sheet=Image.new('RGB',(960,4*610),'#f4efe3');draw=ImageDraw.Draw(sheet)
for i,id in enumerate(selected):
 item=next(d for d in data if d['id']==id);y=i*610;draw.text((20,y+8),f'{item["level"]}. {item["name"]}',font=font,fill='#273c32')
 for j,key in enumerate(['before','after']):
  im=Image.open(OUT/item[key]).convert('RGB');im.thumbnail((450,540));sheet.paste(im,(j*480+(480-im.width)//2,y+65+(540-im.height)//2));draw.text((j*480+20,y+38),'ÖNCESİ' if j==0 else 'SONRASI',font=font,fill='#657067')
sheet.save(OUT/'comparison.jpg',quality=94)
print('Created review index.html, comparison.jpg and 12 glass sheets.')
