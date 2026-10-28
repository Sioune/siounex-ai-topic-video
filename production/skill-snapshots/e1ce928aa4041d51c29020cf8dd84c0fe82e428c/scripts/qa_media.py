#!/usr/bin/env python3
"""Read-only technical video QA. Requires ffmpeg/ffprobe; does not certify listening."""
import argparse,json,subprocess,sys,re
from qa_duration import assess_duration
p=argparse.ArgumentParser();p.add_argument('media');p.add_argument('--expected-seconds',type=float);p.add_argument('--duration-tolerance',type=float,default=.04);a=p.parse_args()
probe=subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',a.media],capture_output=True,text=True)
if probe.returncode:sys.exit(probe.stderr)
d=json.loads(probe.stdout); streams=d['streams'];v=next((s for s in streams if s['codec_type']=='video'),None)
checks={'video_present':v is not None,'audio_present':any(s['codec_type']=='audio' for s in streams)}
if v:checks['vertical_9_16']=abs(v['width']/v['height']-9/16)<.001
duration_report=assess_duration(d)
checks['total_duration_at_most_60_seconds']=duration_report['hard_duration_pass']
seconds=float(d['format'].get('duration',0))
if a.expected_seconds is not None:checks['duration_expected']=abs(seconds-a.expected_seconds)<=a.duration_tolerance
dec=subprocess.run(['ffmpeg','-v','error','-i',a.media,'-f','null','-'],capture_output=True,text=True);checks['full_decode']=dec.returncode==0 and not dec.stderr.strip()
peak=subprocess.run(['ffmpeg','-hide_banner','-i',a.media,'-vn','-af','volumedetect','-f','null','-'],capture_output=True,text=True)
m=re.search(r'max_volume: ([\-\d.]+) dB',peak.stderr); max_db=float(m.group(1)) if m else None
if max_db is not None:checks['peak_below_0dbfs']=max_db<0
print(json.dumps({'media':a.media,'duration_seconds':seconds,'duration_hard_check':duration_report,'size':[v['width'],v['height']] if v else None,'max_volume_dbfs':max_db,'checks':checks,'decode_errors':dec.stderr,'manual_checks_remaining':['listening and final syllables','lip synchronization','subtitle and subject safe areas','music transition quality','source resolution, effective crop and actual final-output pixel enlargement','global view before detail, spatial/routes/numeric relationships, return to global view','narration alignment with visible focus and results','first frame and continuous first 3 seconds: real visual interest without relying on hook text']},ensure_ascii=False,indent=2))
sys.exit(0 if all(checks.values()) else 1)
