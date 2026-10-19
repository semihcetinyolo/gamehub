// Artwork slots. Every entry may point to an image (e.g. made with Astra, see assets/ART.md);
// leave it null and the game draws its built-in placeholder for that part.
window.ART = {
  table: 'assets/tabletop.jpg',        // warm walnut tabletop background
  wood: 'assets/board-panel.png',      // complete marble / brass / cloth play board
  card: null,                          // tray is included in board-panel.png
  discs: [
    'assets/disc-teal.png',
    'assets/disc-pink.png',
    'assets/disc-blue.png',
    'assets/disc-orange.png',
  ],
  features: {
    clayLiner3: 'assets/clay-liner-3.png',
    clayLiner4: 'assets/clay-liner-4.png',
    clayFunnel: 'assets/clay-funnel.png',
    clayMouth: 'assets/clay-mouth-v2.png',
    clayIntro: 'assets/clay-intro.png',
    stopperDoorL: 'assets/stopper-door-l.png',
    stopperDoorR: 'assets/stopper-door-r.png',
    stopperChipOpen: 'assets/stopper-chip-open.png',
    stopperChipShut: 'assets/stopper-chip-shut.png',
    stopperIntro: 'assets/stopper-intro.png',
    iceCube: 'assets/ice-cube.png',
    iceChip: 'assets/ice-chip.png',
    iceShards: 'assets/ice-shards.png',
    iceIntro: 'assets/ice-intro.png',
  },
};

// Disc colours (used for the placeholders and the dots on the target card).
window.DISC_COLORS = [
  { name: 'Turkuaz', face: '#55cabc', side: '#319f94' },
  { name: 'Pembe', face: '#f26482', side: '#cb405e' },
  { name: 'Mavi', face: '#4389d4', side: '#2864a7' },
  { name: 'Turuncu', face: '#f5a13a', side: '#c9761a' },
];
