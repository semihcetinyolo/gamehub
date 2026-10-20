"""Reuse current glass for the final staged junction catalogue; retain originals."""
import argparse,json,traceback
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
import reuse_glass
from junction_rollout import OUT


def transfer(ident):
    file=OUT/'maps'/f'{ident}.json';info=json.loads(file.read_text())
    if not info.get('junctionRollout'):return dict(id=ident,retained=True)
    if not info.get('artworkNeedsRefresh'):
        target=OUT/'art'/Path(info['image']).name
        if target.exists():return dict(id=ident,retained=True)
    assert not info['junctionRollout']['remaining'],ident
    assert info['junctionRollout'].get('logic',{}).get('solutions')==1,ident
    reuse_glass.OUT=OUT
    result=reuse_glass.transfer(ident)
    info=json.loads(file.read_text())
    for ext in ['.webp','.json']:
        source=OUT/'art'/f'{ident}-restored{ext}'
        source.rename(OUT/'art'/f'{ident}-junctions{ext}')
    info['image']=f'assets/glass/{ident}-junctions.webp';info['artMetadata']=f'assets/glass/{ident}-junctions.json'
    file.write_text(json.dumps(info,ensure_ascii=False,separators=(',',':')))
    return result


def main():
    p=argparse.ArgumentParser();p.add_argument('ids',nargs='*');p.add_argument('--jobs',type=int,default=3);a=p.parse_args()
    rows=json.loads((OUT/'before/manifest.json').read_text());ids=a.ids or [r['id'] for r in rows if r['junctions']];report=[]
    with ProcessPoolExecutor(max_workers=a.jobs) as pool:
        fs={pool.submit(transfer,id):id for id in ids}
        for f in as_completed(fs):
            try:r=f.result()
            except Exception as e:r=dict(id=fs[f],error=str(e),traceback=traceback.format_exc())
            report.append(r);print(json.dumps(r,ensure_ascii=False),flush=True)
    (OUT/'reports/art.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    if any('error' in r for r in report):raise SystemExit(1)

if __name__=='__main__':main()
