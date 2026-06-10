Match Factory weighted art v41 - compact target UI + pause

Değişiklikler:
- Hedef paneli daha kompakt hale getirildi:
  - yükseklik azaltıldı
  - genel genişlik küçültüldü
  - icon yuvaları daha küçük ve daha dengeli
- Sağ üst köşeye aynı estetik dilde küçük bir pause butonu eklendi.
- Pause butonu tıklanınca oyun durur, tekrar tıklanınca devam eder.
- Pause durumunda fizik ve tray animasyonları duraklatılır.

Not:
- Oyun mantığı v40 ile aynıdır.
- Matter.js CDN üzerinden yüklenir; internet gerekir.


V42 visual refresh:
- Gameplay logic, UI layout, target logic, pause button and tuning were preserved from v41.
- Only the visual asset PNG files were replaced with the new higher-quality user-provided versions:
  table, bookshelf, chair, lamp, frame, plant.
- No gameplay/system changes were made intentionally.


V45 more spawn density:
- Base kept as v42.
- Total spawned items increased from 108 to 144.
- Target top-3 logic preserved; top 3 target items still spawn in multiples of 3.
- Spawn now pours from a taller offscreen area above the phone so the stack fills upward and can overflow toward the top.
- Horizontal spawn range widened slightly to fill the screen better.
- No canvas HD scaling changes were applied.


V46 level pack update:
- Base: v45.
- Added second level with sports-themed assets: goal, ball, boot, foam finger, whistle, cone, shorts.
- Level 1 remains the existing home/furniture set.
- Level 2 uses the new sports asset set with per-item physicsScale tuning for collider feel.
- Added a presenter-only Skip Level button outside the phone screen (top-right of page).
- Win button now advances to the next level; fail button restarts the current level.


V47 density/collision fix:
- Level 1 count increased to 162 items to restore/improve the dense v45 feel.
- Level 2 count increased to 156 items.
- Sports item collider physicsScale values increased significantly to reduce deep overlap and bottom compression.
- Global physics radius multiplier raised from 0.92 to 1.04.
- Spawn is now level-aware and starts higher/wider so piles fill upward.
- Physics iterations slightly increased for stability.


V48 level2 same collider system:
- Reverted the global collider radius multiplier from 1.04 back to the original working 0.92.
- Removed the over-large sports physicsScale values that caused gaps.
- Sports assets now use the same weighted collider system as level 1 with only light per-asset normalization.
- Gravity restored to 1.5 to match the earlier working pile behavior.
- Level 2 spawn timing was softened so the sports pile settles more like level 1.


V50 size tweaks on v48 base:
- Level 2 goal visualScale -> 1.10
- Level 2 shorts visualScale -> 1.10
- Level 2 foam finger visualScale -> 0.90
- No other gameplay or physics changes.


V51 level 3 added on v50 base:
- Added new Marine level with 7 assets: cap, boat, binoculars, anchor, lifebuoy, starfish, wheel.
- Level 1 and Level 2 logic/assets left unchanged.
- Level 3 uses the same weighted collider system as prior levels, with light per-asset normalization only.
- Level 3 uses the same wide spawn profile as Level 2.


V52 level 2 + 3 settle fix:
- Level 2 and Level 3 now use the same spawn profile as Level 1 (xMargin 40, spawnModulo 78, spawnStep 19, waveStep 96).
- This removes the tighter/wider spawn that was causing initial crushing, then upward opening and top gaps.
- Level 2 and Level 3 asset physicsScale values were re-tuned per asset so elongated/open shapes use smaller weighted colliders.
- Level 1 unchanged.


V53 level 2 + 3 shape-aware colliders:
- Built on v52.
- Level 1 remains unchanged.
- Level 2 and Level 3 now use shape-aware physics bodies.
- Round assets use weighted circle colliders.
- Long/wide/tall assets use weighted rectangle colliders with chamfer.
- Weighted colliderOffset logic is preserved for every item.
- This is meant to reduce initial over-compression, later upward opening, and empty top gaps in levels 2 and 3.


V54 level 2+3 collider enlargement:
- Built on v53.
- Increased physicsScale values for level 2 and especially level 3 assets.
- Rect collider generation now includes a minimum body thickness using rectBase * 0.54, so narrow/tall assets no longer get tiny physics bodies.
- Circle collider multiplier increased slightly from 0.92 to 0.95.
- Rect items now use lower stableDepthBias than circles, so they do not get stuck excessively far back.


V55 visual size tweak on v54 base:
- All Level 2 assets visualScale set to 1.10.
- All Level 3 assets visualScale set to 1.20.
- No other gameplay, collider, or physics changes.


V56 Gemini physics stabilizer on v55 base:
- Removed position-forcing from the anti-float stabilizer.
- Replaced coordinate clamping with velocity-only damping.
- Upward velocity is softly damped instead of moving bodies manually.
- Added sticker-like body settings: restitution 0.0, friction 0.45, frictionAir 0.08.
- Engine iterations adjusted to positionIterations 12 / velocityIterations 8.
- Floor friction raised to 0.40.
- Level system, UI, skip/pause, success logic, asset scales and collider shapes preserved from v55.


V58 Gemini v2 fast-drop stabilizer on v56 base:
- Base is v56, not v57.
- No initial velocity boost was added.
- frictionAir lowered from 0.08 to 0.015 so the initial drop feels fast again.
- restitution set to 0.02 and friction to 0.35.
- Stabilizer is completely inactive before antiFloatAllowedAt, preserving the opening fall.
- After the initial settle window, only velocity damping is applied.
- Body.setPosition remains removed.
- Level system, UI, skip/pause, success logic, asset scales and collider shapes are preserved from v56.


V59 less float fast start:
- Built on v58.
- Fast initial drop is preserved: frictionAir remains 0.015 and stabilizer is still disabled at the beginning.
- Stabilizer now activates at 3200ms instead of 4700ms.
- Upward velocity damping is stronger: y multiplier 0.38 instead of 0.65.
- General velocity/angular damping is slightly stronger.
- restitution set to 0.0 to remove residual bounce.
- Still no Body.setPosition.


V60:
- Added Level 4: round badge token set in assets_level4/.
- All Level 4 items use circle colliders (physicsScale 0.90).
- Existing levels and game logic preserved from v59.

V61:
- Level 4 badge items scaled up to 115% visual size.

V62:
- Added Level 5 using remote, boot, pillow, radio, cookie jar, mug, and clock assets.
- Circle colliders used for pillow and clock; others use rect.

V63:
- Added Level 6 with updated household asset set (radio, pillow, boot, clock, cookie jar, remote, mug).
- Reused stable collider mapping from previous household-style level.

V64:
- Added Level 7 with new household asset variant set.
- Collider mapping kept consistent with previous stable household levels.

V65:
- Reduced remote size to 50% in Levels 5, 6, and 7.
- Matched collider scaling proportionally for the smaller remote.

V66:
- Disabled generated white sticker outline for Levels 5, 6, and 7.
- Level 5 now stays outline-free, Level 6 uses the provided black-outlined art, and Level 7 uses the provided white-outlined art exactly as supplied.
- Kept the Level 5/6/7 remote size reduction from V65.

V67:
- Added Level 8 using candy assets (4 gummy bears + 3 donuts).
- Gummy bears are scaled to 80% so donuts stay relatively larger.
- Kept existing game logic and previous outline behavior unchanged.

V68:
- Added Level 9 using the second sweets asset set.
- Preserved user-provided asset appearance with no extra outline for level 9.
- Kept sizing consistent with previous sweets level (gummies 80%, donuts unchanged).

V69:
- Restored per-item soft shadow for direct-user-art levels 5, 6, 7, and 9 by casting shadow from the item art when generated white outline is disabled.
- Increased Level 8 and 9 donut size to 150% (physics 135%).
- Increased Level 8 and 9 gummy size to 90% (physics 81%).

V70:
- Replaced Level 7 assets with the newly provided thicker-outline versions.
- Reduced Level 8 and 9 donut size to 90% (physics 81%).
- Reduced Level 8 and 9 gummy size to 75% (physics 67.5%).

V71:
- Increased donut sizes in Levels 8 and 9 to 150% (physicsScale 135%).
- Kept gummy sizes at 75%.

V72:
- Levels 5, 6, 7: increased all object sizes by 10% (visual + physics).
- Levels 8, 9: reduced donuts to 80% and set gummies to 90%.
- Added per-item rounded-rect collider tuning for Level 8/9 gummy bears for cleaner collision fitting.

V74:
- Added new Level 10: Home Rotation.
- This level keeps all previous levels unchanged and adds multi-angle variants for the original home objects.
- Each logical item type has several cropped sprite views from the supplied sticker sheets.
- Matching/grouping still uses the same logical type id, so all angle variants of the same object match together.
- The bottom tray and target UI use the canonical front-view sprite for each type.
- The board uses random angle-view sprites to create a fake rotation feeling.
- Level 10 has a slightly higher item count (60 triplets / 180 items) for a denser test level.

V75:
- Fixed Level 10 shadow rendering by always using an alpha silhouette for the drop shadow, even when the user-provided sticker outline is preserved.
- Reduced Level 10 angle set to front view + up to 3 near-front readable angles per object.
- Normalized alternate-angle sprite sizing to the front-view dimensions.
- Matched Level 10 type scales back to Level 1-style visual/physics sizing.


V76 notes:
- Previous experimental rotation level removed.
- New final level rebuilt with cleaner per-angle PNG assets.
- Front view is used as the canonical tray icon for each item.
- Each object now uses up to 3 readable angles and sizes are aligned to Level 1.

V77:
- Added global anti-cluster spawn ordering for all levels.
- Spawn pool now avoids placing the same item type too close in the sequence.
- Added light x-lane jitter so items born around the same time spread across the board better.
- Match logic, targets, assets, and level counts are unchanged.

V78:
- Fixed last level (Home Views / fake-rotation level) shadow visibility.
- Added stronger and slightly expanded shadow casting for level 10 user-outline assets so overlapping items read like the other levels.
- No asset, size, or matching logic changes.

V79:
- Added a new badge-themed level using the new 7 circular badge assets.
- Kept badge size aligned with the existing badge section (same visual/physics scale as level 4).
- Disabled auto-generated extra white outline for the new badge assets; uses the provided art as-is.
- Shadows remain enabled for overlapping items.

V80:
- Added a new badge level using the latest 7 badge assets.
- Kept object sizing matched to the other badge levels.
- Did not add any extra outline; uses the provided assets directly.
- Overlap shadows remain enabled.

V81:
- Added a new marine-themed level with the provided 7 assets.
- Preserved the original outlines exactly as provided (no generated outline).
- Kept overlap shadows enabled.
- Matched object sizing/collider scaling to the original Marine level.

V82 hotfix:
- Fixed broken index.html syntax in the previously shared V81 package.

V83 candy direct:
- Added a new playable candy/donut level based on the uploaded assets.
- Kept asset outlines as provided; no generated white outline is added for this level.
- Matched gummy/donut sizing and collider settings to the existing sweets levels.


V84 (index.html) - 16 levels + HD quality pass:
- New clean entry point: index.html (the old gemini-code html is kept untouched as backup).
- Level count is now 16. Two new candy levels were added:
    Level 15 "Candy B"  -> assets_level15_candy_b  (assetpack15 / thin-outline candy)
    Level 16 "Candy C"  -> assets_level16_candy_c  (assetpack16 / outline-free 3D-render candy)
- HD / retina rendering: the canvas and every pre-rendered sticker sprite now scale by
  window.devicePixelRatio (capped at 3x). This fixes the blurriness from the previous
  non-HD build. Sprites are still cached once per size, so there is no per-frame cost.
- Depth shading: items deeper in / behind the pile are tinted darker (cached black
  silhouette overlay), so the items left at the bottom read as being in shadow.
- Parameterized tuning, all collected at the top of the script:
    * MIN_ITEM_SHARE / MAX_ITEM_SHARE  -> every item type is 10%-22% of the total spawn.
    * COLLIDER_MIN/PEAK/MAX (+ end probabilities) -> weighted collider scale 0.6..1.0,
      peak 0.9, low probability at the 0.6 and 1.0 ends.
- Counts are generated dynamically (no hand-written patterns). Everything is computed in
  triplet units, so all counts are multiples of 3 and the 3 most-spawned types are always
  the cleanable targets.
- Spawn density raised to 56 triplets/level so the pile overflows further above the top.
- "Borderless toward the top" feel: soft top fade where items overflow the screen edge.
- Physics tuning, pause/skip, tray, match and win logic preserved from V83.


V85 (index.html) - shadow rework + top glow removed:
- Removed the white top glow/fade overlay.
- Shadows are no longer a uniform per-object darkening based on stack depth. The old
  approach kept back objects dark even after they became uncovered.
- New cast-shadow model (painter's algorithm): each pile item first draws its own
  silhouette as a soft shadow (screen-space offset, multiply blend) onto whatever is
  already painted behind it, then draws its art. So a shadow is only the silhouette of the
  object sitting on top, projected onto the one beneath. An object moving to the front has
  nothing drawn over it, so it leaves the shadow naturally.
- Shadow color is not pure black. Each sprite's average color is sampled, pushed more
  saturated and darker (SHADOW_SAT / SHADOW_LIGHT), and multiplied over the surface below,
  so colorful levels keep rich, tinted shadows instead of muddy gray.
- Tunables at the top: SHADOW_ALPHA, SHADOW_OFFX/OFFY, SHADOW_BLUR, SHADOW_SAT, SHADOW_LIGHT.
- Sprites are cached blurred/colored once per size, so the per-frame cost stays low.


V86 (index.html) - combined depth shadows:
- Two shadow layers now run together for a stronger sense of depth:
  1) Cast shadow (slightly strengthened: SHADOW_ALPHA 0.62) - each item's offset silhouette
     multiplied onto items behind it.
  2) Coverage-based ambient darkening - the visible part of an item is multiply-darkened by
     how many front items actually cover its CENTER (AMBIENT_PER_COVER, AMBIENT_MAX). This is
     real occlusion, not stack-order rank, so when the items on top are cleared the coverage
     count drops and the object brightens again (fixes the old "stays dark after uncovering").
- Ambient tint uses the same per-sprite saturated+darkened color (not black), multiply.
- Coverage is an O(n^2) center test per frame over the pile; cheap at these counts.


V87 (index.html) - omnidirectional depth shadows:
- Cast shadow is no longer a single down-right drop. It is now an all-around halo: the
  blurred silhouette is enlarged (SHADOW_SPREAD) and drawn with only a small light-direction
  offset, so each item shades the items behind it on every side, not just below.
- Because back-to-front halos stack via multiply, items 2-3 layers deep collect several
  overlapping halos and end up both wider-shadowed and darker than items just one layer down
  - giving a much stronger sense of pile depth.
- Tunables: SHADOW_SPREAD (halo size), SHADOW_BLUR (softness), SHADOW_ALPHA (strength),
  small SHADOW_OFFX/OFFY for light direction. Ambient coverage darkening bumped a bit
  (AMBIENT_PER_COVER 0.26 / AMBIENT_MAX 0.62).


V88 (index.html) - shadow nudge + calmer physics + slower tray anim:
- Shadow strength nudged up a touch (SHADOW_ALPHA 0.60, SHADOW_SPREAD 1.20, darker tint,
  AMBIENT_PER_COVER 0.28 / AMBIENT_MAX 0.66). The shadow system is global, so this affects
  all 16 levels.
- Pull-from-under-a-stack physics: added a per-frame velocity clamp so removing an item no
  longer lets neighbors shoot sideways or pop upward from de-penetration. Horizontal speed is
  capped (MAX_HORIZ_SPEED 8), upward speed is capped harder (MAX_UP_SPEED 6), natural downward
  fall is allowed (MAX_DOWN_SPEED 30), and spin is capped (MAX_ANG_SPEED 0.45). Runs every
  frame, independent of the anti-float window, so the settle right after a pick stays gentle.
- Tray fly-in animation slowed to ~85% speed (progress step 0.15 -> 0.1275).


V89 (index.html) - level grouping + presenter tools:
- Levels are reordered so experiments that share an asset family sit next to each other,
  via LEVEL_ORDER (no objects moved; sorted in place after definition):
  Mobilya 1-2, Spor, Deniz 1-2, Rozet 1-3, Ev Eşyası 1-3, Şeker 1-5.
- Levels are renamed to category labels (LEVEL_NAMES) shown in the jump list.
- Right side: under "Skip Level" there is now a full clickable level list (one button per
  level, category-named). Clicking jumps straight to that level; the active level is
  highlighted. (buildLevelJump / goToLevel)
- Left side: a "Gölge %100/%70" toggle. It scales all shadow opacity (cast + ambient) by
  a multiplier (1.0 <-> 0.7) so shadows can be compared live. (toggleShadowOpacity,
  shadowOpacityMul) Presenter-only; both controls live outside the phone screen.
