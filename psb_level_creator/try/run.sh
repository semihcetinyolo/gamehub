#!/bin/zsh
# Quick hands-on test of psb_level_creator: one BG, one edit with 3 hidden letters, then the evidence images.
# usage: try/run.sh [project-name] [bg-image] [boxes.json]
set -e
cd "${0:A:h}/.."
P=${1:-try_$(date +%H%M%S)}
BG=${2:-lab/styles/cozy_porch.png}
BOXES=${3:-try/boxes_porch.json}
OUT=try/out/$P; mkdir -p $OUT
python3 - "$BG" "$OUT/bg.png" <<'PY'
import sys; from PIL import Image
Image.open(sys.argv[1]).convert('RGB').resize((1536, 2048), Image.LANCZOS).save(sys.argv[2])
PY
python3 plc_client.py create $P >/dev/null
python3 plc_client.py upload $P $OUT/bg.png >/dev/null
echo "edit sent through Clai, waiting (~30 s)..."
python3 plc_client.py edits $P $BOXES --fallback none --wait | tail -3
python3 plc_client.py sheet $P $OUT/sheet.jpg >/dev/null
python3 plc_client.py overview $P $OUT/overview.jpg >/dev/null
python3 plc_client.py file $P/edits/e001/answer.png $OUT/answer.png >/dev/null
python3 plc_client.py candidates $P | python3 -c "import json,sys; d=json.load(sys.stdin); c=d if isinstance(d,list) else d['candidates']; print(len(c),'candidates:', [(x['id'], x['box'], x['flags']) for x in c])"
python3 plc_client.py usage $P
echo "images: $OUT (answer.png, sheet.jpg, overview.jpg)"
[[ -n $NO_OPEN ]] || open $OUT/answer.png $OUT/sheet.jpg $OUT/overview.jpg 2>/dev/null || true
