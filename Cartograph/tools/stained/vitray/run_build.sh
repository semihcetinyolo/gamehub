#!/bin/bash
# run_build.sh <id>...  — build each level as its own background job (logs/<id>.build.log)
cd "$(dirname "$0")"
for id in "$@"; do
  clai ctl kill _vb-$id >/dev/null 2>&1
  clai ctl run _vb-$id -- bash -c "cd $PWD && python3 trace.py $id >/dev/null && python3 build_map.py $id > logs/$id.build.log 2>&1" >/dev/null 2>&1
done
