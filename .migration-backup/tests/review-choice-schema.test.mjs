import test from 'node:test';import assert from 'node:assert/strict';import {reviewEvidenceChoices} from '../scripts/review-evidence.mjs';
test('schema choices are bounded exact spans without forbidden control characters',()=>{
 const item={title:'真实原题',script:'第一行事实\n第二行事实\t第三行事实',facts:Array.from({length:500},(_,i)=>'事实'+i+'abcdefghijklmnopqrstuvwxyz')},artifact=JSON.stringify(item),source='原始正文\r\n时间 2026/10/9 17:17:14';
 const choices=reviewEvidenceChoices(artifact,[{text:source}]),corpus=[item.title,item.script,...item.facts,source].join('\n');
 assert.ok(choices.includes('第一行事实'));assert.ok(choices.includes('第二行事实'));assert.ok(choices.length<=180);assert.ok(choices.every(s=>s.length<=25&&!/[\u0000-\u001f]/.test(s)&&corpus.includes(s)));assert.ok(choices.reduce((n,s)=>n+s.length,0)<=4500);
});
test('nested receipt JSON and Windows paths cannot introduce strict-schema quotes or backslashes',()=>{
 const value={note:'Original "quoted source" is intact',receipt:JSON.stringify({path:'C:\\media\\cover.png',reason:'exact original text'})},artifact=JSON.stringify(value),choices=reviewEvidenceChoices(artifact,[]),corpus=Object.values(value).join('\n');
 assert.ok(choices.length>0);assert.ok(choices.every(s=>!/[\u0000-\u001f"\\]/.test(s)&&corpus.includes(s)));assert.ok(choices.includes('quoted source'));
});
