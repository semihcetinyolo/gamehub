// A level owns one theme. Rendering never chooses a theme by room, position or time.
(function (root) {
  const THEMES = {
    garden: {
      actor: 'purple', hazardType: 'crystal', id: 'garden', name: 'Kristal Bahçe', subtitle: 'Çiçekler arasında bir kaçış', mark: '✿',
      atlas: 'assets/themes/garden-atlas.webp', accent: '#ef9ec4',
      backdrop: ['#50405e', '#282437'], floor: ['#f8dce8', '#edc9df'],
      wall: ['#f7a9cb', '#b65083'], hazard: '#e164ff', hazardName: 'kristallere',
      jelly: ['#ed9cff', '#b931e6', '#7020b4'], rgb: '185,49,230', ink: '#321153',
      body: [40, 548, 436, 414],
    },
    moon: {
      actor: 'indigo', hazardType: 'spikes', id: 'moon', name: 'Aytaşı Zindanı', subtitle: 'Ay ışığında gizli geçitler', mark: '☾',
      atlas: 'assets/themes/moon-atlas.webp', accent: '#b7b6ff',
      backdrop: ['#424563', '#202237'], floor: ['#cac5de', '#bcb6d2'],
      wall: ['#8288ad', '#414668'], hazard: '#c6a1fb', hazardName: 'dikenlere',
      jelly: ['#b2a4ff', '#8055ed', '#4c2ca8'], rgb: '128,85,237', ink: '#211548',
      body: [34, 550, 450, 426],
    },
    ember: {
      actor: 'water', hazardType: 'fire', id: 'ember', name: 'Kor Kalesi', subtitle: 'Alevler içinde serin bir kahraman', mark: '♨',
      atlas: 'assets/themes/ember-atlas.webp', accent: '#ffc18b',
      backdrop: ['#613936', '#291f2d'], floor: ['#ce9478', '#bc836e'],
      wall: ['#80717e', '#433443'], hazard: '#ff9147', hazardName: 'lavlara',
      jelly: ['#9cf5ff', '#19c6ed', '#1479c7'], rgb: '25,198,237', ink: '#083757',
      body: [34, 540, 444, 440],
    },
    toxic: {
      actor:'rose', hazardType:'poison', id:'toxic', name:'Zehirli Sera', subtitle:'Kabarcıkların arasından kaç', mark:'◉',
      atlas:'assets/themes/toxic-atlas.webp', accent:'#c3eb96',
      backdrop:['#314e47','#192c30'], floor:['#d0e4cc','#b8d4b8'],
      wall:['#aaa8ad','#595b69'], hazard:'#c1f54b', hazardName:'zehirli duvarlara',
    },
  };
  const images = new Map();
  const byId = id => THEMES[id] || THEMES.garden;
  const forLevel = level => byId(level.theme);
  function load(theme) {
    if (images.has(theme.atlas)) return images.get(theme.atlas).promise;
    const image = new Image();
    const entry = { image, ready: false, promise: null };
    entry.promise = new Promise(resolve => {
      image.onload = () => { entry.ready = true; resolve(true); };
      image.onerror = () => resolve(false); // theme-colored canvas fallback, frozen for this run
    });
    images.set(theme.atlas, entry); image.src = theme.atlas;
    return entry.promise;
  }
  // Atlas rectangles use a canonical 1536×1024 layout, independent of export resolution.
  function sprite(ctx, theme, rect, x, y, w, h) {
    const entry = images.get(theme.atlas);
    if (!entry || !entry.ready) return false;
    const im = entry.image, sx = im.naturalWidth / 1536, sy = im.naturalHeight / 1024;
    ctx.drawImage(im, rect[0] * sx, rect[1] * sy, rect[2] * sx, rect[3] * sy, x, y, w, h);
    return true;
  }
  const api = { THEMES, byId, forLevel, load, sprite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JellyThemes = api;
})(this);
