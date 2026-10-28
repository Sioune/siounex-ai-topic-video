// Pure alignment planner fixtures; no model, network, speech or actual job calls.
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('ASR page planner preserves exact text and observed boundaries, while uncertain or invalid clocks cannot invent pages',()=>{
 const code=String.raw`
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('caption_alignment','scripts/private-review-align-captions.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert 'faster_whisper' not in sys.modules
text='一二三四五六七八九十甲乙丙丁戊己庚辛壬癸春夏秋冬天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏'
words=[];clock=0
for i in range(0,len(text),2):
 start=clock;clock+=[.17,.43,.28][(i//2)%3];words.append({'word':text[i:i+2],'start':start,'end':clock,'probability':.95})
pages,coverage,uncertainties=m.plan_pages(text,words,clock+.21,offset=3,segment_index=4)
assert coverage==1 and not uncertainties and ''.join(x['text'] for x in pages)==text
assert len(pages)>=2 and all(len(x['text'])<=24 and len(x['display_lines'])<=2 and all(len(line)<=12 for line in x['display_lines']) for x in pages)
assert pages[0]['start_seconds']==3 and pages[-1]['end_seconds']==3+clock+.21
ends={3+w['end'] for w in words}
assert all(p['end_seconds'] in ends for p in pages[:-1])
assert all(p['alignment']=='offline-asr-estimated-word-boundaries' and p['word_alignment_verified'] is False and p['evidence']['segment_index']==4 for p in pages)
altered=[dict(w) for w in words];altered[4]['word']='错错'
changed,coverage,uncertainties=m.plan_pages(text,altered,clock+.21)
assert changed and ''.join(p['text'] for p in changed)==text and uncertainties and coverage<1
uncertain,coverage,issues=m.plan_pages(text,[{'word':'完全错误','start':0,'end':1,'probability':.2}],2)
assert not uncertain and issues[0]['code']=='asr-lexical-alignment-uncertain'
for invalid in [[{'word':text,'start':0,'end':3}], [{'word':'一二','start':1,'end':1.2},{'word':'三四','start':.2,'end':.4}]]:
 try:m.plan_pages(text,invalid,2)
 except ValueError:pass
 else:raise AssertionError('Invalid real clock accepted')
unpaged,coverage,issues=m.plan_pages(text,[{'word':text,'start':0,'end':2,'probability':.95}],2)
assert coverage==1 and not unpaged and issues[0]['code']=='asr-page-boundary-unavailable'
print(json.dumps({'exact_text':True,'observed_boundaries':True,'unmatched_text_retained':True,'uncertain_blocked':True,'invalid_clock_blocked':True,'no_uniform_interpolation':True,'no_model_import':True}))
`;const r=spawnSync('python',['-X','utf8','-B','-'],{input:code,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(r.status,0,r.stderr||r.stdout);const proof=JSON.parse(r.stdout.trim());assert.ok(Object.values(proof).every(v=>v===true));
});
