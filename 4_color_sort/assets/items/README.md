# Tray products

Eighteen original SVG assets in a shared 64 × 64 viewBox, with transparent backgrounds,
soft volume and contact shadows. The same files are used on trays, tables and order
cards. `items.js` is the product catalog used by the game and level generator.

| ID | Product | Category | Asset |
| -- | ------- | -------- | ----- |
| 0 | Kahve | İçecek | coffee.svg |
| 1 | Sandviç | Yemek | sandwich.svg |
| 2 | Çilek | Meyve | strawberry.svg |
| 3 | Brokoli | Sebze | broccoli.svg |
| 4 | Portakal | Meyve | orange.svg |
| 5 | Havuç | Sebze | carrot.svg |
| 6 | Pizza | Yemek | pizza.svg |
| 7 | Üzüm | Meyve | grapes.svg |

| 8 | Peynir | Kahvaltı | cheese.svg |
| 9 | Zeytin | Kahvaltı | olives.svg |
| 10 | Domates | Sebze | tomato.svg |
| 11 | Mercimek çorbası | Yemek | soup.svg |
| 12 | Pilav | Yemek | rice.svg |
| 13 | Köfte | Yemek | meatballs.svg |
| 14 | Kruvasan | Hamur işi | croissant.svg |
| 15 | Kurabiye | Tatlı | cookie.svg |
| 16 | Salata | Yemek | salad.svg |
| 17 | Ayran | İçecek | ayran.svg |

`menus.js` defines eight coherent meals. The generator chooses complete meals;
layer permutations never substitute ingredients from another meal. `menuIds`
connect each level's orders to their visible meal names and color accents.

Product identity determines table compatibility, regardless of category or color.
For example, an orange and a carrot cannot share a table.
