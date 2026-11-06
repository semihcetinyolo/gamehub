USER, after playing quiet_photoreal_porch (game version = b2): "still very bad; the chair N is nonsense, when I tap it an I flies away. Blend means the WHOLE letter is visible."
Root cause (verified): the game's layers L09_N and L11_N are each ONE wooden stick (83x467 and a long diagonal beam). Those Ns were made by adding one stick to spindles/legs that already existed in the BG, so only the stick became the layer; the rest of the "N" is BG and stays. So: the found letter flies away as an I-shaped stick, and the N is never a complete glyph.
NEW HARD RULES:
1. The ENTIRE glyph must be new pixels from the edit: every stroke is the added object/part. Never complete a letter with strokes that already exist in the BG (spindles, legs, frames, stems already there).
2. "Blend" = the whole letter is clearly visible as one complete letter, made of the scene's material/style and lit like the scene; it is NOT camouflage that hides strokes.
3. A letter passes only if its LAYER ALONE (the PNG that flies to the slot, on a flat grey background) reads as the right letter AND the in-scene blind read passes. opus-api is adding a layer-only blind read; use it before every build.

astra-letters: stop the current quiet revision (do not build it). Put rules 1-3 into PROMPTS.md (top). Then audit quiet_photoreal_porch with the layer-only read once opus-api ships it: keep only letters whose layer alone is the full letter (likely A stems, E fork, G kettle grip; check the rest), redo every other letter as a fully added, fully visible object, then calibrated in-scene read + layer read, build, report.
