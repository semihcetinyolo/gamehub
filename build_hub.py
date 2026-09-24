#!/usr/bin/env python3
"""Regenerate games.json — the list of games the Game Hub (index.html) shows.

Every top-level folder that contains a `game.json` is a game:

    {
      "name":  "Sortscapes",     # label in the hub sidebar (default: folder name)
      "entry": "index.html",     # page to open, relative to the folder (default: index.html)
      "hidden": false            # optional: true keeps it out of the hub
    }

Folders without game.json are picked up too if they have an index.html at the
top (name = folder name), so a brand-new game shows up with zero setup.

Run:  python3 build_hub.py        (leveltool/server.py does this on every request)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP = {"leveltool"}


def scan(root: Path = ROOT):
    games = []
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        if d.name.startswith((".", "_")) or d.name in SKIP:
            continue
        meta = {}
        cfg = d / "game.json"
        if cfg.is_file():
            try:
                meta = json.loads(cfg.read_text(encoding="utf-8"))
            except ValueError as e:
                print(f"! {cfg}: {e}")
                continue
        elif not (d / "index.html").is_file():
            continue
        if meta.get("hidden"):
            continue
        entry = meta.get("entry", "index.html")
        if not (d / entry).is_file():
            print(f"! {d.name}: entry '{entry}' not found, skipped")
            continue
        games.append({"name": meta.get("name", d.name), "path": f"{d.name}/{entry}"})
    games.sort(key=lambda g: g["name"].casefold())
    return games


def write(root: Path = ROOT):
    games = scan(root)
    (root / "games.json").write_text(json.dumps(games, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return games


if __name__ == "__main__":
    for g in write():
        print(f"  {g['name']:<24} {g['path']}")
