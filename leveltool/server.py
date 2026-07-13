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
import datetime
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory

ROOT = Path(__file__).resolve().parent.parent          # repo root (holds the games)
PY = sys.executable

app = Flask(__name__, static_folder=None)

# ---- upload manifest: lets us list + delete user-added levels ----
# Each successful upload records the files/folders it created and the registry
# edits it made, so a delete can reverse exactly that one level.
MANIFEST = ROOT / "leveltool" / "uploads.json"
_track = {"paths": [], "edits": [], "rerun": None}


def _reset_track():
    _track["paths"] = []
    _track["edits"] = []
    _track["rerun"] = None


def _rel_to_root(p) -> str:
    return str(Path(p).resolve().relative_to(ROOT.resolve()))


def track_path(p):
    """Record a file/folder this upload created (removed on delete)."""
    try:
        rel = _rel_to_root(p)
    except Exception:
        return
    if rel not in _track["paths"]:
        _track["paths"].append(rel)


def track_edit(file_path, remove_text=None, json_list_remove=None, restore_level_dir=None):
    """Record a reversible registry edit (text insert / json-list add / LEVEL_DIR swap)."""
    e = {"file": _rel_to_root(file_path)}
    if remove_text is not None:
        e["remove"] = remove_text
    if json_list_remove is not None:
        e["json_list_remove"] = json_list_remove
    if restore_level_dir is not None:
        e["restore_level_dir"] = restore_level_dir
    _track["edits"].append(e)


def track_rerun(cwd, args):
    """Record a script to re-run after deletion (e.g. regenerate a levels list)."""
    _track["rerun"] = {"cwd": _rel_to_root(cwd), "args": list(args)}


def load_manifest():
    if MANIFEST.exists():
        try:
            return json.loads(MANIFEST.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_manifest(m):
    MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")


def add_record(game, name):
    if not _track["paths"] and not _track["edits"] and not _track["rerun"]:
        return
    m = load_manifest()
    m.setdefault(game, [])
    m[game].insert(0, {
        "id": "lv_" + uuid.uuid4().hex[:10],
        "name": name,
        "ts": datetime.datetime.now().isoformat(timespec="seconds"),
        "paths": list(_track["paths"]),
        "edits": list(_track["edits"]),
        "rerun": _track["rerun"],
    })
    save_manifest(m)


def _remove_text_once(file_path: Path, text: str):
    if not file_path.exists() or not text:
        return
    cur = file_path.read_text(encoding="utf-8")
    idx = cur.find(text)
    if idx >= 0:
        file_path.write_text(cur[:idx] + cur[idx + len(text):], encoding="utf-8")


def _json_list_remove(file_path: Path, slug: str):
    if not file_path.exists():
        return
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        return
    # supports both {"levels":[...]} (Hidden Pairs) and a bare [...] list
    if isinstance(data, dict) and isinstance(data.get("levels"), list):
        data["levels"] = [x for x in data["levels"] if x != slug]
    elif isinstance(data, list):
        data = [x for x in data if x != slug]
    file_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _restore_level_dir(file_path: Path, value: str):
    if not file_path.exists():
        return
    text = file_path.read_text(encoding="utf-8")
    # the active-level pointer is `const BASE='...'` (newer builds) or
    # `const LEVEL_DIR='...'`; restore whichever this file uses, verbatim.
    for var in ("BASE", "LEVEL_DIR"):
        if re.search(r"const\s+" + var + r"\s*=", text):
            text = re.sub(r"const\s+" + var + r"\s*=\s*['\"][^'\"]*['\"]",
                          f"const {var}='{value}'", text, count=1)
            break
    file_path.write_text(text, encoding="utf-8")


def delete_record(game, rec):
    """Reverse one recorded upload: undo edits, remove files, optional re-run."""
    for e in rec.get("edits", []):
        f = (ROOT / e["file"])
        try:
            if "remove" in e:
                _remove_text_once(f, e["remove"])
            if "json_list_remove" in e:
                _json_list_remove(f, e["json_list_remove"])
            if "restore_level_dir" in e:
                _restore_level_dir(f, e["restore_level_dir"])
        except Exception:
            pass
    for rel in rec.get("paths", []):
        try:
            p = (ROOT / rel).resolve()
            if ROOT.resolve() not in p.parents:
                continue
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            elif p.exists():
                p.unlink()
        except Exception:
            pass
    rr = rec.get("rerun")
    if rr:
        run_script(ROOT / rr["cwd"], rr["args"])


# ---------------------------------------------------------------- helpers ----
_TR = str.maketrans("şŞıİöÖüÜçÇğĞ", "ssiioouuccgg")

def slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9 _-]", "", (name or "").strip().translate(_TR))
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
    inserted = "\n" + element_text
    new = text[:insert_at] + inserted + text[insert_at:]
    file_path.write_text(new, encoding="utf-8")
    track_edit(file_path, remove_text=inserted)


def append_before_array_close(file_path: Path, element_text: str):
    """Append element_text before the final '];' in a file (window.LEVELS=[..];)."""
    text = file_path.read_text(encoding="utf-8")
    idx = text.rstrip().rfind("];")
    if idx < 0:
        raise RuntimeError(f"closing '];' not found in {file_path.name}")
    inserted = ",\n" + element_text + "\n"
    new = text[:idx].rstrip() + inserted + text[idx:]
    file_path.write_text(new, encoding="utf-8")
    track_edit(file_path, remove_text=inserted)


def run_script(cwd: Path, args):
    """Run a python script, return (ok, combined_output)."""
    try:
        r = subprocess.run([PY] + args, cwd=str(cwd), capture_output=True,
                           text=True, timeout=1500)   # big PSBs (100MB+) slice slowly
        out = (r.stdout or "") + (r.stderr or "")
        return r.returncode == 0, out
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def _looks_like_psd(p: Path):
    """A PSB/PSD by extension OR by its magic bytes (so an extension-less file,
    e.g. '0001 2', still works)."""
    if p.suffix.lower() in (".psb", ".psd"):
        return True
    try:
        with open(p, "rb") as f:
            return f.read(4) == b"8BPS"
    except Exception:
        return False


def save_psb(tmp: Path):
    """Return the path to the uploaded .psb/.psd already saved under tmp by
    collect_upload(). We must NOT re-read request.files here: Werkzeug upload
    streams can only be consumed once, so a second fs.save() would write an
    empty file (extract.py then fails with 'read=0, expected=26')."""
    for p in sorted(tmp.rglob("*")):
        if p.is_file() and _looks_like_psd(p):
            return p
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
    track_path(gdir / "levels" / fname)
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
        # delete = remove the psb (+ its extracted folder) then regenerate levels-data.js
        track_path(dest)
        track_path(gdir / "levels" / dest.stem)
        track_rerun(gdir, ["extract_levels.py"])
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
    track_path(base)
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
    slug = slugify(level)
    dest = gdir / "levels" / f"{slug}{psb.suffix.lower()}"
    shutil.copy(psb, dest)
    ok, out = run_script(gdir / "game", ["tools/extract.py", str(dest)])
    if not ok:
        return dict(ok=False, message="extract.py başarısız.", detail=out[-1500:])
    # delete = remove the psb + extracted assets folder + its entry in levels.json
    track_path(dest)
    track_path(gdir / "game" / "assets" / dest.stem)
    track_edit(gdir / "game" / "assets" / "levels.json", json_list_remove=dest.stem)
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
    track_path(game / folder)
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
    # PSB-only. The game's psb_to_level.py auto-detects either PSB layout:
    #   • "solution" format — a 'Pieces' group + 'BG' + 'Cell' + a
    #     'Grid_<difficulty>_<order>' colour-map layer (the new format; yields
    #     bgImg/cellImg/difficulty/order plus each piece's cells+art), or
    #   • numbered piece layers (1,2,3…) with an optional 'map' board layer.
    # It slices the PNGs (pieces + bg.png/cell.png) into <slug>/ and prints the
    # ready LEVELS entry on stdout (diagnostics go to stderr).
    slug = slugify(level).lower()
    psb = save_psb(tmp)
    if not psb:
        return dict(ok=False, message=(
            "Pack It Up artık yalnızca katmanlı PSB ile çalışır. "
            "PSB ya 'Pieces' grubu + 'BG' + 'Cell' + 'Grid_<zorluk>_<sıra>' katmanlarından "
            "(çözüm renk-haritası) ya da 1,2,3… diye numaralı parça katmanlarından oluşmalı."))
    try:
        r = subprocess.run([PY, "psb_to_level.py", str(psb), level, "--slug", slug,
                            "--out-dir", slug], cwd=str(gdir),
                           capture_output=True, text=True, timeout=600)
    except Exception as e:
        return dict(ok=False, message=f"psb_to_level.py hata: {type(e).__name__}: {e}")
    if r.returncode != 0:
        return dict(ok=False, message="psb_to_level.py başarısız.",
                    detail=((r.stderr or "") + (r.stdout or ""))[-1500:])
    entry = (r.stdout or "").strip()
    if not entry.startswith("{"):
        return dict(ok=False, message="psb_to_level.py beklenen JS çıktısını üretmedi.",
                    detail=((r.stderr or "") + (r.stdout or ""))[-1200:])
    track_path(gdir / slug)
    insert_into_array(gdir / "index.html", r"const\s+LEVELS\s*=\s*\[", "  " + entry + ",")
    return dict(ok=True, message=f"PSB dilimlendi → Pack It Up. ({level})",
                detail=(r.stderr or "")[-400:])


def _place_folder(dest: Path, tmp: Path):
    track_path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    for p in tmp.rglob("*"):
        if p.is_file():
            rel = p.relative_to(tmp)
            (dest / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(p, dest / rel)


def _require_manifest(tmp: Path):
    return any(p.name == "manifest.json" for p in tmp.rglob("*"))


def adapt_find_the_cat(gdir, level, tmp):
    slug = slugify(level)
    psb = save_psb(tmp)
    if psb:
        # layered PSB (Background + 'cat' layers) -> sliced by the game's extract.py
        (gdir / "levels").mkdir(exist_ok=True)
        dest = gdir / "levels" / f"{slug}.psb"
        shutil.copy(psb, dest)
        ok, out = run_script(gdir / "game", ["tools/extract.py", str(dest), slug])
        if not ok:
            return dict(ok=False, message="extract.py başarısız.", detail=out[-1500:])
        track_path(dest)
        track_path(gdir / "game" / "assets" / slug)
        insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[",
                          f"  'assets/{slug}/manifest.json',")
        return dict(ok=True, message=f"PSB dilimlendi → Find The Cat. ({level})", detail=out[-800:])
    if not _require_manifest(tmp):
        return dict(ok=False, message="Find The Cat: katmanlı PSB (Background + 'cat' katmanları) ya da klasörde manifest.json gerekli (bg.jpg + cat#.png + manifest.json).")
    _place_folder(gdir / "game" / "assets" / slug, tmp)
    insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[",
                      f"  'assets/{slug}/manifest.json',")
    return dict(ok=True, message=f"'{level}' eklendi → Find The Cat.")


def adapt_hidden_triple(gdir, level, tmp):
    slug = slugify(level).lower()
    register = (f"  {{ id:{json.dumps(slug)}, name:{json.dumps(level)} }},")
    psb = save_psb(tmp)
    if psb:
        # layered PSB (bg / h# / s#) -> sliced by the game's own extract.py
        (gdir / "levels").mkdir(exist_ok=True)
        dest = gdir / "levels" / f"{slug}.psb"   # extract.py uses LEVEL = stem.lower() = slug
        shutil.copy(psb, dest)
        ok, out = run_script(gdir / "game", ["tools/extract.py", str(dest)])
        if not ok:
            return dict(ok=False, message="extract.py başarısız.", detail=out[-1500:])
        track_path(dest)
        track_path(gdir / "game" / "assets" / slug)
        insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[", register)
        return dict(ok=True, message=f"PSB dilimlendi → Hidden Triple Match. ({level})", detail=out[-800:])
    # folder path: needs a ready manifest.json (raw PNGs carry no positions)
    if not _require_manifest(tmp):
        return dict(ok=False, message="Hidden Triple Match: katmanlı PSB (bg/h#/s#) ya da klasörde manifest.json gerekli (bg.jpg + h#.png + manifest.json).")
    _place_folder(gdir / "game" / "assets" / slug, tmp)
    insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[", register)
    return dict(ok=True, message=f"'{level}' eklendi → Hidden Triple Match.")


def _register_hidden_pairs(assets, slug):
    """Add slug to assets/levels.json — the list the game fetches at startup."""
    assets.mkdir(parents=True, exist_ok=True)
    lv = assets / "levels.json"
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
    track_edit(lv, json_list_remove=slug)


def adapt_hidden_pairs(gdir, level, tmp):
    # NOTE: the game loads levels from assets/<id>/ (assets/levels.json + per-level
    # manifest.json), so everything goes under assets/ — not the game root.
    slug = slugify(level).lower()
    assets = gdir / "assets"
    psb = save_psb(tmp)
    if psb:
        # layered PSB (bg / P#_# / _B / _T / M_#) -> sliced by the game's extract_psb.py
        (gdir / "levels").mkdir(exist_ok=True)
        dest = gdir / "levels" / f"{slug}.psb"
        shutil.copy(psb, dest)
        ok, out = run_script(gdir, ["tools/extract_psb.py", str(dest), slug])
        if not ok:
            return dict(ok=False, message="extract_psb.py başarısız.", detail=out[-1500:])
        track_path(dest)
        track_path(assets / slug)
        _register_hidden_pairs(assets, slug)
        return dict(ok=True, message=f"PSB dilimlendi → Hidden Pairs. ({level})", detail=out[-800:])
    # folder path: a ready manifest.json + layer PNGs
    if not _require_manifest(tmp):
        return dict(ok=False, message="Hidden Pairs: katmanlı PSB (BG + her çift bir 'H' grubu: H1/H2 + opsiyonel S1/S2/M) ya da klasörde manifest.json + layer PNG'leri gerekli.")
    _place_folder(assets / slug, tmp)
    _register_hidden_pairs(assets, slug)
    return dict(ok=True, message=f"'{level}' eklendi → Hidden Pairs.")


def adapt_hidden_by_word(gdir, level, tmp):
    return dict(ok=False,
                message="Hidden By Word tek paylaşımlı manifest kullanıyor; otomatik kayıt güvenli değil. "
                        "Dosyalar yerleştirilmedi — bu oyun için manuel ekleme gerekiyor.")


def _replace_level_dir(html: Path, new_dir: str):
    text = html.read_text(encoding="utf-8")
    # newer builds select the level with `const BASE='levels/<id>/'` (trailing
    # slash); older ones use `const LEVEL_DIR='levels/<id>'`. Update whichever.
    m = re.search(r"const\s+(LEVEL_DIR|BASE)\s*=\s*['\"]([^'\"]*)['\"]", text)
    if not m:
        return
    var, old = m.group(1), m.group(2)
    val = new_dir + "/" if var == "BASE" else new_dir
    new = re.sub(r"const\s+" + var + r"\s*=\s*['\"][^'\"]*['\"]",
                 f"const {var}='{val}'", text, count=1)
    html.write_text(new, encoding="utf-8")
    track_edit(html, restore_level_dir=old)   # restore previous pointer on delete


def _furnish_register(gdir, slug):
    """Add slug to levels/levels.json — the list the game cycles with Skip."""
    lv = gdir / "levels" / "levels.json"
    data = []
    if lv.exists():
        try:
            d = json.loads(lv.read_text(encoding="utf-8"))
            data = d if isinstance(d, list) else d.get("levels", [])
        except Exception:
            pass
    if slug not in data:
        data.append(slug)
    lv.write_text(json.dumps(data, indent=2), encoding="utf-8")
    track_edit(lv, json_list_remove=slug)


def adapt_furnish(gdir, level, tmp):
    slug = slugify(level).lower()
    psb = save_psb(tmp)
    if psb:
        # layered PSB (BG + numbered box groups 1,2,3.. with f#/s#/m# layers)
        # -> sliced into scene.png + layers/ + manifest.json by the game's tool
        (gdir / "levels").mkdir(exist_ok=True)
        dest = gdir / "levels" / f"{slug}.psb"
        shutil.copy(psb, dest)
        ok, out = run_script(gdir, ["tools/extract_psb.py", str(dest), f"levels/{slug}"])
        if not ok:
            return dict(ok=False, message="extract_psb.py başarısız.", detail=out[-1500:])
        track_path(dest)
        track_path(gdir / "levels" / slug)
        _furnish_register(gdir, slug)
        return dict(ok=True, message=f"PSB dilimlendi → Furnish Master (level listesine eklendi). ({level})", detail=out[-800:])
    has_scene = any(p.name.lower() == "scene.png" for p in tmp.rglob("*"))
    if not has_scene:
        return dict(ok=False, message="Furnish Master: katmanlı PSB (BG + 1,2,3.. grupları, f#/s#/m#) ya da klasörde scene.png + items_*.png (+ level.json) gerekli.")
    _place_folder(gdir / "levels" / slug, tmp)
    _furnish_register(gdir, slug)
    return dict(ok=True, message=f"'{level}' yüklendi → Furnish Master (level listesine eklendi).")


def adapt_sticker(gdir, level, tmp):
    has_scene = any(p.name.lower() == "scene.png" for p in tmp.rglob("*"))
    if not (has_scene and _require_manifest(tmp)):
        return dict(ok=False, message="Sticker: klasörde scene.png + stickers/ + slots/ + manifest.json gerekli.")
    slug = slugify(level).lower()
    _place_folder(gdir / "levels" / slug, tmp)
    _replace_level_dir(gdir / "index.html", f"levels/{slug}")
    return dict(ok=True, message=f"'{level}' yüklendi → Sticker (aktif level olarak ayarlandı).")


def adapt_sticker2(gdir, level, tmp):
    # Sticker 2 levels come from a layered PSB (bg / slots / a "stickers" group of
    # "si" layers). The game's own tools/extract.py slices it into
    # game/assets/<id>/ (bg.jpg, slots.png, s1..sN.png, manifest.json). The level
    # id follows the 0001/0002 convention; pick the next free number.
    psb = save_psb(tmp)
    if not psb:
        return dict(ok=False, message="Sticker 2: katmanlı bir .psb yükleyin (bg / slots / 'stickers' grubu · si katmanları).")
    assets = gdir / "game" / "assets"
    nums = [int(d.name) for d in assets.iterdir() if d.is_dir() and d.name.isdigit()] if assets.exists() else []
    new_id = f"{(max(nums) + 1) if nums else 1:04d}"
    (gdir / "levels").mkdir(exist_ok=True)
    dest = gdir / "levels" / f"{new_id}.psb"        # extract.py uses the file stem as the level id
    shutil.copy(psb, dest)
    ok, out = run_script(gdir / "game", ["tools/extract.py", str(dest)])
    if not ok:
        return dict(ok=False, message="extract.py başarısız.", detail=out[-1500:])
    track_path(dest)
    track_path(assets / new_id)
    entry = "  { id:" + json.dumps(new_id) + ", name:" + json.dumps(level) + " },"
    insert_into_array(gdir / "game" / "game.js", r"const\s+LEVELS\s*=\s*\[", entry)
    track_edit(gdir / "game" / "game.js", remove_text="\n" + entry)
    return dict(ok=True, message=f"PSB dilimlendi → Sticker 2 (level {new_id}: {level}).", detail=(out or "")[-600:])


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
    "Pack It Up":          ("Pack It Up", ["psb"],
                            "Sadece katmanlı PSB. Yeni biçim: 'Pieces' grubu + 'BG' + 'Cell' + 'Grid_<zorluk>_<sıra>' (çözüm renk-haritası). Eski biçim: 1,2,3… numaralı parça katmanları (+ opsiyonel 'map').", adapt_pack_it_up),
    "Find The Cat":        ("Find The Cat", ["psb", "folder"],
                            "Katmanlı PSB (Background + 'cat' katmanları) veya klasör: bg.jpg + cat#.png + manifest.json.", adapt_find_the_cat),
    "Hidden Triple Match": ("Hidden Triple Match by topic", ["psb", "folder"],
                            "Katmanlı PSB (bg / h# / s#) veya klasör: bg.jpg + h#.png + manifest.json.", adapt_hidden_triple),
    "Hidden Pairs":        ("Hidden Pairs", ["psb", "folder"],
                            "Katmanlı PSB (BG + 'H' grupları: H1/H2 çift, opsiyonel S1/S2/M) veya klasör: manifest.json + layer PNG'leri.", adapt_hidden_pairs),
    "Furnish Master":      ("Furnish Master", ["psb", "folder"],
                            "Katmanlı PSB (BG + 1,2,3.. grupları · f#/s#/m#) veya klasör: scene.png + items_*.png + level.json.", adapt_furnish),
    "Sticker":             ("Sticker Oh Yeah", ["folder"],
                            "Klasör: scene.png + stickers/ + slots/ + manifest.json.", adapt_sticker),
    "Sticker 2":           ("Sticker 2", ["psb"],
                            "Katmanlı PSB: bg / slots / 'stickers' grubu (si katmanları).", adapt_sticker2),
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
    _reset_track()
    try:
        # save everything into tmp once; adapters then read from tmp (the upload
        # streams are consumed here and cannot be re-read from request.files)
        collect_upload(tmp)
        result = fn(gdir, level, tmp)
        if result.get("ok"):
            add_record(game, level)   # remember what was created so it can be deleted
        code = 200 if result.get("ok") else 400
        return jsonify(result), code
    except Exception as e:
        return jsonify(ok=False, message=f"Hata: {type(e).__name__}: {e}"), 500
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@app.get("/api/levels")
def api_levels():
    """List the user-uploaded levels for a game (from the upload manifest)."""
    game = request.args.get("game", "")
    if game not in ADAPTERS:
        return jsonify(ok=False, message=f"Bilinmeyen oyun: {game}"), 400
    recs = load_manifest().get(game, [])
    return jsonify(ok=True, levels=[{"id": r["id"], "name": r["name"], "ts": r.get("ts", "")}
                                    for r in recs])


@app.post("/api/levels/delete")
def api_levels_delete():
    """Delete one or more uploaded levels (by id) for a game."""
    data = request.get_json(silent=True) or {}
    game = data.get("game", "")
    ids = set(data.get("ids") or [])
    if game not in ADAPTERS:
        return jsonify(ok=False, message=f"Bilinmeyen oyun: {game}"), 400
    if not ids:
        return jsonify(ok=False, message="Silinecek level seçilmedi."), 400
    m = load_manifest()
    recs = m.get(game, [])
    to_delete = [r for r in recs if r["id"] in ids]
    if not to_delete:
        return jsonify(ok=False, message="Seçilen level bulunamadı."), 404
    for r in to_delete:
        delete_record(game, r)
    m[game] = [r for r in recs if r["id"] not in ids]
    save_manifest(m)
    return jsonify(ok=True, message=f"{len(to_delete)} level silindi.",
                   deleted=[r["name"] for r in to_delete])


# ---- ratings: per-game user scores (1..10) — avg, distribution, raw table ----
RATINGS = ROOT / "leveltool" / "ratings.json"


def load_ratings():
    if RATINGS.exists():
        try:
            return json.loads(RATINGS.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []


def save_ratings(rows):
    RATINGS.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")


def rating_stats(rows):
    """Per-game aggregate: {game: {count, avg, dist{'1'..'10'}}}."""
    stats = {}
    for r in rows:
        g = r.get("game", "")
        try:
            s = int(r.get("score", 0))
        except (TypeError, ValueError):
            continue
        st = stats.setdefault(g, {"count": 0, "sum": 0,
                                  "dist": {str(i): 0 for i in range(1, 11)}})
        st["count"] += 1
        st["sum"] += s
        if 1 <= s <= 10:
            st["dist"][str(s)] += 1
    for st in stats.values():
        st["avg"] = round(st["sum"] / st["count"], 2) if st["count"] else 0
        st.pop("sum", None)
    return stats


@app.post("/api/ratings")
def api_rate():
    """Record a score for a game. name + score(1..10) are both required."""
    data = request.get_json(silent=True) or {}
    game = (data.get("game") or "").strip()
    name = (data.get("name") or "").strip()
    if not game:
        return jsonify(ok=False, message="Oyun seçilmedi."), 400
    if not name:
        return jsonify(ok=False, message="İsim zorunlu."), 400
    try:
        score = int(data.get("score"))
    except (TypeError, ValueError):
        return jsonify(ok=False, message="Puan zorunlu."), 400
    if not (1 <= score <= 10):
        return jsonify(ok=False, message="Puan 1 ile 10 arasında olmalı."), 400
    rows = load_ratings()
    rows.append({
        "id": uuid.uuid4().hex[:10],
        "game": game[:80],
        "name": name[:60],
        "score": score,
        "ts": datetime.datetime.now().isoformat(timespec="seconds"),
    })
    save_ratings(rows)
    return jsonify(ok=True, message="Puan kaydedildi.")


@app.get("/api/ratings")
def api_ratings():
    """All ratings (newest first) + per-game stats. Optional ?game= filters the list."""
    rows = load_ratings()
    stats = rating_stats(rows)
    game = request.args.get("game")
    out = sorted(rows, key=lambda r: r.get("ts", ""), reverse=True)
    if game:
        out = [r for r in out if r.get("game") == game]
    return jsonify(ok=True, ratings=out, stats=stats)


@app.post("/api/ratings/delete")
def api_ratings_delete():
    """Delete one or more ratings by id."""
    data = request.get_json(silent=True) or {}
    ids = set(data.get("ids") or [])
    if not ids:
        return jsonify(ok=False, message="Silinecek puan seçilmedi."), 400
    rows = load_ratings()
    kept = [r for r in rows if r.get("id") not in ids]
    removed = len(rows) - len(kept)
    if not removed:
        return jsonify(ok=False, message="Seçilen puan bulunamadı."), 404
    save_ratings(kept)
    return jsonify(ok=True, message=f"{removed} puan silindi.")


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
