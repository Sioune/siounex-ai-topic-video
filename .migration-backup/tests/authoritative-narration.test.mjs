import test from 'node:test';import assert from 'node:assert/strict';
import {deriveAuthoritativeNarration} from '../lib/authoritative-narration.mts';
const story=(a,b)=>[{start:0,end:3,narration:a,visual:'原始画面一',asset_id:'image_0'},{start:3,end:8,narration:b,visual:'原始画面二',asset_id:'image_1'}];
test('Chinese prose dash/comma allocation uses exact approved script, retaining every shot and original draft',()=>{
 const script='欧洲聊 AI，真正卡住的也许不是有没有人才，而是怎么先迈出一步。\n\n第二句完整收尾。',rows=story('欧洲聊 AI，真正卡住的也许不是有没有人才——','而是怎么先迈出一步。第二句完整收尾。'),before=JSON.stringify(rows),result=deriveAuthoritativeNarration(script,rows);
 assert.equal(result.storyboard.map(s=>s.narration).join(''),script);assert.match(result.storyboard[0].narration,/人才，$/);assert.equal(JSON.stringify(rows),before);for(let i=0;i<rows.length;i++)assert.deepEqual({...result.storyboard[i],narration:rows[i].narration},rows[i]);assert.equal(result.proof.script_changed,false);assert.equal(result.proof.ranges.at(-1).end,script.length);
});
test('exact historical whitespace-compatible input returns original rows without a new derivation/hash field',()=>{const rows=story('原稿第一句。','原稿第二句。'),r=deriveAuthoritativeNarration('原稿第一句。\n\n原稿第二句。',rows);assert.equal(r.storyboard,rows);assert.equal(r.proof,null)});
for(const [approved,old]of [['版本1.5可以用。','版本15可以用。'],['预算1,000元。','预算1000元。'],['支持C++工具。','支持C工具。'],['路径A/B有效。','路径AB有效。'],['范围1—3项。','范围13项。'],['不能自动发布。','能自动发布。'],['甲先讲，乙再讲。','乙先讲，甲再讲。'],['原稿第一句。原稿第二句。','原稿第一句。']])test('substantive tokens cannot be erased: '+approved,()=>{assert.throws(()=>deriveAuthoritativeNarration(approved,[{narration:old}]),/STORYBOARD_SCRIPT_MISMATCH/)});
test('punctuation differences do not permit splitting or merging numbered/code tokens',()=>{assert.throws(()=>deriveAuthoritativeNarration('范围1—3项，照原文。',story('范围13项——','照原文。')),/MISMATCH/)});
