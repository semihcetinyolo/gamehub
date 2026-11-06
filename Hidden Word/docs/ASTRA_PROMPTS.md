# Hidden Word — UI art and implementation handoff

Approved source: [spec.md](spec.md). Coordinated with `Hidden Words:opus-game` under ledger topic `hw`.
All assets are original generated UI. The similar-game screenshots were viewed only to understand the genre; they were not fed to the generator or reused in these files. Colour screen proofs use this project's `cozy_porch_fake` test scene. Repeated thumbnails and extra level labels in the level-list proof are layout examples, not additional playable levels.

## Direction

Quiet matte ceramic UI: rounded shapes, a shallow upper-left highlight, small soft shadows. Indigo text, ivory surfaces, muted mint support, warm gold for hint/success, coral for hearts and destructive actions. Keep the level artwork dominant. No slogan, ad marker, timer, keyboard, or debug controls outside the admin popup. Slots begin empty; word spacing remains visible. Runtime text is never baked into plates.

## Palette and type

| Role | Hex |
|---|---|
| Main text, primary button, counter | `#3E4870` |
| Ivory surfaces, primary button labels | `#FAF6EA` |
| Mint found-state and support | `#B7E1D2` |
| Hint and success | `#EEBF62` |
| Hearts / reset action | `#E27D70` |
| App background | `#E4EFEC` |
| Secondary text | `#596B73` |
| Destructive text only | `#A34C46` |
| Borders | `#C7D6D1` |

- **[Nunito](https://fonts.google.com/specimen/Nunito), 800–900**: phrase glyphs, primary actions, screen titles. Use 900 for letter glyphs and clear uppercase letterforms. Main action around 20 px on a 390 px phone; phrase around 17–19 px depending on fit.
- **[Nunito Sans](https://fonts.google.com/specimen/Nunito+Sans), 600–700**: settings helper text and smaller labels, 12–15 px on a 390 px phone.
- Both are Google Fonts under OFL. Source variable TTFs and licences are in `docs/fonts/`. Download sources: [Nunito source](https://github.com/google/fonts/tree/main/ofl/nunito), [Nunito Sans source](https://github.com/google/fonts/tree/main/ofl/nunitosans). The proof renderer uses Nunito throughout; the runtime may use Nunito Sans for helpers.
- Runtime fallback: `ui-rounded, system-ui, sans-serif`. Decorative logo and Perfect ribbon lettering are raster art; all other labels remain live text.

## Screen proofs

All individual screens are **1080×1920 PNGs** without a phone bezel. `_wire.png` is grayscale geometry; `b_*_colour.png` is the matching colour composition. Proofs are layout documents, not screenshots proving runtime behavior.

| Screen | Wire | Colour | Content |
|---|---|---|---|
| Main menu | `01_main_menu_wire.png` | `01b_main_menu_colour.png` | Logo without the W tile, settings, PLAY · LEVEL 1, Levels, and a neutral empty-slot motif; no scene or phrase preview, no slogan. |
| Level list | `02_level_list_wire.png` | `02b_level_list_colour.png` | 2-column cards, progress, completed phrase only on finished cards. |
| Game, default | `03_game_screen_wire.png` | `03b_game_screen_colour.png` | Level left, optional hearts after it, found/total counter centered, settings gear right; empty slots, contain-fit scene, centered hint, reserved Banner 320x50 strip. No home button in HUD. |
| Letter flying | `04_letter_flying_wire.png` | `04b_letter_flying_colour.png` | Same new HUD and centered hint/banner row; O cut-out leaves the scene and arcs to the first empty O slot (index 1). Golden path is explanatory only. |
| Perfect | `05_perfect_wire.png` | `05b_perfect_colour.png` | Perfect ribbon, clean finished scene, completed phrase, Next Level. No timer. |
| Settings | `06_settings_wire.png` | `06b_settings_colour.png` | Can / Hearts default OFF, sound, Main menu, Admin, reset progress, Done. |
| Admin popup | `07_admin_popup_wire.png` | `07b_admin_popup_colour.png` | Restart, reveal, solve, previous / next, level picker, and Banner placeholder on/off. Reached from Settings. |
| Hearts enabled | `08_game_hearts_on_wire.png` | `08b_game_hearts_on_colour.png` | Optional extra: level-left HUD with 2 full + 1 empty heart, centered counter, right settings gear, centered hint and banner strip. |

Paths are relative to `game/assets/wireframes/`. `overview_colour.jpg`, `overview_wire.jpg`, and `ui_contact_sheet.jpg` are review sheets, not phone-size screens.

### Geometry for the coder

Coordinates are on the 1080×1920 design canvas; divide by `1080 / deviceWidth` to derive CSS pixels. Adapt vertically to the viewport and safe areas, rather than scaling the entire screen if it would crop controls.

| Region | Design geometry / implementation intent |
|---|---|
| Top HUD | Level x=50 y≈112; enabled hearts immediately after it around x=260–424; counter centered x=440–640; settings gear x=900–1030. No home button in gameplay. |
| Phrase | y=270–454; nominal slot 66×82, 9 px between letters and 32 px between words. Two rows for sample phrase: `YOUR DOOR IS` / `ALWAYS OPEN`. Reduce slot width for long words; never reveal uncollected glyphs. |
| Scene | x=32–1048, y=485–1610 in the proof. Runtime uses contain-fit so the whole scene is visible at 1×, then allows pan/zoom to 4×. |
| Bottom row | Centered hint x=435–645, y=1635–1805; Banner 320x50 proof box x=380–700 y=1845–1895 plus bottom safe-area. Keep hint above banner and maintain 44 CSS px hit target. |
| Menu CTA | PLAY · LEVEL 1 x=130–950 y=925–1115; Levels x=325–755 y=1210–1330; settings top-right. No scene preview or slogan. |
| Panels | Content widths roughly 880–950 px at this scale; preserve 24–32 CSS px inner breathing space and scroll when viewport height is short. |

Flight and combo overlays must use `pointer-events: none`. Begin visual flight immediately; do not wait for it before accepting another tap. Use a target-slot pulse for hint; wrong taps use a small coral ripple. Hearts do not reserve HUD space when disabled. Display crisp readable glyphs over filled tiles; do not use a letter-shaped screenshot inside the slot.

## Production assets

All named UI files except `bg_menu.png` are **RGBA PNG with actual alpha 0 and alpha 255 pixels**. No baked checkerboard. Full-size generated/edit masters are kept in `docs/ui_src/`; production PNGs have their empty outer padding trimmed and are scaled/padded to the sizes below. The app icon has transparent corners as requested; platform packaging may need an opaque variant later. The production files are compacted to display-size ×3 or smaller and palette-quantized; all are under 150 KB.

Nine-slice insets below are source-pixel values in **top / right / bottom / left** order. They describe protected corners, not content padding. For slots, primary plate and panel use `fill`; for the card frame leave the central window empty. Shrink slice widths along with the asset at display scale. `border-image` or an absolutely positioned 9-slice layer must not change the layout size of the interactive control.

| File in `game/assets/ui/` | Pixels | 9-slice TRBL | Runtime content / use |
| `logo.png` | 864×459 | — | Exact Hidden Word wordmark with the small W tile removed. Keep aspect ratio. |
| `icon.png` | 192×192 | — | HW app icon; keep square. |
| `slot_empty.png` | 192×224 | 48 / 48 / 48 / 48 | Empty tile; no glyph. |
| `slot_filled.png` | 192×224 | 48 / 48 / 48 / 48 | Mint found tile; clean Nunito glyph drawn by game. |
| `counter_pill.png` | 384×132 | 51 / 75 / 51 / 75 | Blank indigo pill; ivory found/total text. |
| `btn_hint.png` | 192×192 | — | Gold bulb round button; unlimited, no ad/counter. |
| `btn_settings.png` | 192×192 | — | Cog button; game = Admin, menu = Settings. |
| `btn_home.png` | 192×192 | — | Home button. |
| `heart.png` | 96×96 | — | Filled coral life. |
| `heart_empty.png` | 96×96 | — | Lost life; render only when hearts are enabled. |
| `ribbon_perfect.png` | 864×243 | — | Perfect is baked in; keep aspect ratio. |
| `btn_primary.png` | 768×180 | 45 / 66 / 51 / 66 | Blank indigo button; PLAY / Next Level / Done as text. |
| `panel.png` | 384×512 | 40 / 40 / 44 / 40 | Ivory popup body; no baked title or controls. |
| `card_frame.png` | 384×512 | 40 / 40 / 44 / 40 | Hollow frame; put scene thumbnail underneath, rounded clipping behind rim. |
| `bg_menu.png` | 1080×1920 | — | Native flat neutral background. May replace with CSS `#E4EFEC`. Opaque by design. |

Use `object-fit: contain` for logo, ribbon, icons and hearts. Plates can use nine-slice or proportional scaling at their intended aspect. Never stretch logo lettering. 9-slice review values are starting insets; `ui_asset_manifest.json` records the exact source bounds, sizes and alpha checks. Panel/card: keep the rim above the thumbnail/content, and avoid dark overlays between the rim and image.

## Reproduction

- `python3 docs/generate_ui_assets.py`: runs Clai GPT for missing files only. Each request is logged with `clai action-log`. It does not overwrite existing outputs. Exact image prompts are preserved in `docs/ui_prompts.json` and below. Do not run this merely to regenerate wireframes.
- `python3 docs/prepare_ui_assets.py`: mechanically trims by alpha≥8 bounds, scales/pads masters to final sizes, and writes `docs/ui_asset_manifest.json`. Alpha values ≤2/255 are quantized to zero to remove invisible generator speckles; visible antialiasing is preserved. No painted retouching.
- `python3 docs/render_wireframes.py`: deterministic Pillow layout render using the local fonts, the actual game test scene, and finished PNGs. Writes all 16 screen PNGs.
- `python3 docs/validate_ui.py`: checks dimensions, RGBA transparency, hollow frame center/window, expected files, and generates review sheets.

Each generation command has this form:

```sh
CLAI_IMAGE_SOURCE=codex CLAI_IMAGE_SESSION="$CODEX_THREAD_ID" clai image \
  --model gpt --ratio <ratio> --transparent \
  --output-path game/assets/ui/<name>.png '<prompt below>'
```

The CLI appended the ratio wording to each prompt. No reference-game screenshot was an input. An alpha-cleanup edit of the first card frame is documented after the original generation prompts.

## Exact generation prompts

### `logo.png` — 16:9, transparent

```text
Create one premium mobile casual game wordmark on a truly transparent background. Exact text on two centered lines: Hidden Word. Soft rounded bold lettering, restrained matte ceramic style, deep indigo #3E4870 letters with a warm ivory #FAF6EA edge and a very subtle shadow. Wordmark only, fills 85 percent of canvas width, no enclosing rectangle, no tagline, no stars, no magnifier, no scene, no extra text, no watermark. Orthographic 2D game UI asset, friendly and exceptionally legible on phones.
```

### `icon.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. An app icon: a deep indigo rounded square with two overlapping ivory rounded letter tiles, one showing H and the other W, a tiny mint glint between them. App icon centered, generous simplified silhouette readable at 48 pixels; outer corners fully transparent. No text except H and W.
```

### `slot_empty.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. A single empty rounded square ivory letter slot tile. Thin muted slate border, very shallow inset center, ample empty center. No glyph, letter, underline, dots, or text. Tile occupies 90 percent of canvas and is completely symmetrical, ready for 9-slice.
```

### `slot_filled.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. A single rounded square pale mint letter slot tile in its found state. Thin muted teal border, soft ivory upper rim, very shallow raised center. Entire center left blank for game-rendered dark text. No glyph, letter, checkmark, dots, or text. Tile occupies 90 percent of canvas, symmetric, ready for 9-slice.
```

### `counter_pill.png` — 16:9, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. A single horizontal indigo counter pill plate, width to height 3 to 1. Smooth rounded capsule, restrained ivory hairline upper edge, gentle shallow shadow. Entire center solid indigo and blank, no digits, text, icons, pattern or border ornament. Centered with narrow transparent margin. Designed for stretchable numeric counter.
```

### `btn_hint.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One large round ivory button with a centered simple gold lightbulb symbol, indigo bulb base and two short muted gold rays. Circular mint edge and subtle shadow. Strong recognizable silhouette, no text, no ad badge, no numbers, no separate decorative elements. Button fills 90 percent of the canvas.
```

### `btn_settings.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One circular ivory button with a centered clean indigo cogwheel symbol, 8 soft teeth and open circular center. Thin pale mint edge and gentle shadow. Quiet utility action. No text, no separate decorative elements. Button fills 90 percent of the canvas.
```

### `btn_home.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One circular ivory button with a centered clean indigo house symbol: simple roof, square walls, open ivory door. Thin pale mint edge and gentle shadow. Quiet utility action. No text, no separate decorative elements. Button fills 90 percent of the canvas.
```

### `heart.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One friendly plump coral heart icon with smooth symmetric silhouette, small upper left soft highlight and very subtle dark coral lower rim. No enclosing button, no text, no extra decorations. Heart fills 80 percent of the canvas, completely transparent around it.
```

### `heart_empty.png` — 1:1, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One empty heart icon matching a casual game health display. Symmetric rounded heart outline in muted slate gray with a pale gray translucent interior and very subtle lower rim. Flat neutral unfilled state, no coral, no enclosing button, no text, no extra decorations. Heart fills 80 percent of the canvas, completely transparent around it.
```

### `ribbon_perfect.png` — 16:9, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One wide soft gold celebratory ribbon with small folded ends, restrained ivory rim and subtle shadow. Exact centered text: Perfect. Use bold rounded indigo lettering exceptionally easy to read. Ribbon width to height 3 to 1 and fills width; small ends, no stars or confetti, no scene, no extra text.
```

### `btn_primary.png` — 16:9, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One large horizontal soft indigo rounded rectangle primary button plate, width to height 4 to 1, corner radius one third of button height. Subtle lighter indigo top edge and soft shallow shadow. Entire center solid calm indigo, EMPTY for runtime PLAY or Next Level label. No text, no letters, no symbols, no ornament. Straight long horizontal edges; 9-slice friendly. Centered with narrow transparent margins.
```

### `panel.png` — 3:4, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One large upright ivory popup panel, rounded rectangle width to height 3 to 4, soft mint hairline rim, very subtle shadow. Completely plain empty solid ivory interior, uniform simple straight edges and consistent corner radius. No text, no heading, no buttons, no symbols, no patterns. Designed as 9-slice modal panel; outside rounded corners transparent, panel fills 92 percent of canvas.
```

### `card_frame.png` — 3:4, transparent

```text
Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. One portrait level thumbnail frame, width to height 3 to 4. Thin rounded warm ivory rim with subtle muted mint outer edge and gentle shadow. THE ENTIRE LARGE CENTRAL WINDOW MUST BE TRULY TRANSPARENT, a hollow frame for placing a scene thumbnail behind. No image inside, no fill in the opening, no lettering, no checkmark, no badges, no feet. Narrow rim uses only 5 percent of width. Entire outside transparent too.
```

### Logo tile-removal edit

Input: the original generated `logo.png` with the mint W tile. Output: `docs/ui_src/logo_no_tile_master.png`; production `game/assets/ui/logo.png` is the compact normalized version. This edit preserves the two-line wordmark and reconstructs the underlying W stroke.

```text
Edit this exact wordmark only. Remove the small mint rounded square tile with the letter W at the lower-left of the logo. Reconstruct the underlying left stroke and bottom contour of the large navy W so it reads as a clean uninterrupted W with the same navy fill, warm ivory outline, soft shadow, scale, alignment and letter shapes as the original. Keep every other pixel-level visual decision unchanged: exact text Hidden Word, same two-line layout, same colors, same transparency, same aspect ratio, same wordmark only. No tile, no replacement symbol, no extra text, no tagline, no background, no watermark. Truly transparent background.
```

### Card-frame alpha cleanup edit

Input: first generated `card_frame.png`, after mechanical normalization. Output request: `card_frame_clean.png`, GPT, 3:4, transparent. The initial frame had translucent haze in part of the open window, so center-pixel alpha alone was not accepted as sufficient validation.

```text
Edit this game UI frame only: retain the thin ivory rounded rectangular rim and mint outer outline. Remove ALL translucent haze, grey glass, white glow, fog, shadow and partial opacity from the entire central opening and all outside area. Center opening must be completely empty with alpha exactly zero everywhere inside the rim. Outside the rim must also be alpha exactly zero. Only the narrow ivory and mint rim should have visible pixels, with normal antialiasing on its edges. No glass, no fill, no cast shadows, no text. Portrait 3:4 isolated hollow frame.
```

## Screen composition briefs

The wireframes and colour proofs are deterministic layout drawings, not AI-generated screenshots. Their complete source is `render_wireframes.py`. The colour proofs use a neutral abstract scene placeholder when a test level is not present; they do not preview a level on the main menu. The eight composition briefs are the eight rows in the Screen proofs table above; no additional image-generation prompts were used for those screens.

## V2 — warm storybook UI (2026-11-06)

Generated with `clai image --model gpt`. Full sources in `clai-images/ui-v2-*.png`; exact commands reproducible with `docs/ui_v2_generate.py`. Mockups are deterministic compositions at 1170×2532. Concept illustrations use the named level thumbnails only as style references. Production labels are runtime text except the logo.

### `concept_storybook` — 9:16, transparent: False

Reference: game/assets/upon_storybook_attic/thumb.jpg

```text
Create a portrait mobile game main-menu background illustration, NO text, NO buttons, NO logo, NO UI. Warm gentle watercolor and colored pencil on cream cotton paper #FFF8E8, a cozy storybook atmosphere matching the supplied attic reference in palette and paper texture. This is a decorative quiet background, not a level screenshot. Center 75 percent of image is almost blank ivory paper with subtle warm washes, generous empty space. Small handpainted illustrated clusters ONLY along the far corners: upper left a delicate sage leafy branch, bottom left two closed storybooks and a tiny ochre flower, bottom right a small terracotta pot with sage leaves. Keep decorations within outer 15 percent and lowest 17 percent. Faint warm ochre paper shading, restrained charming craft. No framed inset, no large scene, no characters. Almost blank upper right for a settings control. Match reference material and palette only; do not reproduce room or furniture.
```

### `concept_garden` — 9:16, transparent: False

Reference: game/assets/home_cartoon_garden/thumb.jpg

```text
Create a portrait mobile casual game menu BACKGROUND only, NO text, NO buttons, NO logo, NO UI. Use supplied cozy cartoon garden as style and color reference only. Friendly flat hand-inked gouache cartoon, sage green leaves, warm peach accents, cream center. Large empty light buttercream central 75 percent, a few illustrated tree leaves hanging in top corners and small flowers, terracotta pots and a tiny coral picket fence hugging only the bottom 16 percent. Fine warm dark green outlines, cheerful but restrained, a softly painted pale sage edge vignette. No full garden scene, no door, no characters, no level thumbnail. Upper right nearly blank for settings. All central controls will be added separately.
```

### `logo` — 16:9, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. Exact text on two centered lines: Hidden Word. Bold rounded custom hand-lettered forest-green wordmark, subtle ivory paper outline, small ochre baseline shadow. Letter shapes friendly and slightly organic, consistent weight; only lettering. No letter tiles, no leaf decorations, no frame, no symbols, no tagline. Tight composition, exact spelling.
```

### `btn_play` — 16:9, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One single wide horizontal green rounded rectangle button plate, width to height 4.1 to 1. Solid rich leaf green #39814B with restrained top wash #4A9258 and dark forest lower edge #286138, cream hairline around edge. Clearly GREEN. Flat broad quiet center, completely blank for runtime white PLAY label. NO text, NO triangle, NO decorations. Straight long edges and rounded corners, 9-slice friendly. Narrow transparent margins.
```

### `btn_secondary` — 16:9, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One single horizontal warm cream rounded rectangle button plate, width to height 4.1 to 1, fine warm brown drawn outline, thin sage lower edge. Flat opaque cream center completely blank. NO text, NO icons, NO decorations. Straight long edges and rounded corners, 9-slice friendly, narrow transparent margins.
```

### `level_badge` — 16:9, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One single small horizontal cream label plaque with soft rounded corners, width to height 2.8 to 1. Fine double contour in sage and warm brown, shallow ochre lower edge. Blank solid cream interior for runtime Level 9 text. NO text, NO icons, NO holes, NO hanging strings. Calm paper label, not a button, straight long edges, 9-slice friendly.
```

### `counter_pill` — 16:9, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One single horizontal forest-green #304B3B counter capsule, width to height 2.7 to 1. Fine sage outside edge and almost invisible paper grain, completely blank solid dark center for white digits. No text, no icons, no decorations. Symmetric straight long edges, soft rounded corners. Narrow transparent margins.
```

### `panel` — 3:4, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One upright warm cream #FFF8E8 paper popup panel, width to height 3 to 4, softly rounded corners, fine warm brown contour and thin muted sage outer rim. Very subtle ochre lower shadow. Entire interior UNIFORM flat cream with barely perceptible grain. NO text, NO illustrations, NO buttons, NO ornaments. Straight sides; 9-slice friendly. Transparent exterior, narrow margins.
```

### `slot_empty` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One blank rounded square warm cream letter tile, quiet thin warm brown outline, shallow ochre lower edge, center flat opaque cream for a dark letter. No text, no marks, no dots. Almost square with consistent rounded corners and narrow transparent margins.
```

### `slot_filled` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One blank rounded square pale sage #D6E4C6 found-letter tile, quiet thin forest-green outline, shallow sage lower edge, center flat pale sage for a dark letter. No text, no checkmark, no marks, no dots. Almost square with consistent rounded corners and narrow transparent margins.
```

### `btn_settings` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One circular cream utility button with thin warm brown edge and subtle sage lower rim. Centered simple forest-green cogwheel with six softly rounded teeth and a clear circular hole. Large clear flat symbol occupying half the circle. No text, no other objects, no ornament, narrow transparent margins.
```

### `btn_home` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One circular cream utility button with thin warm brown edge and subtle sage lower rim. Centered simple forest-green house silhouette with clear cream door. Large clear flat symbol occupying half the circle. No text, no other objects, no ornament, narrow transparent margins.
```

### `btn_close` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One circular cream utility button with thin warm brown edge and subtle sage lower rim. Centered simple thick forest-green X made of two rounded crossing strokes. Large clear flat symbol occupying half the circle. No text, no other objects, no ornament, narrow transparent margins.
```

### `btn_back` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One circular cream utility button with thin warm brown edge and subtle sage lower rim. Centered simple thick forest-green left-facing chevron. Large clear flat symbol occupying half the circle. No text, no other objects, no ornament, narrow transparent margins.
```

### `btn_hint` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One circular cream hint button with thin ochre edge and sage lower rim. Centered large ochre lightbulb silhouette, forest-green base, exactly three short simple ochre rays. Friendly illustrated clean shape, recognisable at 48 pixels. No text, no counters, no ad tag, no ornament. Narrow transparent margins.
```

### `ribbon_perfect` — 16:9, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One wide soft ochre paper ribbon with small folded ends, width to height 3.6 to 1. Fine warm brown contour, shallow fold shading. Entire center COMPLETELY BLANK for runtime title Perfect. No text, no stars, no confetti, no ornament. Narrow transparent margins.
```

### `heart` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One small simple plump terracotta coral #CB7560 heart, gentle watercolor wash and fine warm brown outline. No enclosing circle, no extra objects, no text. Symmetric clearly readable shape, narrow transparent margins.
```

### `heart_empty` — 1:1, transparent: True

Reference: none

```text
One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. One small simple empty heart outline in muted warm brown, pale cream interior, thin sage lower edge, gentle watercolor paper. No enclosing circle, no extra objects, no text. Symmetric clearly readable shape, narrow transparent margins.
```

### V2 logo rename — Hidden Letters (2026-11-06)

Reference: `docs/ui_src/v2/logo_hidden_word_reference.png` (previous production logo). GPT reference edit: `clai image --model gpt --ratio 16:9 --transparent --input-path <reference> --output-path clai-images/ui-v2-logo-hidden-letters.png`. Original source preserved; replacement production `game/assets/ui_v2/logo.png` remains 840×450 RGBA. Full cropped master: `docs/ui_masters/v2/logo.png`. Reproduce with `python3 docs/ui_v2_rename_logo.py generate` then `... install`.

```text
Edit the supplied exact game logo. Change the two-line title from Hidden Word to Hidden Letters. Exact first line: Hidden. Exact second line: Letters. Preserve the original Hidden lettering unchanged in character shapes, proportions and style. Render Letters in precisely the same bold rounded organic hand-lettered storybook style as the old Word: forest-green watercolor/gouache paper texture, warm ivory paper outline and subtle ochre lower offset edge. Match the reference colors exactly, including its dark forest green. Keep the same two-line compact centered silhouette and the same overall width-to-height ratio, approximately 1.9 to 1. Fit the longer word Letters within the original lower-line width by using slightly narrower matching letters, without making the logo wider or adding a third line. Maintain similar visual weight and line spacing. Only the wording changes. No icons, no tiles, no leaves, no border, no extra words, no new decorations, no glossy effects. True transparent background everywhere outside the original-style paper outline, including natural gaps. The final asset will occupy the same 840 by 450 transparent box. Exact spelling: H i d d e n / L e t t e r s.
```
