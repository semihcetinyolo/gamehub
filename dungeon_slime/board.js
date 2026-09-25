// One room boundary, one wall skin. '#' and '*' are the same solid geometry;
// '*' changes its material. Backing tiles never create another visible wall row.
(function(root) {
  const solid = c => c === '#' || c === '*';
  const hash = n => { const v=Math.sin(n*127.13+17.71)*43758.5453; return v-Math.floor(v); };
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
      const own=facesByCell.get(e.wallX+','+e.wallY),back=facesByCell.get((e.wallX+e.nx)+','+(e.wallY+e.ny))||[];
      e.region=faceRegion(e,own);
      e.sharedBack=own.concat(back).some(other=>e.nx*other.nx+e.ny*other.ny===-1);
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
    const runs=[],wallRuns=[];
    for(const loop of loops){
      let materialRun=null,wallRun=null;
      for(let i=0;i<loop.length;i++){
        const e=loop[i],before=loop[(i+loop.length-1)%loop.length],after=loop[(i+1)%loop.length];
        e.blend=[before.hazard,e.hazard,after.hazard];
        if(materialRun&&materialRun.nx===e.nx&&materialRun.ny===e.ny&&materialRun.hazard===e.hazard){
          materialRun.bx=e.bx;materialRun.by=e.by;materialRun.length++;materialRun.fadeEnd=e.hazard&&!after.hazard;materialRun.segments.push(e);
        }else{materialRun={...e,length:1,segments:[e],fadeStart:e.hazard&&!before.hazard,fadeEnd:e.hazard&&!after.hazard};runs.push(materialRun);}
        // Texture and masonry joints do not restart at a material boundary.
        if(wallRun&&wallRun.nx===e.nx&&wallRun.ny===e.ny){wallRun.bx=e.bx;wallRun.by=e.by;wallRun.length++;wallRun.segments.push(e);}
        else{wallRun={...e,length:1,segments:[e]};wallRuns.push(wallRun);}
      }
    }
    const thinCells=[...facesByCell.values()].filter(faces=>faces.some(e=>e.sharedBack)).map(faces=>({x:faces[0].wallX,y:faces[0].wallY}));
    return {L,edges,loops,runs,wallRuns,thinCells};
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
  // A compact tent filter follows the contour through corners and the closed-loop seam.
  // Only the stone's colour is blended: hazard geometry and its visible teeth/lava stay exact.
  function materialWeight(e,t){
    const radius=.85;
    const integral=x=>x<=-radius?0:x>=radius?1:x<0?(x+radius)**2/(2*radius*radius):1-(radius-x)**2/(2*radius*radius);
    return e.blend.reduce((sum,on,i)=>sum+(on?integral(i-t)-integral(i-1-t):0),0);
  }
  function mix(a,b,t){
    const out=[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0'));
    return '#'+out.join('');
  }
  function path(c,loops,T) {
    c.beginPath();
    for(const loop of loops){if(!loop.length)continue;c.moveTo(loop[0].ax*T,loop[0].ay*T);for(const e of loop)c.lineTo(e.bx*T,e.by*T);c.closePath();}
  }
  function solidClip(c,L,T) {
    c.beginPath();
    for(let y=0;y<L.H;y++)for(let x=0;x<L.W;x++)if(solid(L.cells[y][x]))c.rect(x*T,y*T,T,T);
    c.clip();
  }
  const PALETTES={
    fire:{top:'#4c3540',base:'#281e2b',rim:'#96664f',hot:'#ff963b',core:'#ffe4a0'},
    poison:{top:'#35283e',base:'#181c26',rim:'#695572',hot:'#c1f54b',core:'#efffc4'},
    crystal:{top:'#65407e',base:'#2d223f',rim:'#ad7bcc',hot:'#e3a1ff',core:'#fff0ff'},
    spikes:{top:'#474961',base:'#252738',rim:'#82899e',hot:'#dfd8f6',core:'#f4f3ff'},
  };
  function stroke(c,color,width){c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  function runSpace(c,e,T){c.translate(e.ax*T,e.ay*T);c.rotate(Math.atan2(e.by-e.ay,e.bx-e.ax));}
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
    const {L,loops,runs,wallRuns}=board,p=PALETTES[theme.hazardType];
    drawFloor(c,board,T,theme,BG);
    c.save();path(c,loops,T);c.lineJoin='round';
    stroke(c,'#17122116',T*.38);stroke(c,'#1712212b',T*.15);c.restore();
    c.save();solidClip(c,L,T);c.lineJoin='round';c.lineCap='butt';
    // Interior pillars are solid stone, including their centre; only exterior backing is hidden.
    for(const loop of loops){
      const area=loop.reduce((sum,e)=>sum+e.ax*e.by-e.bx*e.ay,0);
      if(area<0){path(c,[loop],T);c.fillStyle=theme.wall[1];c.fill();}
    }
    path(c,loops,T);stroke(c,'#191525',T*1.94);stroke(c,theme.wall[1],T*1.8);stroke(c,theme.wall[0],T*1.55);
    // Facing bevels must not leave a dark "second wall" down a thin pillar's centre.
    c.fillStyle=theme.wall[0];
    for(const loop of loops)if(loop.reduce((sum,e)=>sum+e.ax*e.by-e.bx*e.ay,0)<0){path(c,[loop],T);c.fill();}
    for(const cell of board.thinCells)c.fillRect(cell.x*T,cell.y*T,T,T);
    // Carry the tint around corners too, without a hard rectangular end cap.
    c.lineCap='round';
    for(const e of board.edges){
      if(!e.blend.some(Boolean))continue;
      for(const [normal,material,width] of [[theme.wall[1],p.base,1.79],[theme.wall[0],p.top,1.53]]){
        const g=c.createLinearGradient(e.ax*T,e.ay*T,e.bx*T,e.by*T);
        for(let i=0;i<=8;i++)g.addColorStop(i/8,mix(normal,material,materialWeight(e,i/8)));
        c.beginPath();c.moveTo(e.ax*T,e.ay*T);c.lineTo(e.bx*T,e.by*T);stroke(c,g,T*width);
      }
    }
    c.lineCap='butt';
    for(const e of wallRuns){
      c.save();clipFaces(c,e.segments,T);runSpace(c,e,T);const length=e.length*T;
      for(let i=0;i<e.segments.length;i++){
        const edge=e.segments[i],steps=edge.blend.every(v=>v===edge.hazard)?1:16;
        for(let j=0;j<steps;j++){
          const t=materialWeight(edge,(j+.5)/steps),base=mix(theme.wall[1],p.base,t),top=mix(theme.wall[0],p.top,t),rim=mix(theme.wall[0],p.rim,t);
          const g=c.createLinearGradient(0,-T*.84,0,0);g.addColorStop(0,edge.sharedBack?top:base);g.addColorStop(.18,edge.sharedBack?top:rim);g.addColorStop(.32,top);g.addColorStop(.73,top);g.addColorStop(1,base);
          c.fillStyle=g;c.fillRect((i+j/steps)*T,-T*.84,T/steps+.12,T*.84);
        }
      }
      c.save();c.globalAlpha=theme.hazardType==='poison'?.1:.22;c.beginPath();c.rect(0,-T*.69,length,T*.52);c.clip();
      for(let x=0;x<length;x+=T*2.8)Themes.sprite(c,theme,[535,20,460,115],x,-T*.69,T*2.8,T*.52);
      c.restore();
      // Masonry seams belong to the wall, independently of the floor checkerboard.
      const seed=e.ax*7+e.ay*17+e.nx*5;
      for(let u=1.6+hash(seed);u<e.length;u+=1.9+hash(u+seed)*1.4){
        const x=u*T,t=materialWeight(e.segments[Math.floor(u)],u%1);
        c.beginPath();c.moveTo(x-T*.07,-T*.78);c.lineTo(x+T*.04,-T*.48);c.lineTo(x,-T*.12);stroke(c,mix(theme.wall[1],p.base,t)+'b0',T*.055);
        c.beginPath();c.moveTo(x+T*.045,-T*.68);c.lineTo(x+T*.085,-T*.38);stroke(c,'#ffffff28',T*.025);
      }
      c.beginPath();c.moveTo(0,-T*.035);c.lineTo(length,-T*.035);stroke(c,theme.wall[1],T*.07);
      c.restore();
    }
    for(const e of runs){
      if(!e.hazard)continue;
      c.save();clipFaces(c,e.segments,T);runSpace(c,e,T);
      drawMaterial(c,e.length,T,theme.hazardType,p,e.ax*7+e.ay*17+e.nx*5,e);
      c.beginPath();c.moveTo(0,-T*.035);c.lineTo(e.length*T,-T*.035);stroke(c,feather(c,p.hot,e.length,T,e,.35),T*.07);
      c.restore();
    }
    c.restore();
  }
  function feather(c,color,length,T,e,endAlpha=0){
    const g=c.createLinearGradient(0,0,length*T,0),f=Math.min(.4,.65/length);
    const alpha=t=>color+Math.round(t*255).toString(16).padStart(2,'0');
    g.addColorStop(0,alpha(e.fadeStart?endAlpha:1));g.addColorStop(f,color);
    g.addColorStop(1-f,color);g.addColorStop(1,alpha(e.fadeEnd?endAlpha:1));return g;
  }
  function drawMaterial(c,length,T,kind,p,seed,e) {
    const N=length*T;
    if(kind==='spikes'){
      c.fillStyle=feather(c,p.base,length,T,e);c.fillRect(0,-T*.53,N,T*.43);
      for(let u=.27;u<length;u+=.54){const x=u*T,r=T*.235;
        c.beginPath();c.moveTo(x-r,-T*.47);c.lineTo(x,0);c.lineTo(x+r,-T*.47);c.closePath();c.fillStyle='#c7c8e2';c.fill();
        c.beginPath();c.moveTo(x,0);c.lineTo(x+r,-T*.47);c.lineTo(x+T*.03,-T*.39);c.closePath();c.fillStyle='#7e82a4';c.fill();
        c.beginPath();c.moveTo(x-r,-T*.47);c.lineTo(x,0);stroke(c,'#f1edff',T*.035);
      }
    }else if(kind==='fire'){
      c.beginPath();c.moveTo(0,0);
      for(let u=0;u<=length;u+=.08)c.lineTo(u*T,-T*(.11+.045*Math.sin(u*7+seed)));
      c.lineTo(N,0);c.closePath();c.fillStyle=feather(c,'#f77029',length,T,e,.25);c.fill();
      c.save();c.shadowColor='#ff702c';c.shadowBlur=T*.19;
      for(let u=.35;u<length;u+=.8+hash(u+seed)*.55){
        const x=u*T,flip=hash(u*4+seed)>.5?1:-1;
        c.beginPath();c.moveTo(x,0);c.lineTo(x-T*.13*flip,-T*.2);c.lineTo(x+T*.12*flip,-T*.43);c.lineTo(x+T*.04,-T*(.55+hash(u+seed)*.18));
        stroke(c,'#c34832',T*.18);stroke(c,p.hot,T*.085);stroke(c,p.core,T*.028);
      }
      c.restore();
    }else if(kind==='poison'){
      // A dark corroded channel and thick luminous ooze read as dangerous even
      // without relying on the theme's green colour or on tiny animated bubbles.
      c.fillStyle=feather(c,p.base,length,T,e);c.fillRect(0,-T*.59,N,T*.59);
      c.beginPath();c.moveTo(0,0);
      for(let u=0;u<=length;u+=.06)c.lineTo(u*T,-T*(.29+.095*Math.sin(u*5+seed)+.04*Math.sin(u*13)));
      c.lineTo(N,0);c.closePath();c.fillStyle=feather(c,p.hot,length,T,e,.5);c.fill();
      for(let u=.34;u<length;u+=.72){const x=u*T,y=-T*(.13+hash(u+seed)*.13),r=T*(.055+hash(u*3+seed)*.045);
        c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle='#425326';c.fill();
        c.beginPath();c.arc(x-r*.2,y-r*.25,r*.35,0,Math.PI*2);c.fillStyle=p.core;c.fill();
      }
    }else{
      for(let u=.4;u<length;u+=.7){const x=u*T,r=T*(.13+hash(u+seed)*.06),depth=T*(.33+hash(u*3+seed)*.26);
        c.beginPath();c.moveTo(x-r,-depth);c.lineTo(x,0);c.lineTo(x+r*.8,-depth*.75);c.lineTo(x+r*.2,-depth-T*.1);c.closePath();c.fillStyle='#c589e0';c.fill();
        c.beginPath();c.moveTo(x,0);c.lineTo(x+r*.2,-depth-T*.1);c.lineTo(x+r*.8,-depth*.75);c.closePath();c.fillStyle='#8453b8';c.fill();stroke(c,'#edc7ff',T*.025);
      }
    }
  }
  function animate(c,board,T,theme,time,view) {
    const kind=theme.hazardType,p=PALETTES[kind];c.save();
    for(const e of board.edges){
      if(!e.hazard)continue;
      const x=(e.ax+e.bx)*T*.5,y=(e.ay+e.by)*T*.5;
      if(view&&(x<view.x-T||x>view.x+view.w+T||y<view.y-T||y>view.y+view.h+T))continue;
      c.save();clipFaces(c,[e],T);runSpace(c,e,T);const seed=e.ax*17.3+e.ay*8.9,phase=(time*.65+hash(seed))%1;
      if(kind==='fire'){
        c.globalAlpha=.58+.12*Math.sin(time*6+seed);
        const x=T*(.2+hash(seed)*.6),height=T*(.17+.15*Math.sin(time*9+seed));
        c.beginPath();c.moveTo(x-T*.1,-T*.12);c.quadraticCurveTo(x-T*.11,-T*.34,x+Math.sin(time*5+seed)*T*.09,-T*.2-height);c.quadraticCurveTo(x+T*.14,-T*.25,x+T*.12,-T*.08);c.fillStyle=p.hot;c.fill();
        if(hash(seed)>.6){c.globalAlpha=(1-phase)*.7;c.beginPath();c.arc(x+Math.sin(seed+phase)*T*.13,-T*(.3+phase*.5),T*.025,0,7);c.fillStyle=p.core;c.fill();}
      }else if(kind==='poison'){
        c.globalAlpha=Math.sin(phase*Math.PI)*.65;c.beginPath();c.arc(T*(.2+hash(seed)*.6),-T*(.18+phase*.42),T*(.035+phase*.055),0,7);c.strokeStyle=p.core;c.lineWidth=Math.max(.6,T*.035);c.stroke();
      }else{
        const a=Math.max(0,Math.sin(time*1.8+seed))**12;c.globalAlpha=a*.75;c.beginPath();c.moveTo(T*.3,-T*.4);c.lineTo(T*.44,-T*.07);c.strokeStyle=p.core;c.lineWidth=Math.max(.6,T*.04);c.stroke();
      }
      c.restore();
    }
    c.restore();
  }
  const api={build,draw,animate,solid,materialWeight};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyBoard=api;
})(this);
