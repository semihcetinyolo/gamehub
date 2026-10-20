"""Render the staged geometry as exact vector comparisons, not generated artwork."""
import html
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from make_maps import region_polys

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/geometry-pilot'
NOTES={
 'lotus':'Yaprak uçları ve üst üste gelen yaprak sınırları yeniden kuruldu.',
 'heart':'Yapraklardaki çentikler kaldırıldı; karşılıklı yaprakların biçimi korundu.',
 'moon':'Hilal ve yıldız uçları geri getirildi; fazla yaklaşan arka plan çizgileri sadeleştirildi.',
 'rosewindow':'Dıştaki dairelerin çentikleri giderildi; iç motif eş aralıklarla yeniden kuruldu.',
 'snowflake':'Kar tanesinin dalları ve karşılıklı köşeleri özgün biçimine döndürüldü.',
 'kaleido':'Altı yaprağın ve çevredeki baklavaların simetrisi geri getirildi.',
 'medallion':'Düz yıldız kenarları ve düzenli iç halkalar geri getirildi.',
 'motif_carouselhorse':'Baş, boyun ve bacak eğrilerindeki yapay kırıklar giderildi; göz çevresine boşluk açıldı.',
 'story_swan':'Boyun ve gövde eğrileri düzeltildi; göz ile baş sınırı ayrıştırıldı.',
 'motif_elephant':'Kulak ve hortumun doğal eğrileri korundu; bacak başlangıçları eşit ölçüde düzenlendi.',
}
DETAILS={
 'lotus':[2.5,5.1,7,6], 'heart':[2.5,5.0,7,6.8], 'moon':[.9,1.9,6.4,4],
 'rosewindow':[.6,1.8,10.8,4.5], 'snowflake':[1.5,1,9,9],
 'kaleido':[1.5,3.5,9,9], 'medallion':[1.5,3.5,9,9],
 'motif_carouselhorse':[5.8,3.5,4.8,5.4], 'story_swan':[4.4,2.5,5.8,6.6],
 'motif_elephant':[1.2,4.8,10,9.2],
}


def svg(level, colored=False):
    m=level['map'];pal=level['palette'];sol=level['solution']
    s=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {m["cols"]} {m["rows"]}">'
    s+=''.join(f'<path d="{d}" fill="{pal[sol[i]] if colored else "#f1eedf"}" fill-rule="evenodd"/>' for i,d in enumerate(m['paths']))
    s+=f'<path d="{m["edgePath"]}" fill="none" stroke="#344139" stroke-width=".026" stroke-linejoin="round"/>'
    s+=f'<path d="{m["shape"]}" fill="none" stroke="#344139" stroke-width=".045" stroke-linejoin="round"/></svg>'
    return s


def raster(level,size=(480,640),colored=False,view=None):
    factor=3;w,h=size;im=Image.new('RGB',(w*factor,h*factor),'#efe9d8')
    m=level['map'];x,y,cw,ch=view or (0,0,m['cols'],m['rows'])
    scale=min(w/cw,h/ch)*factor;ox=(w*factor-cw*scale)/2;oy=(h*factor-ch*scale)/2
    xy=lambda pts:[(round((u-x)*scale+ox),round((v-y)*scale+oy)) for u,v in pts]
    for i,p in enumerate(region_polys(m)):
        mask=Image.new('L',im.size);d=ImageDraw.Draw(mask)
        d.polygon(xy(p.exterior.coords),fill=255)
        for interior in p.interiors:d.polygon(xy(interior.coords),fill=0)
        im.paste(level['palette'][level['solution'][i]] if colored else '#f1eedf',mask=mask)
    d=ImageDraw.Draw(im)
    for e in m['edges']+m['rim']:
        d.line(xy([e[:2],e[2:4]]),fill='#344139',width=max(2,round(scale*.025)))
    return im.resize(size,Image.Resampling.LANCZOS)


def main():
    rows=json.loads((OUT/'geometry-report.json').read_text());data=[]
    (OUT/'images').mkdir(exist_ok=True)
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',25)
    small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',19)
    overview=Image.new('RGB',(1800,5*540),'#faf7ee');od=ImageDraw.Draw(overview)
    for i,row in enumerate(rows):
        ident=row['id'];before=json.loads((OUT/'before'/f'{ident}.json').read_text());after=json.loads((OUT/'maps'/f'{ident}.json').read_text())
        detail=DETAILS[ident];sx=after['map']['cols']/12;sy=after['map']['rows']/16
        detail=[detail[0]*sx,detail[1]*sy,detail[2]*sx,detail[3]*sy]
        entry={'id':ident,'level':row['level'],'name':row['name'],'note':NOTES[ident],
               'before':before,'after':after,'detail':detail}
        data.append(entry)
        for label,l in [('before',before),('after',after)]:
            (OUT/'images'/f'{ident}-{label}.svg').write_text(svg(l))
        full=Image.new('RGB',(1280,1000),'#faf7ee');fd=ImageDraw.Draw(full)
        fd.text((30,18),f"{row['level']}. Bölüm · {row['name']}",font=font,fill='#233b32')
        for n,(label,l) in enumerate([('ÖNCESİ',before),('SONRASI',after)]):
            fd.text((n*640+30,60),label,font=small,fill='#657167')
            full.paste(raster(l,(600,830)),(n*640+20,100))
        full.save(OUT/'images'/f'{ident}-compare.png')
        x=(i%2)*900;y=(i//2)*540
        od.text((x+20,y+14),f"{row['level']}. {row['name']}",font=font,fill='#233b32')
        for n,(label,l) in enumerate([('ÖNCESİ',before),('SONRASI',after)]):
            od.text((x+n*440+25,y+52),label,font=small,fill='#657167')
            overview.paste(raster(l,(420,440)),(x+n*440+10,y+83))
    overview.save(OUT/'overview.png')
    examples=Image.new('RGB',(1440,3*420),'#faf7ee');ed=ImageDraw.Draw(examples)
    for i,ident in enumerate(['moon','heart','rosewindow']):
        entry=next(r for r in data if r['id']==ident);y=i*420
        ed.text((20,y+10),f"{entry['level']}. {entry['name']}",font=font,fill='#233b32')
        for j,key in enumerate(['before','after']):
            ed.text((j*720+20,y+48),'ÖNCESİ' if j==0 else 'SONRASI',font=small,fill='#657167')
            examples.paste(raster(entry[key],(680,340),view=entry['detail']),(j*720+20,y+75))
    examples.save(OUT/'examples.png')
    page=TEMPLATE.replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('</','<\\/'))
    (OUT/'index.html').write_text(page)
    print('Created index.html, overview.png, examples.png and ten full-size comparison PNGs.')


TEMPLATE=r'''<!doctype html>
<html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartograph — 10 bölüm / öncesi ve sonrası</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f3e9;color:#263c33;font:16px system-ui,-apple-system,sans-serif}header,main{max-width:1450px;margin:auto;padding:24px}header{padding-bottom:12px}h1{font-size:30px;letter-spacing:-1px;margin:8px 0}p{line-height:1.5}.eyebrow{font-size:12px;letter-spacing:2px;color:#69776c}.intro{max-width:900px;color:#617065}button,select{font:inherit;padding:10px 14px;border:1px solid #cdd3c8;border-radius:10px;background:#fffcf5;color:inherit;cursor:pointer}button.active{background:#264d40;color:white;border-color:#264d40}.tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:18px 0}.nav{display:flex;gap:6px;flex-wrap:wrap}.nav button{padding:8px 12px}.nav button.active{background:#264d40;color:white}select{max-width:340px;flex:1}.panels{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{border:1px solid #d9decd;border-radius:16px;overflow:hidden;background:#efe9d8}.label{display:flex;justify-content:space-between;padding:14px 18px;background:#fffcf5;font-size:13px;letter-spacing:1px}.label span{letter-spacing:0;color:#6c786b}.canvas{height:580px;touch-action:none;cursor:grab}.canvas:active{cursor:grabbing}.canvas svg{width:100%;height:100%;display:block}.note{padding:18px 20px;border-left:3px solid #708f7a;background:#eef0e5;margin:20px 0}.foot{font-size:13px;color:#677569}.stats{font-size:13px;color:#657267;margin:10px 0}.zoom{display:flex;align-items:center;gap:8px;margin-left:auto}.zoom input{width:120px}a{color:#275d48}.badge{font-size:12px;background:#e3eadd;border-radius:20px;padding:6px 10px;display:inline-block}@media(max-width:750px){header,main{padding:16px}.canvas{height:420px}.panels{gap:8px}.label{padding:12px 8px;font-size:11px}.label span{display:none}.zoom{margin-left:0}h1{font-size:25px}}
</style>
<header><div class="eyebrow">CARTOGRAPH · GEOMETRİ İNCELEMESİ</div><h1>10 bölüm. Daha temiz çizgiler.</h1>
<p class="intro">Önceki oyun geometrisi ile düzeltilen taslak yan yana. Aynı bölgeyi iki tarafta birlikte yakınlaştırabilir ve sürükleyebilirsin. Çizgi görünümü, girinti ve simetri farklarını renklerden bağımsız gösterir.</p><span class="badge">Pilot çalışma · Ana oyuna uygulanmadı</span></header>
<main><div class="nav" id="nav"></div><div class="tools"><button id="prev" aria-label="Önceki bölüm">←</button><select id="level" aria-label="Bölüm seç"></select><button id="next" aria-label="Sonraki bölüm">→</button><button id="outline" class="active">Çizgiler</button><button id="color">Renkli</button><button id="detail">Detaya bak</button><button id="reset">Tamamını göster</button><label class="zoom">Yakınlaştır <input id="zoom" type="range" min="1" max="6" step=".1" value="1"><span id="zlabel">1×</span></label></div>
<div class="panels"><section class="panel"><div class="label">ÖNCESİ <span id="oldcount"></span></div><div class="canvas" id="before"></div></section><section class="panel"><div class="label">SONRASI <span id="newcount"></span></div><div class="canvas" id="after"></div></section></div>
<p id="note" class="note"></p><p class="stats" id="stats"></p><p class="foot">Bölüm numaraları bu pilot hazırlanırken oyunda görünen sıradır. Görseller doğrudan bölüm yollarından çizilir. Yeni vitraylar, geometri seçimi kesinleşince bu çizgilere göre yenilenecek.</p><p class="foot"><a href="overview.png">10 bölümün toplu karşılaştırması</a> · <a id="download" href="">Bu bölümün büyük karşılaştırması</a> · <a href="examples.png">Gönderdiğin üç örneğin yakın planı</a></p></main>
<script>
const data=__DATA__;
let index=0,colored=false,view=null,drag=null;
const $=id=>document.getElementById(id);
data.forEach((l,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${l.level}. ${l.name}`;$('level').append(o);const b=document.createElement('button');b.textContent=l.level;b.title=l.name;b.onclick=()=>select(i);$('nav').append(b)});
function panel(level){const m=level.map;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.cols} ${m.rows}">${m.paths.map((p,i)=>`<path d="${p}" fill="${colored?level.palette[level.solution[i]]:'#f1eedf'}" fill-rule="evenodd"/>`).join('')}<path d="${m.edgePath}" fill="none" stroke="#344139" stroke-width=".026" stroke-linejoin="round"/><path d="${m.shape}" fill="none" stroke="#344139" stroke-width=".045" stroke-linejoin="round"/></svg>`}
function paint(){const d=data[index];$('before').innerHTML=panel(d.before);$('after').innerHTML=panel(d.after);apply()}
function apply(){for(const id of ['before','after'])$(id).firstElementChild.setAttribute('viewBox',view.join(' '));const z=data[index].after.map.cols/view[2];$('zoom').value=Math.min(6,Math.max(1,z));$('zlabel').textContent=z.toFixed(1)+'×'}
function reset(){const m=data[index].after.map;view=[0,0,m.cols,m.rows];apply()}
function select(i){index=(i+data.length)%data.length;const d=data[index];$('level').value=index;[...$('nav').children].forEach((b,k)=>b.classList.toggle('active',k===index));view=[0,0,d.after.map.cols,d.after.map.rows];paint();$('oldcount').textContent=d.before.map.count+' parça';$('newcount').textContent=d.after.map.count+' parça';$('note').textContent=d.note;const l=d.after.pilot.logic;$('stats').textContent=`Yeni taslak: ${l.startingMoves} kesin başlangıç hamlesi · ${l.toPaint} boyanacak alan · Tek çözüm · Basit eleme ile tamamlanabilir`;$('download').href=`images/${d.id}-compare.png`}
$('prev').onclick=()=>select(index-1);$('next').onclick=()=>select(index+1);$('level').onchange=e=>select(+e.target.value);$('reset').onclick=reset;$('detail').onclick=()=>{view=[...data[index].detail];apply()};
for(const [id,mode] of [['outline',false],['color',true]])$(id).onclick=()=>{colored=mode;$('outline').classList.toggle('active',!mode);$('color').classList.toggle('active',mode);paint()};
$('zoom').oninput=e=>{const m=data[index].after.map,z=+e.target.value,cx=view[0]+view[2]/2,cy=view[1]+view[3]/2;view=[cx-m.cols/z/2,cy-m.rows/z/2,m.cols/z,m.rows/z];apply()};
for(const id of ['before','after']){const el=$(id);el.onpointerdown=e=>{el.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,view:[...view]}};el.onpointermove=e=>{if(!drag)return;const r=el.getBoundingClientRect(),scale=Math.min(r.width/drag.view[2],r.height/drag.view[3]);view=[drag.view[0]-(e.clientX-drag.x)/scale,drag.view[1]-(e.clientY-drag.y)/scale,drag.view[2],drag.view[3]];apply()};el.onpointerup=el.onpointercancel=()=>drag=null;el.onwheel=e=>{e.preventDefault();const factor=e.deltaY>0?1.1:1/1.1,m=data[index].after.map,w=Math.max(m.cols/6,Math.min(m.cols,view[2]*factor)),h=w*m.rows/m.cols;view=[view[0]+(view[2]-w)/2,view[1]+(view[3]-h)/2,w,h];apply()}};
select(0);
</script></html>'''

if __name__=='__main__':main()
