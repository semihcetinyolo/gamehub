REDO TASK 2 (user, 2026-11-06): these levels were left unfinished by Astra workers that hung when Astra's quota ran
out. Produce them FROM SCRATCH under the new rules. Opus (you) gives every instruction; Astra produces every image:
provider "astra" for EVERYTHING (restyle + every letter edit; never nano/albert/marla).

Follow docs/briefs/redo.md exactly (rules, steps 1-6, server/Astra rules, reporting) with these differences:
- Sources: lab/bg_src/<gameindex>_<id>.png (BG layer only, already extracted; overview lab/bg_src/contact.jpg).
- Old projects (if any) were made under the old rules: do not touch them, do not reuse their letters; you may read
  their plans only to avoid their mistakes. New slug = the one in the table.
- SET D levels: each gets its OWN art style (table). Describe it richly in the restyle prompt and use NO style_refs;
  letters are made from that style's own objects/materials (host-part rule still applies: a pixel-art lamp's pole, a
  clay train's coupling, a stained-glass lead line...). Phrase: if the table gives none, reuse the one in
  lab/d_set_plans/ or lab/set_d_astra_b2/ for that scene if it fits, else choose a NEW short, warm, well-known English
  phrase that fits the scene, 11-20 letters without spaces, not already used (taken: see docs/briefs/d1.md list plus
  CHOO CHOO TRAIN, DREAMS COME TRUE, HAVE A NICE TRIP, HEART AND SOUL, PLAY TOGETHER, READING IS MAGIC when owned by
  another scene). Report the phrase with the build.
- SET A/B levels: WATERCOLOR -> style ref projects/upon_storybook_attic/bg.png, CARTOON -> projects/home_cartoon_garden/bg.png.

LEVELS (source, new slug, phrase, style):
A  2444_32923  leafpile_cartoon_r2            "JUMP IN THE LEAVES"   CARTOON
A  2526_33005  study_cartoon_r2               "DREAM BIG STUDY HARD" CARTOON
B  2458_32922  show_watercolor_r2             "THE SHOW MUST GO ON"  WATERCOLOR
B  2544_33030  puppet_watercolor_r2           "PULL THE STRINGS"     WATERCOLOR
B  2441_32930  ferry_watercolor_r2            "SMOOTH SAILING"       WATERCOLOR
B  2508_32975  racers_cartoon_r2              "READY STEADY GO"      CARTOON
D  1857_*      bunny_train_claymation_r2      (phrase)  CLAYMATION / 3D plasticine clay
D  2524_33015  arcade_desk_pixel16_r2         (phrase)  16-BIT PIXEL ART (letters still >= 100 px, readable pixel glyphs)
D  2507_*      dreamy_day_soft3d_r2           (phrase)  soft 3D animated-film render
D  2529_33013  fireside_serenade_folkvector_r2 (phrase) Scandinavian folk-art flat vector
D  1860_*      coffee_truck_gouache_r2        (phrase)  mid-century GOUACHE vintage illustration
D  1904_*      red_gown_diner_popart_r2       (phrase)  1950s RETRO POP-ART comic (halftone, bold ink)
D  2028_*      attic_stainedglass_r2          (phrase)  STAINED-GLASS mosaic
D  2382_*      travel_journal_papercut_r2     (phrase)  layered PAPERCUT paper craft
D  2487_*      reading_fairy_pencil_r2        (phrase)  COLORED-PENCIL storybook sketch
D  2509_*      ladys_luggage_oil_r2           (phrase)  impressionist OIL PAINTING
