#!/usr/bin/env python3
"""Final series QA of evidence records, not factual/visual approval or a pre-render gate.
JSON: current_id, catalog_verified, publication_records [{id,status,published_at,evidence}],
history_ids; template {id,version,locked_at_creation,selection_method,selection_record,
approval_evidence,similarity_review,aesthetic_status}; subtitle {baseline_evidence,
baseline_normalized_height,final_normalized_height,phone_review_evidence};
outro {body_tone,variant,existing_asset_evidence}; highlight {source_version,
source_in,source_out,full_edit_in,full_edit_out,final_duration,semantic_reason,
comparison_evidence,continuous,soft_transition_review}.
Publication times require timezone. Heights use same display-width normalization.
selection_method is alternating_approved for new day/night production; legacy
random_approved and user_directed_candidate records remain readable. Alternating
template records include production_sequence and publishing_slot classification.
A candidate blocks
accepted/approved status until approval; authorized candidate design and preview may proceed.
"""
import argparse
import copy
from datetime import datetime
import json
import math
from pathlib import Path
import sys

DAY_NIGHT_POLICY = json.loads((Path(__file__).resolve().parents[1] /
    'assets/day-night-templates-v1/policy.json').read_text(encoding='utf-8-sig'))


def check(d):
    issues = []
    def require(ok, message):
        if not ok:
            issues.append(message)
    def obj(key):
        value = d.get(key, {})
        require(isinstance(value, dict), key + ' 必须是对象')
        return value if isinstance(value, dict) else {}
    def nonempty(v):
        return isinstance(v, str) and bool(v.strip())
    def number(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if not isinstance(d, dict):
        return {'status': 'blocked', 'issues': ['根对象必须是对象'], 'manual_review_required': True}
    require(nonempty(d.get('current_id')), '缺当前作品ID')
    require(d.get('catalog_verified') is True, '档案完整性/最新发布状态未核实')
    records = d.get('publication_records')
    require(isinstance(records, list), '缺发布档案数组')
    published, seen = [], set()
    for r in records if isinstance(records, list) else []:
        if not isinstance(r, dict):
            issues.append('发布记录须为对象'); continue
        rid = r.get('id')
        if not nonempty(rid):
            issues.append('发布记录缺作品ID'); continue
        require(rid not in seen, '作品ID重复：' + rid); seen.add(rid)
        if rid == d.get('current_id'):
            continue
        if r.get('status') not in ('published', 'draft', 'scheduled', 'cancelled'):
            issues.append('发布状态不明确：' + rid); continue
        if r.get('status') != 'published':
            continue
        require(nonempty(r.get('evidence')), '缺发布证据：' + rid)
        try:
            t = datetime.fromisoformat(r['published_at'].replace('Z', '+00:00'))
            if t.tzinfo is None:
                raise ValueError('timezone missing')
            published.append((t, rid))
        except (KeyError, ValueError, TypeError, AttributeError):
            issues.append('缺可信含时区发布时间：' + rid)
    published.sort(reverse=True)
    if len(published) > 3:
        require(published[2][0] != published[3][0], '第3/4期时间并列，须补证据确定入选')
    expected = [r[1] for r in published[:3]]
    require(d.get('history_ids') == expected, '往期不匹配最近已发布3期：' + str(expected))
    t = obj('template')
    for k in ('id','selection_record','approval_evidence','similarity_review'):
        require(nonempty(t.get(k)), '模板缺 ' + k)
    require(nonempty(t.get('version')) or isinstance(t.get('version'), int) and
            not isinstance(t.get('version'), bool) and t['version'] > 0, '模板缺 version')
    require(t.get('locked_at_creation') is True, '模板未在任务创建时锁定')
    method = t.get('selection_method')
    require(method in ('alternating_approved','random_approved','user_directed_candidate'), '模板选择方式不明')
    require(t.get('aesthetic_status') == 'user_approved', '视觉仍待认可，不能将功能通过当审美通过')
    expected_template = None
    if method == 'alternating_approved':
        sequence = t.get('production_sequence')
        require(isinstance(sequence, int) and not isinstance(sequence, bool) and sequence > 0,
                '新模板交替记录缺有效production_sequence')
        expected_template = next((r for r in DAY_NIGHT_POLICY['templates']
                                  if r['id'] == t.get('id') and str(r['version']) == str(t.get('version'))), None)
        require(expected_template is not None, '交替模板不匹配当前已认可的明确版本')
        slot = t.get('publishing_slot')
        require(isinstance(slot, dict), '交替模板缺冻结早晚分类')
        if isinstance(slot, dict):
            require(slot.get('schema') == 'template-publishing-slot-v1' and
                    slot.get('timezone') == 'Asia/Shanghai' and
                    slot.get('policy') == DAY_NIGHT_POLICY['policy'] and
                    slot.get('selection_sequence') == sequence and
                    not isinstance(slot.get('selection_sequence'), bool), '早晚分类与交替序号不一致')
            require('planned_at' not in slot, '制作分类不预订未来具体发布日期')
            if expected_template:
                require(slot.get('time') == expected_template['time_slot'], '早晚分类与模板不一致')
                if 'runtime' in t:
                    require(t['runtime'] == expected_template['runtime'], '模板运行器与认可版本不一致')
    s = obj('subtitle')
    for k in ('baseline_evidence','phone_review_evidence'):
        require(nonempty(s.get(k)), '字幕缺 ' + k)
    a,b = s.get('baseline_normalized_height'),s.get('final_normalized_height')
    require(number(a) and number(b) and a > 0 and b >= a, '字幕最终归一化字高低于基线或数据缺失')
    o = obj('outro')
    require(o.get('body_tone') in ('dark','light'), '主体深浅未判定')
    require(o.get('variant') == {'dark':'light','light':'dark'}.get(o.get('body_tone')) and o.get('variant') is not None, '片尾未形成反向明暗')
    require(nonempty(o.get('existing_asset_evidence')), '缺已有片尾资产证据')
    if method == 'alternating_approved':
        frames = o.get('frames', (o.get('asset') or {}).get('frames') if isinstance(o.get('asset'), dict) else None)
        require(o.get('version') == 'v5' and frames == 119, '新交替模板须绑定原v5片尾119帧')
        if expected_template:
            require(o.get('body_tone') == expected_template['tone'] and
                    o.get('variant') == expected_template['outro_variant'], '交替模板主体或片尾配色不匹配')
    h = obj('highlight')
    for k in ('source_version','semantic_reason','comparison_evidence','soft_transition_review'):
        require(nonempty(h.get(k)), '高光缺 ' + k)
    for start,end in [('source_in','source_out'),('full_edit_in','full_edit_out')]:
        require(number(h.get(start)) and number(h.get(end)) and h[start] >= 0 and h[end] > h[start], '高光缺有效时码：' + start)
    duration = h.get('final_duration')
    require(number(duration) and abs(duration - 3) <= 0.05, '前置高光须实际连续3秒')
    require(h.get('continuous') is True, '高光连续性未确认')
    return {'status':'blocked' if issues else 'records_clear','issues':issues,
            'expected_history_ids':expected,'manual_review_required':True,
            'note':'记录核查不是事实/视觉认可；须核实来源、手机可读性、语义高光与实播音画。'}


def self_test():
    d={'current_id':'current','catalog_verified':True,'publication_records':[{'id':str(i),'status':'published','published_at':f'2026-10-0{i}T12:00:00+08:00','evidence':'test fixture'} for i in range(1,5)],'history_ids':['4','3','2'],
       'template':{'id':'sample','version':'1','locked_at_creation':True,'selection_method':'random_approved','selection_record':'test draw','approval_evidence':'test approval','similarity_review':'test comparison','aesthetic_status':'user_approved'},
       'subtitle':{'baseline_evidence':'test reference','baseline_normalized_height':.05,'final_normalized_height':.05,'phone_review_evidence':'test comparison'},
       'outro':{'body_tone':'dark','variant':'light','existing_asset_evidence':'test asset'},
       'highlight':{'source_version':'test hash','source_in':1,'source_out':4,'full_edit_in':20,'full_edit_out':23,'final_duration':3,'semantic_reason':'test core outcome','comparison_evidence':'test matched clip','continuous':True,'soft_transition_review':'test playback'}}
    assert check(d)['status']=='records_clear'
    cases=[('catalog_verified',False),('history_ids',['1','2','3'])]
    for k,v in cases:
        x=copy.deepcopy(d);x[k]=v;assert check(x)['status']=='blocked'
    for section,k,v in [('template','approval_evidence',''),('template','locked_at_creation',False),('template','aesthetic_status','function_passed'),('subtitle','final_normalized_height',.04),('outro','variant','dark'),('highlight','semantic_reason',''),('highlight','comparison_evidence',''),('highlight','continuous',False)]:
        x=copy.deepcopy(d);x[section][k]=v;assert check(x)['status']=='blocked'
    x=copy.deepcopy(d);x['publication_records'][3]['status']='scheduled';assert check(x)['status']=='blocked'
    x=copy.deepcopy(d);x['publication_records'][3]['published_at']='2026-10-04';assert check(x)['status']=='blocked'
    x=copy.deepcopy(d);x['publication_records']=x['publication_records'][:2];x['history_ids']=['2','1'];assert check(x)['status']=='records_clear'
    assert check({})['status']=='blocked'
    current = copy.deepcopy(d)
    current['template'].update(id='morning-light',version=1,selection_method='alternating_approved',
        production_sequence=1,publishing_slot={'schema':'template-publishing-slot-v1',
        'timezone':'Asia/Shanghai','time':'08:00','selection_sequence':1,
        'policy':'morning-light-evening-dark-v1'})
    current['outro'].update(body_tone='light',variant='dark',version='v5',frames=119)
    assert check(current)['status']=='records_clear'
    for section,key,value in [('template','production_sequence',0),('template','production_sequence',True),
                              ('outro','frames',120),('outro','version','legacy'),('outro','body_tone','dark')]:
        x=copy.deepcopy(current);x[section][key]=value;assert check(x)['status']=='blocked'
    for key,value in [('time','18:00'),('selection_sequence',2),('planned_at','2026-10-23T00:00:00Z')]:
        x=copy.deepcopy(current);x['template']['publishing_slot'][key]=value;assert check(x)['status']=='blocked'
    current['template'].update(id='evening-dark',production_sequence=2)
    current['template']['publishing_slot'].update(time='18:00',selection_sequence=2)
    current['outro'].update(body_tone='dark',variant='light')
    assert check(current)['status']=='records_clear'
    print('self-test: historical and alternating day/night cases passed; real evidence and visual review still required')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',nargs='?');p.add_argument('--self-test',action='store_true');a=p.parse_args()
    if a.self_test:
        self_test();return 0
    if not a.input:p.error('需要检查JSON或 --self-test')
    try:
        with open(a.input,encoding='utf-8-sig') as f:r=check(json.load(f))
    except (OSError,ValueError) as e:
        print(json.dumps({'status':'blocked','error':str(e)},ensure_ascii=False));return 2
    print(json.dumps(r,ensure_ascii=False,indent=2));return 1 if r['status']=='blocked' else 0

if __name__=='__main__':sys.exit(main())
