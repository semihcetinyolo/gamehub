(function(root){
  const ART={key:'assets/props/item-key.webp',exit:'assets/props/item-exit.webp',wafer:'assets/props/item-wafer.webp'};
  const bounds=cells=>({x:Math.min(...cells.map(c=>c.x)),y:Math.min(...cells.map(c=>c.y)),w:Math.max(...cells.map(c=>c.x))-Math.min(...cells.map(c=>c.x))+1,h:Math.max(...cells.map(c=>c.y))-Math.min(...cells.map(c=>c.y))+1});
  function exitDirection(r,L){
    // Prefer the aperture's short axis when equally close to two boundaries.
    const sides=r.h>r.w?['right','left','up','down']:['up','down','right','left'];
    const distance={up:r.y,down:L.H-r.y-r.h,left:r.x,right:L.W-r.x-r.w};
    return sides.reduce((best,side)=>distance[side]<distance[best]?side:best,sides[0]);
  }
  function portalLayout(r,L,T){
    const direction=exitDirection(r,L),vertical=direction==='up'||direction==='down';
    const width=Math.min(34,Math.max(26,T*1.55)),height=width*1.4;
    // The upright pennant sits beside the aperture, never in the middle of it.
    let x,y;
    if(vertical){
      x=(r.x+r.w)*T+T*.12;
      if(x+width>L.W*T-2)x=r.x*T-width-T*.12;
      y=(direction==='up'?r.y:r.y+r.h)*T-height*.15;
    }else{
      x=(direction==='right'?r.x+r.w:r.x)*T-width*.85;
      y=r.y*T-height-T*.12;
      if(y<2)y=(r.y+r.h)*T+T*.12;
      if(y+height>L.H*T-2){
        x=direction==='right'?r.x*T-width-T*.12:(r.x+r.w)*T+T*.12;
        y=r.y*T;
      }
    }
    return {direction,width,height,x:Math.max(2,Math.min(L.W*T-width-2,x)),y:Math.max(2,Math.min(L.H*T-height-2,y)),
      aperture:{x:r.x*T,y:r.y*T,width:r.w*T,height:r.h*T}};
  }
  function drawExit(c,r,L,state,T,time){
    const locked=L.hasKey&&!state.key,p=portalLayout(r,L,T);
    const vertical=p.direction==='up'||p.direction==='down';
    const span=(vertical?r.w:r.h)*T,depth=(vertical?r.h:r.w)*T;
    const angle={up:0,right:Math.PI/2,down:Math.PI,left:-Math.PI/2}[p.direction];
    const mint=locked?'#b38b59':'#4a9b91',dark=locked?'#846341':'#326c68',cream='#fff1ce';
    c.save();c.translate((r.x+r.w/2)*T,(r.y+r.h/2)*T);c.rotate(angle);
    // A low, soft finish mat: its footprint is exactly the playable opening.
    c.beginPath();c.roundRect(-span/2,-depth/2,span,depth,T*.1);c.fillStyle=dark;c.fill();
    c.beginPath();c.roundRect(-span/2+T*.045,-depth/2+T*.035,span-T*.09,depth-T*.11,T*.075);c.fillStyle=cream;c.fill();
    c.save();c.beginPath();c.roundRect(-span/2+T*.1,-depth/2+T*.09,span-T*.2,depth-T*.24,T*.035);c.clip();
    c.fillStyle=mint;c.fillRect(-span/2,-depth/2,span,depth);
    // Fixed-size checks make broad and narrow exits read as the same object.
    const count=Math.max(2,Math.round(span/(T*.32))),cell=span/count,band=Math.min(depth*.38,T*.36);
    for(let row=0;row<2;row++)for(let col=0;col<count;col++)if((row+col)%2===0){
      c.fillStyle=cream;c.fillRect(-span/2+col*cell,-depth/2+T*.08+row*band/2,cell,band/2);
    }
    if(!locked){
      c.strokeStyle=cream;c.lineWidth=T*.085;c.lineCap='round';c.lineJoin='round';
      const y=depth*.19,n=Math.max(1,Math.floor(span/(T*1.5)));
      for(let i=0;i<n;i++){
        const x=(i-(n-1)/2)*T*1.5;
        c.beginPath();c.moveTo(x-T*.16,y+T*.07);c.lineTo(x,y-T*.08);c.lineTo(x+T*.16,y+T*.07);c.stroke();
      }
    }else{
      c.strokeStyle=cream;c.lineWidth=T*.07;c.beginPath();c.moveTo(-T*.16,depth*.17);c.lineTo(T*.16,depth*.17);c.stroke();
    }
    c.restore();c.restore();
    drawPennant(c,p,locked,time);
  }
  function drawPennant(c,p,locked,time){
    c.save();c.translate(p.x,p.y);c.scale(p.width/30,p.height/42);
    c.lineCap='round';c.lineJoin='round';
    // Small wooden post and weighted foot, with no bloom or floating label.
    c.fillStyle='#254c4d25';c.beginPath();c.ellipse(6,39,6,2.5,0,0,7);c.fill();
    c.strokeStyle='#8a6950';c.lineWidth=4;c.beginPath();c.moveTo(5,7);c.lineTo(5,37);c.stroke();
    c.strokeStyle='#e8c995';c.lineWidth=2;c.beginPath();c.moveTo(4.4,7);c.lineTo(4.4,36);c.stroke();
    const wave=locked?0:Math.sin(time*2.6)*1.2;
    c.beginPath();c.moveTo(6,6);c.bezierCurveTo(14,2,21,10+wave,28,6+wave);c.lineTo(27,24+wave);c.bezierCurveTo(19,28+wave,13,19,6,23);c.closePath();
    c.fillStyle=locked?'#d9a76b':'#f4d277';c.fill();c.strokeStyle='#fff0c7';c.lineWidth=1.5;c.stroke();
    if(locked){
      c.strokeStyle='#78553e';c.lineWidth=2.2;c.beginPath();c.arc(17,13,3.3,Math.PI,0);c.stroke();
      c.fillStyle='#78553e';c.beginPath();c.roundRect(12,13,10,8,2);c.fill();
      c.fillStyle='#fff0c7';c.beginPath();c.arc(17,16.5,1.2,0,7);c.fill();c.fillRect(16.5,17,1,2);
    }else{
      // A miniature finish flag remains recognizable without text at phone size.
      c.save();c.clip();
      for(let row=0;row<3;row++)for(let col=0;col<4;col++){
        c.fillStyle=(row+col)%2?'#fff7de':'#458a82';
        c.fillRect(8+col*4.4,8+row*4.3+wave*(col/4),4.4,4.4);
      }c.restore();
    }
    c.fillStyle='#f5d57e';c.beginPath();c.arc(5,5,3.1,0,7);c.fill();
    c.fillStyle='#fff6d7';c.beginPath();c.arc(4.2,4.1,1,0,7);c.fill();
    c.restore();
  }
  function draw(c,L,state,T,time,Themes){
    for(const r of L.portals)drawExit(c,r,L,state,T,time);
    L.wafers.forEach((cells,i)=>{
      const r=bounds(cells),x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T,stage=state.wafer[i];
      if(stage===2){c.fillStyle='#bb854a';for(let j=0;j<7;j++)c.fillRect(x+w*(.15+.1*j),y+h*(.35+.2*Math.sin(j*7)),T*.12,T*.1);return;}
      c.save();c.shadowColor='#583c4540';c.shadowBlur=T*.14;c.shadowOffsetY=T*.07;
      if(!Themes.nineSlice(c,ART.wafer,x,y,w,h,T*.25)){c.fillStyle='#e8b76f';c.fillRect(x,y,w,h);}
      c.shadowBlur=0;c.shadowOffsetY=0;
      if(stage===1){
        c.beginPath();c.moveTo(x+w*.25,y);c.lineTo(x+w*.5,y+h*.35);c.lineTo(x+w*.37,y+h*.6);c.lineTo(x+w*.68,y+h);
        c.moveTo(x+w*.5,y+h*.35);c.lineTo(x+w*.85,y+h*.2);c.strokeStyle='#7a4428';c.lineWidth=Math.max(2,T*.085);c.lineJoin='round';c.stroke();
      }c.restore();
    });
    if(!state.key)for(const r of L.itemBlobs.filter(b=>b.c==='k')){
      const x=r.x*T,y=r.y*T+Math.sin(time*3)*T*.08,w=r.w*T,h=r.h*T;
      c.save();c.shadowColor='#ffdf7d';c.shadowBlur=T*.22;
      if(!Themes.image(c,ART.key,x,y,w,h)){c.fillStyle='#ffcf65';c.beginPath();c.arc(x+w*.35,y+h*.35,w*.2,0,7);c.fill();c.fillRect(x+w*.4,y+h*.4,w*.35,h*.12);}
      c.restore();
    }
  }
  const api={ART,draw,portalLayout,exitDirection,drawExit};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyProps=api;
})(this);
