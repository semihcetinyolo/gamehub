# Cocktail Sort — Üretilen görseller

Üretim: 7 Ekim 2026, yerleşik `image_gen` aracı. Stil referansı: `reference/cocktail_reference.png`. Her görsel ayrı çağrıyla üretildi; ifade varyasyonları kendi normal portrelerinden düzenlendi.

## Kullanım

- Oyuna hazır 28 PNG: `assets/img/`. Mevcut `assets.js` bunları otomatik yükler.
- Yüksek çözünürlüklü özgün çıktılar: `assets/raw/`.
- Görsel kataloğu: `assets/preview.html`.
- Arka plan 1080×1920; şişe ve yansıma katmanı 400×860; portreler 512×512; ikonlar 256×256; sonuç görselleri 600×400.
- Arka plan RGB, diğer görseller gerçek alfa kanallı RGBA. Cam içi yarı şeffaftır; ön cam katmanının merkezi tamamen şeffaftır.
- Son ölçülendirme `sips -z yükseklik genişlik` ile yapıldı; şişenin tuval kenar boşlukları korundu. Mevcut `tools/fit_assets.py` şişe kenar boşluklarını kırpar; bu teslimdeki şişelere yeniden uygulamayın.

## Kullanılan promptlar

Doğrulama: 28 PNG dosyasının ölçüleri ve alfa kanalları kontrol edildi. Chrome'da 405×720 görünümde bölüm 16 açıldı; 28/28 asset yüklendi, eksik görsel ve JavaScript hatası görülmedi. Şişe/sıvı hizası görsel olarak incelendi. Ekran görüntüsü: `assets/game-preview.png`. Oyun kurallarına yönelik kapsamlı test yapılmadı.

### bg_cafe.png

```text
Use case: stylized-concept. Asset type: bg_cafe.png, a production background for a portrait mobile cocktail sorting game. Match the user's supplied Cocktail Sort reference image: polished cozy casual mobile game illustration, soft cel shading, warm sun from upper left, terracotta, cream, honey wood and leafy green. Vertical 9:16 composition, ideally 1080x1920. Inside a cozy sunlit cafe seen from behind its bar. Upper half: large arched window with softly blurred flowering garden, blue sky, orange plaster walls, plants and a small indistinct chalkboard at far left. Entire lower half: large empty honey-colored wooden countertop seen slightly from above, extending to all edges. A striped towel at bottom far left, greenery at extreme lower corners, tiny cinnamon holder at far right. Center 80 percent calm and uncluttered with low contrast. Background environment only. Absolutely no people, bottles, glasses, tray, cards, buttons, interface, text, letters, numbers, watermark. The game will render all foreground elements separately. Opaque background.
```

### bottle.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: single empty clear glass bottle game sprite, portrait canvas 400x860 aspect ratio. Follow the attached silhouette template precisely on its canvas: rim x118..282 y10..58, neck x132..268 to y140, shoulders curving out to x40 and360 at y262, vertical body sides to y796, rounded base to y850. This geometry is essential because game liquid is rendered at x58,y262,width284,height570. Leave the same transparent margins. Thick elliptical open glass mouth, empty tall cylindrical body. Thin cool grey-blue dark glass outlines with bright white rim glints and narrow side reflections. Clear body interior nearly fully transparent, very faint warm cream glass tint only, no solid fill. No liquid, no layer lines, no cap, no label, no straw, no ground shadow. Front orthographic view, symmetrical.
```

### bottle_overlay.png

```text
Use case: background-extraction. Edit target: attached empty bottle PNG. Produce a foreground glass highlight OVERLAY for this EXACT bottle sprite, same canvas aspect ratio, identical object size, identical positioning and silhouette. Keep ONLY the very thin outer dark-blue-grey edge outline, rim edge strokes, narrow white highlight streak on left edge and tiny shoulder white glints. REMOVE all cream, white, grey or tinted body FILL and inner base fill: make all interior pixels entirely alpha-transparent other than the narrow reflection streaks. Center of entire bottle must be fully transparent, so colored liquid rendered below stays visible and saturated. Outside remains fully transparent. Do not redraw or move the outline, don't add any elements. No opaque panel, no background, no checkerboard pixels, no text, no shadow. True RGBA alpha overlay.
```

### check_badge.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: individual interface icon. Square 256x256 composition. Subject fills center 208x208 equivalent region with about 24px transparent breathing room on each side. One round bright lime-green glossy badge, thick clean white border, bold white checkmark in center, narrow dark-green outer outline. Crisp readable at tiny game UI sizes. Exactly one isolated icon. No floor or cast shadow outside silhouette.
```

### clock.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: individual interface icon. Square 256x256 composition. Subject fills center 208x208 equivalent region with about 24px transparent breathing room on each side. One small round cartoon stopwatch, creamy ivory face, warm brown rim with narrow golden trim, single thick dark brown hand pointing upward from center, little gold button on top, four simple hour ticks, no digits. Crisp readable at tiny game UI sizes. Exactly one isolated icon. No floor or cast shadow outside silhouette.
```

### customer_01.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: customer portrait, square 512x512 canvas. Character: young adult woman with curly auburn hair in a messy bun, pink tied bandana, freckles, white T-shirt and green apron, gold hoop earrings. Bust portrait head and shoulders centered facing viewer. Top of hair at 5% height, face in upper middle, shoulders cropped flush at bottom canvas edge. Character fills width and height naturally; maintain all hair and ears inside image. Hands not visible, holds nothing. Lower right has only plain clothing, game overlays a drink there. Expression: warm friendly expectant smile, bright open eyes looking at viewer. Render one character only.
```

### customer_01_happy.png

```text
Use case: identity-preserve. Edit target: the attached customer portrait. Create its HAPPY facial expression variant for the same game's animation. Preserve the exact character identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, art style, and transparent background. Change ONLY the facial expression: delighted with eyes closed in joy, big open happy smile with visible upper teeth, slightly lifted rosy cheeks and relaxed raised brows. Same head position. No tears, hearts, sparkles, hands, objects, words or new elements. Keep square image and bottom edge crop identical. Genuine RGBA transparency.
```

### customer_01_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create its disappointed SAD facial expression variant for a cozy game. Preserve exact identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, and art style. Change ONLY facial expression to mildly annoyed and disappointed: gently furrowed brows, downturned closed pouting mouth, eyes glancing a little sideways. Still cute and friendly in style; no rage, no tears. Same head position. No extra objects, hands, words, symbols. Keep original square framing, shoulders crop and genuine transparent RGBA background.
```

### customer_02.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: customer portrait, square 512x512 canvas. Character: cheerful adult man with short black curly hair and a full beard, warm dark brown skin, mustard-yellow T-shirt and green apron. Bust portrait head and shoulders centered facing viewer. Top of hair at 5% height, face in upper middle, shoulders cropped flush at bottom canvas edge. Character fills width and height naturally; maintain all hair and ears inside image. Hands not visible, holds nothing. Lower right has only plain clothing, game overlays a drink there. Expression: warm friendly expectant smile, bright open eyes looking at viewer. Render one character only.
```

### customer_02_happy.png

```text
Use case: identity-preserve. Edit target: the attached customer portrait. Create its HAPPY facial expression variant for the same game's animation. Preserve the exact character identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, art style, and transparent background. Change ONLY the facial expression: delighted with eyes closed in joy, big open happy smile with visible upper teeth, slightly lifted rosy cheeks and relaxed raised brows. Same head position. No tears, hearts, sparkles, hands, objects, words or new elements. Keep square image and bottom edge crop identical. Genuine RGBA transparency.
```

### customer_02_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create its disappointed SAD facial expression variant for a cozy game. Preserve exact identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, and art style. Change ONLY facial expression to mildly annoyed and disappointed: gently furrowed brows, downturned closed pouting mouth, eyes glancing a little sideways. Still cute and friendly in style; no rage, no tears. Same head position. No extra objects, hands, words, symbols. Keep original square framing, shoulders crop and genuine transparent RGBA background.
```

### customer_03.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: customer portrait, square canvas 512x512. Character: young adult woman with long black hair and a lavender beret, fair skin, small gold hoop earrings, white T-shirt under dark denim overalls. Same art style as the already generated auburn woman and bearded man. Bust portrait, head and shoulders centered, facing viewer, head in upper middle. Hair fully visible with a little margin above, shoulders cropped at bottom edge, occupies most of canvas. No hands or held objects. Lower right corner plain clothing only for game overlay. Warm friendly expectant smile, bright open eyes at viewer. Exactly one character.
```

### customer_03_happy.png

```text
Use case: identity-preserve. Edit target: the attached customer portrait. Create its HAPPY facial expression variant for the same game's animation. Preserve the exact character identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, art style, and transparent background. Change ONLY the facial expression: delighted with eyes closed in joy, big open happy smile with visible upper teeth, slightly lifted rosy cheeks and relaxed raised brows. Same head position. No tears, hearts, sparkles, hands, objects, words or new elements. Keep square image and bottom edge crop identical. Genuine RGBA transparency.
```

### customer_03_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create its disappointed SAD facial expression variant for a cozy game. Preserve exact identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, and art style. Change ONLY facial expression to mildly annoyed and disappointed: gently furrowed brows, downturned closed pouting mouth, eyes glancing a little sideways. Still cute and friendly in style; no rage, no tears. Same head position. No extra objects, hands, words, symbols. Keep original square framing, shoulders crop and genuine transparent RGBA background.
```

### customer_04.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: customer portrait, square canvas 512x512. Character: kind older man with neat grey hair and round glasses, light tan skin, light-blue shirt and red bow tie. Same art style as the already generated auburn woman and bearded man. Bust portrait, head and shoulders centered, facing viewer, head in upper middle. Hair fully visible with a little margin above, shoulders cropped at bottom edge, occupies most of canvas. No hands or held objects. Lower right corner plain clothing only for game overlay. Warm friendly expectant smile, bright open eyes at viewer. Exactly one character.
```

### customer_04_happy.png

```text
Use case: identity-preserve. Edit target: the attached customer portrait. Create its HAPPY facial expression variant for the same game's animation. Preserve the exact character identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, art style, and transparent background. Change ONLY the facial expression: delighted with eyes closed in joy, big open happy smile with visible upper teeth, slightly lifted rosy cheeks and relaxed raised brows. Same head position. No tears, hearts, sparkles, hands, objects, words or new elements. Keep square image and bottom edge crop identical. Genuine RGBA transparency.
```

### customer_04_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create its disappointed SAD facial expression variant for a cozy game. Preserve exact identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, and art style. Change ONLY facial expression to mildly annoyed and disappointed: gently furrowed brows, downturned closed pouting mouth, eyes glancing a little sideways. Still cute and friendly in style; no rage, no tears. Same head position. No extra objects, hands, words, symbols. Keep original square framing, shoulders crop and genuine transparent RGBA background.
```

### customer_05.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: customer portrait, square canvas 512x512. Character: young adult woman with a short blonde bob, rosy cheeks, pastel pink cardigan over a white top. Same art style as the already generated auburn woman and bearded man. Bust portrait, head and shoulders centered, facing viewer, head in upper middle. Hair fully visible with a little margin above, shoulders cropped at bottom edge, occupies most of canvas. No hands or held objects. Lower right corner plain clothing only for game overlay. Warm friendly expectant smile, bright open eyes at viewer. Exactly one character.
```

### customer_05_happy.png

```text
Use case: identity-preserve. Edit target: the attached customer portrait. Create its HAPPY facial expression variant for the same game's animation. Preserve the exact character identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, art style, and transparent background. Change ONLY the facial expression: delighted with eyes closed in joy, big open happy smile with visible upper teeth, slightly lifted rosy cheeks and relaxed raised brows. Same head position. No tears, hearts, sparkles, hands, objects, words or new elements. Keep square image and bottom edge crop identical. Genuine RGBA transparency.
```

### customer_05_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create its disappointed SAD facial expression variant for a cozy game. Preserve exact identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, and art style. Change ONLY facial expression to mildly annoyed and disappointed: gently furrowed brows, downturned closed pouting mouth, eyes glancing a little sideways. Still cute and friendly in style; no rage, no tears. Same head position. No extra objects, hands, words, symbols. Keep original square framing, shoulders crop and genuine transparent RGBA background.
```

### customer_06.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: customer portrait, square canvas 512x512. Character: young adult man with tousled black hair and a backwards blue cap, warm tan skin, mint-green hoodie. Same art style as the already generated auburn woman and bearded man. Bust portrait, head and shoulders centered, facing viewer, head in upper middle. Hair fully visible with a little margin above, shoulders cropped at bottom edge, occupies most of canvas. No hands or held objects. Lower right corner plain clothing only for game overlay. Warm friendly expectant smile, bright open eyes at viewer. Exactly one character.
```

### customer_06_happy.png

```text
Use case: identity-preserve. Edit target: the attached customer portrait. Create its HAPPY facial expression variant for the same game's animation. Preserve the exact character identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, art style, and transparent background. Change ONLY the facial expression: delighted with eyes closed in joy, big open happy smile with visible upper teeth, slightly lifted rosy cheeks and relaxed raised brows. Same head position. No tears, hearts, sparkles, hands, objects, words or new elements. Keep square image and bottom edge crop identical. Genuine RGBA transparency.
```

### customer_06_sad.png

```text
Use case: identity-preserve. Edit target: attached normal customer portrait. Create its disappointed SAD facial expression variant for a cozy game. Preserve exact identity, age, hair silhouette and strands, accessories, outfit, body, pose, framing, scale, lighting, and art style. Change ONLY facial expression to mildly annoyed and disappointed: gently furrowed brows, downturned closed pouting mouth, eyes glancing a little sideways. Still cute and friendly in style; no rage, no tears. Same head position. No extra objects, hands, words, symbols. Keep original square framing, shoulders crop and genuine transparent RGBA background.
```

### heart_empty.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: individual interface icon. Square 256x256 composition. Subject fills center 208x208 equivalent region with about 24px transparent breathing room on each side. One used-life cartoon heart, symmetrical plump heart silhouette, muted pale grey-beige interior, subtle warm grey-brown outline, matte faint shading, no colored red areas. Match full heart icon silhouette. Crisp readable at tiny game UI sizes. Exactly one isolated icon. No floor or cast shadow outside silhouette.
```

### heart_full.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: individual interface icon. Square 256x256 composition. Subject fills center 208x208 equivalent region with about 24px transparent breathing room on each side. One glossy plump cartoon heart, bright raspberry red-pink, soft broad white highlight upper left, darker crimson thin rim, symmetrical silhouette. Crisp readable at tiny game UI sizes. Exactly one isolated icon. No floor or cast shadow outside silhouette.
```

### icon_pause.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: individual interface icon. Square 256x256 composition. Subject fills center 208x208 equivalent region with about 24px transparent breathing room on each side. One circular glossy violet-purple game button, two thick white vertical rounded bars centered as pause symbol, thick white outer ring, deep purple lower bevel and highlights upper left. No gear. Crisp readable at tiny game UI sizes. Exactly one isolated icon. No floor or cast shadow outside silhouette.
```

### lose_art.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: level loss vignette on landscape 3:2 canvas, intended 600x400. A single empty clear glass cocktail bottle lying gently tipped on its side diagonally, mouth lower left, with a small pastel pink spill by its mouth. One cute tiny pink droplet with a very simple sad face beside the puddle. Gentle and cute, reassuring, polished. No broken glass or drama. All objects fully within frame, wide balanced composition, generous transparent margin, no floor or scenery, no writing.
```

### win_art.png

```text
Use case: stylized-concept. Production individual sprite for Cocktail Sort, cozy casual mobile puzzle game. Match user's initial reference: polished lush hand-painted 2D cartoon with appealing rounded volumes, soft cel-shading and smooth gradients, expressive features, rich warm colors, fine warm-brown outlines, warm light from upper left. Genuine transparent RGBA background, no background color or checkerboard painted into image, no words, letters, watermark, card, frame or UI. Asset type: level victory vignette on landscape 3:2 canvas, intended 600x400. One beautiful small glass cocktail bottle in center, filled with four distinct horizontal layers from bottom to top purple, orange, pink, pink. Pink-white striped straw, tiny strawberry and fresh mint garnish at its neck. A few golden sparkles and pink/purple confetti pieces around it, celebratory, polished. Whole composition fits inside canvas with generous transparent margin, no crop, no floor, no writing. Bottle takes about 80 percent canvas height.
```
