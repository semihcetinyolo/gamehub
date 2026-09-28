// Pixhaku — Level 4–23. tools/build_pack.js üretir; elle değil, tools/pack_4-23.js üzerinden düzenle.
// Pixhaku_prototype.html'deki levels dizisine eklenecek biçimde.
//   solution  mantıksal çözüm sırasında: Hint her zaman sıradaki kesinleşen parçayı verir.
//   artImage  üretilmiş görselin proje içindeki yolu; prototipte görsel dosyanın içine gömülür.
const PIXHAKU_LEVELS_4_23 = [
  {
    // Level 4 — Kiraz Çiçeği Tapınağı · Kolay · Köşe açılışı
    rows: 5,
    cols: 5,
    clues: [
      { r: 0, c: 0, n: 6 },
      { r: 2, c: 3, n: 6 },
      { r: 2, c: 0, n: 3 },
      { r: 3, c: 2, n: 4 },
      { r: 4, c: 4, n: 4 },
      { r: 4, c: 2, n: 2 }
    ],
    solution: [
      [0, 0, 1, 2],
      [4, 1, 4, 2],
      [3, 3, 4, 4],
      [2, 1, 3, 2],
      [2, 0, 4, 0],
      [0, 3, 2, 4]
    ],
    artName: "Cherry Blossom Shrine",
    artImage: "assets/levels/level-4.jpg",
    artPrompt: "Cozy pixel-art cherry blossom shrine garden scene built on the Level 4 Shikaku region blueprint (6 zones, one continuous scene)."
  },
  {
    // Level 5 — Mercan Resifi · Kolay · Çift açılış
    rows: 6,
    cols: 6,
    clues: [
      { r: 1, c: 1, n: 8 },
      { r: 1, c: 5, n: 4 },
      { r: 3, c: 0, n: 9 },
      { r: 3, c: 3, n: 4 },
      { r: 3, c: 5, n: 4 },
      { r: 4, c: 3, n: 4 },
      { r: 5, c: 0, n: 3 }
    ],
    solution: [
      [5, 0, 5, 2],
      [2, 0, 4, 2],
      [4, 3, 5, 4],
      [2, 5, 5, 5],
      [0, 4, 1, 5],
      [0, 0, 1, 3],
      [2, 3, 3, 4]
    ],
    artName: "Coral Reef",
    artImage: "assets/levels/level-5.jpg",
    artPrompt: "Cozy pixel-art underwater coral reef scene built on the Level 5 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 6 — Hasat Çiftliği · Orta · Art arda kararlar
    rows: 6,
    cols: 6,
    clues: [
      { r: 0, c: 2, n: 6 },
      { r: 1, c: 3, n: 3 },
      { r: 1, c: 4, n: 6 },
      { r: 2, c: 2, n: 6 },
      { r: 4, c: 5, n: 6 },
      { r: 5, c: 1, n: 4 },
      { r: 4, c: 2, n: 2 },
      { r: 5, c: 5, n: 3 }
    ],
    solution: [
      [5, 3, 5, 5],
      [4, 0, 5, 1],
      [4, 2, 5, 2],
      [3, 3, 4, 5],
      [0, 4, 2, 5],
      [0, 0, 1, 2],
      [0, 3, 2, 3],
      [2, 0, 3, 2]
    ],
    artName: "Harvest Farm",
    artImage: "assets/levels/level-6.jpg",
    artPrompt: "Cozy pixel-art autumn harvest farm scene built on the Level 6 Shikaku region blueprint (8 zones, one continuous scene)."
  },
  {
    // Level 7 — Şeker Diyarı · Kolay · Nefes molası
    rows: 5,
    cols: 5,
    clues: [
      { r: 0, c: 1, n: 3 },
      { r: 0, c: 4, n: 4 },
      { r: 3, c: 0, n: 3 },
      { r: 1, c: 2, n: 4 },
      { r: 2, c: 4, n: 4 },
      { r: 3, c: 1, n: 2 },
      { r: 4, c: 3, n: 5 }
    ],
    solution: [
      [0, 3, 1, 4],
      [4, 0, 4, 4],
      [1, 0, 3, 0],
      [0, 0, 0, 2],
      [1, 1, 2, 2],
      [3, 1, 3, 2],
      [2, 3, 3, 4]
    ],
    artName: "Candy Land",
    artImage: "assets/levels/level-7.jpg",
    artPrompt: "Cozy pixel-art candy land scene built on the Level 7 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 8 — Çöl Vahası · Orta · Dev bloklar
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 0, n: 8 },
      { r: 0, c: 5, n: 6 },
      { r: 3, c: 0, n: 6 },
      { r: 2, c: 3, n: 9 },
      { r: 4, c: 5, n: 6 },
      { r: 5, c: 1, n: 6 },
      { r: 6, c: 6, n: 8 }
    ],
    solution: [
      [0, 0, 1, 3],
      [5, 3, 6, 6],
      [0, 4, 1, 6],
      [5, 0, 6, 2],
      [2, 5, 4, 6],
      [2, 2, 4, 4],
      [2, 0, 4, 1]
    ],
    artName: "Desert Oasis",
    artImage: "assets/levels/level-8.jpg",
    artPrompt: "Cozy pixel-art desert oasis town scene built on the Level 8 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 9 — Kutup Gecesi · Orta · Gizli sayı
    rows: 6,
    cols: 6,
    clues: [
      { r: 1, c: 3, n: 8 },
      { r: 1, c: 4, n: 4, h: 1 },
      { r: 3, c: 0, n: 4 },
      { r: 3, c: 4, n: 6 },
      { r: 5, c: 5, n: 4 },
      { r: 5, c: 0, n: 6 },
      { r: 5, c: 3, n: 4 }
    ],
    solution: [
      [4, 0, 5, 2],
      [0, 0, 1, 3],
      [2, 0, 3, 1],
      [2, 2, 3, 4],
      [4, 3, 5, 4],
      [2, 5, 5, 5],
      [0, 4, 1, 5]
    ],
    artName: "Arctic Night",
    artImage: "assets/levels/level-9.jpg",
    artPrompt: "Cozy pixel-art arctic night village scene built on the Level 9 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 10 — Buharlı Gök Şehri · Zor · Kalabalık parçalar · eleme
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 2, n: 6 },
      { r: 0, c: 4, n: 8 },
      { r: 5, c: 0, n: 4 },
      { r: 2, c: 1, n: 4 },
      { r: 3, c: 3, n: 6 },
      { r: 3, c: 6, n: 4 },
      { r: 4, c: 4, n: 4 },
      { r: 5, c: 5, n: 2 },
      { r: 5, c: 1, n: 2 },
      { r: 5, c: 4, n: 2 },
      { r: 6, c: 1, n: 7 }
    ],
    solution: [
      [6, 0, 6, 6],
      [5, 3, 5, 4],
      [2, 0, 5, 0],
      [0, 0, 1, 2],
      [5, 1, 5, 2],
      [0, 3, 1, 6],
      [2, 6, 5, 6],
      [4, 5, 5, 5],
      [4, 1, 4, 4],
      [2, 1, 3, 2],
      [2, 3, 3, 5]
    ],
    artName: "Steampunk Sky City",
    artImage: "assets/levels/level-10.jpg",
    artPrompt: "Cozy pixel-art steampunk sky city scene built on the Level 10 Shikaku region blueprint (11 zones, one continuous scene)."
  },
  {
    // Level 11 — Kitapçı Kafe · Kolay · Nefes molası · iç mekan
    rows: 6,
    cols: 6,
    clues: [
      { r: 1, c: 0, n: 4 },
      { r: 0, c: 1, n: 8 },
      { r: 2, c: 5, n: 4 },
      { r: 2, c: 1, n: 4 },
      { r: 2, c: 4, n: 4 },
      { r: 5, c: 2, n: 6 },
      { r: 4, c: 4, n: 4 },
      { r: 4, c: 5, n: 2 }
    ],
    solution: [
      [0, 1, 1, 4],
      [0, 5, 3, 5],
      [4, 5, 5, 5],
      [2, 3, 3, 4],
      [0, 0, 3, 0],
      [4, 3, 5, 4],
      [4, 0, 5, 2],
      [2, 1, 3, 2]
    ],
    artName: "Bookshop Café",
    artImage: "assets/levels/level-11.jpg",
    artPrompt: "Cozy pixel-art bookshop café interior scene built on the Level 11 Shikaku region blueprint (8 zones, one continuous scene)."
  },
  {
    // Level 12 — Korsan Koyu · Orta · Dik mi yatay mı
    rows: 7,
    cols: 7,
    clues: [
      { r: 1, c: 1, n: 4 },
      { r: 1, c: 2, n: 6 },
      { r: 2, c: 6, n: 6 },
      { r: 3, c: 3, n: 12 },
      { r: 4, c: 4, n: 3 },
      { r: 4, c: 6, n: 4 },
      { r: 6, c: 0, n: 4 },
      { r: 6, c: 3, n: 6 },
      { r: 5, c: 6, n: 4 }
    ],
    solution: [
      [3, 5, 4, 6],
      [0, 5, 2, 6],
      [0, 0, 1, 1],
      [2, 0, 4, 3],
      [5, 0, 6, 1],
      [0, 2, 1, 4],
      [5, 5, 6, 6],
      [5, 2, 6, 4],
      [2, 4, 4, 4]
    ],
    artName: "Pirate Cove",
    artImage: "assets/levels/level-12.jpg",
    artPrompt: "Cozy pixel-art tropical pirate cove scene built on the Level 12 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 13 — Dinozor Vadisi · Zor · Dev bloklar · kesişim
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 1, n: 8 },
      { r: 2, c: 7, n: 12 },
      { r: 5, c: 1, n: 8 },
      { r: 2, c: 2, n: 6 },
      { r: 3, c: 5, n: 9 },
      { r: 5, c: 7, n: 3 },
      { r: 6, c: 2, n: 6 },
      { r: 7, c: 0, n: 4 },
      { r: 7, c: 7, n: 8 }
    ],
    solution: [
      [6, 4, 7, 7],
      [0, 4, 2, 7],
      [3, 7, 5, 7],
      [3, 4, 5, 6],
      [0, 0, 1, 3],
      [2, 0, 5, 1],
      [2, 2, 4, 3],
      [6, 0, 7, 1],
      [5, 2, 7, 3]
    ],
    artName: "Dinosaur Valley",
    artImage: "assets/levels/level-13.jpg",
    artPrompt: "Cozy pixel-art prehistoric dinosaur valley scene built on the Level 13 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 14 — Mantar Ormanı Peri Köyü · Orta · İki cephe
    rows: 6,
    cols: 6,
    clues: [
      { r: 0, c: 1, n: 3 },
      { r: 1, c: 3, n: 4 },
      { r: 1, c: 5, n: 4 },
      { r: 1, c: 2, n: 6 },
      { r: 2, c: 3, n: 4 },
      { r: 4, c: 0, n: 4 },
      { r: 4, c: 2, n: 3 },
      { r: 5, c: 4, n: 6 },
      { r: 5, c: 0, n: 2 }
    ],
    solution: [
      [5, 0, 5, 1],
      [0, 3, 1, 4],
      [0, 0, 0, 2],
      [0, 5, 3, 5],
      [4, 3, 5, 5],
      [3, 0, 4, 1],
      [1, 0, 2, 2],
      [3, 2, 5, 2],
      [2, 3, 3, 4]
    ],
    artName: "Mushroom Village",
    artImage: "assets/levels/level-14.jpg",
    artPrompt: "Cozy pixel-art mushroom forest fairy village scene built on the Level 14 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 15 — Kristal Mağarası · Zor · Gizli sayı · eleme
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 1, n: 4 },
      { r: 0, c: 4, n: 6 },
      { r: 2, c: 0, n: 9, h: 1 },
      { r: 2, c: 3, n: 3 },
      { r: 2, c: 5, n: 6 },
      { r: 3, c: 6, n: 3 },
      { r: 4, c: 2, n: 4 },
      { r: 6, c: 4, n: 10 },
      { r: 6, c: 6, n: 4 }
    ],
    solution: [
      [5, 5, 6, 6],
      [5, 0, 6, 4],
      [2, 6, 4, 6],
      [0, 4, 1, 6],
      [2, 4, 4, 5],
      [0, 0, 0, 3],
      [1, 3, 3, 3],
      [4, 0, 4, 3],
      [1, 0, 3, 2]
    ],
    artName: "Crystal Cave",
    artImage: "assets/levels/level-15.jpg",
    artPrompt: "Cozy pixel-art crystal cave mine scene built on the Level 15 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 16 — Lunapark Gecesi · Kolay · Nefes molası
    rows: 5,
    cols: 5,
    clues: [
      { r: 0, c: 1, n: 4 },
      { r: 0, c: 4, n: 9 },
      { r: 3, c: 1, n: 4 },
      { r: 4, c: 2, n: 4 },
      { r: 3, c: 4, n: 2 },
      { r: 4, c: 0, n: 2 }
    ],
    solution: [
      [0, 2, 2, 4],
      [0, 0, 1, 1],
      [2, 0, 3, 1],
      [4, 0, 4, 1],
      [3, 2, 4, 3],
      [3, 4, 4, 4]
    ],
    artName: "Carnival Night",
    artImage: "assets/levels/level-16.jpg",
    artPrompt: "Cozy pixel-art night carnival scene built on the Level 16 Shikaku region blueprint (6 zones, one continuous scene)."
  },
  {
    // Level 17 — Oyuncak Atölyesi · Zor · Kalabalık parçalar · iç mekan
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 0, n: 10 },
      { r: 0, c: 5, n: 2 },
      { r: 1, c: 7, n: 6 },
      { r: 3, c: 1, n: 6 },
      { r: 2, c: 3, n: 9 },
      { r: 3, c: 7, n: 6 },
      { r: 5, c: 1, n: 4 },
      { r: 6, c: 2, n: 3 },
      { r: 5, c: 5, n: 6 },
      { r: 7, c: 1, n: 4 },
      { r: 6, c: 7, n: 4 },
      { r: 7, c: 3, n: 4 }
    ],
    solution: [
      [0, 0, 1, 4],
      [6, 0, 7, 1],
      [0, 6, 2, 7],
      [0, 5, 1, 5],
      [2, 3, 4, 5],
      [3, 6, 5, 7],
      [6, 6, 7, 7],
      [2, 0, 3, 2],
      [4, 0, 5, 1],
      [5, 3, 6, 5],
      [7, 2, 7, 5],
      [4, 2, 6, 2]
    ],
    artName: "Toy Workshop",
    artImage: "assets/levels/level-17.jpg",
    artPrompt: "Cozy pixel-art toy maker's workshop interior scene built on the Level 17 Shikaku region blueprint (12 zones, one continuous scene)."
  },
  {
    // Level 18 — Savana Gün Batımı · Orta · Merkezden açılış
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 2, n: 8 },
      { r: 2, c: 5, n: 9 },
      { r: 4, c: 0, n: 3 },
      { r: 3, c: 1, n: 6 },
      { r: 4, c: 6, n: 6 },
      { r: 4, c: 1, n: 3 },
      { r: 6, c: 1, n: 4 },
      { r: 5, c: 4, n: 6 },
      { r: 5, c: 5, n: 4 }
    ],
    solution: [
      [4, 1, 4, 3],
      [5, 2, 6, 4],
      [5, 0, 6, 1],
      [2, 0, 4, 0],
      [3, 4, 4, 6],
      [5, 5, 6, 6],
      [0, 4, 2, 6],
      [0, 0, 1, 3],
      [2, 1, 3, 3]
    ],
    artName: "Savanna Sunset",
    artImage: "assets/levels/level-18.jpg",
    artPrompt: "Cozy pixel-art golden-hour savanna scene built on the Level 18 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 19 — Ay Üssü · Zor · Eleme
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 2, n: 10 },
      { r: 3, c: 5, n: 5 },
      { r: 0, c: 7, n: 6 },
      { r: 3, c: 0, n: 4 },
      { r: 2, c: 4, n: 9 },
      { r: 4, c: 6, n: 4 },
      { r: 5, c: 0, n: 4 },
      { r: 6, c: 3, n: 4 },
      { r: 6, c: 5, n: 6 },
      { r: 5, c: 7, n: 3 },
      { r: 7, c: 0, n: 4 },
      { r: 7, c: 2, n: 5 }
    ],
    solution: [
      [6, 0, 7, 1],
      [0, 6, 2, 7],
      [7, 2, 7, 6],
      [5, 2, 6, 3],
      [4, 0, 5, 1],
      [2, 0, 3, 1],
      [0, 0, 1, 4],
      [2, 2, 4, 4],
      [5, 4, 6, 6],
      [0, 5, 4, 5],
      [3, 6, 4, 7],
      [5, 7, 7, 7]
    ],
    artName: "Moon Base",
    artImage: "assets/levels/level-19.jpg",
    artPrompt: "Cozy pixel-art moon base scene built on the Level 19 Shikaku region blueprint (12 zones, one continuous scene)."
  },
  {
    // Level 20 — Perili Köşk · Orta · Çift gizli sayı
    rows: 6,
    cols: 6,
    clues: [
      { r: 1, c: 0, n: 4 },
      { r: 0, c: 4, n: 9 },
      { r: 1, c: 5, n: 3 },
      { r: 2, c: 0, n: 4 },
      { r: 3, c: 3, n: 4, h: 1 },
      { r: 4, c: 4, n: 6, h: 1 },
      { r: 4, c: 0, n: 4 },
      { r: 5, c: 3, n: 2 }
    ],
    solution: [
      [0, 2, 2, 4],
      [0, 0, 1, 1],
      [2, 0, 3, 1],
      [0, 5, 2, 5],
      [4, 0, 5, 1],
      [5, 2, 5, 3],
      [3, 2, 4, 3],
      [3, 4, 5, 5]
    ],
    artName: "Haunted Manor",
    artImage: "assets/levels/level-20.jpg",
    artPrompt: "Cozy pixel-art cute-spooky Halloween manor scene built on the Level 20 Shikaku region blueprint (8 zones, one continuous scene)."
  },
  {
    // Level 21 — Viking Fiyortu · Zor · İki cephe
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 1, n: 6 },
      { r: 0, c: 5, n: 6 },
      { r: 0, c: 6, n: 4 },
      { r: 3, c: 0, n: 3 },
      { r: 2, c: 3, n: 8 },
      { r: 3, c: 5, n: 3 },
      { r: 4, c: 1, n: 2 },
      { r: 4, c: 3, n: 2 },
      { r: 4, c: 6, n: 3 },
      { r: 5, c: 0, n: 12 }
    ],
    solution: [
      [0, 6, 3, 6],
      [5, 0, 6, 5],
      [4, 6, 6, 6],
      [4, 3, 4, 4],
      [4, 1, 4, 2],
      [2, 0, 4, 0],
      [2, 5, 4, 5],
      [0, 3, 1, 5],
      [2, 1, 3, 4],
      [0, 0, 1, 2]
    ],
    artName: "Viking Fjord",
    artImage: "assets/levels/level-21.jpg",
    artPrompt: "Cozy pixel-art Viking fjord village scene built on the Level 21 Shikaku region blueprint (10 zones, one continuous scene)."
  },
  {
    // Level 22 — Gökyüzü Adaları · Uzman · Gizli dev · eleme
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 2, n: 6 },
      { r: 0, c: 3, n: 8 },
      { r: 2, c: 7, n: 4 },
      { r: 3, c: 0, n: 4 },
      { r: 2, c: 3, n: 12, h: 1 },
      { r: 3, c: 6, n: 3 },
      { r: 4, c: 0, n: 4 },
      { r: 5, c: 7, n: 4 },
      { r: 5, c: 4, n: 5 },
      { r: 6, c: 0, n: 4 },
      { r: 6, c: 3, n: 4 },
      { r: 6, c: 6, n: 6 }
    ],
    solution: [
      [0, 3, 1, 6],
      [6, 0, 7, 1],
      [0, 7, 3, 7],
      [6, 2, 7, 3],
      [4, 7, 7, 7],
      [4, 0, 5, 1],
      [2, 6, 4, 6],
      [6, 4, 7, 6],
      [5, 2, 5, 6],
      [2, 2, 4, 5],
      [0, 0, 1, 2],
      [2, 0, 3, 1]
    ],
    artName: "Sky Islands",
    artImage: "assets/levels/level-22.jpg",
    artPrompt: "Cozy pixel-art floating sky islands scene built on the Level 22 Shikaku region blueprint (12 zones, one continuous scene)."
  },
  {
    // Level 23 — Orman Tapınağı · Uzman · Final · hepsi bir arada
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 1, n: 4 },
      { r: 1, c: 2, n: 2 },
      { r: 0, c: 5, n: 12 },
      { r: 0, c: 6, n: 6 },
      { r: 2, c: 0, n: 4 },
      { r: 3, c: 2, n: 4, h: 1 },
      { r: 3, c: 6, n: 4 },
      { r: 4, c: 2, n: 4 },
      { r: 5, c: 4, n: 6 },
      { r: 7, c: 6, n: 6 },
      { r: 7, c: 0, n: 4 },
      { r: 6, c: 2, n: 4 },
      { r: 7, c: 3, n: 4 }
    ],
    solution: [
      [0, 6, 2, 7],
      [0, 3, 3, 5],
      [3, 6, 4, 7],
      [0, 2, 1, 2],
      [5, 6, 7, 7],
      [7, 2, 7, 5],
      [6, 0, 7, 1],
      [6, 2, 6, 5],
      [4, 3, 5, 5],
      [4, 1, 5, 2],
      [2, 0, 5, 0],
      [0, 0, 1, 1],
      [2, 1, 3, 2]
    ],
    artName: "Jungle Temple",
    artImage: "assets/levels/level-23.jpg",
    artPrompt: "Cozy pixel-art ancient jungle temple ruins scene built on the Level 23 Shikaku region blueprint (13 zones, one continuous scene)."
  }
];

if (typeof module !== "undefined") module.exports = PIXHAKU_LEVELS_4_23;
