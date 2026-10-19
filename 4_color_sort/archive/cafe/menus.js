// Curated meals. Recipes may change layer order, but never mix dishes across menus.
const MEAL_MENUS = Object.freeze([
  { id: 'home', name: 'Ev yemeği', items: [12, 13, 11], tone: 'coral', note: 'Pilav · Köfte · Çorba' },
  { id: 'breakfast', name: 'Kahvaltı', items: [8, 9, 10], tone: 'honey', note: 'Peynir · Zeytin · Domates' },
  { id: 'garden', name: 'Sebze tabağı', items: [12, 5, 3], tone: 'sage', note: 'Pilav · Havuç · Brokoli' },
  { id: 'fruit', name: 'Meyve molası', items: [4, 7, 2], tone: 'berry', note: 'Portakal · Üzüm · Çilek' },
  { id: 'coffee', name: 'Kahve molası', items: [14, 15, 0], tone: 'honey', note: 'Kruvasan · Kurabiye · Kahve' },
  { id: 'lunch', name: 'Öğle molası', items: [1, 16, 17], tone: 'sage', note: 'Sandviç · Salata · Ayran' },
  { id: 'pizza', name: 'Pizza menüsü', items: [6, 16, 17], tone: 'coral', note: 'Pizza · Salata · Ayran' },
  { id: 'light', name: 'Hafif öğün', items: [12, 16, 11], tone: 'sage', note: 'Pilav · Salata · Çorba' },
]);
if (typeof module !== 'undefined') module.exports = MEAL_MENUS;
