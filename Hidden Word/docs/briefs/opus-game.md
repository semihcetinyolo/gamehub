You are building a new mobile web game: ~/Desktop/quest_projects/Hidden Word (git branch hidden-word; do NOT commit; only write inside "Hidden Word/" — the repo has many unrelated uncommitted changes).

Read docs/spec.md first: it is the approved design. Base code: ../Find The Cat/game (copy and adapt: board, pan/zoom, alpha hit-test, hint, admin popup) and the menu / progress / combo parts of ../Waldo/game (README.md there explains them; also its tools/serve.py for phone testing).

Your part: game/ (index.html, game.js, styles.css, levels.js), tools/extract.py, tools/fake_level.py, tools/serve.py, a short README.md. Make a fake level now from ../psb_level_creator/lab/styles/cozy_porch.png (phrase "YOUR DOOR IS ALWAYS OPEN", 20 letters drawn as separate layers in varied sizes/colours; one or two deliberately faint) so the game is playable before real levels arrive. Real levels will come as PSBs from ../psb_level_creator (layers BG + group Letters with L<2-digit index>_<char>; its build also writes level.json) — extract.py must handle those.

UI art: worker "Hidden Words:astra-ui" designs wireframes and UI images into game/assets/ui/ and game/assets/wireframes/. Build with clean placeholder CSS first, then integrate its assets; agree layout/asset names with it directly: clai ctl send "Hidden Words:astra-ui" "..." and log decisions with: clai ctl ledger --topic hw add NOTE "...".

House rules (user): mobile game layout, not a web page; animations never block input (the player taps the next letter while the previous one is still flying); all debug/test controls only inside the ⚙ admin popup; no keyboard typing mechanics.

Verify in a real browser before reporting (start the server with: clai ctl run hw-serve -- python3 tools/serve.py ; never & / nohup), including: duplicate letters (O x4) fill the right slots, fly animation does not block taps, hearts toggle in settings, hint, progress after reload.
Also add "Hidden Word" to the hub: run python3 build_hub.py from ../ (it only refreshes games.json).

When done, reply: clai ctl send "Hidden Words:1" "<short summary, how to open it on the phone, open issues>". Ask me the same way if the spec is unclear.
