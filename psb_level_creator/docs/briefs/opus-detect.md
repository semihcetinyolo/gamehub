You are building part of a new project: ~/Desktop/quest_projects/psb_level_creator (git branch hidden-word; do NOT commit, do NOT touch files outside psb_level_creator/ — the repo has many unrelated uncommitted changes).

Read docs/spec.md first — it is the approved design and the contract. Your reference code is the Waldo region pipeline: ../Waldo/tools/regions/ (detect.py, split.py, regrow.py, fixcore.py, freespots.py, build.py, checkh.py, README.md) and ../.claude/skills/waldo-level/SKILL.md (how it was used, lessons learned). Also ../Find The Cat/game/tools/extract.py and ../Waldo/game/tools/extract.py for the manifest shape the games consume.

YOUR PART (owner): plc/detect.py, plc/candidates.py, plc/sheet.py, plc/freespots.py, plc/build.py and their tests.
NOT yours ("Hidden Words:opus-api" writes them in parallel): plc/store.py, providers.py, edits.py, jobqueue.py, server.py, plc_client.py. Contract: detect_edit(pdir, project, edit) -> list of candidate dicts (you write cand/<id>.png masks; new ids = max existing + 1); apply_ops(pdir, project, ops) -> project (pure on the dict + mask files; never write project.json); render_sheet(pdir, project, ids=None, edit=None, state=None) -> Path; render_overview(pdir, project) -> Path; find_free(pdir, project, n, w, h, pad) -> list of [x0,y0,x1,y1]; build(pdir, project, expected_labels=None) -> {psb, preview, level_json, report} (paths relative to pdir, under out/). Agree any change directly: clai ctl send "Hidden Words:opus-api" "..." and log it: clai ctl ledger --topic plc add NOTE "...".

Notes:
- Each edit's answer.png is already resized back to its box (edit["box"], canvas coords); BG is bg.png; diff answer vs the BG crop of the box.
- Targets are often small hidden LETTERS (20 per level, roughly 60–200 px), sometimes faint/engraved (see ref/examples/*.jpg), so tune MIN_AREA / thresholds for that and keep them parameters; Waldo characters were bigger.
- Layer pixels = answer pixels inside the mask grown a few px with a soft edge, so the layer sits seamlessly on the clean BG.
- PSB via psd_tools like Waldo build.py; verify by reading it back. level.json: canvas, groups, targets (label, group, bbox, z, file).
- Tests use synthetic BG/answer pairs (known blobs, a slightly shifted redraw, a two-blob candidate for split). No network.

When done, reply: clai ctl send "Hidden Words:1" "<short summary: files, test results, open issues>". Ask me the same way if the spec is unclear.
