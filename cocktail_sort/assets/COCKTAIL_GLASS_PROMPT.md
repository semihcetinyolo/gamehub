# Kokteyl bardağı

Yerleşik `image_gen` / imagegen becerisi ile `assets/img/mixer_coffee.png` referansından üretildi.

- Oyunda kullanılan çıktı: `assets/img/mixer_cocktail.png`, 400 × 860 PNG.
- Kahve bardağıyla aynı uzun, düz gövde oranı; altın ağız ve narenciye amblemi.
- Hazırlama kabı ve müşteri siparişleri aynı görseli / sıvı koordinatlarını kullanır.
- Sıvı alanı: x=62, y=200, w=276, h=546, r=38.
- Önceki sürahi aktif kullanımdan çıkarıldı; ona özel esnetme ve kırpma kaldırıldı.
- Boyutlandırma: sips. Çerçeve ve renkli zemin yok.

## Üretim prompt'u

```text
Use case: precise-object-edit.
Asset type: production transparent glass sprite for the Cocktail Sort game.
Edit target: attached mixer_coffee.png. Make its COCKTAIL companion with EXACTLY the same tall slender highball glass silhouette, canvas aspect ratio 400:860, scale, placement, clear straight walls, open elliptical mouth and thick glass base. Preserve every outer contour and the transparent margins. This asset must align with the reference pixel geometry: rim around y25..95, clear body x50..350, base around y745..825 on a 400x860 equivalent canvas.
Change only the small coffee bean emblem near the top to a tiny warm-gold citrus wedge medallion in the SAME position and size; change copper rim to restrained champagne gold. Keep the same polished cozy mobile game illustration, edge highlights and fine outline. No handle, no spout, no bottle neck, no stem, no garnish sticking outside, no straw. Empty glass with near-transparent clear body, no liquid and no layer lines. Preserve the entire blank liquid interior (x62..338, y200..746), clean and undecorated. True RGBA transparency outside glass. No backdrop, no panel, no frame, no pedestal or shadow. No text or watermark. Do NOT add large blank areas and do NOT change the aspect ratio or widen the glass.
```
