# Zoom sharpness bug (user, 2026-11-06)

User: zooming into a level makes the picture blurry/low quality ("zoom yapınca levelın görsel kalitesi bozuluyor").

Likely cause: `.board` has `will-change: transform` and zoom is a CSS `scale(s)` on it (`applyPan`), so the browser
rasterises the board once at scale 1 and then stretches that bitmap; images are never re-rasterised at the zoomed size.

Fix it properly, e.g.:
- do not keep `will-change` on permanently (only while a gesture/animation runs, removed at gesture end so the browser
  re-rasterises sharply), or better
- lay the board out at its real zoomed size (width/height = base * s, letters in % so they follow) and use translate
  only, so the img elements render from the full-resolution source.

Also check: devicePixelRatio (phone DPR 3); bg.jpg quality (tools/extract.py saves quality=86: raise to ~93 and
re-extract the live levels if size stays reasonable); no downsized copy anywhere; glyph PNGs too.
Keep pinch/drag smooth (60 fps on phone) and the hit-test / hint / fly maths correct.

Verify on a phone-size viewport: screenshot the same spot at max zoom before/after. Astra levels are 1086 px wide, so
some softness at 5x is the source limit: say so. Report when live with the before/after pictures.
