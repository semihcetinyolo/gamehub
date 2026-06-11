#!/usr/bin/env python3
"""
Game Hub — Level Uploader backend.

Serves the static Game Hub + all games, and exposes an upload API that places a
new level into the correct location for the selected game and registers it so
the game can load it.

Input types per game (see ADAPTERS / GET /api/games):
  - image   : a single picture (Jigsolitaire)
  - folder  : a folder of PNGs (optionally with subfolders / a manifest.json)
  - psb     : a layered Photoshop .psb/.psd — sliced server-side via the game's
              own extraction script (Find The Odds / Find The Strange)

Run:  python3 leveltool/server.py [--port 8080]
Then open http://localhost:8080/
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory

ROOT = Path(__file__).resolve().parent.parent          # repo root (holds the games)
PY = sys.executable

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------- helpers ----
def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9 _-]", "", (name or "").strip())
    s = re.sub(r"\s+", "_", s)
    return s or "level"


def safe_join(base: Path, *parts) -> Path:
    """Join and ensure the result stays inside base (path-traversal guard)."""
    p = base.joinpath(*parts).resolve()
    if base.resolve() not in p.parents and p != base.resolve():
        raise ValueError("unsafe path")
    return p


def collect_upload(tmp: Path):
    """Save the multipart upload into tmp, preserving folder structure.

    Files are sent with their relative path as the multipart filename. The first
    path segment (the top folder the user picked) is stripped. Returns the list
    of saved relative paths."""
    saved = []
    files = request.files.getlist("files")
    for fs in files:
        rel = (fs.filename or "").replace("\\", "/").lstrip("/")
        if not rel:
            continue
        # drop the top-level folder segment from a directory upload
        parts = rel.split("/")
        if len(parts) > 1:
            rel = "/".join(parts[1:])
        # guard against traversal
        rel = "/".join(p for p in rel.split("/") if p not in ("", ".", ".."))
        if not rel:
            continue
        dest = tmp / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        fs.save(str(dest))
        saved.append(rel)
    return saved


def list_pngs(folder: Path):
    return sorted([p for p in folder.rglob("*.png")])


def insert_into_array(file_path: Path, array_decl_regex: str, element_text: str):
    """Insert element_text right after the opening '[' of a JS/JSON array
    declaration matched by array_decl_regex (so it becomes the first element)."""
    text = file_path.read_text(encoding="utf-8")
    m = re.search(array_decl_regex, text)
    if not m:
        raise RuntimeError(f"array declaration not found in {file_path.name}")
    insert_at = m.end()
    new = text[:insert_at] + "\n" + element_text + text[insert_at:]
    file_path.write_text(new, encoding="utf-8")


def append_before_array_close(file_path: Path, element_text: str):
    """Append element_text before the final '];' in a file (window.LEVELS=[..];)."""
    text = file_path.read_text(encoding="utf-8")
    idx = text.rstrip().rfind("];")
    if idx < 0:
        raise RuntimeError(f"closing '];' not found in {file_path.name}")
    new = text[:idx].rstrip() + ",\n" + element_text + "\n" + text[idx:]
    file_path.write_text(new, encoding="utf-8")


def run_script(cwd: Path, args):
    """Run a python script, return (ok, combined_output)."""
    try:
        r = subprocess.run([PY] + args, cwd=str(cwd), capture_output=True,
                           text=True, timeout=600)
        out = (r.stdout or "") + (r.stderr or "")
        return r.returncode == 0, out
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def save_psb(tmp: Path):
    """Return the path to the single uploaded .psb/.psd, or None."""
    for fs in request.files.getlist("files"):
        name = (fs.filename or "").replace("\\", "/").split("/")[-1]
        if name.lower().endswith((".psb", ".psd")):
            dest = tmp / name
            fs.save(str(dest))
            return dest
    return None


# --------------------------------------------------------------- adapters ----
# Each adapter(game_dir, level_name, tmp) -> dict(ok, message, [detail])

def adapt_jigsolitaire(gdir, level, tmp):
    # single image -> levels/<file>; prepend {name, src} to LEVELS in game.js
    imgs = [p for p in tmp.rglob("*")
            if p.suffix.lower() in (".webp", ".png", ".jpg", ".jpeg", ".gif")]
    if not imgs:
        return dict(ok=False, message="Bir görsel bulunamadı (webp/png/jpg/gif).")
    src = imgs[0]
    ext = src.suffix.lower()
    fname = f"{slugify(level)}{ext}"
    (gdir / "levels").mkdir(exist_ok=True)
    shutil.copy(src, gdir / "levels" / fname)
    badge = ", badge: 'GIF'" if ext == ".gif" else ""
    entry = f"  {{ name: {json.dumps(level)}, src: 'levels/{fname}'{badge} }},"
    insert_into_array(gdir / "game.js", r"const\s+LEVELS\s*=\s*\[", entry)
    return dict(ok=True, message=f"'{level}' eklendi → Jigsolitaire (varsayılan ilk level).")


def adapt_find_the_odds(gdir, level, tmp):
    psb = save_psb(tmp)
    if psb:
        dest = gdir / "levels" / psb.name
        shutil.copy(psb, dest)
        ok, out = run_script(gdir, ["extract_levels.py"])
        if not ok:
            return dict(ok=False, message="extract_levels.py başarısız.", detail=out[-1500:])
        return dict(ok=True, message=f"PSB dilimlendi ve kaydedildi → Find The Odds. ({psb.name})",
                    detail=out[-800:])
    # folder path: expect Real/ and Odd/ (or Fake/) subfolders
    def grab(*names):
        for n in names:
            d = next((p for p in tmp.rglob("*") if p.is_dir() and p.name.lower() == n), None)
            if d:
                return list_pngs(d)
        return []
    reals = grab("real")
    odds = grab("odd", "fake")
    if not reals or not odds:
        return dict(ok=False, message="Klasörde 'Real/' ve 'Odd/' (veya 'Fake/') alt klasörleri gerekli.")
    folder = slugify(level)
    base = gdir / "levels" / folder
    (base / "Real").mkdir(parents=True, exist_ok=True)
    (base / "Odd").mkdir(parents=True, exist_ok=True)
    real_paths, odd_paths = [], []
    for i, p in enumerate(reals, 1):
        shutil.copy(p, base / "Real" / f"r{i}.png"); real_paths.append(f"levels/{folder}/Real/r{i}.png")
    for i, p in enumerate(odds, 1):
        shutil.copy(p, base / "Odd" / f"o{i}.png"); odd_paths.append(f"levels/{folder}/Odd/o{i}.png")
    entry = "  " + json.dumps({"name": level, "odds": odd_paths, "reals": real_paths})
    insert_into_array(gdir / "levels-data.js", r"window\.LEVELS\s*=\s*\[", entry + ",")
    return dict(ok=True, message=f"'{level}' eklendi → Find The Odds ({len(odds)} odd, {len(reals)} real).")


def adapt_find_the_strange(gdir, level, tmp):
    psb = save_psb(tmp)
    if not psb:
        return dict(ok=False, message="Find The Strange için katmanlı bir .psb yükleyin (bg/o#/r#/s#).")
    (gdir / "levels").mkdir(exist_ok=True)
    dest = gdir / "levels" / f"{slugify(level)}{psb.suffix.lower()}"
    shutil.copy(psb, dest)
    ok, out = run_script(gdir / "game", ["tools/extract.py", str(dest)])
    if not ok:
        return dict(ok=False, message="extract.py başarısız.", detail=out[-1500:])
    return dict(ok=True, message=f"PSB dilimlendi → Find The Strange. ({dest.name})", detail=out[-800:])


def adapt_match3(gdir, level, tmp):
    pngs = list_pngs(tmp)
    if not pngs:
        return dict(ok=False, message="PNG bulunamadı.")
    game = gdir / "oyun" / "match_factory_weighted_art_v83_candy_direct_level copy"
    if not (game / "index.html").exists():
        return dict(ok=False, message="Hidden Match3 oyun klasörü bulunamadı.")
    slug = slugify(level).lower()
    folder = f"assets_{slug}"
    (game / folder).mkdir(exist_ok=True)
    types = []
    for p in pngs:
        fid = slugify(p.stem).lower() or "item"
        shutil.copy(p, game / folder / p.name)
        types.append({"id": fid, "name": p.stem, "asset": f"{folder}/{p.name}",
                      "physicsScale": 0.9})
    obj = {"id": slug, "name": level, "totalTriplets": 54, "types": types}
    # pretty-ish JS object
    entry = "        " + json.dumps(obj) + ","
    insert_into_array(game / "index.html", r"const\s+LEVELS\s*=\s*\[", entry)
    return dict(ok=True, message=f"'{level}' eklendi → Hidden Match3 ({len(types)} obje).")


def adapt_pack_it_up(gdir, level, tmp):
    pngs = list_pngs(tmp)
    if not pngs:
        return dict(ok=False, message="PNG bulunamadı.")
    slug = slugify(level).lower()
    dest = gdir / slug
    dest.mkdir(exist_ok=True)
    names = set()
    for p in pngs:
        shutil.copy(p, dest / p.name); names.add(p.name)
    needed = {"2x3.png", "3x2.png", "2x2.png", "base.png"}
    missing = needed - names
    entry = ("  {id:9001,title:" + json.dumps(level) + ",emoji:'🎁',sub:" + json.dumps(level) +
             ",bg:'linear-gradient(180deg,#ffe3bc 0%,#ffc79a 100%)',"
             "bagColor:'#0277bd',bagType:'suitcase',handleColor:'#f57c00',rows:9,cols:6,"
             f"slim:true,frame:'glossy',items:packItems('{slug}'),sol:[],"
             "winEmoji:'🎉',winTitle:'Harika!',winDesc:'Tamamlandı!',btnText:'Devam →'},")
    insert_into_array(gdir / "index.html", r"const\s+LEVELS\s*=\s*\[", entry)
    msg = f"'{level}' eklendi → Pack It Up."
    if missing:
        msg += f" UYARI: beklenen parça adları eksik: {sorted(missing)} (parça PNG'leri 2x3.png,3x2.png,2x2.png,base.png... olmalı)."
    return dict(ok=True, message=msg)


def _place_folder(dest: Path, tmp: Path):
    dest.mkdir(parents=True, exist_ok=True)
    for p in tmp.rglob("*"):
        if p.is_file():
            rel = p.relative_to(tmp)
            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(p, dest / rel)


def _require_manifest(tmp: Path):
    return any(p.name == "manifest.json" for p in tmp.rglob("*"))


def adapt_find_the_cat(gdir, level, tmp):
    if not _require_manifest(tmp):
        return dict(ok=False, message="Find The Cat: pozisyonlar için klasörde manifest.json gerekli (bg.jpg + cat#.png + manifest.json).")
    slug = slugify(level)
    _place_folder(gdir / "game" / "assets" / slug, tmp)
    insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[",
                      f"  'assets/{slug}/manifest.json',")
    return dict(ok=True, message=f"'{level}' eklendi → Find The Cat.")


def adapt_hidden_triple(gdir, level, tmp):
    if not _require_manifest(tmp):
        return dict(ok=False, message="Hidden Triple Match: klasörde manifest.json gerekli (bg.jpg + h#.png + manifest.json).")
    slug = slugify(level).lower()
    _place_folder(gdir / "game" / "assets" / slug, tmp)
    insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[",
                      f"  {{ id:{json.dumps(slug)}, name:{json.dumps(level)} }},")
    return dict(ok=True, message=f"'{level}' eklendi → Hidden Triple Match.")


def adapt_hidden_pairs(gdir, level, tmp):
    if not _require_manifest(tmp):
        return dict(ok=False, message="Hidden Pairs: klasörde manifest.json gerekli (layer_*.png + manifest.json).")
    slug = slugify(level).lower()
    _place_folder(gdir / slug, tmp)
    lv = gdir / "levels.json"
    data = {"levels": []}
    if lv.exists():
        try:
            data = json.loads(lv.read_text(encoding="utf-8"))
        except Exception:
            pass
    data.setdefault("levels", [])
    if slug not in data["levels"]:
        data["levels"].insert(0, slug)
    lv.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return dict(ok=True, message=f"'{level}' eklendi → Hidden Pairs.")


def adapt_hidden_by_word(gdir, level, tmp):
    return dict(ok=False,
                message="Hidden By Word tek paylaşımlı manifest kullanıyor; otomatik kayıt güvenli değil. "
                        "Dosyalar yerleştirilmedi — bu oyun için manuel ekleme gerekiyor.")


def _replace_level_dir(html: Path, new_dir: str):
    text = html.read_text(encoding="utf-8")
    new = re.sub(r"const\s+LEVEL_DIR\s*=\s*['\"][^'\"]*['\"]",
                 f"const LEVEL_DIR='{new_dir}'", text, count=1)
    html.write_text(new, encoding="utf-8")


def adapt_furnish(gdir, level, tmp):
    has_scene = any(p.name.lower() == "scene.png" for p in tmp.rglob("*"))
    if not has_scene:
        return dict(ok=False, message="Furnish Master: klasörde scene.png + items_*.png (+ level.json) gerekli.")
    slug = slugify(level).lower()
    _place_folder(gdir / "levels" / slug, tmp)
    _replace_level_dir(gdir / "index.html", f"levels/{slug}")
    return dict(ok=True, message=f"'{level}' yüklendi → Furnish Master (aktif level olarak ayarlandı).")


def adapt_sticker(gdir, level, tmp):
    has_scene = any(p.name.lower() == "scene.png" for p in tmp.rglob("*"))
    if not (has_scene and _require_manifest(tmp)):
        return dict(ok=False, message="Sticker: klasörde scene.png + stickers/ + slots/ + manifest.json gerekli.")
    slug = slugify(level).lower()
    _place_folder(gdir / "levels" / slug, tmp)
    _replace_level_dir(gdir / "index.html", f"levels/{slug}")
    return dict(ok=True, message=f"'{level}' yüklendi → Sticker (aktif level olarak ayarlandı).")


# game display name -> (subdir, accepts[], hint, adapter)
ADAPTERS = {
    "Jigsolitaire":        ("Jigsolitaire", ["image"],
                            "Tek görsel: webp/png/jpg/gif.", adapt_jigsolitaire),
    "Find The Odds":       ("Find The Odds", ["psb", "folder"],
                            "PSB (o#/r# katmanlı) veya 'Real/' + 'Odd/' alt klasörlü PNG.", adapt_find_the_odds),
    "Find The Strange":    ("Find The Odds v2", ["psb"],
                            "Katmanlı PSB (bg / o# / r# / s#).", adapt_find_the_strange),
    "Hidden Match3":       ("Hidden Match3", ["folder"],
                            "PNG klasörü — her PNG bir obje olur.", adapt_match3),
    "Pack It Up":          ("Pack It Up", ["folder"],
                            "Parça PNG'leri: 2x3.png, 3x2.png, 2x2.png, base.png …", adapt_pack_it_up),
    "Find The Cat":        ("Find The Cat", ["folder"],
                            "Klasör: bg.jpg + cat#.png + manifest.json.", adapt_find_the_cat),
    "Hidden Triple Match": ("Hidden Triple Match by topic", ["folder"],
                            "Klasör: bg.jpg + h#.png + manifest.json.", adapt_hidden_triple),
    "Hidden Pairs":        ("Hidden Pairs", ["folder"],
                            "Klasör: layer_*.png + manifest.json.", adapt_hidden_pairs),
    "Furnish Master":      ("Furnish Master", ["folder"],
                            "Klasör: scene.png + items_*.png + level.json.", adapt_furnish),
    "Sticker":             ("Sticker Oh Yeah", ["folder"],
                            "Klasör: scene.png + stickers/ + slots/ + manifest.json.", adapt_sticker),
    "Hidden By Word":      ("Hidden By Word", ["folder"],
                            "Paylaşımlı manifest — şimdilik manuel.", adapt_hidden_by_word),
}


# ----------------------------------------------------------------- routes ----
@app.get("/api/games")
def api_games():
    return jsonify([
        {"name": name, "accepts": accepts, "hint": hint}
        for name, (sub, accepts, hint, fn) in sorted(ADAPTERS.items())
    ])


@app.post("/api/upload")
def api_upload():
    game = request.form.get("game", "")
    level = (request.form.get("level", "") or "Yeni Level").strip()
    if game not in ADAPTERS:
        return jsonify(ok=False, message=f"Bilinmeyen oyun: {game}"), 400
    sub, accepts, hint, fn = ADAPTERS[game]
    gdir = ROOT / sub
    if not gdir.exists():
        return jsonify(ok=False, message=f"Oyun klasörü yok: {sub}"), 400
    if not request.files.getlist("files"):
        return jsonify(ok=False, message="Dosya yüklenmedi."), 400
    tmp = Path(tempfile.mkdtemp(prefix="lvlup_"))
    try:
        # save everything into tmp (adapters that need the psb re-read request.files)
        collect_upload(tmp)
        result = fn(gdir, level, tmp)
        code = 200 if result.get("ok") else 400
        return jsonify(result), code
    except Exception as e:
        return jsonify(ok=False, message=f"Hata: {type(e).__name__}: {e}"), 500
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---- static: serve the hub + all games from the repo root ----
@app.get("/")
def index():
    return send_from_directory(str(ROOT), "index.html")


@app.get("/<path:path>")
def static_files(path):
    # Some games discover their assets by fetching a folder and parsing the
    # directory listing (like `python -m http.server` produced). Emulate that
    # listing for directory requests so those games keep working.
    target = (ROOT / path)
    root_r = ROOT.resolve()
    try:
        target_r = target.resolve()
        within = target_r == root_r or root_r in target_r.parents
    except Exception:
        within = False
    if within and target.is_dir():
        names = sorted(p.name + ("/" if p.is_dir() else "") for p in target.iterdir())
        links = "".join('<li><a href="{0}">{0}</a></li>'.format(n) for n in names)
        return "<!doctype html><meta charset=utf-8><title>{0}</title><ul>{1}</ul>".format(path, links)
    return send_from_directory(str(ROOT), path)


if __name__ == "__main__":
    port = 8080
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    print(f"Game Hub + Level Uploader → http://localhost:{port}/")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
