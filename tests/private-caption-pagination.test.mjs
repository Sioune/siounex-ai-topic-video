import test from 'node:test';
import assert from 'node:assert/strict';
import {captionLayout,paginateCaptionCues} from '../scripts/private-review-caption-layout.mjs';
const cue=text=>({text,start_seconds:3.125,end_seconds:8.625,alignment:'estimated-page-timing',word_alignment_verified:false,evidence:{segment_index:2,audio_sha256:'a'.repeat(64)}});
test('actual DeepSeek pages automatically repaginate without losing text, words, audio evidence or outer clocks',()=>{
 for(const text of ['程序员想怎么搭、怎么上线；写手等方案定了再动笔。','它是社区插件，不是DeepSeek官方产品。','示例图里，Chief先拆活：程序员想怎么搭、怎么上线；写手等方案定了再动笔。']){
  const original=cue(text),before=structuredClone(original),pages=paginateCaptionCues([original]);
  assert.deepEqual(original,before);assert.ok(pages.length>1);assert.equal(pages.map(p=>p.text).join(''),text);
  assert.equal(pages[0].start_seconds,original.start_seconds);assert.equal(pages.at(-1).end_seconds,original.end_seconds);
  pages.forEach((page,index)=>{assert.ok(captionLayout(page.text).within_safe_layout);assert.equal(page.layout.normal_size,76);assert.ok(page.end_seconds>page.start_seconds);assert.deepEqual(page.evidence,original.evidence);assert.equal(page.word_alignment_verified,false);assert.equal(page.alignment,'estimated-page-timing');assert.equal(page.pagination.internal_timing,'estimated-text-weight');if(index)assert.equal(page.start_seconds,pages[index-1].end_seconds);});
  for(const word of text.match(/[A-Za-z][A-Za-z-]*/g)||[])assert.ok(pages.some(p=>p.text.includes(word)));
  assert.ok(pages.every(p=>!/^\p{P}/u.test(p.text)));
 }
});
test('already safe measured captions retain their clocks and alignment; repeated normalization is stable',()=>{
 const source={...cue('而是会直接影响一场戏的情绪。'),alignment:'actual-segment-audio-boundaries'},pages=paginateCaptionCues([source]);assert.equal(pages.length,1);assert.equal(pages[0].alignment,source.alignment);assert.equal(pages[0].pagination,undefined);assert.deepEqual(paginateCaptionCues(pages),pages);
});
test('actual approved paragraph separators remain in cue evidence while shared pagination renders readable pages without changing audio clocks',()=>{
 for(const text of ['而是怎么在安全和发展之间先迈出一步。\n\n','他更希望重点管 AI 怎么被使用，而不是把底层技术一股脑管住。\n\n默茨的回应是：完全不监管不对，规则太严也会压住创新。\n\n','黄仁勋还把德国的制造业和工程能力看成现成优势，认为 AI 有机会把这些长项变成竞争力。他在英国说得更直白：人才和活力都有，却总能找到不开始的理由。\n\n','Alpha\r\nBeta是两个术语，段落只影响显示。']){
  const source={...cue(text),alignment:'actual-segment-audio-boundaries'},before=structuredClone(source),pages=paginateCaptionCues([source]);assert.deepEqual(source,before);assert.equal(pages.map(p=>p.text).join(''),text);assert.equal(pages[0].start_seconds,source.start_seconds);assert.equal(pages.at(-1).end_seconds,source.end_seconds);for(const [i,page]of pages.entries()){assert.equal(page.layout.within_safe_layout,true);assert.ok(page.layout.display_lines.every(line=>!/[\r\n]/u.test(line)&&Array.from(line).length<=12));assert.equal(page.layout.normal_size,76);assert.deepEqual(page.evidence,source.evidence);assert.ok(page.end_seconds>page.start_seconds);if(i)assert.equal(page.start_seconds,pages[i-1].end_seconds);}assert.deepEqual(paginateCaptionCues(pages),pages);
 }
});
test('indivisible oversized word and invalid clocks retain a concrete failure instead of truncating evidence',()=>{
 assert.throws(()=>paginateCaptionCues([cue('ExtraordinarilyLongEnglishWord')]),/UNBREAKABLE_WORD/);assert.throws(()=>paginateCaptionCues([{...cue('有效文字'),end_seconds:3.125}]),/INPUT_INVALID/);
});
