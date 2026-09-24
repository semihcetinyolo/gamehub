# Game Hub

Each top-level folder is a standalone game. `index.html` at the root is the hub
that lists them all in one place.

## Adding a new game

1. Create a folder at the root, e.g. `My Game/`, with the game inside
   (use relative paths for assets so it works both standalone and in the hub).
2. Add `My Game/game.json`:

   ```json
   { "name": "My Game", "entry": "index.html" }
   ```

   `entry` is the page to open, relative to the folder. If the folder has an
   `index.html` at the top you can skip `game.json`; the folder name is then used.
   `"hidden": true` keeps a folder out of the hub. To list several pages from one
   folder (e.g. a game and its level editor), make `game.json` a list of these objects.
3. Run `python3 build_hub.py` to refresh `games.json`, then commit and push.
   (`leveltool/server.py` rebuilds `games.json` on every request, so there's no need
   to run it while that server is running.)

## Running

- **A single game:** `cd "My Game" && python3 -m http.server 8000` → http://localhost:8000
- **The whole hub:** from the root, `python3 -m http.server 8766` → http://localhost:8766
- **Hub + level upload/ratings:** `python3 leveltool/server.py --port 8080` (see `leveltool/README.md`)
