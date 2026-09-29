// One room boundary, one wall skin. '#' and '*' are the same solid geometry;
// '*' changes its material. Backing tiles never create another visible wall row.
(function(root) {
  const solid = c => c === '#' || c === '*';
  function build(L) {
    if(L.start){
      // Tiny floor pockets sealed behind hazardous masonry are not playable rooms.
      // Include wafers in the flood so rooms opened later keep their floor and walls.
      const reachable=new Set(),queue=[L.start];
      while(queue.length){
        const [x,y]=queue.pop(),key=x+','+y;
        if(x<0||y<0||x>=L.W||y>=L.H||reachable.has(key)||solid(L.cells[y][x]))continue;
        reachable.add(key);queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
      }
      L={...L,cells:L.cells.map((row,y)=>row.map((c,x)=>solid(c)||reachable.has(x+','+y)?c:'#'))};
    }
    const at=(x,y)=>x<0||y<0||x>=L.W||y>=L.H?'#':L.cells[y][x];
    const edges=[];
    for(let y=0;y<L.H;y++)for(let x=0;x<L.W;x++) {
      if(solid(at(x,y)))continue;
      for(const [dx,dy,ax,ay,bx,by] of [[0,-1,x,y,x+1,y],[1,0,x+1,y,x+1,y+1],[0,1,x+1,y+1,x,y+1],[-1,0,x,y+1,x,y]]) {
        const material=at(x+dx,y+dy);
        if(solid(material))edges.push({ax,ay,bx,by,nx:dx,ny:dy,hazard:material==='*',wallX:x+dx,wallY:y+dy});
      }
    }
    // Partition each masonry cell between its exposed faces. Thin pillars and
    // corners share a mitred top surface instead of painting strips over each other.
    const facesByCell=new Map();
    for(const e of edges){const key=e.wallX+','+e.wallY;if(!facesByCell.has(key))facesByCell.set(key,[]);facesByCell.get(key).push(e);}
    for(const e of edges){
      const own=facesByCell.get(e.wallX+','+e.wallY);
      e.region=faceRegion(e,own);
    }
    const starts=new Map();
    for(const e of edges){const k=e.ax+','+e.ay;if(!starts.has(k))starts.set(k,[]);starts.get(k).push(e);}
    const seen=new Set(),loops=[];
    for(const first of edges){
      if(seen.has(first))continue;
      const loop=[];let e=first;
      while(e&&!seen.has(e)){
        loop.push(e);seen.add(e);
        const candidates=(starts.get(e.bx+','+e.by)||[]).filter(q=>!seen.has(q));
        const rank=q=>{const cross=(e.bx-e.ax)*(q.by-q.ay)-(e.by-e.ay)*(q.bx-q.ax);const dot=(e.bx-e.ax)*(q.bx-q.ax)+(e.by-e.ay)*(q.by-q.ay);return cross>0?0:dot>0?1:cross<0?2:3;};
        e=candidates.sort((a,b)=>rank(a)-rank(b))[0];
      }
      loops.push(loop);
    }
    const corners=[];
    for(const loop of loops){
      const area=loop.reduce((sum,e)=>sum+e.ax*e.by-e.bx*e.ay,0);
      for(let i=0;i<loop.length;i++){
        const e=loop[i],prev=loop[(i+loop.length-1)%loop.length];
        e.wallRole=area<0?'inner':'outer';
        const turn=(prev.bx-prev.ax)*(e.by-e.ay)-(prev.by-prev.ay)*(e.bx-e.ax);
        if(turn)corners.push({x:e.ax,y:e.ay,type:turn>0?'inner-corner':'outer-corner',before:prev,after:e,hazard:prev.hazard||e.hazard});
      }
    }
    const parts=[...facesByCell.values()].map(faces=>{
      const first=faces[0],opposite=faces.length===2&&faces[0].nx*faces[1].nx+faces[0].ny*faces[1].ny===-1;
      const type=faces.length===4?'pillar':faces.length===3?'end-cap':faces.length===2?(opposite?'inner-straight':'outer-corner'):first.wallRole+'-straight';
      return {x:first.wallX,y:first.wallY,type,hazard:first.hazard,faces};
    });
    // One-cell masonry shell, including diagonal corner cells. Enclosed solid
    // islands are filled completely; backing outside the room stays hidden.
    const backing=new Set(),pending=[];
    for(let x=0;x<L.W;x++)pending.push([x,0],[x,L.H-1]);
    for(let y=0;y<L.H;y++)pending.push([0,y],[L.W-1,y]);
    while(pending.length){
      const [x,y]=pending.pop(),key=x+','+y;
      if(x<0||y<0||x>=L.W||y>=L.H||backing.has(key)||!solid(at(x,y)))continue;
      backing.add(key);pending.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    const skinCells=[];
    for(let y=0;y<L.H;y++)for(let x=0;x<L.W;x++)if(solid(at(x,y))){
      let exposed=!backing.has(x+','+y);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(!solid(at(x+dx,y+dy)))exposed=true;
      if(exposed)skinCells.push({x,y});
    }
    const skinSet=new Set(skinCells.map(c=>c.x+','+c.y)),skinEdges=[];
    for(const {x,y} of skinCells)for(const [dx,dy,ax,ay,bx,by] of [[0,-1,x,y,x+1,y],[1,0,x+1,y,x+1,y+1],[0,1,x+1,y+1,x,y+1],[-1,0,x,y+1,x,y]])
      if(!skinSet.has((x+dx)+','+(y+dy)))skinEdges.push({ax,ay,bx,by,nx:dx,ny:dy});
    // Carve the visible wall sides into the existing footprint. Weighted mitres
    // let the deeper south/east faces join the shallow north/west bevels cleanly.
    const depthFaces=skinEdges.map(e=>({...e,
      wallX:Math.floor((e.ax+e.bx-e.nx)/2),wallY:Math.floor((e.ay+e.by-e.ny)/2),
      nx:-e.nx,ny:-e.ny,depth:e.ny>0?STYLE.front:e.nx>0?STYLE.side:STYLE.bevel}));
    const depthCells=new Map();
    for(const e of depthFaces){const key=e.wallX+','+e.wallY;if(!depthCells.has(key))depthCells.set(key,[]);depthCells.get(key).push(e);}
    for(const faces of depthCells.values())for(const e of faces)e.region=faceRegion(e,faces);
    return {L,edges,loops,corners,parts,skinCells,skinEdges,depthFaces};
  }
  function faceRegion(e,faces){
    const x=e.wallX,y=e.wallY;
    let polygon=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
    for(const other of faces){
      if(other===e)continue;
      const distance=p=>((p[0]-e.ax)*e.nx+(p[1]-e.ay)*e.ny)/(e.depth||1)-((p[0]-other.ax)*other.nx+(p[1]-other.ay)*other.ny)/(other.depth||1);
      const next=[];
      for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b);
        if(da<=1e-9)next.push(a);
        if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);next.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
      }
      polygon=next;
    }
    return polygon;
  }
  function clipFaces(c,edges,T){
    c.beginPath();
    for(const e of edges){e.region.forEach(([x,y],i)=>i?c.lineTo(x*T,y*T):c.moveTo(x*T,y*T));c.closePath();}
    c.clip();
  }
  function path(c,loops,T) {
    c.beginPath();
    for(const loop of loops){if(!loop.length)continue;c.moveTo(loop[0].ax*T,loop[0].ay*T);for(const e of loop)c.lineTo(e.bx*T,e.by*T);c.closePath();}
  }
  // Shared measurements are in board units, independent of zoom and theme.
  const STYLE=Object.freeze({bevel:.10,front:.34,side:.23,shadowX:.20,shadowY:.32,housing:.58,rail:.44,lip:.035,textureAlpha:.14});
  const HAZARDS={
    spikes: {base:'#343947',hot:'#c9d6e4',core:'#f7fbff'},
    crystal:{base:'#493353',hot:'#cb8ce9',core:'#f6d9ff'},
    fire:   {base:'#4b3031',hot:'#ff873f',core:'#ffe7a0'},
    ice:    {base:'#2c475b',hot:'#83d9f4',core:'#e3fcff'},
    poison: {base:'#374329',hot:'#b6e94b',core:'#efffc0'},
    electric:{base:'#42404b',hot:'#ffda63',core:'#fff8c6'},
    void:   {base:'#352b4b',hot:'#c099f2',core:'#f1dcff'},
    thorns: {base:'#473941',hot:'#d7969f',core:'#ffced3'},
    brine:  {base:'#284b4c',hot:'#65d9c4',core:'#c7fff1'},
    saws:   {base:'#43434a',hot:'#cdd2d9',core:'#fff0c5'},
  };
  const hazardStyle=theme=>theme.hazardStyle||theme.hazardType;
  const palette=theme=>HAZARDS[hazardStyle(theme)]||HAZARDS.spikes;
  function stroke(c,color,width){c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  function runSpace(c,e,T){c.translate(e.ax*T,e.ay*T);c.rotate(Math.atan2(e.by-e.ay,e.bx-e.ax));}
  function skinPath(c,board,T){c.beginPath();for(const {x,y} of board.skinCells)c.rect(x*T,y*T,T,T);}
  function drawFloor(c,board,T,theme,BG) {
    const {L}=board,colors=BG?.colors||theme.floor;
    // Exactly one grid: no multi-stone atlas repeated inside a grid square.
    for(let y=0;y<L.H;y++)for(let x=0;x<L.W;x++)if(!solid(L.cells[y][x])){
      c.fillStyle=colors[0];c.fillRect(x*T,y*T,T+.15,T+.15);
      if((x+y)%2){c.globalAlpha=.38;c.fillStyle=colors[1];c.fillRect(x*T,y*T,T+.15,T+.15);c.globalAlpha=1;}
    }
    c.save();path(c,board.loops,T);c.clip('evenodd');
    c.beginPath();for(let x=0;x<=L.W;x++){c.moveTo(x*T,0);c.lineTo(x*T,L.H*T);}for(let y=0;y<=L.H;y++){c.moveTo(0,y*T);c.lineTo(L.W*T,y*T);}
    stroke(c,'#4e3a5312',Math.max(.5,T*.025));c.restore();
  }
  function draw(c,board,T,theme,Themes,BG) {
    drawFloor(c,board,T,theme,BG);
    // Soft cast shadow, clipped to playable floor. The wall itself never
    // intrudes into a corridor; a one-cell passage retains its full width.
    c.save();path(c,board.loops,T);c.clip('evenodd');
    for(const [spread,alpha] of [[1.3,'09'],[1,'13'],[.65,'15']]){
      c.save();c.translate(T*STYLE.shadowX*spread,T*STYLE.shadowY*spread);
      skinPath(c,board,T);c.fillStyle='#262339'+alpha;c.fill();c.restore();
    }
    path(c,board.loops,T);c.lineJoin='miter';
    stroke(c,'#27223714',T*.20);stroke(c,'#27223722',T*.075);c.restore();
    c.save();skinPath(c,board,T);c.clip();
    c.fillStyle=theme.wall[0];c.fillRect(0,0,board.L.W*T,board.L.H*T);
    c.save();c.globalAlpha=STYLE.textureAlpha;
    Themes.texture?.(c,theme.wallArt,0,0,board.L.W*T,board.L.H*T,T*6);
    c.restore();
    // A single quiet masonry bond. It never restarts at a corner or trap.
    c.beginPath();
    for(let y=0;y<=board.L.H;y++){
      c.moveTo(0,y*T);c.lineTo(board.L.W*T,y*T);
      for(let x=y%2;x<board.L.W;x+=2){c.moveTo(x*T,y*T);c.lineTo(x*T,(y+1)*T);}
    }
    stroke(c,theme.wall[1]+'55',T*.035);
    // One raised cap with directional vertical faces, lit from upper left.
    // All side shading is partitioned by cell; corners are never double-painted.
    for(const e of board.depthFaces){
      c.save();clipFaces(c,[e],T);runSpace(c,e,T);
      const d=e.depth*T,front=e.ny<0,right=e.nx<0;
      const base=mix(theme.wall[1],'#292735',front?.27:right?.14:0);
      const upper=mix(theme.wall[1],theme.wall[0],front?.18:right?.34:.58);
      const face=c.createLinearGradient(0,0,0,d);
      face.addColorStop(0,base);face.addColorStop(.22,theme.wall[1]);face.addColorStop(.85,upper);face.addColorStop(1,upper);
      c.fillStyle=face;c.fillRect(-T*.5,0,T*2,d);
      // A thin ledge separates the lit top from its face; the base stays dark.
      c.beginPath();c.moveTo(-T*.5,d+T*.018);c.lineTo(T*1.5,d+T*.018);
      stroke(c,front||right?'#fff4d97d':'#fff8e9c7',T*.055);
      c.beginPath();c.moveTo(-T*.5,T*.025);c.lineTo(T*1.5,T*.025);stroke(c,'#27233355',T*.045);
      const joint=e.ny!==0?((e.ax+e.ay)%2===0):(e.ay%2===0);
      if(joint&&e.depth>STYLE.bevel){
        c.beginPath();c.moveTo(0,T*.04);c.lineTo(0,d-T*.045);stroke(c,'#29253638',T*.035);
      }
      c.restore();
    }
    c.restore();
    // Hazard rail is an overlay on the SAME stone body. Exact hard endpoints
    // preserve safe/dangerous boundaries; all art stays inside solid geometry.
    for(const e of board.edges)if(e.hazard){
      drawHazardFace(c,e,T,theme,0);
    }
  }
  function mix(a,b,t){
    return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  }
  function railFill(c,T,p){
    const g=c.createLinearGradient(0,-T*(STYLE.rail+.02),0,-T*.08);
    g.addColorStop(0,mix(p.base,'#111523',.65));g.addColorStop(.24,mix(p.base,'#111523',.3));
    g.addColorStop(.75,p.base);g.addColorStop(1,mix(p.base,p.hot,.2));return g;
  }
  function drawHazardFace(c,e,T,theme,time){
    const p=palette(theme),kind=hazardStyle(theme);
    c.save();clipFaces(c,[e],T);runSpace(c,e,T);
    // A raised, bevelled housing and a deep inset share one opaque paint pass.
    // Animated frames redraw the same profile, so neither shadows nor faces vanish.
    const front=e.ny<0||e.nx<0;
    const body=c.createLinearGradient(0,-T*STYLE.housing,0,0);
    body.addColorStop(0,mix(p.base,p.core,.42));
    body.addColorStop(.22,mix(p.base,p.hot,.24));
    body.addColorStop(.68,p.base);
    body.addColorStop(1,mix(p.base,'#111523',front?.65:.4));
    c.fillStyle=body;c.fillRect(-T*.5,-T*STYLE.housing,T*2,T*STYLE.housing);
    // Rear raised lip, recessed channel, and solid front fascia.
    c.fillStyle=mix(p.hot,p.core,.4);c.fillRect(-T*.5,-T*.565,T*2,T*.035);
    c.fillStyle=mix(p.base,'#111523',.5);c.fillRect(-T*.5,-T*.48,T*2,T*.06);
    c.fillStyle=railFill(c,T,p);c.fillRect(-T*.5,-T*STYLE.rail,T*2,T*(STYLE.rail-.10));
    c.fillStyle=mix(p.base,p.hot,.35);c.fillRect(-T*.5,-T*.105,T*2,T*.035);
    // Shadow offsets stay down/right in world space on every wall orientation.
    const dx=e.bx-e.ax,dy=e.by-e.ay;
    drawHazard(c,T,kind,p,e.wallX*17+e.wallY*31,time,{x:.045*dx+.06*dy,y:-.045*dy+.06*dx});
    c.fillStyle=mix(p.hot,p.core,.12);c.fillRect(-T*.5,-T*STYLE.lip,T*2,T*STYLE.lip);
    c.restore();
  }
  function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
  function drawHazard(c,T,kind,p,seed,time,shadow){
    c.save();c.scale(T,T);
    const gradient=(x1,y1,x2,y2,colors)=>{const g=c.createLinearGradient(x1,y1,x2,y2);colors.forEach((color,i)=>g.addColorStop(i/(colors.length-1),color));return g;};
    const dark=mix(p.base,'#0f1421',.55),shade=mix(p.base,p.hot,.3);
    if(kind==='spikes'||kind==='thorns'||kind==='crystal'||kind==='ice'){
      for(const x of [.25,.75]){
        const crystal=kind==='crystal'||kind==='ice',bend=kind==='thorns'?.09:0;
        const shape=crystal?[[x-.18,-.30],[x,-.035],[x+.16,-.29],[x+.04,-.47]]:[[x-.19,-.43],[x+bend,-.035],[x+.19,-.43]];
        c.save();c.translate(shadow.x,shadow.y);polygon(c,shape);c.fillStyle='#101320a8';c.fill();c.restore();
        // Dark sockets hold faceted teeth above the raised rail.
        c.beginPath();c.ellipse(x,-.41,.205,.057,0,0,7);c.fillStyle=dark;c.fill();
        polygon(c,shape);c.fillStyle=gradient(x-.18,-.4,x+.18,-.2,[p.core,p.hot,shade]);c.fill();
        polygon(c,crystal?[[x,-.035],[x+.16,-.29],[x+.04,-.47]]:[[x+bend,-.035],[x+.19,-.43],[x+.015,-.40]]);
        c.fillStyle=gradient(x,-.4,x+.2,-.05,[p.hot,shade,p.base]);c.fill();
        c.beginPath();c.moveTo(x+(crystal?.04:.015),crystal?-.46:-.40);c.lineTo(x+bend,-.055);stroke(c,p.core,.035);
      }
    }else if(kind==='fire'||kind==='poison'||kind==='brine'){
      const fire=kind==='fire',surface=x=>-.265-(fire?.06:.028)*Math.sin(x*Math.PI*4+seed+time*(fire?2:1.5));
      c.beginPath();c.moveTo(0,-.06);
      for(let i=0;i<=24;i++){const x=i/24;c.lineTo(x,surface(x));}
      c.lineTo(1,-.06);c.closePath();
      c.fillStyle=gradient(0,-.33,0,-.04,[p.core,p.hot,mix(p.hot,p.base,.6)]);c.fill();
      // Bright liquid meniscus and a darker vertical edge show actual thickness.
      c.beginPath();for(let i=0;i<=24;i++){const x=i/24;i?c.lineTo(x,surface(x)):c.moveTo(x,surface(x));}stroke(c,p.core,.03);
      c.fillStyle=mix(p.hot,p.base,.55);c.fillRect(0,-.09,1,.04);
      if(fire){
        c.beginPath();c.moveTo(.12,-.13);c.lineTo(.35,-.2);c.lineTo(.55,-.15);c.lineTo(.84,-.22);stroke(c,p.core,.04);
      }else for(const x of [.25,.72]){
        const y=-.27+Math.sin(time*2+seed+x)*.025;
        c.beginPath();c.ellipse(x+.035,y+.04,.105,.045,0,0,7);c.fillStyle=mix(p.hot,p.base,.6);c.fill();
        c.beginPath();c.arc(x,y,.095,0,7);c.fillStyle=gradient(x-.06,y-.08,x+.065,y+.08,[p.core,p.hot,shade]);c.fill();
        c.beginPath();c.arc(x-.025,y-.035,.023,0,7);c.fillStyle=p.core;c.fill();
      }
    }else if(kind==='electric'){
      for(const x of [.08,.80]){
        c.fillStyle=dark;c.fillRect(x+shadow.x,-.40+shadow.y,.13,.30);
        c.fillStyle=gradient(x,-.4,x+.13,-.4,[p.core,p.hot,shade]);c.fillRect(x,-.40,.13,.29);
        for(const y of [-.36,-.25,-.15]){c.fillStyle=p.base;c.fillRect(x,y,.13,.025);}
      }
      c.beginPath();c.moveTo(.22,-.27);c.lineTo(.43,-.36);c.lineTo(.53,-.19);c.lineTo(.79,-.3);stroke(c,shade,.1);stroke(c,p.hot,.055);stroke(c,p.core,.022);
    }else if(kind==='void'){
      c.beginPath();c.ellipse(.5+shadow.x,-.255+shadow.y,.29,.17,0,0,7);c.fillStyle=dark;c.fill();
      c.beginPath();c.ellipse(.5,-.285,.28,.155,0,0,7);c.fillStyle=gradient(.3,-.44,.7,-.13,[p.core,p.hot,p.base]);c.fill();
      c.beginPath();c.ellipse(.5,-.285,.21,.105,0,0,7);c.fillStyle=dark;c.fill();
      c.beginPath();c.ellipse(.5,-.265,.13,.057,0,0,7);stroke(c,mix(p.base,p.hot,.5),.024);
      c.beginPath();c.arc(.5+Math.cos(time+seed)*.25,-.285+Math.sin(time+seed)*.13,.033,0,7);c.fillStyle=p.core;c.fill();
    }else if(kind==='saws'){
      const points=[];for(let i=0;i<24;i++){const a=i*Math.PI/12+time*1.8+seed,r=i%2?.175:.235;points.push([.5+Math.cos(a)*r,-.275+Math.sin(a)*r]);}
      c.save();c.translate(shadow.x,shadow.y);polygon(c,points);c.fillStyle=dark;c.fill();c.restore();
      polygon(c,points);c.fillStyle=gradient(.3,-.46,.7,-.1,[p.core,p.hot,shade]);c.fill();stroke(c,p.core,.016);
      c.beginPath();c.arc(.5,-.275,.115,0,7);c.fillStyle=p.base;c.fill();stroke(c,p.hot,.025);
      c.beginPath();c.arc(.5,-.275,.057,0,7);c.fillStyle=gradient(.46,-.32,.54,-.23,[p.core,p.hot,shade]);c.fill();
    }
    c.restore();
  }
  function animate(c,board,T,theme,time,view) {
    const kind=hazardStyle(theme);
    if(['spikes','thorns','crystal','ice','electric'].includes(kind))return;
    for(const e of board.edges){
      if(!e.hazard)continue;
      const x=(e.ax+e.bx)*T*.5,y=(e.ay+e.by)*T*.5;
      if(view&&(x<view.x-T||x>view.x+view.w+T||y<view.y-T||y>view.y+view.h+T))continue;
      drawHazardFace(c,e,T,theme,time);
    }
  }
  const api={build,draw,animate,solid,STYLE,HAZARDS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyBoard=api;
})(this);
