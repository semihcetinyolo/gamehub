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
    return {L,edges,loops,corners,parts,skinCells,skinEdges};
  }
  function faceRegion(e,faces){
    const x=e.wallX,y=e.wallY;
    let polygon=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
    for(const other of faces){
      if(other===e)continue;
      const distance=p=>(p[0]-e.ax)*e.nx+(p[1]-e.ay)*e.ny-(p[0]-other.ax)*other.nx-(p[1]-other.ay)*other.ny;
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
  const STYLE=Object.freeze({bevel:.13,rail:.43,lip:.065,textureAlpha:.14});
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
    // Shadows are confined to the room contour. Every wall orientation uses
    // the same width, top material and world-space lighting.
    c.save();path(c,board.loops,T);c.lineJoin='miter';
    stroke(c,'#17122112',T*.42);stroke(c,'#17122120',T*.18);c.restore();
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
    // Bevels belong to the silhouette, not to individual tiles. No seams down
    // the middle of pillars, caps, T-junctions or one-cell internal walls.
    for(const e of board.skinEdges){
      c.beginPath();c.moveTo(e.ax*T,e.ay*T);c.lineTo(e.bx*T,e.by*T);
      stroke(c,theme.wall[1],T*STYLE.bevel*2);
      const inset=STYLE.bevel*.7;
      c.beginPath();c.moveTo((e.ax-e.nx*inset)*T,(e.ay-e.ny*inset)*T);c.lineTo((e.bx-e.nx*inset)*T,(e.by-e.ny*inset)*T);
      stroke(c,e.ny<0||e.nx<0?'#fff8eaa0':'#302b3830',T*.045);
    }
    c.restore();
    // Hazard rail is an overlay on the SAME stone body. Exact hard endpoints
    // preserve safe/dangerous boundaries; all art stays inside solid geometry.
    const p=palette(theme);
    for(const e of board.edges)if(e.hazard){
      c.save();clipFaces(c,[e],T);runSpace(c,e,T);
      c.fillStyle=p.base;c.fillRect(-T*.5,-T*STYLE.rail,T*2,T*STYLE.rail);
      c.fillStyle=p.hot+'77';c.fillRect(-T*.5,-T*STYLE.rail,T*2,T*.045);
      c.fillStyle=p.hot;c.fillRect(-T*.5,-T*STYLE.lip,T*2,T*STYLE.lip);
      drawHazard(c,T,hazardStyle(theme),p,e.wallX*17+e.wallY*31,0);
      c.restore();
    }
  }
  function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
  function drawHazard(c,T,kind,p,seed,time){
    c.save();c.scale(T,T);
    if(kind==='spikes'||kind==='thorns'||kind==='crystal'||kind==='ice'){
      for(const x of [.25,.75]){
        const crystal=kind==='crystal'||kind==='ice',bend=kind==='thorns'?.09:0;
        polygon(c,crystal?[[x-.15,-.27],[x,-.025],[x+.15,-.27],[x+.04,-.42]]:[[x-.17,-.39],[x+bend,-.035],[x+.17,-.39]]);
        c.fillStyle=p.hot;c.fill();
        polygon(c,crystal?[[x,-.025],[x+.15,-.27],[x+.04,-.42]]:[[x+bend,-.035],[x+.17,-.39],[x+.015,-.35]]);c.fillStyle=p.base+'80';c.fill();
        c.beginPath();c.moveTo(x-.15,-.37);c.lineTo(x+bend,-.055);stroke(c,p.core,.025);
      }
    }else if(kind==='fire'){
      c.beginPath();c.moveTo(0,-.065);
      for(let i=0;i<=20;i++){const x=i/20;c.lineTo(x,-.23-.06*Math.sin(x*Math.PI*4+seed+time*2));}
      c.lineTo(1,-.065);c.closePath();c.fillStyle=p.hot;c.fill();
      c.beginPath();c.moveTo(.12,-.1);c.lineTo(.35,-.17);c.lineTo(.55,-.12);c.lineTo(.84,-.19);stroke(c,p.core,.035);
    }else if(kind==='poison'||kind==='brine'){
      c.fillStyle=p.hot;c.fillRect(0,-.23,1,.17);
      for(const x of [.25,.72]){
        c.beginPath();c.arc(x,-.21+Math.sin(time*2+seed+x)*.025,.085,0,7);c.fillStyle=p.hot;c.fill();
        c.beginPath();c.arc(x-.018,-.235,.027,0,7);c.fillStyle=p.core;c.fill();
      }
    }else if(kind==='electric'){
      for(const x of [.08,.82]){c.fillStyle=p.hot;c.fillRect(x,-.36,.1,.24);c.fillStyle=p.core;c.fillRect(x,-.32,.1,.035);}
      c.beginPath();c.moveTo(.2,-.23);c.lineTo(.43,-.32);c.lineTo(.53,-.15);c.lineTo(.8,-.26);stroke(c,p.hot,.055);stroke(c,p.core,.021);
    }else if(kind==='void'){
      c.beginPath();c.ellipse(.5,-.24,.25,.13,0,0,7);stroke(c,p.hot,.04);
      c.beginPath();c.ellipse(.5,-.24,.12,.065,0,0,7);c.fillStyle='#161226';c.fill();
      c.beginPath();c.arc(.5+Math.cos(time+seed)*.23,-.24+Math.sin(time+seed)*.115,.03,0,7);c.fillStyle=p.core;c.fill();
    }else if(kind==='saws'){
      c.translate(.5,-.235);c.rotate(time*1.8+seed);
      const points=[];for(let i=0;i<24;i++){const a=i*Math.PI/12,r=i%2?.15:.205;points.push([Math.cos(a)*r,Math.sin(a)*r]);}
      polygon(c,points);c.fillStyle=p.hot;c.fill();
      c.beginPath();c.arc(0,0,.09,0,7);c.fillStyle=p.base;c.fill();
      c.beginPath();c.arc(0,0,.035,0,7);c.fillStyle=p.core;c.fill();
    }
    c.restore();
  }
  function animate(c,board,T,theme,time,view) {
    const kind=hazardStyle(theme),p=palette(theme);
    if(['spikes','thorns','crystal','ice','electric'].includes(kind))return;
    for(const e of board.edges){
      if(!e.hazard)continue;
      const x=(e.ax+e.bx)*T*.5,y=(e.ay+e.by)*T*.5;
      if(view&&(x<view.x-T||x>view.x+view.w+T||y<view.y-T||y>view.y+view.h+T))continue;
      c.save();clipFaces(c,[e],T);runSpace(c,e,T);
      // Repaint only the inset, leaving the constant contact line untouched.
      c.beginPath();c.rect(0,-T*.425,T,T*.36);c.clip();
      c.fillStyle=p.base;c.fillRect(0,-T*.425,T,T*.36);
      drawHazard(c,T,kind,p,e.wallX*17+e.wallY*31,time);c.restore();
    }
  }
  const api={build,draw,animate,solid,STYLE,HAZARDS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyBoard=api;
})(this);
