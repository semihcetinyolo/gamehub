/* Level order: one slug per level, assets in assets/<slug>/ (made by tools/extract.py).
   New levels are appended to the END as soon as they pass the checks.
   Order of the first 14 set by the user on 2026-11-06. */
window.HW_LEVELS = [
  'catgaming_cartoon_marla_r2', // GAME OVER KITTY (r2 of catgaming_cartoon_marla)
  'fireside_serenade_folkvector_r2', // HEART AND SOUL (native 1086x1448)
  'travel_journal_papercut_r2', // ADVENTURE AWAITS (native 1086x1448)
  'coffee_truck_gouache_r2',  // BUT FIRST COFFEE (native 1086x1448)
  'roadtrip_cartoon_marla_r2', // ON THE ROAD AGAIN (r2 of roadtrip_cartoon_marla)
  'galley_watercolor_r2',   // SOUP OF THE DAY (r2 of galley_watercolor, native 1086x1448)
  'puppet_watercolor_r2',     // PULL THE STRINGS (native 1086x1448)
  'show_watercolor_r2',       // THE SHOW MUST GO ON (native 1086x1448)
  'upon_storybook_attic',   // ONCE UPON A TIME
  'racers_cartoon_r2',        // READY STEADY GO (native 1086x1448)
  'bunny_train_claymation_r2', // CHOO CHOO TRAIN (native 1086x1448)
  'grandma_watercolor_marla', // WHAT BIG EYES YOU HAVE
  'dreamy_day_soft3d_r3',     // DREAMS COME TRUE (native 1086x1448)
  'costume_watercolor_marla_r2', // DRESS TO IMPRESS
  'home_cartoon_garden',    // HOME SWEET HOME
  'quiet_photoreal_porch',  // A QUIET MORNING
  'door_stained_glass',     // YOUR DOOR IS ALWAYS OPEN
  'gamenight_watercolor_r2', // LET THE GAMES BEGIN (r2 of gamenight_watercolor, native 1086x1448)
  'phonecall_watercolor_r2', // A CALL FROM THE PAST (r2 of phonecall_watercolor, native 1086x1448)
  'camper_cartoon_r2',      // RISE AND SHINE (r2 of camper_cartoon_astra, native 1086x1448)
  'red_gown_diner_popart_r2', // THE LADY IN RED (native 1086x1448)
  'halloween_watercolor_marla', // TRICK OR TREAT
  'reading_fairy_pencil_r2',  // READING IS MAGIC (native 1086x1448)
  'arcade_desk_pixel16_r2',   // PLAY TOGETHER (native 1086x1448)
  'attic_stainedglass_r2',    // LITTLE THINGS MATTER (native 1086x1448)
  'leafpile_cartoon_r2',      // JUMP IN THE LEAVES (native 1086x1448)
  'study_cartoon_r2',         // DREAM BIG STUDY HARD (native 1086x1448)
  'ferry_watercolor_r2',      // SMOOTH SAILING (native 1086x1448)
  'harvest_gouache_gen',      // GROW YOUR OWN (Astra-generated BG, native 1086x1448)
  'icecream_cartoon_gen',     // LIFE IS SWEET (Astra-generated BG, native 1086x1448)
  'cafe_gouache_gen',         // TABLE FOR TWO (Astra-generated BG, native 1086x1448)
  'bakery_watercolor_gen',    // BAKED WITH LOVE (Astra-generated BG, native 1086x1448)
  'cabin_folkvector_gen',     // WARM AND COZY (Astra-generated BG, native 1086x1448)
  'treehouse_cartoon_gen',    // FRIENDS FOREVER (Astra-generated BG, native 1086x1448)
  'greenhouse_watercolor_gen', // APRIL SHOWERS (Astra-generated BG, native 1086x1448)
  'beehive_folkvector_gen',   // SWEET AS HONEY (Astra-generated BG, native 1086x1448)
  'blanketfort_pencil_gen',   // SWEET DREAMS (Astra-generated BG, native 1086x1448)
  'picnic_pencil_gen',        // HELLO SUNSHINE (Astra-generated BG, native 1086x1448)
  'reef_papercut_gen',        // UNDER THE SEA (Astra-generated BG, native 1086x1448)
  'campsite_papercut_gen',    // HAPPY CAMPER (Astra-generated BG, native 1086x1448)
];
/* Levels tab grouping: production route + provider + art style (one section per combination, play order inside).
   bg: "BG üretim" (BG generated from a prompt) | "Hidden BG" (redrawn from a Hidden PSB's BG layer only)
       | "Hidden full" (redrawn from the full Hidden composite)
   provider: "Nano Banana" | "Astra" | "Sunburst" (Marla gpt-image-2.5-sunburst); style: Title case.
   A level without an entry is listed under "Diğer". *_r2 replacements take the old slug's place in HW_LEVELS. */
window.HW_LEVEL_INFO = {
  upon_storybook_attic:    { bg: 'BG üretim',   provider: 'Nano Banana', style: 'Watercolor' },
  home_cartoon_garden:     { bg: 'BG üretim',   provider: 'Nano Banana', style: 'Cartoon' },
  quiet_photoreal_porch:   { bg: 'BG üretim',   provider: 'Nano Banana', style: 'Photoreal' },
  door_stained_glass:      { bg: 'BG üretim',   provider: 'Nano Banana', style: 'Stained glass' },
  galley_watercolor_r2:    { bg: 'Hidden BG',   provider: 'Astra',       style: 'Watercolor' },
  gamenight_watercolor_r2: { bg: 'Hidden BG',   provider: 'Astra',       style: 'Watercolor' },
  phonecall_watercolor_r2: { bg: 'Hidden BG',   provider: 'Astra',       style: 'Watercolor' },
  camper_cartoon_r2:       { bg: 'Hidden BG',   provider: 'Astra',       style: 'Cartoon' },
  roadtrip_cartoon_marla_r2: { bg: 'Hidden BG', provider: 'Sunburst',    style: 'Cartoon' },
  catgaming_cartoon_marla_r2: { bg: 'Hidden BG', provider: 'Sunburst',   style: 'Cartoon' },
  bunny_train_claymation_r2: { bg: 'Hidden BG', provider: 'Astra',       style: 'Claymation' },
  coffee_truck_gouache_r2:   { bg: 'Hidden BG', provider: 'Astra',       style: 'Gouache' },
  fireside_serenade_folkvector_r2: { bg: 'Hidden BG', provider: 'Astra', style: 'Folk vector' },
  red_gown_diner_popart_r2:  { bg: 'Hidden BG', provider: 'Astra',       style: 'Pop art' },
  halloween_watercolor_marla: { bg: 'Hidden full', provider: 'Sunburst', style: 'Watercolor' },
  grandma_watercolor_marla:  { bg: 'Hidden full', provider: 'Sunburst', style: 'Watercolor' },
  reading_fairy_pencil_r2:   { bg: 'Hidden BG',   provider: 'Astra',    style: 'Colored pencil' },
  arcade_desk_pixel16_r2:    { bg: 'Hidden BG',   provider: 'Astra',    style: 'Pixel art' },
  travel_journal_papercut_r2: { bg: 'Hidden BG',  provider: 'Astra',    style: 'Papercut' },
  attic_stainedglass_r2:     { bg: 'Hidden BG',   provider: 'Astra',    style: 'Stained glass' },
  leafpile_cartoon_r2:       { bg: 'Hidden BG',   provider: 'Astra',    style: 'Cartoon' },
  study_cartoon_r2:          { bg: 'Hidden BG',   provider: 'Astra',    style: 'Cartoon' },
  ferry_watercolor_r2:       { bg: 'Hidden BG',   provider: 'Astra',    style: 'Watercolor' },
  racers_cartoon_r2:         { bg: 'Hidden BG',   provider: 'Astra',    style: 'Cartoon' },
  dreamy_day_soft3d_r3:      { bg: 'Hidden BG',   provider: 'Astra',    style: 'Soft 3D' },
  puppet_watercolor_r2:      { bg: 'Hidden BG',   provider: 'Astra',    style: 'Watercolor' },
  show_watercolor_r2:        { bg: 'Hidden BG',   provider: 'Astra',    style: 'Watercolor' },
  costume_watercolor_marla_r2: { bg: 'Hidden BG', provider: 'Sunburst', style: 'Watercolor' },
  harvest_gouache_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Gouache' },
  icecream_cartoon_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Cartoon' },
  cafe_gouache_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Gouache' },
  bakery_watercolor_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Watercolor' },
  cabin_folkvector_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Folk vector' },
  treehouse_cartoon_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Cartoon' },
  greenhouse_watercolor_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Watercolor' },
  beehive_folkvector_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Folk vector' },
  blanketfort_pencil_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Colored pencil' },
  picnic_pencil_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Colored pencil' },
  reef_papercut_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Papercut' },
  campsite_papercut_gen: { bg: 'BG üretim', provider: 'Astra', style: 'Papercut' },
};

/* shown as "(test)" in the admin level picker */
window.HW_TEST_LEVELS = [];
/* not in the player's order: reachable only from the admin level picker (listed after the player levels) */
window.HW_ADMIN_ONLY_LEVELS = [];
window.HW_ADMIN_TAGS = {};

/* group of a level: "Hidden BG · Astra · Cartoon" (Levels tab heading) or, with short, "HiddenBG·Astra·Cartoon"
   (admin level picker label); '' when HW_LEVEL_INFO has no complete entry */
window.HW_LEVEL_GROUP = function(slug, short){
  const f = (window.HW_LEVEL_INFO || {})[slug];
  if (!f || !f.bg || !f.provider || !f.style) return '';
  const parts = [f.bg, f.provider, f.style];
  if (!short) return parts.join(' · ');
  return parts.map(p => p.split(/\s+/).map((w, i) => i ? w.charAt(0).toLocaleUpperCase('tr') + w.slice(1) : w).join('')).join('·');
};
