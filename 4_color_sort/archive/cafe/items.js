// Shared by the game and the level generator. IDs remain stable across levels.
const FOOD_ITEMS = Object.freeze([
  { name: 'Kahve', category: 'İçecek', asset: 'coffee' },
  { name: 'Sandviç', category: 'Yemek', asset: 'sandwich' },
  { name: 'Çilek', category: 'Meyve', asset: 'strawberry' },
  { name: 'Brokoli', category: 'Sebze', asset: 'broccoli' },
  { name: 'Portakal', category: 'Meyve', asset: 'orange' },
  { name: 'Havuç', category: 'Sebze', asset: 'carrot' },
  { name: 'Pizza', category: 'Yemek', asset: 'pizza' },
  { name: 'Üzüm', category: 'Meyve', asset: 'grapes' },
  { name: 'Peynir', category: 'Kahvaltılık', asset: 'cheese' },
  { name: 'Zeytin', category: 'Kahvaltılık', asset: 'olives' },
  { name: 'Domates', category: 'Sebze', asset: 'tomato' },
  { name: 'Mercimek çorbası', category: 'Yemek', asset: 'soup' },
  { name: 'Pilav', category: 'Yemek', asset: 'rice' },
  { name: 'Köfte', category: 'Yemek', asset: 'meatballs' },
  { name: 'Kruvasan', category: 'Kahvaltılık', asset: 'croissant' },
  { name: 'Kurabiye', category: 'Tatlı', asset: 'cookie' },
  { name: 'Salata', category: 'Yemek', asset: 'salad' },
  { name: 'Ayran', category: 'İçecek', asset: 'ayran' },
]);
if (typeof module !== 'undefined') module.exports = FOOD_ITEMS;
