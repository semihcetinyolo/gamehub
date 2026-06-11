# Game Hub — Level Uploader

A small backend that **serves the Game Hub + all games** and adds a **"Level Yükle"**
button so you can upload a new level and have it placed in the correct location for
the chosen game (and registered so the game loads it).

> The Game Hub `index.html` is a static page and cannot write files on its own.
> This server is what makes uploads possible — run/deploy it instead of the plain
> static server.

## Run locally

```bash
cd "<repo root>"                 # the folder that contains the game folders + index.html
pip install -r leveltool/requirements.txt
python3 leveltool/server.py --port 8080
# open http://localhost:8080/
```

Add a level, then `git add -A && git commit && git push` to publish it.

## Deploy on the internal server

Run it as a long-lived service behind your existing reverse proxy
(`superset.internal.yologamestudios.com`). Example with gunicorn:

```bash
pip install -r leveltool/requirements.txt gunicorn
cd "<repo root>"
gunicorn --chdir "<repo root>" "leveltool.server:app" --bind 0.0.0.0:8080 --timeout 600
```

Then point the host/route at `:8080`. The app serves the hub at `/`, the games at
their paths, and the upload API at `/api/*`.

systemd unit (optional):

```ini
[Service]
WorkingDirectory=/path/to/repo
ExecStart=/usr/bin/gunicorn leveltool.server:app --bind 0.0.0.0:8080 --timeout 600
Restart=always
```

> The server writes uploaded levels into the game folders on disk. On the deployed
> host those changes live on that host; commit/push from there (or upload locally
> and push) to keep the repo in sync.

## What each game accepts

| Game | Input | Notes |
|------|-------|-------|
| Jigsolitaire | **image** (webp/png/jpg/gif) | single picture; auto-cut into a grid |
| Find The Odds | **PSB** or **folder** | PSB sliced via `extract_levels.py`; folder needs `Real/` + `Odd/` (or `Fake/`) subfolders |
| Find The Strange | **PSB** | layered `bg / o# / r# / s#`; sliced via `game/tools/extract.py` |
| Hidden Match3 | **folder** of PNGs | each PNG becomes an object (default physics scale) |
| Pack It Up | **folder** of pieces | filenames must be `2x3.png, 3x2.png, 2x2.png, base.png …` |
| Find The Cat | **folder** | needs `bg.jpg + cat#.png + manifest.json` |
| Hidden Triple Match | **folder** | needs `bg.jpg + h#.png + manifest.json` |
| Hidden Pairs | **folder** | needs `layer_*.png + manifest.json` |
| Furnish Master | **folder** | `scene.png + items_*.png + level.json`; becomes the active level |
| Sticker | **folder** | `scene.png + stickers/ + slots/ + manifest.json`; becomes the active level |
| Hidden By Word | — | uses one shared manifest; not auto-registered yet (manual) |

### Why some games need a `manifest.json`

Games where items sit at fixed positions (hidden-object scenes) need each item's
coordinates. Those come from the layered **PSB** the artwork was built from — raw
PNGs don't carry positions. For Find The Odds / Find The Strange the server runs
the game's own PSB→assets script, so a PSB "just works". For the other
position-based games, include the game's `manifest.json` in the uploaded folder
(or generate it with that game's existing extract script), and the server will
place + register it.
