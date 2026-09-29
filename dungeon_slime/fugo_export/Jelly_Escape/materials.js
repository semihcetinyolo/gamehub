// Each level keeps one immutable wall / hazard pair for its entire run.
(function(root){
  const rows = [
    ['limestone','obsidian','moon','Fildişi Hisar','spikes','#ded5c3','#777168','#d9e2f2'],
    ['rose','amethyst','garden','Gül Kuvarsı','crystal','#efc5d1','#aa718d','#e99cff'],
    ['sandstone','magma','ember','Lav Mabedi','fire','#e6c28e','#987458','#ffac45'],
    ['frost','ice','moon','Buz Sarayı','ice','#d3e7ef','#8196b0','#7ae9ff'],
    ['forest','venom','toxic','Zehirli Harabeler','poison','#c8cbc0','#777d76','#cbf45b'],
    ['copper','electric','ember','Yıldırım Atölyesi','electric','#d6b696','#8a6956','#ffe37b'],
    ['moon','void','moon','Boşluk Tapınağı','void','#d5cce9','#827997','#ee93ff'],
    ['candy','thorns','garden','Dikenli Şekerlik','thorns','#f1dfbb','#ad8d71','#ff95ab'],
    ['coral','brine','toxic','Mercan Sığınağı','brine','#ead5cd','#9a8283','#68f1df'],
    ['clockwork','saws','moon','Saat Kulesi','saws','#d4c6a1','#8b816a','#ffe1a4'],
  ];
  const MATERIALS=Object.fromEntries(rows.map(([id,hazardId,theme,name,hazardStyle,top,base,accent])=>[id,{
    id,theme,name,hazardStyle,wall:[top,base],accent,
    hazardType:({ice:'spikes',electric:'fire',void:'crystal',thorns:'spikes',brine:'poison',saws:'spikes'})[hazardStyle]||hazardStyle,
    wallArt:'assets/materials/wall-'+id+'.webp',
    hazardArt:'assets/materials/hazard-'+hazardId+'.webp',
  }]));
  const api={MATERIALS,defaults:{garden:'rose',moon:'limestone',ember:'sandstone',toxic:'forest'}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JellyMaterials=api;
})(this);
