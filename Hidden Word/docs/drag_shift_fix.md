# Letters shift while dragging when zoomed (user bug, 2026-11-06)

User: "zoomlu drag yaptığımda letterlar kayıyor" - after the zoom-sharpness change, when zoomed in and dragging/panning,
the letter layers slide/shift relative to the background instead of staying locked to the scene.

Reproduce on a phone-size viewport (iOS Safari behaviour if you can emulate it): zoom 2-5x, drag slowly and fast,
release; compare the letter patch position vs the BG at every frame.

Likely suspects:
- letters and the BG on different compositing layers, or different rounding (left/top in % on a large board ->
  sub-pixel snapping that differs from the bg img);
- will-change toggled on/off during the drag;
- the commit step after the gesture (size commit moves letters but not the BG, or the other way round);
- the drag transform applied to a different element than the letters' container.

Fix: letters and BG move as ONE rigid layer at all zooms (e.g. one container with a single transform; letter positions
in exact board px, no independent rounding; same rendering path). Keep the zoom sharpness, smooth 60 fps, and the
hit-test / hint / fly maths correct.

Verify with frame captures during a drag at 1x / 3x / 5x (slow and fast, and right after release). Report when live.
