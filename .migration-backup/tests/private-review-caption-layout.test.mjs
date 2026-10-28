import test from 'node:test';
import assert from 'node:assert/strict';
import {captionLayout,CAPTION_LAYOUT_VERSION} from '../scripts/private-review-caption-layout.mjs';
import {buildPrivateAss} from '../scripts/private-review-producer.mjs';

const exact=(text,layout)=>{assert.equal(layout.display_lines.join(''),text);assert.equal(layout.display_text,layout.display_lines.join('\n'));assert.equal(layout.normal_size,76);assert.equal(layout.max_lines,2);assert.equal(layout.layout_version,CAPTION_LAYOUT_VERSION);};

test('the real Yuewen subtitle keeps 情绪 together and balances the original two lines',()=>{
 const text='而是会直接影响一场戏的情绪。',layout=captionLayout(text);exact(text,layout);
 assert.equal(layout.within_safe_layout,true);assert.equal(layout.lines,2);assert.ok(layout.display_lines.some(line=>line.includes('情绪')));
 assert.ok(layout.display_lines.every(line=>Array.from(line).length<=12));assert.ok(layout.display_lines.every(line=>!/^\p{P}/u.test(line)));
 assert.ok(Math.abs(Array.from(layout.display_lines[0]).length-Array.from(layout.display_lines[1]).length)<=4);
});

test('closing punctuation remains with its preceding phrase and opening quotes remain with their following words',()=>{
 for(const text of ['他们称之为“情绪”，观众会记住。','片子已经做好了，为什么还要重看？','他问：“这一场戏的情绪是什么？”']){
  const layout=captionLayout(text);exact(text,layout);assert.equal(layout.within_safe_layout,true,text);
  assert.ok(layout.display_lines.every(line=>!/[（《「『【“‘]$/u.test(line)&&!(/^[，。！？；：、,.!?;:…）〉》」』】”’]/u.test(line))),layout.display_text);
 }
});

test('English words and their punctuation are never split or dropped',()=>{
 for(const text of ['把WorkBuddy放进工作流。','AI、Token和上下文怎么分工？','DeepSeek-Bot留住上下文']){
  const layout=captionLayout(text);exact(text,layout);assert.equal(layout.within_safe_layout,true,text);
  for(const word of text.match(/[A-Za-z][A-Za-z-]*/g)||[])assert.ok(layout.display_lines.some(line=>line.includes(word)),word);
 }
});

test('a full 24-character page remains bounded and Unicode text is preserved exactly',()=>{
 for(const text of ['字'.repeat(24),'AI动画😀如何留住观众的情绪？']){
  const layout=captionLayout(text);exact(text,layout);assert.equal(layout.within_safe_layout,true);assert.ok(layout.lines<=2);
  assert.ok(layout.display_lines.every(line=>Array.from(line).length<=12));
 }
});

test('overlong captions retain all evidence and explicitly fail instead of truncating or hiding a third line',()=>{
 for(const text of ['完整原稿内容'.repeat(9),'字'.repeat(25)]){
  const layout=captionLayout(text);exact(text,layout);assert.equal(layout.within_safe_layout,false);assert.equal(layout.reason,'caption-exceeds-two-lines');assert.ok(layout.lines>2);assert.ok(!layout.display_text.includes('…'));
 }
 const word='ExtraordinarilyLongEnglishWord',layout=captionLayout(word);exact(word,layout);assert.equal(layout.within_safe_layout,false);assert.equal(layout.reason,'indivisible-word-exceeds-line-width');assert.equal(layout.display_lines[0],word);
 const indivisible='用DeepSeek-Bot留住上下文',three=captionLayout(indivisible);exact(indivisible,three);assert.equal(three.within_safe_layout,false);assert.ok(three.display_lines.some(line=>line==='DeepSeek-Bot'));assert.ok(three.lines>2);
});

test('a punctuation boundary that cannot fit safely is unqualified and never silently edits the source',()=>{
 const text='字'.repeat(12)+'，'+'字'.repeat(11),layout=captionLayout(text);exact(text,layout);assert.equal(layout.within_safe_layout,false);assert.equal(layout.reason,'no-safe-word-boundary-within-two-lines');
});

test('caption layout is display-only: the source cue, actual timing and alignment evidence remain unchanged',()=>{
 const cue={text:'而是会直接影响一场戏的情绪。',start_seconds:29.431,end_seconds:32.117,alignment:'estimated-page-timing',word_alignment_verified:false,evidence:{segment_index:4,audio_sha256:'a'.repeat(64)}},before=structuredClone(cue),layout=captionLayout(cue.text);
 exact(cue.text,layout);assert.deepEqual(cue,before);assert.equal(layout.within_safe_layout,true);assert.equal(layout.lines,2);
 assert.equal(captionLayout('').within_safe_layout,false);assert.throws(()=>captionLayout(cue.text,0),/INPUT_INVALID/);
});

test('the producer ASS export uses natural wrapping with the original cue clock and locked 76px style',()=>{
 const cue={text:'而是会直接影响一场戏的情绪。',start_seconds:29.431,end_seconds:32.117,alignment:'estimated-page-timing',word_alignment_verified:false},before=structuredClone(cue),ass=buildPrivateAss([cue]);
 assert.match(ass,/Dialogue: 0,0:00:29\.43,0:00:32\.12,/);assert.match(ass,/Style: Default,Microsoft YaHei,76,/);
 assert.match(ass,/情绪。/);assert.doesNotMatch(ass,/情\\N绪/);assert.match(ass,/\\N/);assert.deepEqual(cue,before);
});
test('paragraph separators are a display concern and never force script edits, hidden rows or changed timing',()=>{
 const cue={text:'而是怎么在安全和发展之间先迈出一步。\n\n',start_seconds:10,end_seconds:13.9,alignment:'actual-segment-audio-boundaries',word_alignment_verified:false},before=structuredClone(cue),layout=captionLayout(cue.text),ass=buildPrivateAss([cue]);assert.deepEqual(cue,before);assert.equal(layout.within_safe_layout,true);assert.equal(layout.display_lines.join(''),'而是怎么在安全和发展之间先迈出一步。');assert.equal(layout.normal_size,76);assert.match(ass,/Dialogue: 0,0:00:10\.00,0:00:13\.90,/);assert.ok(!ass.includes('\\N\\N'));assert.equal(captionLayout('Alpha\nBeta').display_text,'Alpha Beta');
});
