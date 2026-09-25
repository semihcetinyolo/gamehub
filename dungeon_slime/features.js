// Interactive stonework. Coordinates share the board's collision geometry, without another grid.
(function (root) {
  const PLATE={atlas:'assets/mechanisms/pressure-plate.svg'};
  function rect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
  function star(c,x,y,r){
    c.beginPath();
    for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,k=i%2?.46:1;
      const px=x+Math.cos(a)*r*k,py=y+Math.sin(a)*r*k;i?c.lineTo(px,py):c.moveTo(px,py);}
    c.closePath();
  }
  function gradient(c,x,y,h,top,bottom){const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
  function plate(c,r,T,pressed,time,Themes){
    const x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T,u=Math.min(w,h),color=pressed?'#89ffcf':'#ffd783';
    const size=Math.min(w,h)*1.28,cx=x+w/2,cy=y+h/2;
    if(pressed){
      c.save();c.shadowColor='#69ffc3';c.shadowBlur=T*.3;c.strokeStyle='#8ff5c6';c.lineWidth=T*.075;
      c.beginPath();c.arc(cx,cy,size*.48,0,7);c.stroke();c.restore();
    }
    if(Themes.sprite(c,PLATE,[pressed?768:0,0,768,1024],cx-size/2,cy-size/2,size,size))return;
    // The fallback preserves the circular, recessed silhouette if the SVG cannot load.
    c.save();
    c.shadowColor=pressed?'#56edb0':'#eab655';c.shadowBlur=T*(pressed?.6:.16);
    c.fillStyle=pressed?'#346f62':'#896e4d';c.beginPath();c.arc(cx,cy,size*.44,0,7);c.fill();
    c.shadowBlur=0;c.strokeStyle=color;c.lineWidth=T*.09;c.stroke();
    c.fillStyle='#33313d';c.beginPath();c.arc(cx,cy,size*.34,0,7);c.fill();
    c.fillStyle=gradient(c,x,y,h,pressed?'#244b49':'#ffc890',pressed?'#4c9b7b':'#b65b5a');
    c.beginPath();c.arc(cx,cy+(pressed?T*.05:-T*.1),size*.28,0,7);c.fill();
    c.strokeStyle=pressed?'#bbffe0':'#e8bb79';c.lineWidth=T*.04;c.stroke();
    star(c,x+w/2,y+h/2,u*.3);c.fillStyle=color;c.fill();
    c.strokeStyle=pressed?'#eafff4':'#6e4c39';c.lineWidth=T*.045;c.stroke();
    // Lights outside the stone's silhouette remain visible while it presses the plate.
    c.fillStyle=color;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){c.beginPath();c.arc(cx+dx*size*.43,cy+dy*size*.43,T*.06,0,Math.PI*2);c.fill();}
    c.restore();
  }
  function stone(c,r,T,f,time){
    const x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T;
    c.save();
    if(f){
      const dx=Math.sign(f.to.x-f.from.x),dy=Math.sign(f.to.y-f.from.y);
      c.strokeStyle='#ffe6a4';c.lineWidth=T*.075;c.lineCap='round';c.globalAlpha=.5;
      for(const offset of [-.36,.36]){
        const sx=x+w/2-dx*w*.55+dy*offset*T,sy=y+h/2-dy*h*.55+dx*offset*T;
        c.beginPath();c.moveTo(sx,sy);c.lineTo(sx-dx*T*.7,sy-dy*T*.7);c.stroke();
      }c.globalAlpha=1;
    }
    c.shadowColor='#15112670';c.shadowBlur=T*.24;c.shadowOffsetY=T*.18;
    c.fillStyle='#36364e';rect(c,x+T*.035,y+T*.025,w-T*.07,h-T*.05,T*.31);c.fill();
    c.shadowBlur=0;c.shadowOffsetY=0;
    c.fillStyle=gradient(c,x,y,h,'#b1b4c5','#686d8a');
    rect(c,x+T*.1,y+T*.06,w-T*.2,h-T*.3,T*.25);c.fill();
    c.strokeStyle='#d7d8e0';c.lineWidth=T*.055;c.stroke();
    c.fillStyle=gradient(c,x,y,h,'#9194ac','#545773');
    rect(c,x+T*.22,y+T*.21,w-T*.44,h-T*.58,T*.24);c.fill();
    c.strokeStyle='#45465f';c.lineWidth=T*.045;c.stroke();
    // Carved chips, rather than subdivisions that could be mistaken for grid cells.
    c.strokeStyle='#d5d4df80';c.lineWidth=T*.04;
    c.beginPath();c.moveTo(x+T*.2,y+T*.59);c.lineTo(x+T*.31,y+T*.45);c.lineTo(x+T*.29,y+T*.29);
    c.moveTo(x+w-T*.24,y+h-T*.49);c.lineTo(x+w-T*.4,y+h-T*.34);c.stroke();
    star(c,x+w/2,y+h*.47,T*.61);c.fillStyle='#493c44';c.lineWidth=T*.13;c.strokeStyle='#494257';c.stroke();c.fill();
    star(c,x+w/2,y+h*.44,T*.55);c.fillStyle=gradient(c,x,y,h,'#fff2b3','#efb957');c.fill();
    c.strokeStyle='#fff0ba';c.lineWidth=T*.045;c.stroke();
    c.restore();
  }
  function gate(c,r,T,theme,time,alpha){
    const x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T;
    const kind=theme.hazardType,fire=kind==='fire',poison=kind==='poison';
    c.save();c.globalAlpha=alpha;
    rect(c,x,y,w,h,T*.12);c.clip();
    c.fillStyle=gradient(c,x,y,h,poison?'#234b39':fire?'#662b36':'#362c54',poison?'#53833b':fire?'#301e2d':'#221d39');c.fillRect(x,y,w,h);
    c.strokeStyle=theme.hazard;c.lineWidth=T*.16;
    c.shadowColor=theme.hazard;c.shadowBlur=T*.45;
    if(fire){
      // Broad molten seams rise through one continuous slab of volcanic rock.
      for(let i=0;i<4;i++){
        c.beginPath();
        for(let j=0;j<=16;j++){
          const px=x+w*(i+.5)/4+Math.sin(j*1.6+i*4+time*1.6)*T*.18,py=y+h*j/16;
          j?c.lineTo(px,py):c.moveTo(px,py);
        }c.stroke();
      }
      c.fillStyle='#ffde78';
      for(let i=0;i<8;i++){const p=(time*.42+i*.173)%1;c.beginPath();c.ellipse(x+w*(.18+(i*.273)% .65),y+h*(1-p),T*.045,T*(.07+p*.06),0,0,7);c.fill();}
    }else if(poison){
      c.fillStyle='#bbf06460';
      for(let i=0;i<9;i++){const p=(time*.28+i*.163)%1,px=x+w*(.18+(i*.337)%.65),py=y+h*(1-p);
        c.beginPath();c.arc(px,py,T*(.11+.12*Math.sin(p*Math.PI)),0,7);c.fill();c.lineWidth=T*.025;c.stroke();}
      c.lineWidth=T*.09;c.beginPath();
      for(let i=0;i<=20;i++){const py=y+h*i/20,px=x+w*.5+Math.sin(i*.8+time*2)*w*.3;i?c.lineTo(px,py):c.moveTo(px,py);}c.stroke();
    }else{
      for(let i=0;i<Math.ceil(h/T);i++){
        const py=y+(i+.5)*T;
        for(const side of [-1,1]){const px=x+w/2+side*w*.47;
          c.beginPath();c.moveTo(px,py-T*.34);c.lineTo(px-side*w*.34,py);c.lineTo(px,py+T*.34);c.closePath();
          c.fillStyle=gradient(c,x,py-T*.3,T*.6,'#f7d5ff',theme.hazard);c.fill();}
      }
    }
    c.shadowBlur=T*.2;c.strokeStyle=theme.hazard;c.lineWidth=T*.11;rect(c,x+T*.025,y+T*.025,w-T*.05,h-T*.05,T*.12);c.stroke();
    // The same star as the plate makes their relationship legible before the first hit.
    c.shadowBlur=0;c.fillStyle='#302936e8';c.beginPath();c.arc(x+w/2,y+h/2,T*.59,0,7);c.fill();
    c.strokeStyle='#ffd783';c.lineWidth=T*.045;c.stroke();
    star(c,x+w/2,y+h/2,T*.33);c.stroke();
    c.restore();
  }
  function housing(c,r,T,theme,cover,active){
    const x=r.x*T,y=r.y*T,w=r.w*T,h=r.h*T,m=T*.12;
    c.save();
    // A permanent inset mechanism remains visible even when its hazard is disabled.
    c.strokeStyle='#292a38';c.lineWidth=T*.19;rect(c,x+m/2,y+m/2,w-m,h-m,T*.12);c.stroke();
    c.strokeStyle='#c0bdb0';c.lineWidth=T*.045;rect(c,x+m,y+m,w-2*m,h-2*m,T*.09);c.stroke();
    if(cover>0){
      c.save();rect(c,x+m,y+m,w-2*m,h-2*m,T*.08);c.clip();
      const vertical=h>=w,span=(vertical?w:h)/2*cover;
      c.fillStyle=gradient(c,x,y,h,'#c2c5bc','#777e80');
      if(vertical){c.fillRect(x,y,span,h);c.fillRect(x+w-span,y,span,h);}
      else{c.fillRect(x,y,w,span);c.fillRect(x,y+h-span,w,span);}
      c.strokeStyle='#4b5860';c.lineWidth=T*.055;c.beginPath();
      if(vertical){c.moveTo(x+span,y);c.lineTo(x+span,y+h);c.moveTo(x+w-span,y);c.lineTo(x+w-span,y+h);}
      else{c.moveTo(x,y+span);c.lineTo(x+w,y+span);c.moveTo(x,y+h-span);c.lineTo(x+w,y+h-span);}c.stroke();
      c.restore();
      if(cover>.85&&!active){
        c.globalAlpha=(cover-.85)/.15;
        c.fillStyle='#425855';c.beginPath();c.arc(x+w/2,y+h/2,T*.42,0,7);c.fill();
        c.strokeStyle='#bdffe2';c.lineWidth=T*.09;c.lineCap='round';c.beginPath();
        c.moveTo(x+w/2-T*.18,y+h/2);c.lineTo(x+w/2-T*.03,y+h/2+T*.14);c.lineTo(x+w/2+T*.21,y+h/2-T*.17);c.stroke();
      }
    }
    c.globalAlpha=1;c.fillStyle=active?theme.hazard:'#95ebbb';
    for(const [dx,dy] of [[.5,.035],[.5,.965]]){c.beginPath();c.arc(x+w*dx,y+h*dy,T*.055,0,7);c.fill();}
    c.restore();
  }
  function gateCover(active,transition){
    if(!transition)return active?0:1;
    const p=Math.max(0,Math.min(1,transition.age/transition.duration));
    return transition.reactivating?1-p:p;
  }
  function draw(c,L,s,T,theme,time,flights,openings,Themes){
    for(const [i,p] of L.buttons.entries())plate(c,p,T,s.switches[i],time,Themes);
    for(const [i,g] of L.gates.entries()){
      const transition=openings.find(e=>e.index===i),active=!s.switches[g.button],cover=gateCover(active,transition);
      if(active||cover<1)gate(c,g,T,theme,time,active?1:1-cover*.7);
      housing(c,g,T,theme,cover,active);
    }
    for(const [i,r] of s.rocks.entries())stone(c,r,T,flights.find(f=>f.index===i),time);
  }
  const api={draw,PLATE,gateCover};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyFeatures=api;
})(this);
