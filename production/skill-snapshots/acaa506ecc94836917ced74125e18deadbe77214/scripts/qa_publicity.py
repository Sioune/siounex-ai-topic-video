#!/usr/bin/env python3
"""Check default dual-cover files and publicity copy; does not certify visual design.
Manifest JSON: covers [{ratio:"3:4"|"4:3"|other, path:"relative/or/absolute/image"}],
copy {cover_title, publish_title, body, hashtags}. Text fields are nonempty strings;
hashtags may also be a nonempty string array. Paths resolve beside the manifest.
Other optional ratios are retained, not rejected or substituted for required ratios.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys

REQUIRED = {'3:4': (3,4), '4:3': (4,3)}


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


def check(data, base=Path('.'), inspect=image_size):
    issues, verified = [], []
    if not isinstance(data, dict):
        return {'completeness_pass':False,'issues':['manifest must be an object'],'manual_visual_review_required':True}
    covers=data.get('covers',[])
    if not isinstance(covers,list):covers=[];issues.append('covers must be an array')
    for ratio,(numerator,denominator) in REQUIRED.items():
        entries=[x for x in covers if isinstance(x,dict) and x.get('ratio')==ratio]
        if not entries:
            issues.append('missing required cover '+ratio);continue
        passed=False
        failures=[]
        for entry in entries:
            try:
                value=entry.get('path')
                if not isinstance(value,str) or not value.strip():raise ValueError('missing image path')
                path=base/Path(value)
                w,h=inspect(path)
                if not isinstance(w,int) or not isinstance(h,int) or w<=0 or h<=0 or w*denominator!=h*numerator:
                    raise ValueError(f'actual dimensions {w}x{h} do not match {ratio}')
                verified.append({'ratio':ratio,'path':str(path),'width':w,'height':h});passed=True
            except (OSError,ValueError,KeyError,TypeError) as e:
                failures.append(str(e))
        if not passed:issues.append(ratio+': '+'; '.join(failures))
    copy=data.get('copy',{})
    if not isinstance(copy,dict):copy={}
    for field in ('cover_title','publish_title','body','hashtags'):
        v=copy.get(field)
        ok=isinstance(v,str) and bool(v.strip())
        if field=='hashtags' and isinstance(v,list):ok=bool(v) and all(isinstance(x,str) and bool(x.strip()) for x in v)
        if not ok:issues.append('missing publicity copy '+field)
    return {'completeness_pass':not issues,'issues':issues,'verified_required_covers':verified,
            'manual_visual_review_required':True,
            'manual_checks':['independently composed layouts','no stretched subject or clipped title','phone-size readability and safe margins','same story and factual promise','correct delivered file versions and authorized access'],
            'note':'File/copy presence and pixel ratios only; not visual approval or publishing authorization. Optional ratios do not replace either default.'}


def self_test():
    d={'covers':[{'ratio':'3:4','path':'portrait.png'},{'ratio':'4:3','path':'landscape.png'}],
       'copy':{'cover_title':'example','publish_title':'example','body':'example','hashtags':['example']}}
    def sizes(path):return (300,400) if path.name=='portrait.png' else (400,300)
    assert check(d,inspect=sizes)['completeness_pass']
    for i in range(2):
        x=dict(d,covers=[d['covers'][i]]);assert not check(x,inspect=sizes)['completeness_pass']
    assert not check(d,inspect=lambda p:(300,400))['completeness_pass']
    assert not check(dict(d,copy={}),inspect=sizes)['completeness_pass']
    optional=dict(d,covers=d['covers']+[{'ratio':'9:16','path':'optional.png'}]);assert check(optional,inspect=sizes)['completeness_pass']
    assert not check(dict(d,covers=[{'ratio':'9:16','path':'optional.png'}]),inspect=sizes)['completeness_pass']
    assert not check({})['completeness_pass']
    print('self-test: 8 cases passed; visual composition review still required')


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
