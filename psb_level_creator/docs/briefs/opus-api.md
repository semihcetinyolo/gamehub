You are building part of a new project: ~/Desktop/quest_projects/psb_level_creator (git branch hidden-word; do NOT commit, do NOT touch files outside psb_level_creator/ — the repo has many unrelated uncommitted changes).

Read docs/spec.md first — it is the approved design and the contract. Reference code: ref/odin (Odin clone; read bridge/clai-edit.mjs, nano-edit.mjs, sam.mjs for CLAI_URL/TLS/key, image-api.mjs for the Albert route, marla.mjs) and ../Waldo/tools/marla.py + ../Waldo/tools/regions/marla_api.py for the client style.

YOUR PART (owner): plc/store.py, plc/providers.py, plc/edits.py, plc/jobqueue.py, plc/server.py, plc_client.py, tests for these, and a short README.md at the project root (how to run, port 8790).
NOT yours (worker "Hidden Words:opus-detect" writes them in parallel): plc/detect.py, plc/candidates.py, plc/sheet.py, plc/freespots.py, plc/build.py. Call them from server.py with the contract in the spec: detect_edit(pdir, project, edit) -> list of candidate dicts; apply_ops(pdir, project, ops) -> project; render_sheet(pdir, project, ids=None, edit=None, state=None) -> Path; render_overview(pdir, project) -> Path; find_free(pdir, project, n, w, h, pad) -> list of rects; build(pdir, project, expected_labels=None) -> dict. Agree any change directly: clai ctl send "Hidden Words:opus-detect" "..." and log it: clai ctl ledger --topic plc add NOTE "...". Auto-run detect when an edit finishes (wrapped so a detect bug never fails the edit).

Hard rules:
- Secrets: read ~/.config/claiface/key and ~/.config/marla/token at runtime; never print, log or write them anywhere.
- Ledger: write edits/<id>/request.json BEFORE the paid request; outcome unknown after a crash/restart -> status "unknown", never resent.
- Tests mock all providers: no paid calls in pytest.
- After tests pass, do ONE real smoke test: create a project, generate one BG through Clai (or upload an existing jpg), send ONE 1024 edit through Clai ("add a small red apple on the ground"), confirm the answer comes back in place and usage shows via=clai. Report which Clai HTTP endpoint you used for text-to-image.
- Start the server with: clai ctl run plc-server -- <command>   (never & / nohup). Leave it running when done.

When done, reply: clai ctl send "Hidden Words:1" "<short summary: files, test results, smoke test, open issues>". Ask me the same way if the spec is unclear.
