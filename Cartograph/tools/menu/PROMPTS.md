# Cartograph ana menü + profil görselleri

ChatGPT (Astra) için hazırlanan liste. Görsel sayfası: `tools/menu/astra_menu.html` (prompt kopyalama, referans indirme, "bitti" işareti).

**İş akışı**
1. Her görseli uygulama ikonunu (`assets/app-icon.png`) referans vererek üret. Avatarlarda ilk beğendiğini sonrakilere de referans ver.
2. Dosyayı aşağıdaki adla `assets/menu/src/` içine kaydet (png, jpg, webp olur).
3. `python3 tools/menu/menu_art.py build` → `assets/menu/<ad>.webp` ve `menu-art.js` yazılır. Oyun eksik olanların yerine kendi çizimini gösterir.

Butonlar, profil kartı, istatistik kutuları ve koleksiyon ızgarası CSS ile çiziliyor; koleksiyondaki küçük vitraylar oyunun kendi bölüm görselleri. Bunlar için görsel gerekmiyor.

| # | Dosya | Ne | Üretim | Oyunda | Durum |
|---|---|---|---|---|---|
| 1 | `logo-emblem` | Ana menüde CARTOGRAPH yazısının üstündeki amblem | 1024×1024, şeffaf | 256 px | **Şart** |
| 2 | `avatar-1` | Profil resmi 1: tilki kâşif | 1024×1024 | 256 px | **Şart** |
| 3 | `avatar-2` | Profil resmi 2: baykuş rotacı | 1024×1024 | 256 px | **Şart** |
| 4 | `avatar-3` | Profil resmi 3: kedi denizci | 1024×1024 | 256 px | **Şart** |
| 5 | `avatar-4` | Profil resmi 4: kaplumbağa kaptan | 1024×1024 | 256 px | **Şart** |
| 6 | `avatar-5` | Profil resmi 5: ayı dağcı | 1024×1024 | 256 px | **Şart** |
| 7 | `avatar-6` | Profil resmi 6: tavşan haritacı | 1024×1024 | 256 px | **Şart** |
| 8 | `avatar-7` | Profil resmi 7: kirpi gözlemci | 1024×1024 | 256 px | **Şart** |
| 9 | `avatar-8` | Profil resmi 8: su samuru gezgin | 1024×1024 | 256 px | **Şart** |
| 10 | `avatar-frame` | Profil resminin çerçevesi (ortası boş) | 1024×1024, şeffaf | 256 px | İsteğe bağlı |
| 11 | `icon-collection` | "Koleksiyon" düğmesinin ikonu | 1024×1024, şeffaf | 128 px | İsteğe bağlı |
| 12 | `menu-background` | Ana menünün arka planı | 1024×1536 | 1024 px | İsteğe bağlı |

## Ortak stil (her prompt'un sonunda var)

```
STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

## Prompt'lar

### 1. `logo-emblem` — Ana menüde CARTOGRAPH yazısının üstündeki amblem

```
A circular stained-glass emblem: an eight-pointed compass rose in brass-gold and parchment-cream glass on a deep forest-green glass disc, ringed by a thin brass band with tiny teal and terracotta glass gems at the four cardinal points. Centred, filling about 90% of the canvas. Transparent background outside the circle. Transparent background (PNG with alpha).

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 2. `avatar-1` — Profil resmi 1: tilki kâşif

```
A round stained-glass portrait medallion of a clever red fox explorer in a forest-green coat holding a brass spyglass, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 3. `avatar-2` — Profil resmi 2: baykuş rotacı

```
A round stained-glass portrait medallion of a wise brown owl navigator with round brass spectacles and a small compass, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 4. `avatar-3` — Profil resmi 3: kedi denizci

```
A round stained-glass portrait medallion of a ginger cat sailor in a dark tricorn hat with a rolled sea chart under its arm, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 5. `avatar-4` — Profil resmi 4: kaplumbağa kaptan

```
A round stained-glass portrait medallion of a sea turtle captain in a navy captain's cap with a small brass anchor, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 6. `avatar-5` — Profil resmi 5: ayı dağcı

```
A round stained-glass portrait medallion of a brown bear mountaineer with a cream scarf holding a glowing amber lantern, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 7. `avatar-6` — Profil resmi 6: tavşan haritacı

```
A round stained-glass portrait medallion of a cream rabbit map-maker with a quill pen and a parchment map, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 8. `avatar-7` — Profil resmi 7: kirpi gözlemci

```
A round stained-glass portrait medallion of a small hedgehog scout looking through a brass magnifying glass, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 9. `avatar-8` — Profil resmi 8: su samuru gezgin

```
A round stained-glass portrait medallion of a cheerful otter traveller in a terracotta neckerchief holding a wooden oar, head and shoulders, friendly, facing the viewer. The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as the other avatars in this set.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 10. `avatar-frame` — Profil resminin çerçevesi (ortası boş)

```
A thin round brass-and-glass ring frame for a profile picture: a polished brass ring with small inset glass gems (teal, amber, terracotta) and tiny compass ticks at north, east, south and west. The ring is about 12% of the width; everything inside the ring and outside it is fully transparent. Transparent background (PNG with alpha).

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 11. `icon-collection` — "Koleksiyon" düğmesinin ikonu

```
A small icon of an arched stained-glass window with four colourful panes (teal, amber, terracotta, green) and dark lead lines, on a transparent background. Very simple, bold, readable at 24 px. Transparent background (PNG with alpha).

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```

### 12. `menu-background` — Ana menünün arka planı

```
A very soft, low-contrast background for a mobile menu: aged parchment with faint antique map contour lines and a pale compass rose, edges slightly darker. Mostly empty in the middle so text and buttons sit on top. Portrait 2:3.

STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.
```
