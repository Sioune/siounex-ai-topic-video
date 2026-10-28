#!/usr/bin/env python3
"""Read final-file duration with ffprobe; strict <=60 seconds, no overrun tolerance."""
import argparse
from decimal import Decimal, InvalidOperation
from fractions import Fraction
import json
import subprocess
import sys

HARD_MAX_SECONDS = Decimal('60')


def decimal(value):
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def assess_duration(probe):
    errors, measurements = [], {}
    fmt = probe.get('format', {})
    duration = decimal(fmt.get('duration'))
    if duration is None or duration <= 0:
        errors.append('missing/invalid positive container duration')
    else:
        measurements['container_duration'] = duration
    av = [s for s in probe.get('streams', []) if s.get('codec_type') in ('video', 'audio')]
    if not av:
        errors.append('no audio/video streams')
    for i, stream in enumerate(av):
        label = f"{stream.get('codec_type')}_{stream.get('index', i)}"
        values = []
        direct = decimal(stream.get('duration'))
        if direct is not None and direct > 0:
            values.append(direct)
        try:
            ticks = decimal(stream.get('duration_ts'))
            tb = Fraction(str(stream.get('time_base')))
            if ticks is not None and ticks > 0 and tb > 0:
                values.append(ticks * Decimal(tb.numerator) / Decimal(tb.denominator))
        except (ValueError, ZeroDivisionError):
            pass
        if not values:
            errors.append(label + ': missing/invalid positive stream duration')
            continue
        start = decimal(stream.get('start_time'))
        if start is None:
            try:
                pts = decimal(stream.get('start_pts'))
                tb = Fraction(str(stream.get('time_base')))
                if pts is not None and tb > 0:
                    start = pts * Decimal(tb.numerator) / Decimal(tb.denominator)
            except (ValueError, ZeroDivisionError):
                pass
        if start is None:
            errors.append(label + ': missing/invalid stream start time and start_pts')
            continue
        # Positive offsets are part of the final-file playback timeline.
        # Negative codec preroll does not excuse a long declared stream duration.
        measurements[label + '_duration'] = max(values)
        measurements[label + '_playback_end'] = max(values) + max(start, Decimal('0'))
    maximum = max(measurements.values()) if measurements else None
    for label, value in measurements.items():
        if value > HARD_MAX_SECONDS:
            errors.append(f'{label} exceeds 60 seconds: {value}')
    passed = not errors and maximum is not None and maximum <= HARD_MAX_SECONDS
    return {'hard_max_seconds': 60, 'hard_duration_pass': passed,
            'maximum_measured_seconds': str(maximum) if maximum is not None else None,
            'measurements_seconds': {k:str(v) for k,v in measurements.items()},
            'errors': errors, 'manual_check_remaining': 'Listen to complete final sentence, final syllables and original outro; duration alone does not prove completeness.'}


def probe_media(path):
    p = subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',path], capture_output=True, text=True)
    if p.returncode:
        raise ValueError(p.stderr.strip() or 'ffprobe failed')
    return json.loads(p.stdout)


def self_test():
    def sample(value, stream=None, start='0'):
        return {'format':{'duration':value},'streams':[{'codec_type':'video','index':0,'duration':stream or value,'start_time':start}]}
    cases=[(sample('59.9'),True),(sample('60'),True),(sample('60.000001'),False),
           (sample('60.04'),False),(sample('66.6'),False),(sample('60','66.6'),False),
           (sample('59','59','.5'),True),(sample('60','60','.01'),False),
           (sample('NaN'),False),({'format':{},'streams':[]},False)]
    ticks={'format':{'duration':'60'},'streams':[{'codec_type':'video','duration_ts':1800,'time_base':'1/30','start_pts':0}]}
    cases.append((ticks,True))
    over={'format':{'duration':'60'},'streams':[{'codec_type':'video','duration':'60','duration_ts':1801,'time_base':'1/30','start_pts':0}]}
    cases.append((over,False))
    for pts,expected in [(2,False),(1,True),(None,False)]:
        cases.append(({'format':{'duration':'59'},'streams':[{'codec_type':'video','duration':'59','start_pts':pts,'time_base':'1/1'}]},expected))
    for data,expected in cases:
        assert assess_duration(data)['hard_duration_pass'] == expected, data
    print('self-test: 15 duration cases passed; exact cap has no tolerance')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('media',nargs='?');p.add_argument('--self-test',action='store_true');a=p.parse_args()
    if a.self_test:
        self_test();return 0
    if not a.media:p.error('need final media file or --self-test')
    try:
        report=assess_duration(probe_media(a.media));report['media']=a.media
    except (OSError,ValueError,TypeError) as e:
        report={'media':a.media,'hard_duration_pass':False,'errors':[str(e)]}
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if report['hard_duration_pass'] else 1

if __name__=='__main__':sys.exit(main())
