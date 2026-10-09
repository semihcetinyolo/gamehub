# Altın detaylı hazırlama bardağı

Yerleşik `image_gen` / imagegen becerisiyle üretildi.
Referans: `assets/img/mixer_cocktail.png`.
Çıktı: `assets/img/mixer_cocktail_gold.png`, sips ile 400 × 860 PNG.

- Kalın metal ağız, altın taban ve ince yan şeritler; sıvı alanı açık.
- Sıvı koordinatları: x=66, y=190, w=268, h=530, r=34.
- Kokteyl hazırlama kabı ve siparişlerde ortak görsel.
- Tahtadaki hazırlama kapları en-boy oranı korunarak diğer şişelerden %18 büyük; yerleşimde başlık / büyüme payı ayrıldı.

## Prompt

```text
Use case: precise-object-edit. Edit target: attached Cocktail Sort cocktail glass sprite. Create a more distinct premium preparation vessel with a substantial CHAMPAGNE GOLD METAL rim and foot, while preserving its EXACT current tall slender silhouette, placement, width, height and 400:860 canvas ratio. Same cozy polished casual game style.
Replace the thin gold rim with a clearly thicker polished gold collar from approximately y30 to y155 on a 400x860 coordinate canvas; retain the open elliptical mouth. Keep the little citrus emblem centered below this collar above y195. Replace the transparent thick glass bottom below y752 with an opaque substantial warm gold metal base / foot with two subtle engraved horizontal bands. Add two slender golden vertical structural strips along the extreme outside edges only (x43..59 and x341..356) connecting collar to base, so this reads as a gold-mounted cocktail vessel, not an ordinary plain glass bottle.
CRITICAL: retain the full clear unobstructed liquid window x62..338, y200..746, no pattern, metal, plaque, engraving or objects over this window. Empty vessel, no liquid. Keep its exact proportions and outer shape: no handle, no spout, no stem, no enlargement, no added margins. Glossy metal has warm brown shadows and pale cream specular highlights, no orange cast across interior. Preserve near-transparent glass window. True alpha transparent outside. No background, no frame around sprite, no pedestal beneath vessel, no ground shadow, no text, no watermark. One isolated vessel.
```
