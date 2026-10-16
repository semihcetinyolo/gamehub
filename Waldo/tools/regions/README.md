# Region pipeline (park level onwards)

One Marla generation draws several characters at once inside a region, instead of one call per character.

1. `plan_<level>.py`: regions that do not overlap (~1000–1300 px, 5–7 characters each, to keep Marla edit calls low), the characters in each one (kind + landmark), the group names and the target counts. Ask for a few more characters than needed; extras are simply left out.
2. Set up the work directory with `state.json` (`{"project": ...}`), `bg.png` and `ref_char.png`. The `marla_api` helpers create the project and upload the background.
3. `python3 gen.py WORK plan_<level> [region numbers]` submits regions, all in one job.
4. `python3 detect.py WORK plan_<level>` finds every character (shift-tolerant diff, so redraw drift is ignored). It colour-checks red balloon / yellow raincoat / handstand (black fur on top), flags `big` / `multi` / `clipped` / `outside`, and writes `WORK/sheet.jpg`.
   - `split.py WORK ID LEFT RIGHT` splits a blob that holds two characters side by side.
   - `freespots.py WORK [N] [W] [H] [PAD]` finds the largest empty rects for one combined fill round (every missing kind in 1–2 big regions) and draws them on `WORK/freespots.jpg`.
5. `python3 build.py WORK plan_<level> OUT.psb --drop ... --kind id=K,... --allow ... --pairs a-b` resolves overlaps between edits, picks the counts, cuts the H layers and writes the PSB (BG + groups of H).

Park level (2026-10-14) was built with:
`split.py /tmp/marla2 19 B D` and
`build.py /tmp/marla2 plan_park out.psb --drop 25,51,54,57,68,69,70,72,79,61,22,65,37,66 --allow 39,44 --pairs 8-62 --kind 8=S,11=S,15=S,23=S,31=S,40=S,47=S,55=S,60=S,83=S`

Living room v2 (red pandas, 2026-10-15) was built in batches of 4 regions with `plan_livingroom2.py`.
After `detect.py`: `regrow.py WORK --merge ...` (grows cores back, ignoring characters that earlier edits drew), then `split.py` / `fixcore.py` for the blobs that still hold two characters, then
`build.py /tmp/marla5 plan_livingroom2 out.psb --drop 49,65,3,25,60,42,50,68,56 --pairs 4-105,13-102,62-70,64-114,79-80 --allow 97 --kind <kinds.txt>`

2026-10-15 glitch pass: park rebuilt with `--drop 5,78,92,116,90 --pairs 60-68,69-81 --allow 4,19,35,41,51,80,93,96`; living room with `--drop 49,65,3,25,60,42,50,68,56,53,118,119,120` (118–120 are carved-off tails). Run `checkh.py WORK` after every build.
