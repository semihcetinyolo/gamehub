# Cocktail Sort: Astra asset guide

The game runs without any of these files and uses its own placeholder art until they exist.
Each file can be added on its own. When a file shows up in `assets/img/`, the game uses it on the next refresh.

## Workflow

1. Upload to Astra: the **style reference** (`reference/cocktail_reference.png`) + the **wireframe** listed for that asset.
2. Paste the **shared style text** plus the **asset prompt**.
3. Save the result to `assets/raw/` under the file name in the table.
4. `python3 tools/fit_assets.py` trims, scales and positions it, then writes it to `assets/img/`.
5. Check it with `index.html`. For the bottle, also check `index.html?calib=1`. The red box must sit inside the glass.
   If it does not, adjust the `BOTTLE.liquid` numbers in `assets.js`.

> The reference image is for style only. Do not copy its layout, bottle count or buttons.
> The game draws the UI (cards, bars, tray, chips, texts). Astra only makes the pictures below.

## Wireframes (`assets/wireframes/`)

| File | Purpose |
|---|---|
| `01…04_layout_*_bottles.png` | Real game screen with 5 / 6 / 8 / 10 bottles. Grey boxes = where the assets go |
| `05_layout_colour_placeholder.png` | The same screen in colour, with the placeholder art |
| `06_background_zones.png` | Which parts of the background the UI covers, and which sides get cropped on tall phones |
| `07_bottle_template.png`, `07b_bottle_silhouette_400x860.png` | Exact bottle silhouette + liquid area |
| `08_customer_template.png` | Customer portrait framing + the 3 expressions |
| `09_icons_template.png` | Icon canvas sizes |

To regenerate the wireframes: `PW=…/playwright-core node tools/wireframes.js`

## Shared style text (add to the start of every prompt)

```
Cozy casual mobile puzzle game art for a cocktail bar game. Soft cel-shaded 2D illustration,
gentle gradients, clean warm-dark-brown outlines, rounded friendly shapes, warm sunlit café mood,
palette of cream, honey wood, pastel pink, orange, purple and leafy green. Polished, high detail,
consistent lighting from the upper left. Match the style of the attached reference image.
No text, no letters, no logos, no watermark, no UI.
```

## List

| File | Size | Background | Wireframe | Required? |
|---|---|---|---|---|
| `bg_cafe.png` | 1080×1920 | solid | 06 | yes |
| `bottle.png` | 400×860 | transparent | 07, 07b | yes |
| `bottle_overlay.png` | 400×860 | transparent | 07 | optional |
| `mixer.png` | 400×860 | transparent | 07, 07b | yes (the preparation vessel) |
| `customer_01…06.png` | 512×512 | transparent | 08 | yes (done) |
| `customer_07…12.png` | 512×512 | transparent | 08 | yes (new) |
| `customer_XX_happy.png`, `customer_XX_sad.png` | 512×512 | transparent | 08 | recommended |
| `bg_coffee.png` | 1080×1920 | solid | 06 | coffee levels |
| `bottle_coffee.png` | 400×860 | transparent | 07, 07b | coffee levels |
| `mixer_coffee.png` | 400×860 | transparent | 07, 07b | coffee levels |
| `heart_full.png`, `heart_empty.png` | 256×256 | transparent | 09 | yes |
| `clock.png`, `coin.png`, `check_badge.png`, `icon_pause.png` | 256×256 | transparent | 09 | yes |
| `win_art.png`, `lose_art.png` | 600×400 | transparent | 09 | optional |

---

### bg_cafe.png
Attach: reference + `06_background_zones.png`
```
Vertical 9:16 mobile game background: the inside of a cozy sunlit café seen from behind the bar.
Upper part: a big arched window with a blurred flower garden and soft daylight, hanging plants,
a small chalkboard on the far left edge. Lower half: a warm honey-colored wooden counter top seen
slightly from above, clean and empty in the middle so a tray of bottles can stand on it.
Keep all props (potted plants, flowers in a vase, a jar of cinnamon sticks, a striped towel) at the
far left and far right edges only. The centre column must stay calm and low-detail, slightly blurred
(shallow depth of field) so the game UI on top stays readable. No people, no bottles, no glasses
in the centre, no text.
```
Note: the UI covers the centre. The sides get cropped by ~9% on tall phones, so put no important detail there either.

### bottle.png
Attach: reference + `07_bottle_template.png` + `07b_bottle_silhouette_400x860.png`
```
A single EMPTY clear glass bottle, straight front view, perfectly symmetrical, following the attached
black silhouette exactly: thick rounded rim lip on top, short neck, soft rounded shoulders, tall
straight cylindrical body, rounded bottom corners. The bottle fills the whole canvas edge to edge.
Thin cool grey-blue glass outline, subtle white highlights on the rim and along the left edge, a very
light cool tint. The inside of the body is clean, bright and almost fully transparent because the
game draws colored liquid layers inside it. No liquid, no label, no cap, no straw, no shadow,
no reflection on the floor. Transparent background (PNG with alpha).
```
Note: the liquid is drawn on top of `bottle.png`. If you want the glass shine to show on top of the liquid, make `bottle_overlay.png`.

### mixer.png (the preparation vessel)
Attach: reference + `07_bottle_template.png` + `07b_bottle_silhouette_400x860.png`
The mixer sits in the top middle of the board. Any colour can go into it, and every cocktail is built and served from it. It must read as "the special one" at a glance, but its liquid area must match the bottle's red box.
```
A single EMPTY clear cocktail mixing vessel, straight front view, perfectly symmetrical, the same overall
size and outline as the attached bottle silhouette, so the inside body area lines up with it. Thick
polished gold / brass rim and a gold band around the base, a small gold star emblem high on the neck,
clear sparkling glass body with soft white highlights. The inside of the body is clean, bright and
almost fully transparent because the game draws coloured liquid layers inside it. No liquid, no label
text, no straw, no shadow. Transparent background (PNG with alpha).
```

### bottle_overlay.png (optional)
Attach: the finished `bottle.png`
```
Using the attached bottle image: keep ONLY its outline and white glass highlights (rim, left edge
streak, small shoulder glints). Everything else, especially the whole body area, must be fully
transparent. Same size and position, pixel aligned. Transparent background.
```

### Customers: customer_01 … customer_12
The game picks a random customer for each order (never two of the same on screen, never the one who just left).
Customers 01–06 are done. 07–12 add variety. Give each new one a different age, body type, hair and outfit colour from the first six.
Attach: reference + `08_customer_template.png`. First make the **normal** expression of each character.
Then upload that output and make the happy and sad versions with the "same character" prompt.

Base prompt (fill in `{CHARACTER}` and `{EXPRESSION}`):
```
Bust portrait of a friendly café customer for a cozy mobile game: {CHARACTER}.
Head and shoulders only, facing the viewer, centered; head in the upper middle of the frame,
shoulders cut off by the bottom edge. Hands are not visible and nothing is held. Keep the lower
right corner of the frame free of important detail (the game puts a small drink icon there).
Expression: {EXPRESSION}. Transparent background (PNG with alpha), no frame, no card.
```

| File | {CHARACTER} |
|---|---|
| customer_01 | young woman with curly auburn hair in a messy bun and a pink bandana, freckles, white T-shirt and green apron |
| customer_02 | cheerful man with short black curly hair and a full beard, warm brown skin, mustard-yellow T-shirt and green apron |
| customer_03 | young woman with long black hair and a lavender beret, fair skin, small gold hoop earrings, dark denim overalls |
| customer_04 | kind older man with neat grey hair and round glasses, light tan skin, light-blue shirt and red bow tie |
| customer_05 | young woman with a short blonde bob, rosy cheeks, pastel pink cardigan over a white top |
| customer_06 | young man with tousled black hair and a backwards blue cap, warm tan skin, mint-green hoodie |
| customer_07 | grandmother with a silver bun, pearl earrings and a lilac knitted cardigan, warm smile lines |
| customer_08 | tall young man with a red-brown mohawk, freckles, denim jacket over a yellow T-shirt |
| customer_09 | young woman with a short black pixie cut, deep brown skin, big round earrings, coral blouse |
| customer_10 | middle-aged man with a neat ginger beard, flat cap and a green knitted vest over a white shirt |
| customer_11 | teenage girl with two puffy space buns, braces, star clips, light-blue oversized hoodie |
| customer_12 | businesswoman with a sleek dark ponytail, glasses, navy blazer and a small gold necklace |

| Version | {EXPRESSION} |
|---|---|
| `customer_0X.png` | warm friendly smile, looking at the viewer, a little expectant |
| `customer_0X_happy.png` | delighted, eyes closed in joy, big open smile, rosy cheeks |
| `customer_0X_sad.png` | annoyed and disappointed, frowning brows, pouting mouth, eyes looking away |

Prompt for the happy / sad versions (with the normal image attached):
```
Same character, same outfit, same pose, same framing and size, same transparent background.
Only change the facial expression to: {EXPRESSION}.
```

### Icons (256×256, transparent; the shape fills about 208 px in the middle)
Attach: reference + `09_icons_template.png`

- **heart_full.png**: `Glossy cartoon heart icon, bright red-pink with a soft white highlight in the upper left and a darker red rim. Transparent background.`
- **heart_empty.png**: `The same cartoon heart icon but empty/used: flat light grey-beige, no gloss, slightly faded. Transparent background.`
- **clock.png**: `Small round cartoon stopwatch icon, cream face, brown rim, single hand, little button on top. Transparent background.`
- **coin.png**: `Shiny gold cartoon coin icon, front view, thick golden rim, simple embossed star or cocktail glass in the middle, warm highlight in the upper left. Transparent background.`
- **check_badge.png**: `Round green check-mark badge, bright green circle with a thick white border and a bold white check mark, slight gloss. Transparent background.`
- **icon_pause.png**: `Round glossy purple game button with a white pause symbol (two vertical bars), thick white outer ring, soft bottom shadow inside the button. Transparent background.`

### win_art.png / lose_art.png (optional, 600×400)
- **win**: `A finished pastel layered cocktail in a glass bottle with a striped straw, sparkles and a few confetti pieces around it, celebratory. Transparent background.`
- **lose**: `A tipped-over empty glass bottle with a small spilled puddle and a sad little droplet, gentle and cute, not dramatic. Transparent background.`

---

## Coffee levels

Every 5th level from level 8 is a coffee level (8, 13, 18, …). It uses the same rules, but with coffee ingredients in coffee containers, and you build the drink in a cup.
The layer colours are drawn by the game: espresso (dark brown), milk (cream white), caramel (amber) and lavender (lilac). No images are needed for the colours.
Each file below is optional. Until it exists, the cocktail version is used.

### bg_coffee.png
Attach: reference + `06_background_zones.png`
```
Vertical 9:16 mobile game background: a cozy coffee shop seen from behind the coffee bar. Upper part:
a warm window with soft morning light, shelves with jars of coffee beans and stacked cups, a small
chalkboard on the far left edge, an espresso machine partly visible on the far right edge. Lower
half: a dark walnut wooden counter top seen slightly from above, clean and empty in the middle.
Props only at the far left and right edges. The centre column must stay calm and low-detail,
slightly blurred. Warm browns, cream and copper tones. No people, no text.
```

### bottle_coffee.png
Attach: reference + `07_bottle_template.png` + `07b_bottle_silhouette_400x860.png`
```
A single EMPTY clear glass milk-bottle style container for a coffee bar, straight front view,
perfectly symmetrical, following the attached black silhouette exactly (same neck, shoulders and
body). Glass with a light warm tint, a small kraft-paper tag tied with twine around the neck (no
text), soft white highlights. The inside of the body is clean and almost fully transparent because
the game draws coffee layers inside it. No liquid, no shadow. Transparent background (PNG with alpha).
```

### mixer_coffee.png
Attach: reference + `07_bottle_template.png` + `07b_bottle_silhouette_400x860.png`
```
A single EMPTY tall clear glass latte cup, straight front view, perfectly symmetrical, filling the
same 400x860 canvas: a slightly wider rim at the top, a straight tall body, a thick glass base. The
straight body must cover the red liquid box of the attached template. A thin copper band near the
rim and a tiny coffee-bean emblem. Glass clean, bright and almost fully transparent inside because
the game draws the coffee layers. No handle, no liquid, no foam, no shadow. Transparent background.
```

## Tips
- Generate all 6 characters in the **same chat** to keep the style consistent, using `customer_01` as the reference.
- If the bottle silhouette comes out different, run `fit_assets.py` anyway, then check `?calib=1`.
  For small shifts, change `x/y/w/h` in `BOTTLE.liquid` in `assets.js`.
- If the background is not transparent (white or checkered), `fit_assets.py` prints a warning. Do one more "remove background" pass in Astra.
