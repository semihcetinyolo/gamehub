# Waldo

Find-the-character playable built from the Waldo `.psb` levels. Same controls as
Find The Cat (drag to pan, pinch / scroll to zoom, 3 hearts, 💡 hint, ⚙ admin).

A level is played in stages, one per character group in the `.psb`
(top of the layer panel first). Each stage opens with a card, e.g.
**Find The Green Mayo's 0/10**; after the last find the next group's card comes
(**Find The Swimming Armband's 0/10**), and after the last stage the level ends.
Found characters are removed (BG is clean underneath); tapping that spot again does nothing; tapping anything else (scenery, the `D`
decoys, the other stage's characters) costs a heart.

## Run

```bash
python3 tools/serve.py   # from Waldo/: http://localhost:8767, phones on the same Wi-Fi: http://<mac-ip>:8767
```

## Asset pipeline

```bash
python3 tools/extract.py ../output/beach_waldo.psb    # -> assets/beach/
python3 tools/extract.py ../output/park_waldo.psb --icon=sunflower:0 --icon=redcap:7 --icon=tongue:8   # -> assets/park/ (frogs)
python3 tools/extract.py ../output/livingroom_waldo.psb --icon=discodance:4   # -> assets/livingroom/ (auto icon had bar-stool legs in it)
```

Layer conventions: `BG` (clean background), any number of groups of `H` layers
(one stage each; the stage text comes from `tools/labels.json`, e.g. `GreenMayo` → "Kids In Green Swimsuits": always the character + its feature),
`D` = decoys (never a target), `E`/`M` ignored. Output: `bg.jpg` (BG + decoys
flattened), one PNG per target + stage icon, `manifest.json`. List new levels in `LEVELS`
in `game.js`.
