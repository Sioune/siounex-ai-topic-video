import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileMotionSequence} from '../scripts/content-motion-media.mjs';

test('a word-for-word grounded placeholder is refused before FFmpeg, intent or a derived video is written',async t=>{
 const jobDir=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-placeholder-'));
 t.after(()=>fs.rmSync(jobDir,{recursive:true,force:true}));
 const script='系统先采集，再审核，最后制作视频。';
 let commands=0;
 await assert.rejects(()=>compileMotionSequence({jobDir,script,task_index:0,frames:180,source_media:[],shots:[{
  kind:'mechanism',frames:180,source_start_frame:0,
  mechanism:{type:'process-flow',nodes:['采集','审核','制作'],grounded_excerpt:script},
  visible_content:'三个步骤逐次高亮，连接处有移动光点',supports_narration:script,role:'explanation',relevance:'direct'
 }]},{command:async()=>{commands++;},probe:async()=>{throw Error('must not probe');}}),{code:'MOTION_MECHANISM_SPECIFIC_VISUAL_REQUIRED'});
 assert.equal(commands,0);
 assert.deepEqual(fs.readdirSync(jobDir),[]);
});
