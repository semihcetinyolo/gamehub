# Yeni müşteriler ve kahve seti

7 Ekim 2026 — Yerleşik `image_gen` ile üretildi. Her görsel ayrı çağrıyla oluşturuldu; mutlu/üzgün sürümler kendi normal portrelerinden düzenlendi. Son boyutlandırma `sips` ile yapıldı, alfa kanalları korundu.

## Teslim

- `assets/img/customer_07.png` … `customer_12.png`, her biri için `_happy` ve `_sad`: 18 şeffaf PNG, 512×512.
- `assets/img/bg_coffee.png`: 1080×1920, opak arka plan.
- `assets/img/bottle_coffee.png`, `mixer_coffee.png`, `mixer.png`: 400×860, şeffaf PNG.
- `assets/img/coin.png`: 256×256, şeffaf PNG.
- Yüksek çözünürlüklü asıllar aynı adlarla `assets/raw/` içinde.
- Katalog: `assets/preview.html`. Kahve önizlemesi: `assets/coffee-preview.png`. Kokteyl önizlemesi: `assets/cocktail-expansion-preview.png`.

## Oyuna uyarlama

Yeni kapların cam tabanlarını korumak için `assets.js` içindeki `BOTTLE.liquidByAsset` sıvı sınırları ayarlandı. Müşteri kartları ve oyun kapları ortak `bottleMarkup` üzerinden aynı sınırları kullanır. Standart şişeye ait ön cam çerçevesi yalnızca standart şişeye uygulanır; diğer kaplar kendi biçimini ve metal kenarını korur.

Kahve kabı: x62 y200 w276 h546. Süt şişesi ve altın hazırlama kabı: x58 y262 w284 h546. Köşe yarıçapı 38. Tüm değerler 400×860 tuvale göredir. Mevcut `tools/fit_assets.py` tuval kenar boşluklarını kırpar; bu teslimdeki kaplara yeniden uygulanmamalıdır.

## Kontrol

23 yeni dosyanın boyutları, şeffaflık kanalları ve özgün kopyaları doğrulandı. Chrome'da bölüm 1 ve bölüm 8, 405×720 görünümde; bölüm 8 ayrıca 320×568 görünümde açıldı. 51/51 asset yüklendi, müşteri havuzunda 12 karakter görüldü. Katalogdaki 51 resim açıldı; eksik resim veya JavaScript hatası görülmedi. Bu çalışma oyun kuralları için kapsamlı test içermez.

## Kullanılan promptlar

### bg_coffee.png

```text
Use case: stylized-concept. Production 9:16 portrait mobile game background, target 1080x1920. Match the cozy hand-painted casual game art of existing Cocktail Sort cafe, soft cel shading, gentle gradients and upper-left warm morning sunshine. A cozy coffee shop from behind the coffee bar. Upper half: large softly illuminated window, warm cream plaster, walnut shelves with coffee bean jars and stacked ivory cups at far edges; indistinct chalkboard at far left, copper espresso machine partly visible at far right. Lower half is one broad empty dark walnut wooden countertop seen slightly from above, spanning width and extending to bottom edge. Props only at far edges. Central 80% calm, low detail, slight depth-of-field softness for game UI. Palette warm browns, cream, copper with small leafy green accents. No people, no text, no readable chalk writing, no UI, no foreground tray, no bottles or cups in center. Opaque full-bleed backdrop.
```

### bottle_coffee.png

```text
Use case: precise-object-edit. Attached image is the exact base bottle sprite. Produce a coffee bar milk-bottle variant preserving pixel-aligned silhouette, canvas 400:860 aspect, transparent margins, neck, shoulders, body, base and scale. Change only glass tint to very subtle warm tone, add small blank kraft paper tag tied with twine around neck. Tag must stay high at neck, not cover body/liquid area. Preserve clear nearly transparent glass body, narrow white highlights, same blue-grey outline. Body has straight sides x40 and360 between y262 and796 on 400x860 canvas. Inner liquid region x58,y262,w284,h570 stays clean. No liquid, no lettering, no cap, no straw, no shadow, no checkerboard. Genuine transparent RGBA background. Same polished cozy cartoon style.
```

### coin.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: single shiny gold cartoon coin icon, square 256x256 canvas, centered shape fills about 208x208 with even transparent margins. Front view round thick golden rim, simple embossed five-point star in middle, upper-left warm creamy white highlight, deeper amber shading along lower rim. Clear at tiny UI scale. No text, digits, shadow outside silhouette or other objects.
```

### customer_07.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: customer portrait on square 512x512 canvas. Character: grandmother with a silver hair bun, pearl earrings and a lilac knitted cardigan, warm smile lines, soft round cheeks and a gently plump build. Bust portrait, head and shoulders only, centered facing viewer. Entire hair visible with a small margin above; shoulders cut flush at bottom canvas edge. Face in upper middle, same proportions and framing as existing customer_01. Hands not visible, nothing held. Lower right only simple clothing to allow a drink overlay. Expression: warm friendly slightly expectant smile and bright open eyes looking at viewer. Exactly one character, no other people. Use distinctive age and face shape.
```

### customer_07_happy.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Produce the HAPPY expression variant for the same game. Preserve exact character identity and age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting, style, and genuine transparent RGBA background. Change ONLY face: delighted, eyes closed in joy, big open happy smile with upper teeth showing, lifted rosy cheeks, relaxed brows. Preserve braces if this character has braces. No tears, symbols, hands, extra objects or text. Keep square framing and shoulders cut by bottom edge identical.
```

### customer_07_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create the SAD/disappointed expression variant for the same cozy game. Preserve exact identity, age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting and art style. Change ONLY face: mildly annoyed and disappointed, gently furrowed brows, downturned closed pouting mouth, eyes looking slightly sideways. Cute gentle mood, no anger or tears. Keep youthful character age appropriate. No extra objects, hands, words or symbols. Exact same square canvas and bottom shoulders crop. Preserve genuine transparent RGBA background.
```

### customer_08.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: customer portrait on square 512x512 canvas. Character: tall slim young adult man with a red-brown mohawk, freckles, denim jacket over a yellow T-shirt. Bust portrait, head and shoulders only, centered facing viewer. Entire hair visible with a small margin above; shoulders cut flush at bottom canvas edge. Face in upper middle, same proportions and framing as existing customer_01. Hands not visible, nothing held. Lower right only simple clothing to allow a drink overlay. Expression: warm friendly slightly expectant smile and bright open eyes looking at viewer. Exactly one character, no other people. Use distinctive age and face shape.
```

### customer_08_happy.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Produce the HAPPY expression variant for the same game. Preserve exact character identity and age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting, style, and genuine transparent RGBA background. Change ONLY face: delighted, eyes closed in joy, big open happy smile with upper teeth showing, lifted rosy cheeks, relaxed brows. Preserve braces if this character has braces. No tears, symbols, hands, extra objects or text. Keep square framing and shoulders cut by bottom edge identical.
```

### customer_08_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create the SAD/disappointed expression variant for the same cozy game. Preserve exact identity, age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting and art style. Change ONLY face: mildly annoyed and disappointed, gently furrowed brows, downturned closed pouting mouth, eyes looking slightly sideways. Cute gentle mood, no anger or tears. Keep youthful character age appropriate. No extra objects, hands, words or symbols. Exact same square canvas and bottom shoulders crop. Preserve genuine transparent RGBA background.
```

### customer_09.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: customer portrait on square 512x512 canvas. Character: young adult woman with a short black pixie cut, deep brown skin, big round earrings, coral blouse. Bust portrait, head and shoulders only, centered facing viewer. Entire hair visible with a small margin above; shoulders cut flush at bottom canvas edge. Face in upper middle, same proportions and framing as existing customer_01. Hands not visible, nothing held. Lower right only simple clothing to allow a drink overlay. Expression: warm friendly slightly expectant smile and bright open eyes looking at viewer. Exactly one character, no other people. Use distinctive age and face shape.
```

### customer_09_happy.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Produce the HAPPY expression variant for the same game. Preserve exact character identity and age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting, style, and genuine transparent RGBA background. Change ONLY face: delighted, eyes closed in joy, big open happy smile with upper teeth showing, lifted rosy cheeks, relaxed brows. Preserve braces if this character has braces. No tears, symbols, hands, extra objects or text. Keep square framing and shoulders cut by bottom edge identical.
```

### customer_09_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create the SAD/disappointed expression variant for the same cozy game. Preserve exact identity, age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting and art style. Change ONLY face: mildly annoyed and disappointed, gently furrowed brows, downturned closed pouting mouth, eyes looking slightly sideways. Cute gentle mood, no anger or tears. Keep youthful character age appropriate. No extra objects, hands, words or symbols. Exact same square canvas and bottom shoulders crop. Preserve genuine transparent RGBA background.
```

### customer_10.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: customer portrait on square 512x512 canvas. Character: middle-aged broad-shouldered man with a neat ginger beard, flat cap and a green knitted vest over a white shirt. Bust portrait, head and shoulders only, centered facing viewer. Entire hair visible with a small margin above; shoulders cut flush at bottom canvas edge. Face in upper middle, same proportions and framing as existing customer_01. Hands not visible, nothing held. Lower right only simple clothing to allow a drink overlay. Expression: warm friendly slightly expectant smile and bright open eyes looking at viewer. Exactly one character, no other people. Use distinctive age and face shape.
```

### customer_10_happy.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Produce the HAPPY expression variant for the same game. Preserve exact character identity and age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting, style, and genuine transparent RGBA background. Change ONLY face: delighted, eyes closed in joy, big open happy smile with upper teeth showing, lifted rosy cheeks, relaxed brows. Preserve braces if this character has braces. No tears, symbols, hands, extra objects or text. Keep square framing and shoulders cut by bottom edge identical.
```

### customer_10_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create the SAD/disappointed expression variant for the same cozy game. Preserve exact identity, age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting and art style. Change ONLY face: mildly annoyed and disappointed, gently furrowed brows, downturned closed pouting mouth, eyes looking slightly sideways. Cute gentle mood, no anger or tears. Keep youthful character age appropriate. No extra objects, hands, words or symbols. Exact same square canvas and bottom shoulders crop. Preserve genuine transparent RGBA background.
```

### customer_11.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: customer portrait on square 512x512 canvas. Character: teenage girl with two puffy space buns, braces, star hair clips, light-blue oversized hoodie, youthful age-appropriate friendly design. Bust portrait, head and shoulders only, centered facing viewer. Entire hair visible with a small margin above; shoulders cut flush at bottom canvas edge. Face in upper middle, same proportions and framing as existing customer_01. Hands not visible, nothing held. Lower right only simple clothing to allow a drink overlay. Expression: warm friendly slightly expectant smile and bright open eyes looking at viewer. Exactly one character, no other people. Use distinctive age and face shape.
```

### customer_11_happy.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Produce the HAPPY expression variant for the same game. Preserve exact character identity and age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting, style, and genuine transparent RGBA background. Change ONLY face: delighted, eyes closed in joy, big open happy smile with upper teeth showing, lifted rosy cheeks, relaxed brows. Preserve braces if this character has braces. No tears, symbols, hands, extra objects or text. Keep square framing and shoulders cut by bottom edge identical.
```

### customer_11_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create the SAD/disappointed expression variant for the same cozy game. Preserve exact identity, age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting and art style. Change ONLY face: mildly annoyed and disappointed, gently furrowed brows, downturned closed pouting mouth, eyes looking slightly sideways. Cute gentle mood, no anger or tears. Keep youthful character age appropriate. No extra objects, hands, words or symbols. Exact same square canvas and bottom shoulders crop. Preserve genuine transparent RGBA background.
```

### customer_12.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: customer portrait on square 512x512 canvas. Character: businesswoman with a sleek dark ponytail, glasses, navy blazer and a small gold necklace. Bust portrait, head and shoulders only, centered facing viewer. Entire hair visible with a small margin above; shoulders cut flush at bottom canvas edge. Face in upper middle, same proportions and framing as existing customer_01. Hands not visible, nothing held. Lower right only simple clothing to allow a drink overlay. Expression: warm friendly slightly expectant smile and bright open eyes looking at viewer. Exactly one character, no other people. Use distinctive age and face shape.
```

### customer_12_happy.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Produce the HAPPY expression variant for the same game. Preserve exact character identity and age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting, style, and genuine transparent RGBA background. Change ONLY face: delighted, eyes closed in joy, big open happy smile with upper teeth showing, lifted rosy cheeks, relaxed brows. Preserve braces if this character has braces. No tears, symbols, hands, extra objects or text. Keep square framing and shoulders cut by bottom edge identical.
```

### customer_12_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create the SAD/disappointed expression variant for the same cozy game. Preserve exact identity, age, hair silhouette/strands, accessories, outfit, body, pose, head position, framing, scale, lighting and art style. Change ONLY face: mildly annoyed and disappointed, gently furrowed brows, downturned closed pouting mouth, eyes looking slightly sideways. Cute gentle mood, no anger or tears. Keep youthful character age appropriate. No extra objects, hands, words or symbols. Exact same square canvas and bottom shoulders crop. Preserve genuine transparent RGBA background.
```

### mixer.png

```text
Use case: precise-object-edit. Attached bottle is exact base sprite. Make its special cocktail PREPARATION vessel variant. Preserve pixel-aligned silhouette, 400:860 canvas, margins, object size and placement, same neck, shoulders, straight body and base. Change rim to thick polished gold/brass rim, add narrow gold band at very bottom base, small gold star emblem high on neck. Body remains clear glass with soft white side highlights, nearly fully transparent clean body, game draws liquids inside. Liquid rectangle x58,y262,width284,height570 on 400x860 canvas must remain free of decorations. Gold band below liquid area. No liquid, no words, no cap, no straw, no floor shadow, no backdrop. Genuine transparent RGBA. Match original cozy game rendering.
```

### mixer_coffee.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort cozy casual mobile puzzle game. Match existing portraits in this conversation and original reference: polished lush hand-painted 2D cartoon, appealing rounded volumes, soft cel shading, smooth gradients, expressive friendly features, fine warm-brown outlines, warm sunlight upper left. Genuine transparent RGBA background. No colored backdrop, no painted checkerboard, no words, logo, watermark, UI or frame. Asset type: one EMPTY tall clear glass latte cup, no handle. Portrait 400x860 composition. Attached template is GEOMETRY reference only, do not render template marks/text. Cup straight sides x40 and360 from y65 down to y796, rounded thick base reaches y850; open elliptical slightly wider rim at y10..60, rim fits x30..370. On this canvas game liquid rectangle x58,y262,w284,h570 MUST fit inside cup. Cup is a straight tall tumbler, NO narrow neck, NO shoulders, NO bottle shape. Thin copper band around upper rim, tiny embossed coffee bean emblem just below rim above y180. Warm subtly tinted nearly transparent glass interior, cool-grey thin edges and white highlights on rim/left edge. Inside center fully clear, no opaque fill, no liquid, foam, cap, spoon, straw, label, shadow. Transparent alpha background.
```

