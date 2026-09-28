// Reactions affect presentation only. Every hazardous contact remains lethal.
(function(root){
  const JELLIES={
    purple:{id:'lightning',name:'Şimşek',mark:'ϟ',color:'#fff1a3'},
    indigo:{id:'ice',name:'Buz',mark:'❄',color:'#c1eaff'},
    water:{id:'water',name:'Su',mark:'≈',color:'#b8faff'},
    mint:{id:'nature',name:'Doğa',mark:'❧',color:'#caffac'},
    amber:{id:'fire',name:'Ateş',mark:'♨',color:'#ffe499'},
    void:{id:'void',name:'Boşluk',mark:'◌',color:'#cbb4ff'},
    rose:{id:'air',name:'Rüzgâr',mark:'≋',color:'#f1fcff'},
  };
  const HAZARDS={
    spikes:{name:'Metal diken',element:'metal',family:'spikes',color:'#e2e6f4'},
    crystal:{name:'Kristal',element:'crystal',family:'crystal',color:'#dcabff'},
    fire:{name:'Lav',element:'fire',family:'fire',color:'#ffb15c'},
    ice:{name:'Buz',element:'ice',family:'crystal',color:'#9bedff'},
    poison:{name:'Zehir',element:'poison',family:'poison',color:'#c6f76e'},
    electric:{name:'Elektrik',element:'lightning',family:'fire',color:'#ffe99c'},
    void:{name:'Boşluk',element:'void',family:'crystal',color:'#b394ff'},
    thorns:{name:'Dikenli sarmaşık',element:'nature',family:'spikes',color:'#eba5b8'},
    brine:{name:'Asit',element:'acid',family:'poison',color:'#a1ffdc'},
    saws:{name:'Metal testere',element:'metal',family:'spikes',color:'#f1d9a8'},
  };
  // Column order: water, ice, nature, lightning, fire, air, void.
  const MATRIX={
    fire:['steam','melt','burn','overload','flare','firestorm','collapse'],
    poison:['contaminate','etch','wither','short','fume','toxicCloud','voidFume'],
    brine:['contaminate','etch','wither','short','fume','toxicCloud','voidFume'],
    electric:['short','fracture','burn','overload','plasma','ionize','collapse'],
    ice:['freeze','resonance','wither','fracture','thermalShock','snowstorm','singularity'],
    crystal:['crystallize','resonance','petrify','resonance','thermalShock','crystallize','singularity'],
    void:['vortex','vortex','vortex','vortex','vortex','vortex','vortex'],
    spikes:['puncture','chip','tear','discharge','embers','gust','starfall'],
    thorns:['puncture','chip','tear','discharge','embers','gust','starfall'],
    saws:['slice','chip','tear','discharge','embers','gust','starfall'],
  };
  const LABELS={collapse:'Boşluk çöküşü',voidFume:'Karanlık sis',singularity:'Tekilliğe çekilme',starfall:'Yıldızların dağılması',steam:'Buharlaşma',melt:'Erime',burn:'Külleşme',overload:'Enerji taşması',flare:'Alev patlaması',firestorm:'Ateş girdabı',contaminate:'Zehirli çözünme',etch:'Aşınma',wither:'Solma',short:'Kısa devre',fume:'Duman tepkimesi',toxicCloud:'Zehir bulutu',fracture:'Çatlama',plasma:'Plazma parlaması',ionize:'İyonlaşma',freeze:'Ani donma',resonance:'Kristal rezonansı',thermalShock:'Termal şok',snowstorm:'Kar girdabı',crystallize:'Kristalleşme',petrify:'Taşlaşma',vortex:'Boşluğa çekilme',puncture:'Delinme',chip:'Buz kırılması',tear:'Liflerin kopması',discharge:'Elektrik boşalması',embers:'Kıvılcımlara dağılma',gust:'Rüzgârın dağılması',slice:'Kesilme'};
  function reaction(actor,hazard){
    const element=JELLIES[actor.id]||JELLIES.purple,h=HAZARDS[hazard]||HAZARDS.spikes;
    const effect=(MATRIX[hazard]||MATRIX.spikes)[['water','ice','nature','lightning','fire','air','void'].indexOf(element.id)];
    return {id:element.id+':'+hazard,element:element.id,hazardElement:h.element,hazard,effect,label:LABELS[effect],color:element.color,hazardColor:h.color};
  }
  const api={JELLIES,HAZARDS,MATRIX,reaction};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyElements=api;
})(this);
