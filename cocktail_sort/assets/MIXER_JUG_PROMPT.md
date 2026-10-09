# Hazırlama sürahisi

9 Ekim 2026 — yerleşik `image_gen` aracı, `imagegen` becerisi.

- Stil / düzenleme referansı: `assets/img/mixer.png`.
- Oyunda kullanılan çıktı: `assets/img/mixer_jug.png` (400 × 860, alfa kanallı PNG).
- Yeni siluet: geniş ağız, dökme ucu, sağda açık kulp, kısa gövde; altın cam detayları.
- `assets.js` sıvı alanı: x=50, y=354, w=226, h=420, r=30.
- PNG tuvali sips ile ölçülendirildi. Eski görsel korunuyor.
- Kabın arkasındaki renkli panel, kaide ve çerçeve kaldırıldı.
- Oyunda PNG'nin üst / alt şeffaf boşlukları `viewBox="0 226 400 602"` ile dışarıda bırakılır. Sıvı ve yansıma aynı koordinatlara uyarlanır; görünür yükseklik diğer şişelerle eşitlenir.

## Üretim prompt'u

```text
Use case: precise-object-edit. Asset type: single production transparent sprite for a cozy polished casual mobile cocktail sorting game.
Edit target/style reference: attached current gold-rimmed glass bottle. Redesign the vessel itself into a clearly different wide-mouthed mixing JUG with a pouring spout and a large open loop handle on its RIGHT. Preserve the reference's polished hand-painted glass, warm gold metal, soft highlights and fine dark outlines. Do not preserve its narrow bottle neck or shoulder silhouette.
Canvas layout is critical: portrait 400:860 aspect ratio, equivalent coordinate system 400 wide by 860 tall. Keep the top 160 pixels EMPTY transparent. Jug mouth at y190, broad elliptical gold lip runs from x30 to x294, with small pouring spout reaching x12 at left. Body sides vertical at x32 and x294 from y250 to y755, rounded bottom at y822, thin golden foot at y832. Large elegant gold-edged clear glass C-shaped handle at right x290..390, from y300 to y655, with a genuinely open transparent hole. Jug is shorter and wider than the source bottle, no long neck and no rounded bottle shoulders. Front orthographic view. Entire empty liquid interior x50..276 y275..790 must be clear, nearly transparent, no decoration or label, no measurement ticks. Delicate glass reflections only along edges. A small gold star detail may be on the upper lip only, never on the liquid area. Empty vessel, no liquid. True transparent alpha background outside the object AND through the handle. No backdrop, no colored panel, no frame, no pedestal, no ground shadow, no text, no watermark. One jug only.
```
