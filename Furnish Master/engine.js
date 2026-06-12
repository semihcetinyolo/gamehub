/* ---------- World: a sceneW x sceneH canvas inside a viewport, with fit + zoom + pan ---------- */
function makeWorld(viewport, world, opts={}){
  let W = opts.W ?? 1402, H = opts.H ?? 1122;
  const minZoom = opts.minZoom ?? 1, maxZoom = opts.maxZoom ?? 3.4;
  const vAnchor = opts.vAnchor ?? 0.5;   // 0=top, .5=center — where the scene sits when it's shorter than the viewport
  const initZoom = opts.initZoom ?? 1;   // default zoom (1 = fit; >1 opens a bit zoomed-in)
  const hMargin = opts.hMargin ?? 0;     // when fitRect is set: side margin fraction (e.g. .03 = 3%)
  let fitRect = opts.fitRect || null;    // {x,y,w,h} in world coords: fit THIS to the width, centered on it
  let fit=1, zoom=initZoom, S=1, panX=0, panY=0;
  const listeners=[];
  function vpRect(){ return viewport.getBoundingClientRect(); }
  function apply(){ world.style.transform=`translate(${panX}px,${panY}px) scale(${S})`; listeners.forEach(f=>f()); }
  function clampPan(){
    if(fitRect) return;                  // free pan; layout re-centers on the rect
    const r=vpRect(), cw=W*S, ch=H*S, m=Math.min(r.width,r.height)*0.25;
    panX = cw<=r.width ? (r.width-cw)/2 : Math.min(m, Math.max(r.width-cw-m, panX));
    panY = ch<=r.height? (r.height-ch)*vAnchor: Math.min(m, Math.max(r.height-ch-m, panY));
  }
  function layout(){ const r=vpRect();
    if(fitRect){ fit = r.width*(1-2*hMargin)/fitRect.w; S=fit*zoom;
      panX = r.width/2 - (fitRect.x+fitRect.w/2)*S;
      panY = r.height/2 - (fitRect.y+fitRect.h/2)*S; apply(); return; }
    fit=Math.min(r.width/W, r.height/H); S=fit*zoom;
    panX=(r.width-W*S)/2; panY=(r.height-H*S)*vAnchor; clampPan(); apply(); }
  function setSize(w,h){ W=w; H=h; world.style.width=w+'px'; world.style.height=h+'px'; layout(); }
  function setFitRect(rect){ fitRect=rect; layout(); }
  function screenToWorld(cx,cy){ const r=vpRect(); return {x:(cx-r.left-panX)/S, y:(cy-r.top-panY)/S}; }
  // when zoomed IN past fit, keep the room covering the viewport (free pan, clamped — no rubber-band)
  function clampRoom(){ const r=vpRect();
    const rx0=fitRect.x*S, rx1=(fitRect.x+fitRect.w)*S, ry0=fitRect.y*S, ry1=(fitRect.y+fitRect.h)*S;
    panX = (rx1-rx0)>=r.width ? Math.min(-rx0, Math.max(r.width-rx1, panX)) : r.width/2-(rx0+rx1)/2;
    panY = (ry1-ry0)>=r.height ? Math.min(-ry0, Math.max(r.height-ry1, panY)) : r.height/2-(ry0+ry1)/2; }
  function setZoom(nz,fcx,fcy){ const r=vpRect(); nz=Math.max(minZoom,Math.min(maxZoom,nz));
    if(fcx==null){fcx=r.left+r.width/2;fcy=r.top+r.height/2;}
    const fwx=(fcx-r.left-panX)/S, fwy=(fcy-r.top-panY)/S;
    zoom=nz; S=fit*zoom; panX=fcx-r.left-fwx*S; panY=fcy-r.top-fwy*S;
    if(fitRect){ if(zoom<=1.03){ const rp=restPan(); panX=rp.x; panY=rp.y; } else clampRoom(); } else clampPan();
    apply(); }
  function zoomBy(f,fcx,fcy){ setZoom(zoom*f,fcx,fcy); }
  function reset(){ zoom=initZoom; layout(); }

  const pts=new Map(); let pinch=null, panActive=false, last=null, suppress=false, raw=null, retRAF=0;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  // rubber-band: when fitRect, the scene is tethered to its centred rest position
  function restPan(){ const r=vpRect(); return fitRect
    ? {x:r.width/2-(fitRect.x+fitRect.w/2)*S, y:r.height/2-(fitRect.y+fitRect.h/2)*S} : {x:panX,y:panY}; }
  function rubber(d){ const max=vpRect().width*0.14; return max*Math.tanh(d/max); }   // resists, caps ~14% pull
  function stopReturn(){ if(retRAF){cancelAnimationFrame(retRAF); retRAF=0;} }
  function snapBack(){ stopReturn(); const rp=restPan(), sx=panX, sy=panY, t0=performance.now(), dur=300;
    (function step(now){ const t=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-t,3);   // ease-out, no overshoot/wobble
      panX=sx+(rp.x-sx)*e; panY=sy+(rp.y-sy)*e; apply();
      retRAF = t<1 ? requestAnimationFrame(step) : 0; })(t0); }
  viewport.addEventListener('pointerdown',e=>{
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){ const a=[...pts.values()]; pinch={d:dist(a[0],a[1]),zoom}; panActive=false; suppress=true; return; }
    if(e.target.closest('.draggable,.ctl,button,.palette,input,#panel')) return;
    if(fitRect){ panActive=true; raw={x:0,y:0}; last={x:e.clientX,y:e.clientY}; stopReturn(); try{viewport.setPointerCapture(e.pointerId);}catch(_){} return; }
    if(W*S<=vpRect().width+1 && H*S<=vpRect().height+1) return;
    panActive=true; last={x:e.clientX,y:e.clientY}; try{viewport.setPointerCapture(e.pointerId);}catch(_){}
  });
  viewport.addEventListener('pointermove',e=>{
    if(pts.has(e.pointerId)) pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch && pts.size>=2){ const a=[...pts.values()]; const nd=dist(a[0],a[1]);
      setZoom(pinch.zoom*(nd/pinch.d),(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2); return; }
    if(!panActive) return;
    if(fitRect){
      if(zoom<=1.03){ raw.x+=e.clientX-last.x; raw.y+=e.clientY-last.y;   // at fit: rubber-band tether
        const rp=restPan(); panX=rp.x+rubber(raw.x); panY=rp.y+rubber(raw.y); }
      else { panX+=e.clientX-last.x; panY+=e.clientY-last.y; clampRoom(); }  // zoomed in: free pan to explore
      last={x:e.clientX,y:e.clientY}; apply(); }
    else { panX+=e.clientX-last.x; panY+=e.clientY-last.y; last={x:e.clientX,y:e.clientY}; clampPan(); apply(); }
  });
  function end(e){ pts.delete(e.pointerId); if(pts.size<2)pinch=null;
    if(pts.size===0){ const wasPan=panActive; panActive=false; suppress=false; if(wasPan&&fitRect&&zoom<=1.03) snapBack(); } }
  viewport.addEventListener('pointerup',end); viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('wheel',e=>{ e.preventDefault(); zoomBy(e.deltaY<0?1.12:1/1.12,e.clientX,e.clientY); },{passive:false});
  window.addEventListener('resize',layout);

  return { layout, setSize, setFitRect, reset, setZoom, zoomBy, screenToWorld,
    onChange(f){listeners.push(f);},
    get zoom(){return zoom;}, get S(){return S;}, get W(){return W;}, get H(){return H;},
    get suppressed(){return suppress||pts.size>=2;} };
}

/* ---------- helpers ---------- */
function loadImage(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

/* ---------- IndexedDB key/value (passes generated assets between creator & game) ---------- */
const Store = (()=>{ let dbp=null;
  function open(){ if(dbp)return dbp; dbp=new Promise((res,rej)=>{ const r=indexedDB.open('furnish_master',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); return dbp; }
  return {
    async get(k){ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction('kv').objectStore('kv').get(k); t.onsuccess=()=>res(t.result); t.onerror=()=>rej(t.error); }); },
    async set(k,v){ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite').objectStore('kv').put(v,k); t.onsuccess=()=>res(); t.onerror=()=>rej(t.error); }); },
    async del(k){ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite').objectStore('kv').delete(k); t.onsuccess=()=>res(); t.onerror=()=>rej(t.error); }); }
  };
})();

/* ---------- Auto-segment an item sheet: cut every item out of the white, like die-cut stickers ----------
   Returns [{id, dataURL, w, h, area}]. White/soft-shadow detection + flood fill from the borders,
   connected-component labelling, then a 1px edge erosion for clean sticker edges. */
function segmentSheet(img, opts={}){
  const whiteMax = opts.whiteMax ?? 224;   // brightness considered "paper"
  const whiteSat = opts.whiteSat ?? 18;    // low saturation considered neutral (paper/shadow)
  const W=img.naturalWidth, H=img.naturalHeight, N=W*H;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d', {willReadFrequently:true}); ctx.drawImage(img,0,0);
  const px=ctx.getImageData(0,0,W,H).data;
  const isPaper=(p)=>{ const o=p*4, a=px[o+3]; if(a<24) return true;
    const r=px[o],g=px[o+1],b=px[o+2], mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    return mx>=whiteMax && (mx-mn)<=whiteSat; };
  // flood fill paper from all borders -> background
  const bg=new Uint8Array(N); const st=[];
  const seed=(x,y)=>{ const p=y*W+x; if(!bg[p] && isPaper(p)){ bg[p]=1; st.push(p);} };
  for(let x=0;x<W;x++){ seed(x,0); seed(x,H-1); } for(let y=0;y<H;y++){ seed(0,y); seed(W-1,y); }
  while(st.length){ const p=st.pop(), x=p%W, y=(p/W)|0;
    if(x>0)seed(x-1,y); if(x<W-1)seed(x+1,y); if(y>0)seed(x,y-1); if(y<H-1)seed(x,y+1); }
  // label foreground (8-connectivity)
  const lab=new Int32Array(N); let next=0; const comps=[];
  for(let p0=0;p0<N;p0++){ if(bg[p0]||lab[p0]) continue; next++;
    let minx=W,miny=H,maxx=0,maxy=0,area=0; const s=[p0]; lab[p0]=next;
    while(s.length){ const p=s.pop(), x=p%W, y=(p/W)|0; area++;
      if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
        const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; const q=ny*W+nx;
        if(!bg[q]&&!lab[q]){ lab[q]=next; s.push(q); } } }
    comps.push({id:next,minx,miny,maxx,maxy,area}); }
  const minArea=Math.max(400, N*0.0006);
  let items=comps.filter(c=>c.area>=minArea && (c.maxx-c.minx)>10 && (c.maxy-c.miny)>10);
  items.sort((a,b)=> (a.miny-b.miny)||(a.minx-b.minx));
  // build sprite canvases with 1px erosion (drop the anti-aliased rim)
  const out=[];
  items.forEach((c,idx)=>{
    const w=c.maxx-c.minx+1, h=c.maxy-c.miny+1;
    const sc=document.createElement('canvas'); sc.width=w; sc.height=h;
    const sctx=sc.getContext('2d'); const sd=sctx.createImageData(w,h); const sp=sd.data;
    for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++){
      const gx=c.minx+xx, gy=c.miny+yy, gp=gy*W+gx, sidx=(yy*w+xx)*4;
      if(lab[gp]===c.id){
        // erosion: transparent if any 4-neighbour is background/other
        const edge = (gx>0&&lab[gp-1]!==c.id) || (gx<W-1&&lab[gp+1]!==c.id) ||
                     (gy>0&&lab[gp-W]!==c.id) || (gy<H-1&&lab[gp+W]!==c.id);
        if(edge){ sp[sidx+3]=0; }
        else { const o=gp*4; sp[sidx]=px[o]; sp[sidx+1]=px[o+1]; sp[sidx+2]=px[o+2]; sp[sidx+3]=255; }
      } else sp[sidx+3]=0;
    }
    sctx.putImageData(sd,0,0);
    out.push({id:'item_'+idx, dataURL:sc.toDataURL('image/png'), w, h, sx:c.minx, sy:c.miny, area:c.area});
  });
  return out;
}

/* ---------- Discover individual item images (items_*.png) in a level folder ----------
   Uses the dev server's directory listing. Returns sprites {id:{src,w,h}} keyed by filename stem. */
async function loadItemFiles(dir){
  let names=[];
  try{
    const html = await (await fetch(dir+'/')).text();
    const re = /href="(items_[^"]+\.(?:png|jpg|jpeg|webp))"/gi; let m;
    while((m=re.exec(html))) names.push(decodeURIComponent(m[1]));
  }catch(e){}
  names = [...new Set(names)].sort();
  const sprites={};
  for(const n of names){
    try{ const im=await loadImage(dir+'/'+n);
      sprites[n.replace(/\.[^.]+$/,'')] = {src:dir+'/'+n, w:im.naturalWidth, h:im.naturalHeight}; }catch(e){}
  }
  return sprites;
}

/* ---------- Load item sprites straight from a known id list (id -> <id>.png) ----------
   Works on any static host (no directory listing needed). Returns {id:{src,w,h}}. */
async function loadItemsById(dir, ids){
  const sprites={};
  for(const id of [...new Set(ids)]){
    if(sprites[id]) continue;
    try{ const im=await loadImage(dir+'/'+id+'.png');
      sprites[id] = {src:dir+'/'+id+'.png', w:im.naturalWidth, h:im.naturalHeight}; }catch(e){}
  }
  return sprites;
}

/* ---------- Build a level from a level folder: cut scene + load item images + optional placements ---------- */
async function buildDefaultLevel(dir){
  const sc = await prepScene(dir+'/scene.png');
  let placements = null;
  try { const r = await fetch(dir+'/level.json'); if(r.ok) placements = await r.json(); } catch(e){}
  // Prefer building sprites directly from the placement ids (each id maps to
  // "<id>.png") — this works on any static host. Fall back to scanning the
  // directory listing only when there are no placements to go by.
  const ids = (placements && placements.items) ? placements.items.map(it=>it.id) : [];
  const sprites = ids.length ? await loadItemsById(dir, ids) : await loadItemFiles(dir);
  return { dir, scene:sc.dataURL, sceneW:sc.w, sceneH:sc.h, sprites,
    box: (placements&&placements.box) || {x:Math.round(sc.w*0.74), y:Math.round(sc.h*0.76), w:150},
    items: (placements&&placements.items) || [] };
}

/* ---------- Strip a flat white background from a scene image (room floats on app bg) ---------- */
function cutBackground(img, opts={}){
  const whiteMax=opts.whiteMax??242, whiteSat=opts.whiteSat??14;
  const W=img.naturalWidth, H=img.naturalHeight, N=W*H;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
  const id=ctx.getImageData(0,0,W,H), px=id.data;
  const isPaper=p=>{ const o=p*4, a=px[o+3]; if(a<24) return true;
    const r=px[o],g=px[o+1],b=px[o+2], mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    return mx>=whiteMax && (mx-mn)<=whiteSat; };
  const bg=new Uint8Array(N), st=[];
  const seed=(x,y)=>{ const p=y*W+x; if(!bg[p]&&isPaper(p)){ bg[p]=1; st.push(p);} };
  for(let x=0;x<W;x++){ seed(x,0); seed(x,H-1); } for(let y=0;y<H;y++){ seed(0,y); seed(W-1,y); }
  while(st.length){ const p=st.pop(), x=p%W, y=(p/W)|0;
    if(x>0)seed(x-1,y); if(x<W-1)seed(x+1,y); if(y>0)seed(x,y-1); if(y<H-1)seed(x,y+1); }
  for(let p=0;p<N;p++){ if(bg[p]) px[p*4+3]=0; }
  ctx.putImageData(id,0,0);
  return {dataURL:cv.toDataURL('image/png'), w:W, h:H};
}
async function prepScene(src){ const im=await loadImage(src); return cutBackground(im); }

/* ---------- Isometric open cardboard box (crisp at any zoom) ---------- */
function boxSVG(open=true){
  const flaps = open ? `
    <polygon points="30,80 100,45 92,16 22,51" fill="#ecca8e" stroke="#b9893f" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="100,45 170,80 178,51 108,16" fill="#e3bd76" stroke="#b9893f" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="30,80 100,115 104,150 34,115" fill="#d8ad63" stroke="#b9893f" stroke-width="2" stroke-linejoin="round" opacity=".95"/>
    <polygon points="100,115 170,80 166,115 96,150" fill="#cfa257" stroke="#b9893f" stroke-width="2" stroke-linejoin="round" opacity=".95"/>` : '';
  const interior = open ? `
    <polygon points="100,45 170,80 100,115 30,80" fill="#6b4a25"/>
    <ellipse cx="100" cy="78" rx="47" ry="20" fill="#f2ead7"/>
    <ellipse cx="84" cy="73" rx="20" ry="9" fill="#fbf6ea"/>
    <ellipse cx="118" cy="82" rx="18" ry="8" fill="#fbf6ea"/>` : '';
  return `<svg viewBox="0 0 200 210" width="100%" height="100%" style="overflow:visible">
    <ellipse cx="100" cy="188" rx="74" ry="20" fill="rgba(40,40,30,.18)"/>
    ${flaps}
    <polygon points="100,115 170,80 170,150 100,185" fill="#c99a4f" stroke="#a37c3f" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="30,80 100,115 100,185 30,150" fill="#dcb066" stroke="#a37c3f" stroke-width="2.5" stroke-linejoin="round"/>
    ${interior}
    <path d="M125 108 L150 122 L150 134 L125 120 Z" fill="#fff" opacity=".75"/>
    <path d="M134 116 l10 6 M132 124 l14 8" stroke="#b9893f" stroke-width="2" opacity=".6"/>
  </svg>`;
}
