/* ---------- World: a sceneW x sceneH canvas inside a viewport, with fit + zoom + pan ----------
   (trimmed from the Furnish Master engine; just the camera + a couple of helpers) */
function makeWorld(viewport, world, opts={}){
  let W = opts.W ?? 2048, H = opts.H ?? 2048;
  const minZoom = opts.minZoom ?? 1, maxZoom = opts.maxZoom ?? 4;
  let fit=1, zoom=1, S=1, panX=0, panY=0, coverMul=1;
  const listeners=[];
  function vpRect(){ return viewport.getBoundingClientRect(); }
  function apply(){ world.style.transform=`translate(${panX}px,${panY}px) scale(${S})`; listeners.forEach(f=>f()); }
  function clampPan(){   // hard edges: the scene always covers the viewport, no overscroll past its border
    const r=vpRect(), cw=W*S, ch=H*S;
    panX = cw<=r.width ? (r.width-cw)/2 : Math.min(0, Math.max(r.width-cw, panX));
    panY = ch<=r.height? (r.height-ch)/2: Math.min(0, Math.max(r.height-ch, panY));
  }
  function zoomFloor(){ return Math.max(minZoom, coverMul); }   // never zoom out below "cover"
  function layout(){ const r=vpRect(); fit=Math.min(r.width/W, r.height/H);
    coverMul=Math.min(maxZoom, Math.max(1, Math.max(r.width/W, r.height/H)/fit));   // zoom that fills the viewport
    zoom=Math.min(maxZoom, Math.max(zoom, zoomFloor()));                            // keep it covering on resize
    S=fit*zoom; panX=(r.width-W*S)/2; panY=(r.height-H*S)/2; clampPan(); apply(); }
  function cover(){ layout(); zoom=coverMul; S=fit*zoom; const r=vpRect();
    panX=(r.width-W*S)/2; panY=(r.height-H*S)/2; clampPan(); apply(); }   // open filled (no letterbox)
  function setSize(w,h){ W=w; H=h; world.style.width=w+'px'; world.style.height=h+'px'; layout(); }
  function screenToWorld(cx,cy){ const r=vpRect(); return {x:(cx-r.left-panX)/S, y:(cy-r.top-panY)/S}; }
  function worldToScreen(wx,wy){ const r=vpRect(); return {x:r.left+panX+wx*S, y:r.top+panY+wy*S}; }
  function setZoom(nz,fcx,fcy){ const r=vpRect(); nz=Math.max(zoomFloor(),Math.min(maxZoom,nz));
    if(fcx==null){fcx=r.left+r.width/2;fcy=r.top+r.height/2;}
    const fwx=(fcx-r.left-panX)/S, fwy=(fcy-r.top-panY)/S;
    zoom=nz; S=fit*zoom; panX=fcx-r.left-fwx*S; panY=fcy-r.top-fwy*S; clampPan(); apply(); }
  function zoomBy(f,fcx,fcy){ setZoom(zoom*f,fcx,fcy); }
  function reset(){ zoom=1; layout(); }
  // smoothly bring a world point to the viewport centre at (optional) target zoom
  function focus(wx,wy,targetZoom){
    const r=vpRect(); if(targetZoom!=null) zoom=Math.max(zoomFloor(),Math.min(maxZoom,targetZoom)); S=fit*zoom;
    panX=r.width/2 - wx*S; panY=r.height/2 - wy*S; clampPan();
    world.style.transition='transform .5s cubic-bezier(.3,.9,.3,1)'; apply();
    setTimeout(()=>world.style.transition='',520);
  }

  const pts=new Map(); let pinch=null, panActive=false, last=null, suppress=false;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  viewport.addEventListener('pointerdown',e=>{
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){ const a=[...pts.values()]; pinch={d:dist(a[0],a[1]),zoom}; panActive=false; suppress=true; return; }
    if(e.target.closest('.draggable,.ctl,button,.bar,input')) return;
    if(W*S<=vpRect().width+1 && H*S<=vpRect().height+1) return;
    panActive=true; last={x:e.clientX,y:e.clientY}; viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove',e=>{
    if(pts.has(e.pointerId)) pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch && pts.size>=2){ const a=[...pts.values()]; const nd=dist(a[0],a[1]);
      setZoom(pinch.zoom*(nd/pinch.d),(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2); return; }
    if(panActive){ panX+=e.clientX-last.x; panY+=e.clientY-last.y; last={x:e.clientX,y:e.clientY}; clampPan(); apply(); }
  });
  function end(e){ pts.delete(e.pointerId); if(pts.size<2)pinch=null; if(pts.size===0){panActive=false;suppress=false;} }
  viewport.addEventListener('pointerup',end); viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('wheel',e=>{ e.preventDefault(); zoomBy(e.deltaY<0?1.12:1/1.12,e.clientX,e.clientY); },{passive:false});
  window.addEventListener('resize',layout);

  return { layout, setSize, reset, cover, setZoom, zoomBy, focus, screenToWorld, worldToScreen,
    onChange(f){listeners.push(f);},
    get zoom(){return zoom;}, get S(){return S;}, get W(){return W;}, get H(){return H;}, get coverZoom(){return coverMul;},
    get suppressed(){return suppress||pts.size>=2;} };
}

function loadImage(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
