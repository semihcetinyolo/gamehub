# Cocktail Flow: Astra asset guide (conveyor belt)

> Runtime update: the game now draws the rail and moving slats directly in SVG,
> using the same path and clock as the drinks. PNG belts are retained as art
> references only; `fit_belt.py` no longer changes the belt shown in the game.
> Shape and placement live in `game.js` (`beltGeometry`, `layoutBelt`), colours in
> `style.css`, and lap time in `progression.js` (`BELT`). The guide below describes
> the previous image workflow.

All other art (customers, bottles, glasses, background, icons) is shared with
Cocktail Sort, see `../cocktail_sort/assets/ASTRA_PROMPTS.md`. This guide only covers the
**conveyor belt**, one image per screen layout. The layouts can be switched in the
pause panel (GÖRÜNÜM: V1 · Halka / V2 · Dik / V3 · Ferah).

Until a belt image exists, the game draws a simple grey belt itself.

## Workflow

1. Upload to Astra: the **style reference** (`reference/cocktail_reference.png`), the
   **template** (`…c_belt_vX_template_….png`) and the **silhouette** (`…d_belt_vX_silhouette_….png`).
   Add the **layout** screenshot (`…_belt_vX_layout.png`) if Astra needs context.
2. Paste the **shared style text** plus the **belt prompt** for that view.
3. Save the result as `assets/raw/belt_v1.png` (or `belt_v2.png`, `belt_v3.png`) with a transparent background.
4. `python3 tools/fit_belt.py` trims the empty margin, scales the image to the template size and writes it to `assets/img/`.
5. Open the game, pause, pick that view. The game draws the moving slats lightly on top of the image,
   and the drinks ride the middle of the belt band.

> The game stretches the image over the loop, so the **outline must follow the silhouette**:
> the same outer shape, belt band width and inner opening. Decorations stay inside that outline.

## Wireframes (`assets/wireframes/`)

| File | Purpose |
|---|---|
| `10_belt_v1_layout.png`, `11_…v2…`, `12_…v3…` | Game screen in wireframe mode. The `belt_vX.png` box shows where the image goes |
| `10b…`, `11b…`, `12b…` `_colour_placeholder.png` | The same screen in colour, with the placeholder belt |
| `10c…`, `11c…`, `12c…` `_template_WxH.png` | Exact loop at the final size. Grey = moving belt band, brown = rim, cream = inner counter. Red dashes = belt direction (clockwise). Green 1–3 = where customers take their drink. Yellow = where drinks get on |
| `10d…`, `11d…`, `12d…` `_silhouette_WxH.png` | The same shape as a clean silhouette on a transparent background (black = rim, dark grey = belt, light grey = inner counter) |

To regenerate the wireframes: `PW=…/playwright-core node tools/wireframes.js`.
Re-run it after the layout changes. Images that are already fitted keep working, because the game stretches them.

## Shared style text (add to the start of every prompt)

```
Cozy casual mobile puzzle game art for a cocktail bar game. Soft cel-shaded 2D illustration,
gentle gradients, clean warm-dark-brown outlines, rounded friendly shapes, warm sunlit café mood,
palette of cream, honey wood, pastel pink, orange, purple and leafy green. Polished, high detail,
consistent lighting from the upper left. Match the style of the attached reference image.
No text, no letters, no logos, no watermark, no UI.
```

## Belt prompts

Shared part for all three views (put it after the style text, then add the view's lines):

```
A closed-loop drink conveyor belt for a cocktail bar, like a sushi-bar conveyor, seen from
straight above (top-down, flat, no perspective). Follow the attached silhouette exactly:
same outer outline, same belt band width, same inner opening, filling the whole canvas edge to edge.
The belt band is a soft dark-grey rubber track made of short rounded slats running across the band,
with a thin polished brass rail on both edges. Around the outside: a rounded honey-wood rim.
The inner opening is a smooth cream-and-honey wooden bar top with a soft inner shadow, empty.
Even lighting along the whole loop so it can be stretched slightly. No drinks, no glasses,
no people, no plants, nothing standing on the belt. Transparent background outside the loop.
```

| File | Size (template) | Wireframes | View lines to add |
|---|---|---|---|
| `belt_v1.png` | 1024×961 | 10, 10c, 10d | `Almost round loop (a fat ring), slightly wider than tall. Customers stand on the left, top and right of it.` |
| `belt_v2.png` | 564×1024 | 11, 11c, 11d | `Tall upright racetrack loop, about twice as tall as wide, with long straight sides. Customers stand on both sides of it.` |
| `belt_v3.png` | 1024×281 | 12, 12c, 12d | `Long flat racetrack loop, about four times as wide as tall, with long straight top and bottom runs and round ends. Customers stand in a row above it.` |
| `belt_v1_coffee.png` … `belt_v3_coffee.png` | same | same | optional, coffee levels: `Darker walnut wood rim and a coffee-house mood; the inner bar top is dark roasted wood.` |
