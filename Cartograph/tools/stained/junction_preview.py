"""Review the staged eight-level crossing pilot at game stroke width and zoom."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from make_maps import region_polys
from junction_pilot import OUT, levels, junctions


def palette(level):
    return [p if isinstance(p,str) else p[1] for p in level['palette']]


def raster(level, size, view=None, mode='color'):
    m=level['map'];x,y,cw,ch=view or [0,0,m['cols'],m['rows']]
    w,h=size;aa=3;scale=min(w/cw,h/ch)*aa;ox=(w*aa-cw*scale)/2;oy=(h*aa-ch*scale)/2
    im=Image.new('RGB',(w*aa,h*aa),'#f4f0e4');pal=palette(level)
    xy=lambda cs:[((u-x)*scale+ox,(v-y)*scale+oy) for u,v in cs]
    for r,p in enumerate(region_polys(m)):
        mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
        d.polygon(xy(p.exterior.coords),fill=255)
        for hole in p.interiors:d.polygon(xy(hole.coords),fill=0)
        c=level['given'][r] if mode=='game' else level['solution'][r]
        im.paste(pal[c] if c>=0 and mode!='lines' else '#f1eedf',mask=mask)
    d=ImageDraw.Draw(im)
    for edges,width in [(m['edges'],1.9),(m['rim'],3.5)]:
        for e in edges:d.line(xy([e[:2],e[2:4]]),fill='#3a4234',width=round(width*aa))
    return im.resize(size,Image.Resampling.LANCZOS)


def main():
    before={l['id']:l for l in levels()};rows=json.loads((OUT/'before/manifest.json').read_text());data=[]
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',19)
    small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
    overview=Image.new('RGB',(720,len(rows)*510),'#f8f4e9');draw=ImageDraw.Draw(overview)
    details=[]
    for k,row in enumerate(rows):
        ident=row['id'];old=before[ident];new=json.loads((OUT/'maps'/f'{ident}.json').read_text())
        new['palette']=json.loads((OUT/'art'/Path(new['artMetadata']).name).read_text())['palette']
        old=dict(old,palette=palette(old));new=dict(new,palette=palette(new))
        entry=dict(**row,before=old,after=new,oldImage='../../'+old['image'],newImage='art/'+Path(new['image']).name,
                   joints=new['junctionPilot']['repairs'],logic=new['junctionPilot']['logic'])
        data.append(entry)
        draw.text((20,k*510+10),f'{row["level"]}. {row["name"]}',font=font,fill='#243f32')
        for j,l in enumerate([old,new]):
            draw.text((j*360+20,k*510+40),'ÖNCESİ' if j==0 else 'SONRASI',font=small,fill='#677569')
            overview.paste(raster(l,(320,427)),(j*360+20,k*510+68))
        for n,change in enumerate(entry['joints']):
            p=change['point'];width=max(2.3,new['map']['cols']*.17)
            view=[p[0]-width/2,p[1]-width/2,width,width]
            details.append((entry,n,view))
    overview.save(OUT/'overview.jpg',quality=94)
    for start in range(0,len(details),8):
        chunk=details[start:start+8];sheet=Image.new('RGB',(1280,4*350),'#f8f4e9');d=ImageDraw.Draw(sheet)
        for i,(entry,n,view) in enumerate(chunk):
            x=i%2*640;y=i//2*350
            d.text((x+8,y+8),f'{entry["level"]}. {entry["name"]} · {n+1}   ÖNCE / SONRA',font=small,fill='#243f32')
            for j,key in enumerate(['before','after']):sheet.paste(raster(entry[key],(304,304),view=view),(x+j*320+8,y+36))
        sheet.save(OUT/'review'/f'joints-{start//8+1:02}.jpg',quality=94)
    page=TEMPLATE.replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('</','<\\/'))
    (OUT/'index.html').write_text(page)
    (OUT/'review-data.json').write_text(json.dumps(data,ensure_ascii=False))
    print(f'{len(data)} levels, {len(details)} corrected junction closeups. Review: {OUT / "index.html"}')


TEMPLATE=r'''<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartograph · 8 bölümde net birleşimler</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f8f4e9;color:#263c32;font:16px system-ui}main{max-width:1000px;margin:auto;padding:26px}h1{font-size:30px;letter-spacing:-.8px;margin:8px 0 16px}p{line-height:1.6;color:#617064}.eyebrow{font-size:12px;letter-spacing:2px}.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:18px 0}button,select{font:inherit;color:inherit;background:#fffdf6;border:1px solid #c9d2c3;padding:10px 13px;border-radius:9px}button{cursor:pointer}button.active{background:#284e3c;color:white}select{max-width:340px}.scroll{overflow-x:auto;padding-bottom:8px}.panels{display:flex;gap:20px;justify-content:center;min-width:680px}.panel{width:322px;border:1px solid #d7ddcf;border-radius:12px;overflow:hidden;background:#f4f0e4;flex-shrink:0}.label{padding:12px 15px;background:#fffdf6;font-size:13px;display:flex;justify-content:space-between}.viewport{width:320px;height:427px;touch-action:none;cursor:grab}.viewport svg{width:100%;height:100%;display:block}.status{font-size:13px;padding:12px 16px;background:#eaf0e4;border-radius:9px}.hard{color:#a43430}.note{border-left:3px solid #8ca681;padding-left:16px;font-size:14px}.foot{font-size:13px}a{color:#315e47}.range{display:flex;gap:8px;align-items:center;margin-left:auto}.range input{width:110px}#markersLabel{font-size:13px}.viewport path[data-r]{cursor:pointer}@media(max-width:750px){main{padding:16px}.panels{justify-content:flex-start;gap:12px;min-width:656px}.range{margin-left:0}h1{font-size:26px}}
</style><main>
<div class="eyebrow">CARTOGRAPH · 8 BÖLÜMLÜK DENEME</div><h1>Kesişimler daha okunaklı.</h1>
<p>Dört yönlü birleşimler ayrıldı; aralarında görünen bir kenar bulunan iki T birleşimi oluştu. Önce ve sonrayı aynı noktada yakınlaştırabilirsin.</p>
<div class="tools"><button id="prev">←</button><select id="level" aria-label="Bölüm"></select><button id="next">→</button><span id="hard" class="hard"></span></div>
<div class="tools"><button id="color" class="active">Renkli</button><button id="game">Başlangıç</button><button id="lines">Çizgiler</button><button id="glass">Vitray</button><label id="markersLabel"><input id="markers" type="checkbox"> Değişen noktalar</label></div>
<div class="tools"><select id="joint" aria-label="Düzeltilen birleşim"></select><button id="detail">Yakından bak</button><button id="reset">Normal boyut</button><label class="range">Zoom <input id="zoom" type="range" min="1" max="8" value="1" step=".1"></label></div>
<div class="scroll"><div class="panels"><section class="panel"><div class="label">ÖNCESİ <span id="oldcount"></span></div><div id="before" class="viewport"></div></section><section class="panel"><div class="label">SONRASI <span id="newcount"></span></div><div id="after" class="viewport"></div></section></div></div>
<p id="stats" class="status"></p><p id="selection" class="foot">Bir alana tıklayarak gerçek komşularını vurgulayabilirsin.</p>
<p class="note">Normal boyutta her pano 320 piksel genişliğinde. Çizgiler oyundaki kalınlıkta gösterilir. Yakınlaştırma ve sürükleme iki tarafta birlikte çalışır. Dar ekranlarda ikinci panoya yana kaydırabilirsin.</p>
<p class="foot">Vitraylar mevcut cam dokularıyla yeni sınırlara uyarlandı. <a href="overview.jpg">8 bölümün toplu karşılaştırması</a> · <a href="review/joints-01.jpg">Birleşimlerin yakın planı</a></p></main>
<script>
const data=__DATA__,$=id=>document.getElementById(id);let index=0,mode='color',view,drag=null,selected=null,moved=false;
for(const [i,d] of data.entries()){const o=document.createElement('option');o.value=i;o.textContent=`${d.level}. ${d.name}`;$('level').append(o)}
function picture(l,side){const m=l.map,d=data[index];let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.join(' ')}">`;
if(mode==='glass')s+=`<image href="${side==='before'?d.oldImage:d.newImage}" x="0" y="0" width="${m.cols}" height="${m.rows}"/>`;
else {s+='<defs>';for(let i=0;i<4;i++)s+=`<pattern id="${side}-s${i}" width=".24" height=".24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".065" height=".24" fill="#000" opacity=".18"/></pattern>`;s+='</defs>';
s+=m.paths.map((p,r)=>{const c=mode==='game'?l.given[r]:l.solution[r];let fill=mode==='lines'||c<0?'#f1eedf':l.palette[c];if(selected!==null)fill=r===selected?'#efc24d':m.adj[selected]?.includes(r)?'#8fb7a5':'#e9e9df';return `<path data-r="${r}" d="${p}" fill="${fill}" fill-rule="evenodd"/>${mode==='game'&&c>=0&&selected===null?`<path d="${p}" fill="url(#${side}-s${c})" fill-rule="evenodd" pointer-events="none"/>`:''}`}).join('');
s+=`<path d="${m.edgePath}" fill="none" stroke="#3a4234" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" pointer-events="none"/><path d="${m.shape}" fill="none" stroke="#3a4234" stroke-width="3.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" pointer-events="none"/>`;}
if($('markers').checked)for(const j of d.joints)s+=`<circle cx="${j.point[0]}" cy="${j.point[1]}" r="${Math.max(.2,m.cols*.018)}" fill="none" stroke="#c13729" stroke-width="1.7" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
return s+'</svg>'}
function paint(){for(const side of ['before','after'])$(side).innerHTML=picture(data[index][side],side);$('zoom').value=Math.max(1,Math.min(8,data[index].after.map.cols/view[2]));for(const b of ['color','game','lines','glass'])$(b).classList.toggle('active',mode===b)}
function reset(){const m=data[index].after.map;view=[0,0,m.cols,m.rows];selected=null;$('selection').textContent='Bir alana tıklayarak gerçek komşularını vurgulayabilirsin.';paint()}
function select(n){index=(n+data.length)%data.length;const d=data[index];$('level').value=index;$('hard').textContent=d.hard?'Zor bölüm':'';$('oldcount').textContent=d.before.map.count+' parça';$('newcount').textContent=d.after.map.count+' parça';$('joint').innerHTML='';d.joints.forEach((j,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`Birleşim ${i+1} / ${d.joints.length}`;$('joint').append(o)});const l=d.logic;$('stats').textContent=`${d.joints.length} kesişim düzeltildi · ${l.startingMoves} kesin başlangıç · ${l.toPaint} boyanacak alan · Tek çözüm${d.hard?' · İleri çıkarım gerektirir':''}`;reset()}
$('level').onchange=e=>select(+e.target.value);$('prev').onclick=()=>select(index-1);$('next').onclick=()=>select(index+1);
for(const b of ['color','game','lines','glass'])$(b).onclick=()=>{mode=b;selected=null;paint()};$('markers').onchange=paint;$('reset').onclick=reset;
function detail(){const d=data[index],p=d.joints[+$('joint').value].point,m=d.after.map,w=Math.max(2.3,m.cols*.17),h=w*m.rows/m.cols;view=[p[0]-w/2,p[1]-h/2,w,h];selected=null;paint()}
$('detail').onclick=detail;$('joint').onchange=detail;$('zoom').oninput=e=>{const m=data[index].after.map,w=m.cols/(+e.target.value),h=w*m.rows/m.cols;view=[view[0]+(view[2]-w)/2,view[1]+(view[3]-h)/2,w,h];paint()};
for(const side of ['before','after']){const el=$(side);el.onpointerdown=e=>{el.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,view:[...view],region:e.target.dataset.r};moved=false};el.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)<4&&!moved)return;moved=true;const scale=Math.min(el.clientWidth/drag.view[2],el.clientHeight/drag.view[3]);view=[drag.view[0]-dx/scale,drag.view[1]-dy/scale,drag.view[2],drag.view[3]];paint()};el.onpointerup=e=>{if(drag&&!moved&&drag.region!==undefined){selected=selected===+drag.region?null:+drag.region;const d=data[index];$('selection').textContent=selected===null?'Bir alana tıklayarak gerçek komşularını vurgulayabilirsin.':`Sarı: seçilen alan · Yeşil: ortak kenarı olan komşular. Önce: ${d.before.map.adj[selected].length}, sonra: ${d.after.map.adj[selected].length} komşu.`;paint()}drag=null};el.onpointercancel=()=>drag=null;el.onwheel=e=>{e.preventDefault();const m=data[index].after.map,w=Math.max(m.cols/8,Math.min(m.cols,view[2]*(e.deltaY>0?1.12:1/1.12))),h=w*m.rows/m.cols;view=[view[0]+(view[2]-w)/2,view[1]+(view[3]-h)/2,w,h];paint()}}
select(0);
</script></html>'''

if __name__=='__main__':main()
