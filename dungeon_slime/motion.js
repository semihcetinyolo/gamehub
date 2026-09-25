// Material animation is presentation only: collision shapes and level solutions stay in engine.js.
(function(root) {
  const SKINS = {
    purple: { name:'Üzüm Jöli', material:'elastic', atlas:'assets/themes/garden-atlas.webp', body:[40,548,436,414], portrait:[1,1], colors:['#ed9cff','#b931e6','#7020b4'], rgb:'185,49,230', ink:'#321153' },
    indigo: { name:'Ay Jölisi', material:'elastic', atlas:'assets/themes/moon-atlas.webp', body:[34,550,450,426], portrait:[1,1], colors:['#b2a4ff','#8055ed','#4c2ca8'], rgb:'128,85,237', ink:'#211548' },
    water: { name:'Su Jölisi', material:'water', atlas:'assets/themes/ember-atlas.webp', body:[34,540,444,440], portrait:[1,1], colors:['#9cf5ff','#19c6ed','#1479c7'], rgb:'25,198,237', ink:'#083757' },
    mint: { name:'Nane Jöli', material:'gel', atlas:'assets/animation/jellies.webp', body:[52,56,414,391], portrait:[0,1], colors:['#c0ffe4','#31d998','#138867'], rgb:'49,217,152', ink:'#104837' },
    amber: { name:'Bal Jölisi', material:'honey', atlas:'assets/animation/jellies.webp', body:[560,55,416,393], portrait:[1,1], colors:['#fff2a1','#f6b63c','#b97620'], rgb:'246,182,60', ink:'#633019' },
    rose: { name:'Çilek Jöli', material:'elastic', atlas:'assets/animation/jellies.webp', body:[1071,54,419,393], portrait:[2,1], colors:['#ffd1e8','#f35fab','#ac3376'], rgb:'243,95,171', ink:'#56193e' },
  };
  for (const [id,skin] of Object.entries(SKINS)) skin.id=id;
  const PROFILES = {
    water: {duration:.20,ease:2.4,breath:.011,frequency:2.5,description:'Akışkan dalga ve su halkaları'},
    elastic: {duration:.17,ease:3,breath:.023,frequency:4.2,description:'Akıcı esneme ve hızlı toparlanma'},
    gel: {duration:.21,ease:2.6,breath:.018,frequency:3.1,description:'Yumuşak salınım ve kabarcıklar'},
    honey: {duration:.24,ease:2,breath:.009,frequency:1.6,description:'Yumuşak yayılma ve yapışkan damlalar'},
  };
  const FX = { atlas:'assets/animation/effects.webp' };
  const clamp = x => Math.max(0,Math.min(1,x));
  const mix = (a,b,t) => a+(b-a)*t;
  const forLevel = (level,theme) => SKINS[level.jelly] || SKINS[theme.actor] || SKINS.purple;
  const profile = actor => PROFILES[actor.material];
  const rect = (c,x,y,w,h,r) => { c.beginPath();c.roundRect(x,y,Math.max(.001,w),Math.max(.001,h),Math.max(0,Math.min(r,w/2,h/2))); };
  function morph(from,to,dir,actor) {
    const p=profile(actor), [dx,dy]={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[dir];
    return {age:0,duration:p.duration,from:{...from},to:{x:to.x,y:to.y,w:to.w,h:to.h},actor,dx,dy};
  }
  function sampleMorph(m,age=m.age) {
    // One monotonic curve: no anticipation pause, reverse motion or clamped oscillation.
    const t=clamp(age/m.duration),p=1-(1-t)**profile(m.actor).ease;
    return Object.fromEntries(['x','y','w','h'].map(k=>[k,mix(m.from[k],m.to[k],p)]));
  }
  function paintBody(c,b,actor,time,Themes,energy=0) {
    const {x,y,w,h}=b,r=Math.min(w,h)*.24;
    c.save();rect(c,x,y,w,h,r);c.clip();
    const g=c.createLinearGradient(0,y,0,y+h);actor.colors.forEach((v,i)=>g.addColorStop(i/2,v));c.fillStyle=g;c.fillRect(x,y,w,h);
    const [sx,sy,sw,sh]=actor.body,e=Math.min(w,h)*.25;
    const xx=[x,x+e,x+w-e,x+w], yy=[y,y+e,y+h-e,y+h], ax=[sx,sx+sw*.25,sx+sw*.75,sx+sw],ay=[sy,sy+sh*.25,sy+sh*.75,sy+sh];
    for(let j=0;j<3;j++)for(let i=0;i<3;i++)Themes.sprite(c,actor,[ax[i],ay[j],ax[i+1]-ax[i],ay[j+1]-ay[j]],xx[i],yy[j],xx[i+1]-xx[i],yy[j+1]-yy[j]);
    if(actor.material==='water') {
      c.strokeStyle='#caffff';c.lineWidth=Math.max(.7,Math.min(w,h)*.022);c.globalAlpha=.24+energy*.35;
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(x+w*.5,y+h*(.3+i*.2)+Math.sin(time*5+i)*h*.025,w*(.3+i*.065),h*.065,0,0,7);c.stroke();}
    } else if(actor.material==='gel') {
      c.strokeStyle='#dcffee';c.lineWidth=Math.max(.6,Math.min(w,h)*.018);c.globalAlpha=.4;
      for(let i=0;i<5;i++){const t=(time*.14+i*.21)%1;c.beginPath();c.arc(x+w*(.17+(i%3)*.3),y+h*(.87-t*.7),Math.min(w,h)*(.025+i*.007),0,7);c.stroke();}
    } else if(actor.material==='honey') {
      c.fillStyle='#ffe79a';c.globalAlpha=.21;
      for(let i=0;i<3;i++){rect(c,x+w*(.2+i*.25),y+h*.12,w*.075,h*(.2+.07*Math.sin(time*1.4+i)),w*.04);c.fill();}
    } else if(energy>.01) {
      c.strokeStyle='#ffdcff';c.globalAlpha=energy*.55;c.lineWidth=Math.max(1,Math.min(w,h)*.027);
      rect(c,x+w*.06,y+h*.06,w*.88,h*.88,r);c.stroke();
    }
    c.restore();c.save();c.strokeStyle=actor.colors[2];c.lineWidth=Math.max(.7,Math.min(w,h)*.018);rect(c,x,y,w,h,r);c.stroke();c.restore();
  }
  function effect(c,Themes,index,x,y,size,alpha=1) {
    c.save();c.globalAlpha=clamp(alpha);c.globalCompositeOperation='screen';
    Themes.sprite(c,FX,[(index%3)*512,Math.floor(index/3)*512,512,512],x-size/2,y-size/2,size,size);c.restore();
  }
  function impact(b,dx,dy,actor) {
    return {age:0,duration:actor.material==='honey'?1.1:.75,actor,
      x:b.x+b.w*(dx>0?1:dx<0?0:.5),y:b.y+b.h*(dy>0?1:dy<0?0:.5),dx,dy};
  }
  function drawImpact(c,hit,T,Themes) {
    const t=hit.age,u=clamp(t/hit.duration),a=hit.actor,water=a.material==='water',honey=a.material==='honey';
    c.save();c.globalAlpha=(1-u)*.7;c.strokeStyle=a.colors[0];c.lineWidth=Math.max(.7,T*.045);
    if(water){c.beginPath();c.ellipse(hit.x*T,hit.y*T,T*(.3+u*1.1),T*(.12+u*.4),Math.atan2(hit.dy,hit.dx)+Math.PI/2,0,7);c.stroke();}
    for(let i=0;i<(honey?6:10);i++){
      const sign=i%2?1:-1,speed=.9+i*.17;
      const x=hit.x-hit.dx*t*speed+hit.dy*sign*t*(i*.22),y=hit.y-hit.dy*t*speed+hit.dx*sign*t*(i*.22)+t*t*(honey?1.8:.8);
      c.fillStyle=a.colors[i%3];c.beginPath();c.ellipse(x*T,y*T,T*(honey?.065:.045)*(1-u),T*(honey?.12:.06)*(1-u),0,0,7);c.fill();
    }
    c.restore();
  }
  function death(b,dx,dy,actor,hazard) {
    const kind=hazard||'spikes',duration=kind==='poison'?2.35:kind==='fire'?2.05:kind==='crystal'?1.85:1.7;
    const pieces=Array.from({length:actor.material==='water'?26:18},(_,i)=>{
      const angle=i*2.39996, speed=2+(i%5)*.62;
      return {vx:Math.cos(angle)*speed-dx*2,vy:Math.sin(angle)*speed-dy*2-2.4,r:.11+(i%4)*.035,angle};
    });
    return {age:0,duration,b:{x:b.x,y:b.y,w:b.w,h:b.h},actor,kind,dx,dy,pieces};
  }
  function drawDeath(c,f,T,Themes,face) {
    const {b,actor:a,kind}=f,t=f.age,u=clamp(t/f.duration),cx=(b.x+b.w/2)*T,cy=(b.y+b.h/2)*T;
    const water=a.material==='water',honey=a.material==='honey',w=b.w*T,h=b.h*T,size=Math.max(w,h);
    c.save();
    if(kind==='fire'||kind==='poison') {
      const poison=kind==='poison',collapse=clamp((t-.14)/(poison?1.35:1.05)),remain=1-collapse;
      c.globalAlpha=clamp((1-u)*2);c.fillStyle=poison?'#68be3f':water?a.colors[1]:a.colors[2];
      c.beginPath();c.ellipse(cx,cy+h*.36,w*(.2+collapse*.3),T*(.13+remain*.12),0,0,7);c.fill();
      if(remain>.015) {
        const body={x:cx-w*(1+collapse*.08)/2+Math.sin(t*(poison?39:18))*T*.055*remain,y:b.y*T+h*collapse*.9,w:w*(1+collapse*.08),h:Math.max(1,h*remain)};
        c.globalAlpha=remain;paintBody(c,body,a,t,Themes,.4);
        c.save();rect(c,body.x,body.y,body.w,body.h,Math.min(body.w,body.h)*.2);c.clip();
        c.fillStyle=poison?'#a8ef45':water?'#e6ffff':'#813c28';c.globalAlpha=collapse*.65;c.fillRect(body.x,body.y,body.w,body.h);c.restore();
      }
      c.globalAlpha=1;
      if(poison){
        effect(c,Themes,2,cx,cy-h*.15-t*T*.4,size*(.75+u*.25),Math.sin(u*Math.PI)*.8);
        for(let i=0;i<9;i++){const p=(t*.65+i*.12)%1;c.globalAlpha=(1-p)*(1-u);c.strokeStyle=i%2?'#dcff80':'#87ec46';c.lineWidth=T*.055;c.beginPath();c.arc(cx+Math.sin(i*2.8)*w*.42,cy+h*.3-p*h*.95,T*(.08+p*.15),0,7);c.stroke();}
      } else {
        effect(c,Themes,4,cx,cy-t*T*.7,size*(.6+u*.65),Math.sin(u*Math.PI)*(water?.95:.45));
        if(!water)effect(c,Themes,3,cx,cy+h*.1,size*.8,Math.sin(u*Math.PI)*.45);
        for(let i=0;i<10;i++){const p=(t*.7+i*.137)%1;c.globalAlpha=(1-u)*(1-p);c.fillStyle=water?'#d8ffff':'#ffce79';c.beginPath();c.arc(cx+Math.sin(i*2.1)*w*.4,cy+h*.25-p*h,T*(.02+(i%3)*.012),0,7);c.fill();}
      }
    } else {
      const crystal=kind==='crystal',delay=crystal?.26:.11,p=clamp((t-delay)/1.25);
      if(t<delay){paintBody(c,{x:b.x*T,y:b.y*T,w,h},a,t,Themes,1);if(crystal){c.globalAlpha=.45;c.fillStyle='#e2ddff';rect(c,b.x*T,b.y*T,w,h,Math.min(w,h)*.24);c.fill();}}
      else {
        if(water&&!crystal){c.globalAlpha=(1-p)*.38;c.fillStyle=a.colors[1];c.beginPath();c.ellipse(cx,cy+h*.35,w*(.24+p*.34),T*.16,0,0,7);c.fill();effect(c,Themes,0,cx,cy,size*(.6+p),Math.max(0,1-p*2));}
        else if(honey)effect(c,Themes,5,cx,cy,size*(.6+p),Math.max(0,1-p*1.8));
        else if(a.id==='purple'||a.id==='indigo')effect(c,Themes,1,cx,cy,size*(.55+p),Math.max(0,1-p*2));
        for(const q of f.pieces){
          const age=t-delay,drag=honey?.5:crystal?.9:1.1,x=cx+q.vx*T*age*drag,y=cy+(q.vy*age+age*age*(water?4:2.6))*T;
          c.save();c.globalAlpha=1-p;c.translate(x,y);c.rotate(q.angle+age*(crystal?2:5));
          const r=q.r*T*(crystal?.9:1.25)*(1-p*.5),g=c.createLinearGradient(0,-r,0,r);g.addColorStop(0,a.colors[0]);g.addColorStop(1,a.colors[2]);c.fillStyle=g;
          if(crystal){c.beginPath();c.moveTo(0,-r*1.5);c.lineTo(r,r*.1);c.lineTo(0,r);c.lineTo(-r*.8,0);c.closePath();}
          else if(water||a.material==='gel'){c.beginPath();c.ellipse(0,0,r*.7,r*(1+age*.2),0,0,7);}
          else rect(c,-r,-r,r*2,r*(honey?2.8:2),r*.6);
          c.fill();c.fillStyle='#ffffff99';c.beginPath();c.arc(-r*.2,-r*.3,r*.22,0,7);c.fill();c.restore();
        }
      }
    }
    c.restore();
    drawSurvivingEyes(c,f,T);
  }
  function drawSurvivingEyes(c,f,T) {
    const {b,kind,actor:a}=f,t=f.age,water=a.material==='water';
    const release=kind==='spikes'?.08:kind==='crystal'?.19:.22;
    const age=Math.max(0,t-release),fade=clamp((f.duration-t)/.24);
    const size=Math.min(b.w,b.h,3.1)*T,r=Math.max(T*.13,size*.15);
    const cx=(b.x+b.w/2)*T,cy=(b.y+b.h/2)*T-size*.075;
    for(const side of [-1,1]){
      const drift=side*(1-Math.exp(-age*3))*T*.38-f.dx*T*age*.12;
      let lift;
      if(kind==='fire'&&water)lift=-T*.55*Math.sin(Math.min(age/.85,1)*Math.PI)+T*.25*Math.max(0,age-.85);
      else if(kind==='poison')lift=T*.15*Math.sin(age*9+side)*Math.min(1,age*3)+T*.35*Math.min(age,1);
      else {const flight=Math.min(age,.62);lift=T*(-1.65*flight+3.1*flight*flight);if(age>.62)lift=T*.17-T*.16*Math.abs(Math.sin((age-.62)*12))*Math.exp(-(age-.62)*4);}
      const x=cx+side*size*.23+drift,y=cy+lift;
      c.save();c.globalAlpha=fade;c.translate(x,y);c.rotate(side*Math.sin(age*7)*Math.exp(-age)*.22);
      // The pair survives the body, looks around, then blinks just before retry.
      const blink=age>1.15&&age<1.27?.16:1;
      c.fillStyle='#20192e35';c.beginPath();c.ellipse(0,r*.95,r*.83,r*.19,0,0,7);c.fill();
      c.fillStyle='#fffdfd';c.beginPath();c.ellipse(0,0,r,r*1.08*blink,0,0,7);c.fill();
      c.strokeStyle='#cabdde';c.lineWidth=Math.max(.6,T*.025);c.stroke();
      if(blink>.3){
        const look=kind==='poison'?Math.sin(age*11+side)*.25:Math.sin(age*5)*.16;
        c.fillStyle=a.ink;c.beginPath();c.ellipse(r*look,r*(.12+Math.sin(age*4)*.12),r*.55,r*.66,0,0,7);c.fill();
        c.fillStyle='#fff';c.beginPath();c.arc(r*(look+.17),-r*.12,r*.19,0,7);c.fill();
      }
      c.restore();
    }
  }
  const api={SKINS,PROFILES,FX,forLevel,profile,morph,sampleMorph,paintBody,impact,drawImpact,death,drawDeath,effect};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyMotion=api;
})(this);
