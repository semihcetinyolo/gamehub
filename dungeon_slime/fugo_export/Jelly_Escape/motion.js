// Material animation is presentation only: collision shapes and level solutions stay in engine.js.
(function(root) {
  const Elements=typeof module!=='undefined'&&module.exports?require('./elements'):root.JellyElements;
  // Legacy IDs remain stable for saved progress and existing level definitions.
  const bodyArt=(id,material,colors,rgb,ink)=>({material,atlas:'assets/characters/'+id+(id==='ice'?'.png':'.webp'),body:[0,0,1536,1024],portrait:[0,0],standalone:true,colors,rgb,ink});
  const SKINS = {
    purple:bodyArt('lightning','electric',['#fffacb','#ffdd26','#c28512'],'255,221,38','#574015'),
    indigo:bodyArt('ice','ice',['#f2ffff','#a5e8f7','#489cbb'],'165,232,247','#154358'),
    water:{material:'water',atlas:'assets/themes/ember-atlas.webp',body:[34,540,444,440],portrait:[1,1],colors:['#9cf5ff','#19c6ed','#1479c7'],rgb:'25,198,237',ink:'#083757'},
    mint:{material:'gel',atlas:'assets/animation/jellies.webp',body:[52,56,414,391],portrait:[0,1],colors:['#c0ffe4','#31d998','#138867'],rgb:'49,217,152',ink:'#104837'},
    amber:bodyArt('fire','fire',['#fff1aa','#ff741e','#bd3022'],'255,116,30','#6d2515'),
    rose:bodyArt('air','air',['#ffffff','#e6f3f7','#a3bdc9'],'230,243,247','#345466'),
    void:{...bodyArt('void','void',['#f4d4ff','#b46af2','#7842ba'],'180,106,242','#513174'),atlas:'assets/characters/void-pearl.png'},
  };
  for(const [id,skin] of Object.entries(SKINS)){skin.id=id;skin.element=Elements.JELLIES[id];skin.name=skin.element.name+' Jölisi';skin.forms=Object.fromEntries(['tall','flat'].map(form=>[form,{atlas:'assets/characters/forms/'+skin.element.id+'-'+form+'.png'}]));}
  const PROFILES = {
    water:{duration:.20,ease:2.4,breath:.011,frequency:2.5,description:'Akışkan dalga ve su halkaları'},
    electric:{duration:.16,ease:3.2,breath:.014,frequency:5,description:'Hızlı esneme ve parlak elektrik damarları'},
    ice:{duration:.18,ease:2.8,breath:.006,frequency:1.6,description:'Buz yüzeyleri ve kristal parıltıları'},
    gel:{duration:.21,ease:2.6,breath:.018,frequency:3.1,description:'Yumuşak salınım ve kabarcıklar'},
    fire:{duration:.18,ease:2.7,breath:.024,frequency:3.8,description:'Alev tepesi, kor ve yükselen kıvılcımlar'},
    air:{duration:.20,ease:2.4,breath:.028,frequency:2.1,description:'Beyaz bulut kıvrımları ve akan rüzgâr'},
    void:{duration:.19,ease:2.8,breath:.017,frequency:2.2,description:'Sedefli mor gövde, yıldızlar ve dönen boşluk halkası'},
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
  // Square and elongated illustrations share the same material. Blend by aspect
  // ratio, never replace a loaded character with the generic missing-art fallback.
  function bodyLayers(b,actor,Themes) {
    const ratio=Math.max(b.w,b.h)/Math.max(.001,Math.min(b.w,b.h));
    const form=actor.forms[b.h>b.w?'tall':'flat'];
    const t=clamp((ratio-1.05)/1.8),blend=Themes.ready?.(form)?t*t*(3-2*t):0;
    return [{art:actor,rect:actor.body,alpha:1-blend,form:false},
      {art:form,rect:[0,0,1536,1024],alpha:blend,form:true}].filter(layer=>layer.alpha>.001);
  }
  function paintIllustration(c,b,actor,time,Themes,layer) {
    const {x,y,w,h}=b,[sx,sy,sw,sh]=layer.rect;
    if(!layer.form){
      c.save();if(!actor.standalone){rect(c,x,y,w,h,Math.min(w,h)*.24);c.clip();}
      const e=Math.min(w,h)*.25;
      const xx=[x,x+e,x+w-e,x+w],yy=[y,y+e,y+h-e,y+h],ax=[sx,sx+sw*.25,sx+sw*.75,sx+sw],ay=[sy,sy+sh*.25,sy+sh*.75,sy+sh];
      for(let j=0;j<3;j++)for(let i=0;i<3;i++)Themes.sprite(c,layer.art,[ax[i],ay[j],ax[i+1]-ax[i],ay[j+1]-ay[j]],xx[i],yy[j],xx[i+1]-xx[i],yy[j+1]-yy[j]);
      c.restore();return;
    }
    // A gentle travelling bend keeps every form alive, inside its collision box.
    // The short edge controls motion and detail size, including the 1×8 forms.
    const vertical=h>w,u=Math.min(w,h),p=profile(actor),amp=u*(actor.material==='ice'?.009:.025),n=28;
    for(let i=0;i<n;i++){
      const a=i/n,z=(i+.5)/n;
      const bend=Math.sin(time*p.frequency*1.7-z*Math.PI*3)*Math.sin(Math.PI*z)*amp;
      if(vertical)Themes.sprite(c,layer.art,[sx,sy+sh*a,sw,sh/n],x+amp+bend,y+h*a,w-amp*2,h/n);
      else Themes.sprite(c,layer.art,[sx+sw*a,sy,sw/n,sh],x+w*a,y+amp+bend,w/n,h-amp*2);
    }
  }
  function paintBody(c,b,actor,time,Themes,energy=0) {
    const opacity=typeof c.globalAlpha==='number'?c.globalAlpha:1;
    const {x,y,w,h}=b,r=Math.min(w,h)*.24;
    const illustrated=Themes.ready?.(actor);
    c.save();
    if(!illustrated){rect(c,x,y,w,h,r);c.clip();const g=c.createLinearGradient(0,y,0,y+h);actor.colors.forEach((v,i)=>g.addColorStop(i/2,v));c.fillStyle=g;c.fillRect(x,y,w,h);}
    for(const layer of bodyLayers(b,actor,Themes)){
      c.save();c.globalAlpha=opacity*layer.alpha;paintIllustration(c,b,actor,time,Themes,layer);c.restore();
    }
    c.restore();c.save();rect(c,x,y,w,h,r);c.clip();
    if(actor.material==='water') {
      c.strokeStyle='#caffff';c.lineWidth=Math.max(.7,Math.min(w,h)*.022);c.globalAlpha=opacity*(.24+energy*.35);
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(x+w*.5,y+h*(.3+i*.2)+Math.sin(time*5+i)*h*.025,w*(.3+i*.065),h*.065,0,0,7);c.stroke();}
    } else if(actor.material==='gel') {
      c.strokeStyle='#dcffee';c.lineWidth=Math.max(.6,Math.min(w,h)*.018);c.globalAlpha=opacity*(.4);
      for(let i=0;i<5;i++){const t=(time*.14+i*.21)%1;c.beginPath();c.arc(x+w*(.17+(i%3)*.3),y+h*(.87-t*.7),Math.min(w,h)*(.025+i*.007),0,7);c.stroke();}
    } else if(actor.material==='fire') {
      c.fillStyle='#fff59b';c.globalAlpha=opacity*(.21);
      for(let i=0;i<3;i++){const u=Math.min(w,h),t=(time*.45+i*.31)%1;c.globalAlpha=opacity*.14*Math.sin(t*Math.PI);c.beginPath();c.ellipse(x+w*(.2+i*.3),y+h*(.82-t*.65),u*.04,u*.12,-.2,0,7);c.fill();}
    } else if(energy>.01) {
      c.strokeStyle=actor.element.color;c.globalAlpha=opacity*(energy*.55);c.lineWidth=Math.max(1,Math.min(w,h)*.027);
      rect(c,x+w*.06,y+h*.06,w*.88,h*.88,r);c.stroke();
    }
    // Small material cues stay within the collision silhouette and clear of the eyes.
    c.globalAlpha=opacity*(.4);c.strokeStyle=actor.element.color;c.fillStyle=actor.element.color;c.lineWidth=Math.max(.7,Math.min(w,h)*.018);
    const unit=Math.min(w,h),el=actor.element.id;
    if(el==='lightning'){
      const pulse=.5+.4*Math.max(0,Math.sin(time*7));c.globalAlpha=opacity*(pulse);c.beginPath();c.moveTo(x+w*.13,y+h*.2);c.lineTo(x+w*.24,y+h*.3);c.lineTo(x+w*.16,y+h*.34);c.lineTo(x+w*.27,y+h*.41);c.stroke();
    }else if(el==='ice'){
      for(const [xx,yy] of [[x+w*.19,y+h*.23],[x+w*.81,y+h*.8]])for(let i=0;i<3;i++){const a=i*Math.PI/3;c.beginPath();c.moveTo(xx-Math.cos(a)*unit*.065,yy-Math.sin(a)*unit*.065);c.lineTo(xx+Math.cos(a)*unit*.065,yy+Math.sin(a)*unit*.065);c.stroke();}
    }else if(el==='fire'){
      for(let i=0;i<5;i++){const t=(time*.6+i*.2)%1;c.globalAlpha=opacity*((1-t)*.6);c.beginPath();c.arc(x+w*(i%2?.85:.14),y+h*(.85-t*.65),unit*.022*(1-t*.5),0,7);c.fill();}
    }else if(el==='air'){
      for(let i=0;i<2;i++){const yy=y+h*(.75+i*.08);c.beginPath();c.moveTo(x+w*.15,yy);c.bezierCurveTo(x+w*.4,yy+Math.sin(time*3)*h*.025,x+w*.65,yy-h*.035,x+w*.83,yy);c.stroke();}
    }else if(el==='void'){
      c.strokeStyle='#ccb0ff';c.globalAlpha=opacity*.6;
      for(let i=0;i<2;i++){c.beginPath();c.ellipse(x+w*.5,y+unit*.24,unit*.19,unit*.085,time*.65+i*.5,0,Math.PI*1.5);c.stroke();}
      for(let i=0;i<6;i++){c.globalAlpha=opacity*(.3+.5*Math.sin(time*2+i)**2);c.beginPath();c.arc(x+w*(.1+(i*.173)%.8),y+h*(.15+(i*.271)%.7),unit*.016,0,7);c.fill();}
    }else if(el==='nature'){
      for(const [xx,yy] of [[x+w*.16,y+h*.23],[x+w*.85,y+h*.8]]){c.beginPath();c.ellipse(xx,yy,unit*.035,unit*.065,.5+Math.sin(time*2)*.15,0,7);c.fill();}
    }
    c.restore();
    // A persistent elemental crest, kept above the face and inside every form.
    c.save();c.globalAlpha=opacity*(.72);c.fillStyle=actor.element.color;
    const emblem=Math.min(w,h)*.22;c.font=`bold ${emblem}px system-ui`;c.textAlign='center';c.textBaseline='middle';
    if(!actor.standalone)c.fillText(actor.element.mark,x+w*.5,y+h*.15);c.restore();
    if(!illustrated){c.save();c.globalAlpha=opacity;c.strokeStyle=actor.colors[2];c.lineWidth=Math.max(.7,Math.min(w,h)*.018);rect(c,x,y,w,h,r);c.stroke();c.restore();}
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
      particle(c,a.element.id,x*T,y*T,T*.07*(1-u),i+t*3,a.colors[i%3]);
    }
    c.restore();
  }
  function death(b,dx,dy,actor,hazard) {
    const style=Elements.HAZARDS[hazard]?hazard:'spikes',reaction=Elements.reaction(actor,style),kind=Elements.HAZARDS[style].family;
    const duration=style==='void'?2.2:kind==='crystal'?2.1:kind==='poison'?2.25:kind==='fire'?2:1.65;
    const pieces=Array.from({length:24},(_,i)=>{const angle=i*2.39996;return {i,angle,r:.1+(i%4)*.035,vx:Math.cos(angle)*(1.5+i%5*.4)-dx*2.4,vy:Math.sin(angle)*(1.5+i%5*.4)-dy*2.4};});
    return {age:0,duration,b:{x:b.x,y:b.y,w:b.w,h:b.h},actor,kind,hazard:style,reaction,dx,dy,pieces};
  }
  function particle(c,element,x,y,r,angle,color){
    c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.strokeStyle=color;c.lineWidth=Math.max(.7,r*.28);
    c.beginPath();
    if(element==='lightning'){c.moveTo(r*.6,-r);c.lineTo(-r*.5,0);c.lineTo(r*.2,0);c.lineTo(-r*.5,r);c.stroke();}
    else if(element==='ice'){c.moveTo(0,-r);c.lineTo(r*.65,0);c.lineTo(0,r*1.3);c.lineTo(-r*.55,0);c.closePath();c.fill();}
    else if(element==='nature'){c.ellipse(0,0,r*.5,r*1.4,.5,0,7);c.fill();c.strokeStyle='#346745';c.beginPath();c.moveTo(0,-r);c.lineTo(0,r);c.stroke();}
    else if(element==='air'){c.arc(0,0,r*1.5,0,Math.PI*1.4);c.stroke();}
    else if(element==='void'){c.moveTo(0,-r*1.5);c.lineTo(r*.35,-r*.35);c.lineTo(r*1.5,0);c.lineTo(r*.35,r*.35);c.lineTo(0,r*1.5);c.lineTo(-r*.35,r*.35);c.lineTo(-r*1.5,0);c.lineTo(-r*.35,-r*.35);c.closePath();c.fill();}
    else if(element==='fire'){c.moveTo(-r,r);c.quadraticCurveTo(-r,-r,0,-r*1.7);c.quadraticCurveTo(r*.2,-r*.1,r,r);c.closePath();c.fill();}
    else {c.ellipse(0,0,r*.65,r*1.25,0,0,7);c.fill();}
    c.restore();
  }
  function arcs(c,cx,cy,size,t,color,alpha=1){
    c.save();c.globalAlpha=clamp(alpha);c.strokeStyle=color;c.lineWidth=Math.max(1,size*.02);
    for(let i=0;i<5;i++){const a=i*1.256+t*3;c.beginPath();for(let j=0;j<5;j++){const r=size*(.1+j*.105),k=a+(j%2?.22:-.18);const x=cx+Math.cos(k)*r,y=cy+Math.sin(k)*r;j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}c.restore();
  }
  function drawDeath(c,f,T,Themes) {
    const {b,actor:a,hazard,reaction:r}=f,t=f.age,u=clamp(t/f.duration),cx=(b.x+b.w/2)*T,cy=(b.y+b.h/2)*T,w=b.w*T,h=b.h*T,size=Math.max(w,h),fade=clamp((1-u)*2);
    const body=(sx,sy,alpha=1,offset=0)=>{if(alpha<=.001)return;c.save();c.globalAlpha=clamp(alpha);paintBody(c,{x:cx-w*sx/2,y:cy-h*sy/2+offset,w:Math.max(.01,w*sx),h:Math.max(.01,h*sy)},a,t,Themes,.8);c.restore();};
    c.save();
    if(hazard==='void'||r.element==='void'){
      const collapse=1-clamp(t/(r.effect==='starfall'?.65:1.1));c.save();c.translate(cx,cy);c.rotate(t*t*3);c.translate(-cx,-cy);body(collapse,collapse,collapse);c.restore();
      c.strokeStyle=hazard==='void'?'#ba8bff':r.hazardColor;c.lineWidth=T*.065;c.globalAlpha=fade;c.beginPath();
      for(let i=0;i<130;i++){const v=i/130,angle=v*Math.PI*7+t*5,rad=size*.55*(1-v);const x=cx+Math.cos(angle)*rad,y=cy+Math.sin(angle)*rad*.5;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
      for(const q of f.pieces){const rad=size*(.5+q.i%3*.1)*(1-u),angle=q.angle+t*4;particle(c,r.element,cx+Math.cos(angle)*rad,cy+Math.sin(angle)*rad*.6,q.r*T*fade,angle,a.colors[q.i%3]);}
    }else if(hazard==='crystal'||hazard==='ice'){
      // Crystals grow in place, imprison the jelly, then collapse vertically.
      // No radial projectile burst: silhouette and trajectory differ from puncture.
      const grow=clamp(t/.48),fall=clamp((t-.95)/.8),remain=1-fall;
      body(1-fall*.3,1-fall*.8,(1-grow*.7)*remain,h*fall*.35);
      c.save();c.globalAlpha=fade;
      const count=7;
      for(let i=0;i<count;i++){
        const x=cx+w*(i/(count-1)-.5),height=h*(.55+(i%3)*.2)*grow*remain,y=cy+h*.48+fall*fall*T*(i%3+.5);
        c.beginPath();c.moveTo(x-w*.1,y);c.lineTo(x-w*.085,y-height*.75);c.lineTo(x,y-height);c.lineTo(x+w*.09,y-height*.78);c.lineTo(x+w*.1,y);c.closePath();
        c.fillStyle=i%2?r.hazardColor:a.colors[1];c.globalAlpha=fade*.78;c.fill();c.strokeStyle='#effaff';c.lineWidth=Math.max(.6,T*.03);c.stroke();
        if(t>.42){c.beginPath();c.moveTo(x,y-height*.9);c.lineTo(x-w*.035,y-height*.5);c.lineTo(x+w*.045,y-height*.25);c.strokeStyle='#514669';c.stroke();}
      }c.restore();
      if(r.effect==='resonance'){c.globalAlpha=fade*.55;c.strokeStyle=r.color;c.lineWidth=T*.045;for(let i=0;i<3;i++){c.beginPath();c.ellipse(cx,cy,size*(.3+((t*.6+i*.25)%1)*.4),T*.18,0,0,7);c.stroke();}}
      if(r.effect==='thermalShock'){for(const q of f.pieces.slice(0,10)){c.globalAlpha=fade*.3;c.fillStyle='#f6ffff';c.beginPath();c.arc(cx+Math.sin(q.angle)*w*.4,cy-t*T*(.4+q.i*.04),T*(.15+t*.08),0,7);c.fill();}}
      if(r.effect==='petrify'){c.globalAlpha=fade;for(const q of f.pieces.slice(0,8))particle(c,'nature',cx+Math.sin(q.angle)*w*.45,cy+h*.35+fall*T,q.r*T,t,'#7e8876');}
    }else if(['spikes','thorns','saws'].includes(hazard)){
      const burst=clamp(t/.23);
      if(t<.25){
        if(hazard==='saws'){c.save();c.beginPath();c.rect(cx-w,cy-h,w*2,h);c.clip();body(1,1,1-burst,-burst*T*.35);c.restore();c.save();c.beginPath();c.rect(cx-w,cy,w*2,h);c.clip();body(1,1,1-burst,burst*T*.35);c.restore();}
        else body(1+burst*.2,1-burst*.88,1-burst,h*burst*.35);
      }
      if(r.element==='water'){c.globalAlpha=fade*.55;c.fillStyle=a.colors[1];c.beginPath();c.ellipse(cx,cy+h*.4,w*(.3+u*.15),T*.14,0,0,7);c.fill();}
      c.globalAlpha=fade;
      for(const q of f.pieces){const age=Math.max(0,t-.025),x=cx+q.vx*T*age,y=cy+(q.vy*age+3.5*age*age)*T;
        particle(c,r.element,x,y,q.r*T*(1-u*.55),q.angle+t*(r.element==='ice'?1:5),a.colors[q.i%3]);}
      if(r.effect==='discharge')arcs(c,cx,cy,size,t,r.color,Math.max(0,1-t*2));
    }else{
      const electric=hazard==='electric',toxic=hazard==='poison'||hazard==='brine';
      const steam=['steam','fume','toxicCloud'].includes(r.effect),swirl=['firestorm','toxicCloud','ionize'].includes(r.effect);
      const collapse=clamp(t/(electric?.45:toxic?1.05:.8));
      if(r.effect==='overload'||r.effect==='plasma'){body(1+Math.sin(t*55)*.05,1+Math.sin(t*55)*.05,1-collapse);arcs(c,cx,cy,size*(.9+u),t,r.color,fade);}
      else body(1+collapse*.12,1-collapse,1-collapse,h*collapse*.45);
      if(r.element==='water'||r.effect==='melt'||toxic){c.globalAlpha=fade*.65;c.fillStyle=toxic?r.hazardColor:a.colors[1];c.beginPath();c.ellipse(cx,cy+h*.4,w*(.25+collapse*.25),T*.14,0,0,7);c.fill();}
      if(electric||r.effect==='short')arcs(c,cx,cy,size,t,toxic?r.hazardColor:'#fff0a6',fade*(.6+.4*Math.sin(t*32)**2));
      for(const q of f.pieces){
        const phase=(t*.65+q.i*.043)%1,angle=q.angle+t*(swirl?5:1),radius=w*(swirl?.2+phase*.35:.4);
        const x=cx+(swirl?Math.cos(angle):Math.sin(q.angle))*radius,y=r.effect==='melt'?cy-h*.25+phase*h*.75:cy+h*.3-phase*h*(steam?1.5:1.1);
        c.globalAlpha=fade*(1-phase);
        if(steam){c.fillStyle=toxic?'#c9ed9a':'#e9ffff';c.globalAlpha*=.3;c.beginPath();c.arc(x,y,T*(.14+phase*.35),0,7);c.fill();}
        else if(toxic){c.strokeStyle=r.hazardColor;c.lineWidth=T*.04;c.beginPath();c.arc(x,y,T*(.07+phase*.18),0,7);c.stroke();}
        else particle(c,r.effect==='burn'?'nature':r.effect==='melt'?'water':swirl?'fire':r.element,x,y,q.r*T*(1-phase*.45),angle,r.effect==='burn'?'#77716b':a.colors[q.i%3]);
      }
      if(r.effect==='etch'){c.globalAlpha=fade;for(const q of f.pieces.slice(0,8))particle(c,'ice',cx+Math.sin(q.angle)*w*.4,cy+t*T*.6,q.r*T,q.angle,r.hazardColor);}
      if(r.effect==='wither'){c.globalAlpha=fade;for(const q of f.pieces.slice(0,8))particle(c,'nature',cx+Math.sin(q.angle)*w*.4,cy+t*T*.5,q.r*T,q.angle+t,'#8a8960');}
    }
    c.restore();drawSurvivingEyes(c,f,T);
  }
  function drawSurvivingEyes(c,f,T) {
    const {b,kind,actor:a,hazard}=f,t=f.age,water=a.element.id==='water';
    const release=kind==='spikes'?.04:kind==='crystal'?.8:.12;
    const age=Math.max(0,t-release),fade=clamp((f.duration-t)/.24);
    const size=Math.min(b.w,b.h,3.1)*T,r=Math.max(T*.13,size*.15);
    const cx=(b.x+b.w/2)*T,cy=(b.y+b.h/2)*T-size*.075;
    for(const side of [-1,1]){
      const drift=side*(1-Math.exp(-age*3))*T*.38-f.dx*T*age*.12;
      let lift;
      if(hazard==='void'||a.element.id==='void')lift=Math.sin(age*6+side)*T*.5;
      else if(hazard==='electric')lift=T*.1*Math.sin(age*50)*Math.exp(-age)+T*.25*age;
      else if(kind==='crystal')lift=T*.42*Math.max(0,age)**2;
      else if(kind==='fire'&&water)lift=-T*.55*Math.sin(Math.min(age/.85,1)*Math.PI)+T*.25*Math.max(0,age-.85);
      else if(kind==='poison')lift=T*.15*Math.sin(age*9+side)*Math.min(1,age*3)+T*.35*Math.min(age,1);
      else {const flight=Math.min(age,.62);lift=T*(-1.65*flight+3.1*flight*flight);if(age>.62)lift=T*.17-T*.16*Math.abs(Math.sin((age-.62)*12))*Math.exp(-(age-.62)*4);}
      const shrink=(hazard==='void'||a.element.id==='void')?Math.max(0,1-t/f.duration):1;
      const x=cx+(side*size*.23+drift)*shrink,y=cy+lift*shrink;
      c.save();c.globalAlpha=fade;c.translate(x,y);if(hazard==='void'||a.element.id==='void')c.scale(shrink,shrink);c.rotate(side*Math.sin(age*7)*Math.exp(-age)*.22);
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
  const api={Elements,SKINS,PROFILES,FX,forLevel,profile,morph,sampleMorph,bodyLayers,paintBody,impact,drawImpact,death,drawDeath,effect};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyMotion=api;
})(this);
