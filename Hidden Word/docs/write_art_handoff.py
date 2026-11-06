from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'docs/ui_asset_manifest.json').read_text())
prompts=json.loads((ROOT/'docs/ui_prompts.json').read_text())
base='''# Hidden Word — UI art and implementation handoff

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
'''
notes={
'logo':'Exact Hidden Word wordmark with the small W tile removed. Keep aspect ratio.',
'icon':'HW app icon; keep square.',
'slot_empty':'Empty tile; no glyph.',
'slot_filled':'Mint found tile; clean Nunito glyph drawn by game.',
'counter_pill':'Blank indigo pill; ivory found/total text.',
'btn_hint':'Gold bulb round button; unlimited, no ad/counter.',
'btn_settings':'Cog button; game = Admin, menu = Settings.',
'btn_home':'Home button.',
'heart':'Filled coral life.',
'heart_empty':'Lost life; render only when hearts are enabled.',
'ribbon_perfect':'Perfect is baked in; keep aspect ratio.',
'btn_primary':'Blank indigo button; PLAY / Next Level / Done as text.',
'panel':'Ivory popup body; no baked title or controls.',
'card_frame':'Hollow frame; put scene thumbnail underneath, rounded clipping behind rim.'}
for name,r in manifest.items():
 sz='×'.join(map(str,r['size'])); sl=' / '.join(map(str,r['slice_insets_trbl'])) if r['slice_insets_trbl'] else '—'
 base+=f"| `{r['file']}` | {sz} | {sl} | {notes[name]} |\n"
base+='''| `bg_menu.png` | 1080×1920 | — | Native flat neutral background. May replace with CSS `#E4EFEC`. Opaque by design. |

Use `object-fit: contain` for logo, ribbon, icons and hearts. Plates can use nine-slice or proportional scaling at their intended aspect. Never stretch logo lettering. 9-slice review values are starting insets; `ui_asset_manifest.json` records the exact source bounds, sizes and alpha checks. Panel/card: keep the rim above the thumbnail/content, and avoid dark overlays between the rim and image.

## Reproduction

- `python3 docs/generate_ui_assets.py`: runs Clai GPT for missing files only. Each request is logged with `clai action-log`. It does not overwrite existing outputs. Exact image prompts are preserved in `docs/ui_prompts.json` and below. Do not run this merely to regenerate wireframes.
- `python3 docs/prepare_ui_assets.py`: mechanically trims by alpha≥8 bounds, scales/pads masters to final sizes, and writes `docs/ui_asset_manifest.json`. Alpha values ≤2/255 are quantized to zero to remove invisible generator speckles; visible antialiasing is preserved. No painted retouching.
- `python3 docs/render_wireframes.py`: deterministic Pillow layout render using the local fonts, the actual game test scene, and finished PNGs. Writes all 16 screen PNGs.
- `python3 docs/validate_ui.py`: checks dimensions, RGBA transparency, hollow frame center/window, expected files, and generates review sheets.

Each generation command has this form:

```sh
CLAI_IMAGE_SOURCE=codex CLAI_IMAGE_SESSION="$CODEX_THREAD_ID" clai image \\
  --model gpt --ratio <ratio> --transparent \\
  --output-path game/assets/ui/<name>.png '<prompt below>'
```

The CLI appended the ratio wording to each prompt. No reference-game screenshot was an input. An alpha-cleanup edit of the first card frame is documented after the original generation prompts.

## Exact generation prompts

'''
for p in prompts:
 base+=f"### `{p['name']}.png` — {p['ratio']}, transparent\n\n```text\n{p['prompt']}\n```\n\n"
base+='''### Logo tile-removal edit

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
'''
(ROOT/'docs/ASTRA_PROMPTS.md').write_text(base)
print('Wrote ASTRA_PROMPTS.md with',len(prompts),'original prompts and two edit prompts')
