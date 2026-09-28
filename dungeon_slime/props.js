(function(root){
  const ART={key:'assets/props/item-key.webp',exit:'assets/props/item-exit.webp',wafer:'assets/props/item-wafer.webp'};
  const bounds=cells=>({x:Math.min(...cells.map(c=>c.x)),y:Math.min(...cells.map(c=>c.y)),w:Math.max(...cells.map(c=>c.x))-Math.min(...cells.map(c=>c.x))+1,h:Math.max(...cells.map(c=>c.y))-Math.min(...cells.map(c=>c.y))+1});
  function portalLayout(r,L,T){
    const width=Math.max(34,Math.min(54,T*1.85)),height=width*1.35;
    return {width,height,x:Math.max(3,Math.min(L.W*T-width-3,(r.x+r.w/2)*T-width/2)),y:Math.max(16,Math.min(L.H*T-height-3,(r.y+r.h/2)*T-height*.65))};
  }
  function drawExit(c,r,L,state,T,time){
    const x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T,locked=L.hasKey&&!state.key;
    const ink=locked?'#ffc66e':'#8cffe0',p=portalLayout(r,L,T),cx=p.x+p.width/2;
    c.save();
    // The luminous threshold retains the exact playable aperture; the sign never stretches.
    c.fillStyle=locked?'#b8975755':'#32deb96b';c.fillRect(x,y,w,h);
    c.strokeStyle=ink;c.lineWidth=Math.max(1.5,T*.08);c.strokeRect(x+1,y+1,Math.max(1,w-2),Math.max(1,h-2));
    c.shadowColor=ink;c.shadowBlur=T*.45;c.lineJoin='round';
    const px=p.x,py=p.y,pw=p.width,ph=p.height;
    c.beginPath();c.moveTo(px,py+ph);c.lineTo(px,py+pw*.52);c.arc(cx,py+pw*.52,pw/2,Math.PI,0);c.lineTo(px+pw,py+ph);c.closePath();
    c.fillStyle='#182d3b';c.fill();c.strokeStyle='#f1dfb4';c.lineWidth=4;c.stroke();c.shadowBlur=0;
    c.save();c.clip();const g=c.createLinearGradient(0,py,0,py+ph);g.addColorStop(0,locked?'#715a40':'#0c8e94');g.addColorStop(1,locked?'#352d32':'#65ffd7');c.fillStyle=g;c.fillRect(px+5,py+5,pw-10,ph-8);
    c.globalAlpha=.22+.1*Math.sin(time*3);c.fillStyle='#e9ffff';c.beginPath();c.ellipse(cx,py+ph*.52,pw*.23,ph*.47,0,0,7);c.fill();c.restore();
    if(locked){
      c.fillStyle='#ffcc75';c.beginPath();c.roundRect(cx-pw*.2,py+ph*.5,pw*.4,ph*.25,3);c.fill();c.strokeStyle='#ffcc75';c.lineWidth=3;c.beginPath();c.arc(cx,py+ph*.5,pw*.13,Math.PI,0);c.stroke();
    }else{
      const yy=py+ph*.55+Math.sin(time*3)*2,angle=r.y<=1?-Math.PI/2:r.y+r.h>=L.H-1?Math.PI/2:r.x<=1?Math.PI:0;c.save();c.translate(cx,yy);c.rotate(angle);c.strokeStyle='#f4fffb';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(-pw*.17,0);c.lineTo(pw*.17,0);c.moveTo(pw*.02,-pw*.15);c.lineTo(pw*.17,0);c.lineTo(pw*.02,pw*.15);c.stroke();c.restore();
    }
    c.fillStyle='#203642';c.beginPath();c.roundRect(cx-25,py-15,50,17,6);c.fill();c.fillStyle=ink;c.font='bold 10px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(locked?'KİLİTLİ':'ÇIKIŞ',cx,py-6);
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
  const api={ART,draw,portalLayout,drawExit};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyProps=api;
})(this);
