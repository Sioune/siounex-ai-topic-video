#!/usr/bin/env python3
"""Check default dual-cover files and publicity copy; does not certify visual design.
Manifest JSON: covers [{ratio:"3:4"|"4:3"|other, path:"relative/or/absolute/image",
brand_evidence:"brand-check.json"}],
copy {cover_title, publish_title, body, hashtags}. Text fields are nonempty strings;
hashtags may also be a nonempty string array. Paths resolve beside the manifest.
Evidence JSON: method visual|ocr, observed_text, image_sha256, evidence_note, reviewed_at.
All delivered cover ratios require exact branding and file-bound evidence. Optional
ratios are retained and cannot replace required defaults. This validates records,
not the truth of OCR/visual inspection; manual image review remains necessary.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

REQUIRED = {'3:4': (3,4), '4:3': (4,3)}
BRAND = '怎么用好AI'


def image_size(path):
    if not path.is_file():
        raise ValueError('file missing')
    if path.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff','.avif'):
        raise ValueError('expected an exported image file')
    p=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',str(path)],capture_output=True,text=True)
    if p.returncode:raise ValueError(p.stderr.strip() or 'image unreadable')
    streams=json.loads(p.stdout).get('streams',[])
    if not streams:raise ValueError('image dimensions unavailable')
    return streams[0]['width'],streams[0]['height']


def validate_brand_record(record, actual_sha):
    if not isinstance(record,dict):raise ValueError('brand evidence must be an object')
    if record.get('method') not in ('visual','ocr'):raise ValueError('need real visual or OCR evidence')
    if record.get('observed_text') != BRAND:raise ValueError('brand text missing or inaccurate; required '+BRAND)
    if record.get('image_sha256') != actual_sha:raise ValueError('brand evidence is not bound to this final image')
    for field in ('evidence_note','reviewed_at'):
        if not isinstance(record.get(field),str) or not record[field].strip():raise ValueError('brand evidence missing '+field)
    return {'method':record['method'],'observed_text':BRAND,'image_sha256':actual_sha,'record_check_only':True}


def brand_evidence(image_path, report_path):
    with report_path.open(encoding='utf-8-sig') as f:record=json.load(f)
    actual=hashlib.sha256(image_path.read_bytes()).hexdigest()
    return validate_brand_record(record,actual)


def check(data, base=Path('.'), inspect=image_size, inspect_brand=brand_evidence):
    issues, verified = [], []
    if not isinstance(data, dict):
        return {'completeness_pass':False,'issues':['manifest must be an object'],'manual_visual_review_required':True}
    covers=data.get('covers',[])
    if not isinstance(covers,list):covers=[];issues.append('covers must be an array')
    present={x.get('ratio') for x in covers if isinstance(x,dict) and isinstance(x.get('ratio'),str)}
    for ratio in REQUIRED:
        if ratio not in present:issues.append('missing required cover '+ratio)
    for index,entry in enumerate(covers):
        try:
            if not isinstance(entry,dict):raise ValueError('cover entry must be an object')
            ratio=entry.get('ratio')
            if not isinstance(ratio,str):raise ValueError('missing ratio')
            numbers=ratio.split(':')
            if len(numbers)!=2:raise ValueError('ratio must be width:height')
            numerator,denominator=map(int,numbers)
            if numerator<=0 or denominator<=0:raise ValueError('ratio must be positive')
            value=entry.get('path')
            if not isinstance(value,str) or not value.strip():raise ValueError('missing image path')
            path=base/Path(value);w,h=inspect(path)
            if not isinstance(w,int) or not isinstance(h,int) or w<=0 or h<=0 or w*denominator!=h*numerator:
                raise ValueError(f'actual dimensions {w}x{h} do not match {ratio}')
            evidence=entry.get('brand_evidence')
            if not isinstance(evidence,str) or not evidence.strip():raise ValueError('missing visual/OCR brand evidence path')
            brand=inspect_brand(path,base/Path(evidence))
            verified.append({'ratio':ratio,'path':str(path),'width':w,'height':h,'brand_evidence_record':brand})
        except (OSError,ValueError,KeyError,TypeError) as e:
            issues.append(f'cover[{index}]: '+str(e))
    copy=data.get('copy',{})
    if not isinstance(copy,dict):copy={}
    for field in ('cover_title','publish_title','body','hashtags'):
        v=copy.get(field);ok=isinstance(v,str) and bool(v.strip())
        if field=='hashtags' and isinstance(v,list):ok=bool(v) and all(isinstance(x,str) and bool(x.strip()) for x in v)
        if not ok:issues.append('missing publicity copy '+field)
    return {'completeness_pass':not issues,'issues':issues,'verified_covers':verified,
            'verified_required_covers':[c for c in verified if c['ratio'] in REQUIRED],
            'manual_visual_review_required':True,'brand_visual_approval':'not established by this script',
            'manual_checks':['exact 怎么用好AI on every cover','refined, legible secondary brand; title retains priority','independently composed layouts','no stretched subject or clipped title','phone-size readability and safe margins','same story and factual promise','correct delivered file versions and authorized access'],
            'note':'File/copy/ratio and evidence-record consistency only; no automatic visual approval or publishing authorization. Missing/stale brand evidence blocks completeness.'}


def self_test():
    d={'covers':[{'ratio':'3:4','path':'portrait.png','brand_evidence':'portrait.json'},{'ratio':'4:3','path':'landscape.png','brand_evidence':'landscape.json'}],
       'copy':{'cover_title':'example','publish_title':'example','body':'example','hashtags':['example']}}
    def sizes(path):return {'portrait.png':(300,400),'landscape.png':(400,300),'optional.png':(90,160)}[path.name]
    def mock_brand(image,report):return {'method':'visual','observed_text':BRAND,'record_check_only':True}
    def run(x,inspect=sizes):return check(x,inspect=inspect,inspect_brand=mock_brand)
    assert run(d)['completeness_pass']
    for i in range(2):assert not run(dict(d,covers=[d['covers'][i]]))['completeness_pass']
    assert not run(d,inspect=lambda p:(300,400))['completeness_pass']
    assert not run(dict(d,copy={}))['completeness_pass']
    opt={'ratio':'9:16','path':'optional.png','brand_evidence':'optional.json'}
    assert run(dict(d,covers=d['covers']+[opt]))['completeness_pass']
    assert not run(dict(d,covers=[opt]))['completeness_pass']
    assert not check({})['completeness_pass']
    for i in range(2):
        items=[dict(x) for x in d['covers']];items[i].pop('brand_evidence')
        assert not run(dict(d,covers=items))['completeness_pass']
    assert not run(dict(d,covers=d['covers']+[dict(opt,brand_evidence='')]))['completeness_pass']
    record={'method':'visual','observed_text':BRAND,'image_sha256':'a'*64,'evidence_note':'Synthetic unit-test record, not an actual inspected cover','reviewed_at':'2026-10-11T00:00:00Z'}
    assert validate_brand_record(record,'a'*64)['record_check_only']
    assert validate_brand_record(dict(record,method='ocr'),'a'*64)['record_check_only']
    for field,value in [('method','checkbox'),('observed_text','怎么用好Al'),('image_sha256','b'*64),('evidence_note',''),('reviewed_at','')]:
        try:validate_brand_record(dict(record,**{field:value}),'a'*64)
        except ValueError:pass
        else:raise AssertionError(field)
    print('self-test: 18 cases passed; real visual/OCR evidence and manual image review required')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('manifest',nargs='?');p.add_argument('--self-test',action='store_true');a=p.parse_args()
    if a.self_test:self_test();return 0
    if not a.manifest:p.error('need publicity manifest or --self-test')
    try:
        path=Path(a.manifest)
        with path.open(encoding='utf-8-sig') as f:report=check(json.load(f),path.resolve().parent)
    except (OSError,ValueError) as e:report={'completeness_pass':False,'issues':[str(e)]}
    print(json.dumps(report,ensure_ascii=False,indent=2));return 0 if report['completeness_pass'] else 1

if __name__=='__main__':sys.exit(main())
