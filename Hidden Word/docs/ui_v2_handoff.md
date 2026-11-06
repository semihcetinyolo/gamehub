# Hidden Word UI v2 — implementation handoff

Recommended direction: **storybook paper** (`01_menu_storybook.png`). Warm cream, forest-green ink, restrained watercolor corner illustrations. Direction B (`02_menu_garden.png`) is a brighter cartoon alternative, provided as an optional background. Both use a green PLAY and a separate Level N badge; neither has a row of level boxes.

## Review and source files

- `docs/ui_v2_mockups/`: six **1170×2532** PNG proofs, `contact_sheet.jpg`, `asset_contact_sheet.jpg`.
- `game/assets/ui_v2/`: production PNGs. These are ready to integrate, but this task does **not** modify game code.
- `docs/ui_masters/v2/`: full-resolution art, cropped to visible alpha for transparent sprites.
- `docs/ui_src/v2/`: untouched generated sources; original CLI outputs also remain in `clai-images/ui-v2-*.png`.
- Exact prompts: `docs/ASTRA_PROMPTS.md`, section “V2 — warm storybook UI”; machine-readable `docs/ui_v2_prompts.json`.
- Asset sizes, source crops, alpha results: `docs/ui_v2_manifest.json`. Validation: `docs/ui_v2_validation.json`.

## Production mapping

All sizes and slice insets below are **bitmap pixels**. Insets are **top / right / bottom / left**. For a 3× phone rendering, CSS border widths are these insets divided by 3. Do not divide the `border-image-slice` numbers themselves. Use `fill` for plate centers. Slice stretching is appropriate for plate centers and edges; use `contain` for icons, logo, hearts and ribbon. Preserve all sprite alpha.

| PNG | Size | Slice insets | Placement / runtime content |
|---|---:|---|---|
| `bg_menu.png` | 1170×2532 | — | Main menu, centered cover; opaque. Recommended. |
| `bg_menu_garden.png` | 1170×2532 | — | Optional direction B background; opaque. |
| `logo.png` | 840×450 | — | Main menu; only asset with baked lettering: Hidden Word. |
| `btn_play.png` | 840×210 | 60 / 90 / 66 / 90 | Green PLAY; white runtime label. Also Next Level / retry. |
| `btn_primary.png` | 840×210 | 60 / 90 / 66 / 90 | Identical alias of `btn_play.png` for current primary skin. |
| `btn_secondary.png` | 840×180 | 54 / 81 / 60 / 81 | Levels / Main menu; forest runtime label. |
| `level_badge.png` | 360×138 | 42 / 60 / 48 / 60 | Separate menu Level N plaque; compact HUD level plaque. |
| `counter_pill.png` | 288×132 | 42 / 60 / 48 / 60 | HUD found / total, white runtime numbers. |
| `panel.png` | 384×512 | 42 / 42 / 48 / 42 | Settings, end popup, level cards. Solid cream interior. |
| `slot_empty.png` | 96×102 | 27 / 27 / 30 / 27 | Unfound blank letter slot. |
| `slot_filled.png` | 96×102 | 27 / 27 / 30 / 27 | Found slot; dark runtime letter. |
| `btn_settings.png` | 144×144 | — | Top-right settings control. |
| `btn_home.png` | 144×144 | — | Optional home icon wherever existing navigation needs it. |
| `btn_back.png` | 144×144 | — | Levels back control. |
| `btn_close.png` | 144×144 | — | Modal close control. |
| `btn_hint.png` | 192×192 | — | Center-bottom hint; no text, count or ad badge. |
| `ribbon_perfect.png` | 900×252 | — | Ochre ribbon, **blank**; add Perfect as runtime text. |
| `heart.png`, `heart_empty.png` | 90×84 each | — | Existing optional lives, shown only with Hearts enabled. |

The new panel is also the level-card backing; clip the real scene thumbnail with a 12–14 px corner radius over it. A hollow frame image is not needed. Place text above all plate images; no dark overlay between a thumbnail and its backing. Toggles, selected tabs, completion checkmarks and modal scrims remain simple native shapes, not additional raster art.

## Layout at 390×844 logical pixels

The PNG proofs are exactly 3× this coordinate system. The top 47 px and bottom 34 px represent device safe areas; implementation should read the actual insets, not hardcode a device. On shorter phones, compress menu whitespace first. Avoid shrinking controls below 44×44 px hit areas.

- **Main menu:** settings `(326,51,44,44)`; logo box `(56,194,278,147)`; Level plaque `(135,448,120,46)`; PLAY `(58,520,274,68)`; Levels `(95,612,200,52)`. Keep the badge separate, with 26 px before PLAY. No level strip, slogans or scene previews. Background corner art stays decorative.
- **Gameplay:** Level at `(18,54,103,40)`; counter at `(151,54,88,40)`; settings at `(328,52,44,44)`. Two example phrase rows start at y=116 and 159; 30×32 slots with 4 px letter spacing and 16 px word spacing. Wrap at word boundaries and adapt long phrases rather than clipping.
- **Scene:** example bounds `(20,211,350,469)`, preserving the real 1792×2400 scene ratio. Reuse the existing pan/zoom and letter overlay geometry. Do not crop hidden letters to accommodate new UI.
- **Hint:** `(165,691,60,60)` with a 9 px clear gap before the reserved banner. The banner is **y=760..810 = 50 CSS px**, full width; y=810..844 is the additional safe-bottom area. No control or artwork under either. In production, anchor hint/dock to `50px + env(safe-area-inset-bottom)` and reserve both in layout. The proof's blank strip is intentional, with no customer-facing debug text.
- **Levels:** two-column scroll view, 24 px side margins, 14 px gutter, section headings and image-first cards. No locks. Preserve existing `HW_LEVEL_INFO` group keys and within-group play order. Proofs show two actual sample groups (Astra / Hidden BG / Watercolor and Cartoon); short style headings are visual presentation only, not a data regrouping request. Existing full group labels may remain if explicitly required. Footer Home / Levels navigation takes safe bottom into account; card content scrolls above it.
- **Perfect:** cream modal on a 45% forest scrim, blank ochre ribbon with runtime Perfect; completed scene and complete phrase; green Next Level; quiet Main menu below. Backdrop example is the completed 13/13 state. Preserve the game's existing completion rules.
- **Settings:** Sound, Hearts, existing hearts explanation, Main menu, Admin entry, Reset progress. The Admin link only opens the admin popup; debug/test controls belong exclusively inside that popup. Keep destructive reset confirmation behavior. No test controls in the ordinary HUD or menu. Settings icon is a 44 px target; close artwork may be 40 px inside a 44 px hit area.

## Colour and type

| Role | Hex |
|---|---|
| Main paper | `#FFF8E8` |
| Quiet screen background | `#F7F0DF` |
| Ink / main text | `#304B3B` |
| Secondary text | `#6F725D` |
| Primary green | `#39814B` |
| Pressed green / lower edge | `#286138` |
| Found letter / selected surface | `#D6E4C6` |
| Fine outline | `#C8B795` |
| Ribbon / hint accent | `#E9B85F` |
| Life icon coral | `#CB7560` |
| Reset text | `#9D5141` |
| Primary button text | `#FFFFFF` |

Use the existing **Nunito 800/900** for headings, controls, digits and letters; **Nunito Sans 600/700** for secondary labels. Local font files already exist under `docs/fonts/`; proofs use Nunito for reproducibility. Heading 26–32 px; PLAY 25 px/900; secondary button 19 px/900; HUD 16–18 px/900; phrase glyph 19 px/900; card title 17 px/900; supporting labels 12–14 px/700. Keep runtime labels separate from art for localization. Primary press: translate down 2 px, scale .98; release 100 ms. No sparkle/confetti layer required.

## Reproduction and limits

`python3 docs/ui_v2_generate.py mockups` and `... final` generate missing sources only via the requested `clai image --model gpt`; each request is action-logged. `python3 docs/ui_v2_prepare.py` alpha-trims/pads/scales sources into masters and production sizes; only invisible alpha ≤2 is removed. `python3 docs/ui_v2_render.py` composes proofs using real level scenes, letter layers and the finished assets; plate proofs use nine-slicing. `python3 docs/ui_v2_validate.py` checks outputs and records results.

The two background sources are 941×1672; the required 1170×2532 production backgrounds are center-cover resamples. Original resolution is retained in masters. This is a design/asset delivery, not an implemented or browser-tested UI. Opus-game owns implementation and runtime regression checks. Review sprite edges at actual phone size when integrating, and preserve all current level access, settings, hint and admin behavior.
