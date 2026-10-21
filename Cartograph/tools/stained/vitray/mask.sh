#!/bin/bash
# mask.sh <id> "<subject description>"  -> design/<id>.subject.png via the ClaiFace image model (edit of the design sheet)
id=$1; subj=$2; cd "$(dirname "$0")"
out=../../../clai-images/$id-subject.png
CLAI_IMAGE_SOURCE=claude-code /Users/semihcetin/.local/bin/clai image --output-path "$PWD/$out" --model gpt --ratio 3:4 --input-path design/$id.png "Edit this flat stained-glass design into a two-tone segmentation mask with exactly the same canvas, framing, panel shape and black lead lines. Fill every glass pane that belongs to $subj with pure black #000000. Fill every other pane (the background: sky, water, leaves, plants, ground, rays) with pure white #FFFFFF. Keep the white outside the panel white. No other colours, no shading." >/dev/null 2>&1 && cp "$out" design/$id.subject.png && echo "$id mask ok" || echo "$id mask FAILED"
