#!/usr/bin/env python3
"""Build a Fugo upload for a game folder into <folder>/fugo_export/.

Fugo accepts one self-contained .html, or a .zip of a folder with its assets
(index.html at the zip root), up to 150MB.

Settings come from the "fugo" key of the first entry in the folder's game.json:

    "fugo": { "mode": "html" }                    # inline local <script>/<link> into one file
    "fugo": { "mode": "zip", "exclude": ["x/*"] } # entry page as index.html + its assets

Usage:  python3 fugo_export.py pixhaku dungeon_slime
"""
import fnmatch
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = "fugo_export"
LIMIT = 150 * 1024 * 1024

# never shipped in a zip: sources, docs, tooling, OS junk
ZIP_EXCLUDE = [
    OUT + "/*", ".*", "*/.*", "tools/*", "docs/*", "*/source/*", "*.md", "*.json",
    "*.txt", "*contact-sheet*", "*-source.*", "*.psd", "*.psb", "*.pdf", "*.py", "*.pyc",
]


def load_cfg(d: Path):
    cfg = json.loads((d / "game.json").read_text(encoding="utf-8"))
    first = cfg[0] if isinstance(cfg, list) else cfg
    return first, first.get("fugo", {})


def local(ref: str) -> bool:
    return not re.match(r"^(https?:|data:|//)", ref)


def strip_query(ref: str) -> str:
    return ref.split("?", 1)[0].split("#", 1)[0]


def inline_html(d: Path, entry: str) -> str:
    html = (d / entry).read_text(encoding="utf-8")

    def script(m):
        ref = m.group(2)
        if not local(ref):
            return m.group(0)
        code = (d / strip_query(ref)).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f"<script{m.group(1)}{m.group(3)}>\n{code}\n</script>"

    def style(m):
        ref = m.group(1)
        if not local(ref):
            return m.group(0)
        css = (d / strip_query(ref)).read_text(encoding="utf-8")
        return f"<style>\n{css}\n</style>"

    html = re.sub(r'<script([^>]*?)\s+src="([^"]+)"([^>]*)>\s*</script>', script, html)
    html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', style, html)
    return html


def export(folder: str):
    d = (ROOT / folder).resolve()
    meta, fugo = load_cfg(d)
    entry = meta.get("entry", "index.html")
    mode = fugo.get("mode", "zip")
    slug = re.sub(r"[^A-Za-z0-9]+", "_", meta.get("name", d.name)).strip("_")
    out = d / OUT
    out.mkdir(exist_ok=True)

    if mode == "html":
        dest = out / f"{slug}.html"
        dest.write_text(inline_html(d, entry), encoding="utf-8")
    else:
        dest = out / f"{slug}.zip"
        excl = ZIP_EXCLUDE + fugo.get("exclude", [])
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(d / entry, "index.html")
            for p in sorted(d.rglob("*")):
                rel = p.relative_to(d).as_posix()
                if not p.is_file() or rel == entry or p.suffix == ".html":
                    continue
                if any(fnmatch.fnmatch(rel, pat) for pat in excl):
                    continue
                z.write(p, rel)

    size = dest.stat().st_size
    flag = "  !! over 150MB" if size > LIMIT else ""
    print(f"{dest.relative_to(ROOT)}  {size / 1048576:.1f} MB{flag}")
    return dest


if __name__ == "__main__":
    for f in sys.argv[1:] or ["pixhaku", "dungeon_slime"]:
        export(f)
