"""Source scenes from Hidden (hidden-object) PSBs for new Hidden Word levels.

User rule (2026-11-06): take ONLY the `BG` layer of a Hidden PSB; every other layer (H = hidden objects, M = ...)
stays off. The full composite has too many objects (levels galley/gamenight/roadtrip were too crowded).

  python3 tools/hidden_source.py fetch <out_dir> <gameindex>:<drive_file_id> ...   # download PSBs (Drive, read-only)
  python3 tools/hidden_source.py bg <psb_or_dir> <out_dir>                         # BG-only PNG per PSB

Output: <out_dir>/<psb stem>.png (RGB, full canvas). Fails loudly if a PSB has no top-level layer named BG.
"""
import os
import sys

CRED = os.environ.get(
    "HIDDEN_DRIVE_CRED",
    "/Users/semihcetin/Desktop/notebooks/hidden_objects/credentials/hidden_internal.json")


def fetch(out, specs):
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    cred = service_account.Credentials.from_service_account_file(
        CRED, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    svc = build("drive", "v3", credentials=cred, cache_discovery=False)
    os.makedirs(out, exist_ok=True)
    for spec in specs:
        idx, fid = spec.split(":")
        m = svc.files().get(fileId=fid, fields="name", supportsAllDrives=True).execute()
        path = os.path.join(out, f"{idx}_{m['name']}")
        with open(path, "wb") as f:
            d = MediaIoBaseDownload(f, svc.files().get_media(fileId=fid, supportsAllDrives=True),
                                    chunksize=50 * 1024 * 1024)
            done = False
            while not done:
                _, done = d.next_chunk()
        print("saved", path, os.path.getsize(path))


def bg_only(src, out):
    from PIL import Image
    from psd_tools import PSDImage
    os.makedirs(out, exist_ok=True)
    files = [src] if src.endswith(".psb") else [os.path.join(src, f) for f in sorted(os.listdir(src))
                                                if f.endswith(".psb")]
    for path in files:
        psd = PSDImage.open(path)
        bgs = [l for l in psd if l.name.strip().upper() == "BG"]
        if not bgs:
            raise SystemExit(f"{path}: no top-level BG layer (layers: {[l.name for l in psd]})")
        canvas = Image.new("RGBA", psd.size, (255, 255, 255, 255))
        layer = bgs[0].composite(viewport=(0, 0) + psd.size)  # BG alone, other layers ignored
        canvas.alpha_composite(layer.convert("RGBA"))
        p = os.path.join(out, os.path.basename(path).replace(".psb", ".png"))
        canvas.convert("RGB").save(p)
        print(p, psd.size, "BG only; skipped", len(psd) - 1, "layers")


if __name__ == "__main__":
    if len(sys.argv) < 4 or sys.argv[1] not in ("fetch", "bg"):
        raise SystemExit(__doc__)
    if sys.argv[1] == "fetch":
        fetch(sys.argv[2], sys.argv[3:])
    else:
        bg_only(sys.argv[2], sys.argv[3])
