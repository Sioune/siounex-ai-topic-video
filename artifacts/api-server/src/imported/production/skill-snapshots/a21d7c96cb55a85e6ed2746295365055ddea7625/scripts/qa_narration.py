#!/usr/bin/env python3
"""Conservative frontstage-text preflight; not factual or semantic approval."""
import argparse
import json
import re
import sys

PATTERNS = [
    r'(?:据|根据|援引).{0,30}(?:报道|消息|资料|介绍)',
    r'(?:IT\s*之家|媒体|外媒|官方).{0,12}(?:报道|消息|透露|介绍)',
    r'(?:来源|出处|资料来自|消息来自)\s*[:：]',
    r'(?:尚未|未能|无法|未经).{0,8}(?:独立)?(?:核验|验证|证实)',
    r'(?:我们|我).{0,6}(?:核验|查阅|核对).{0,12}(?:报道|来源|资料)',
    r'具体以.{0,12}为准',
]
RX = [re.compile(p, re.I) for p in PATTERNS]


def check(data):
    problems, exceptions_used = [], []
    if not isinstance(data, dict):
        return {'machine_preflight': 'blocked', 'problems': ['根对象必须是对象'], 'manual_review_required': True}
    exceptions = data.get('exceptions', [])
    if not isinstance(exceptions, list):
        exceptions = []
        problems.append('exceptions 必须是数组')
    for surface in ('narration', 'subtitles', 'overlays'):
        value = data.get(surface)
        valid = isinstance(value, str) if surface == 'narration' else isinstance(value, list) and all(isinstance(x, str) for x in value)
        if not valid or (surface == 'narration' and not value.strip()):
            problems.append(f'{surface} 缺失或格式不正确')
            continue
        texts = [value] if isinstance(value, str) else value
        for i, line in enumerate(texts):
            for rx in RX:
                for match in rx.finditer(line):
                    permitted = next((e for e in exceptions if isinstance(e, dict)
                        and e.get('surface') == surface
                        and isinstance(e.get('text'), str) and e['text']
                        and e['text'] in line and match.group() in e['text']
                        and e.get('kind') in ('understanding', 'rights', 'user_request')
                        and isinstance(e.get('reason'), str) and e['reason'].strip()), None)
                    if permitted:
                        if permitted not in exceptions_used:
                            exceptions_used.append(permitted)
                    else:
                        problems.append(f'{surface}[{i}] 待改写或必要性复核：{match.group()}')
    segments = data.get('segments')
    if not isinstance(segments, list) or not segments:
        problems.append('缺少逐段真实素材映射')
    else:
        for i, seg in enumerate(segments):
            if not isinstance(seg, dict) or not all(isinstance(seg.get(k), str) and seg[k].strip() for k in ('text', 'visual')):
                problems.append(f'segments[{i}] 缺文字或具体可见画面')
            elif seg.get('material_status') != 'checked':
                problems.append(f'segments[{i}] 素材未完成获取与核查')
    return {'machine_preflight': 'blocked' if problems else 'clear', 'problems': problems,
            'exceptions_to_verify': exceptions_used, 'manual_review_required': True,
            'note': '仅作机器预检；必须人工核对必要例外、事实、真实素材和兴趣故事三道门。'}


def self_test():
    base = {'narration': '你看，角色绕过桌子，自己走到了门口。', 'subtitles': [], 'overlays': [],
            'segments': [{'text': '绕过桌子', 'visual': '示例原片00:02–00:06，角色从桌边绕向门口', 'material_status': 'checked'}]}
    assert check(base)['machine_preflight'] == 'clear'
    for text in ['据 IT 之家报道，这个角色会绕路。', '某媒体援引消息称，它成功了。', '据官方资料介绍，它成功了。', '我们核验了多家报道。', '尚未独立核验。', '具体以官方为准。']:
        assert check(dict(base, narration=text))['machine_preflight'] == 'blocked', text
    assert check(dict(base, overlays=['来源：某媒体']))['machine_preflight'] == 'blocked'
    assert check(dict(base, subtitles=['IT之家报道，角色成功了']))['machine_preflight'] == 'blocked'
    assert check(dict(base, segments=[dict(base['segments'][0], material_status='pending')]))['machine_preflight'] == 'blocked'
    exc = {'surface': 'overlays', 'text': '来源：原片作者', 'kind': 'rights', 'reason': '示例许可要求画面显示署名，人工待核对'}
    result = check(dict(base, overlays=[exc['text']], exceptions=[exc]))
    assert result['machine_preflight'] == 'clear' and result['manual_review_required']
    assert check(dict(base, narration='IT之家编辑在现场演示了这个动作。'))['machine_preflight'] == 'clear'
    assert check(dict(base, narration='这是厂商放出的演示，目前只展示了这一种情况。'))['machine_preflight'] == 'clear'
    assert check({})['machine_preflight'] == 'blocked'
    print('self-test: 14 cases passed; semantic/media review still required')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', nargs='?')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.input:
        parser.error('需要稿件检查 JSON 或 --self-test')
    try:
        with open(args.input, encoding='utf-8-sig') as f:
            report = check(json.load(f))
    except (OSError, ValueError) as e:
        print(json.dumps({'machine_preflight': 'blocked', 'error': str(e)}, ensure_ascii=False))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report['machine_preflight'] == 'blocked' else 0


if __name__ == '__main__':
    sys.exit(main())
