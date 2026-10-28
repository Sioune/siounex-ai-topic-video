import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {motionSha as sha,motionShotIssues} from '../lib/content-motion-contract.mts';
import {compileMotionSequence,projectMotionShots,validatedIllustrativeMechanism} from '../scripts/content-motion-media.mjs';
import {validateMotionSelection,motionPlanPrompt} from '../scripts/content-motion-plan.mjs';
import {pixelMotion} from '../scripts/content-motion-qa.mjs';
const script='PHP 内存处理可能出错。这两个漏洞评分达到 9.2 分。';
const metadata=source_sha256=>({schema:'grounded-process-illustration-v1',source_sha256,script_sha256:sha(script),grounded_excerpts:['内存处理可能出错','两个漏洞评分达到 9.2 分'],states:['请求触发','内存处理出错','漏洞评分 9.2'],illustrative:true});
const source_sha256=sha('illustration');
const media={asset_id:'illustration',kind:'video',sha256:source_sha256,illustrative_mechanism:metadata(source_sha256),video_review:{duration_seconds:3,frames:[{frame_id:'f1'}]}};
const shot={kind:'video',asset_id:'illustration',frames:85,source_start_frame:0,visible_content:'内存出错及评分的过程示意',supports_narration:'漏洞评分',role:'core',relevance:'direct',hook:false,hook_reprise:false,frame_ids:['f1'],mechanism:null};
const tasks=[{index:0,needs_actual_case:false}];const value={short_title:'PHP 漏洞评分',segments:[{index:0,shots:[shot]}]};
const options={tasks,timing:[85],media:[media],script};
test('illustration remains explicitly simulated and cannot satisfy an actual-case requirement',()=>{
 assert.equal(validatedIllustrativeMechanism(media,script).illustrative,true);
 const flat=validateMotionSelection(value,options);assert.equal(flat[0].illustrative,true);
 const o={classification:'mechanism-process',meaningful_change:true,what_changed:'过程状态变化',frame_sha256:[sha('1'),sha('2')],text_only:false,relevance:'direct',duplicate_of:null};
 assert.equal(motionShotIssues([{...flat[0],measured_motion:true,observation:o}],85,{observed:true}).issues.length,0);
 assert.ok(motionShotIssues([{...flat[0],illustrative:false,measured_motion:true,observation:o}],85,{observed:true}).issues.some(x=>x.code==='MOTION_UNDECLARED_SIMULATION'));
 assert.throws(()=>validateMotionSelection(value,{...options,tasks:[{index:0,needs_actual_case:true}]}),{code:'MOTION_ACTUAL_CASE_REQUIRED'});
 assert.throws(()=>validateMotionSelection(value,{...options,tasks:[{index:0,needs_actual_case:false,requires_existing_video:true}]}),{code:'MOTION_CLOSING_VIDEO_REQUIRED'});
 assert.throws(()=>validatedIllustrativeMechanism({...media,illustrative_mechanism:{...media.illustrative_mechanism,source_sha256:sha('wrong')}},script),{code:'MOTION_MECHANISM_FACT_BINDING_REQUIRED'});
 assert.throws(()=>validatedIllustrativeMechanism(media,script+'新增内容'),{code:'MOTION_MECHANISM_FACT_BINDING_REQUIRED'});
 assert.match(motionPlanPrompt({...options,current_timing:[85]}),/依据已审口播绘制的过程示意/);
});

test('real 85-frame PHP illustration compiles from its source, stays labelled and has measurable pixels, without quality approval',{skip:!process.env.PHP_ILLUSTRATION_MP4||!process.env.PHP_APPROVED_SCRIPT},async t=>{
 const script=fs.readFileSync(process.env.PHP_APPROVED_SCRIPT,'utf8'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'php-illustration-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'source.mp4');fs.copyFileSync(process.env.PHP_ILLUSTRATION_MP4,file);
 const hash=sha(fs.readFileSync(file)),i={schema:'grounded-process-illustration-v1',source_sha256:hash,script_sha256:sha(script),grounded_excerpts:['内存不够','这两个漏洞评分达到 9.2 分'],states:['远程请求','内存处理出错','漏洞评分'],illustrative:true};
 const m={asset_id:'php-illustration',kind:'video',file,sha256:hash,source_url:'https://siounex-ai-topic-library.siounexzhao.chatgpt.site/production',video_review:{duration_seconds:3},illustrative_mechanism:i},s={...shot,asset_id:m.asset_id};
 const r=await compileMotionSequence({shots:[s],task_index:4,jobDir:dir,script,source_media:[m],frames:85});assert.equal(r.frames,85);assert.equal(r.quality_approved,false);assert.equal(r.new_speech_calls,0);assert.equal(r.shots[0].illustrative_mechanism.illustrative,true);
 const p=projectMotionShots({source_to_timeline:[{index:4,start_frame:0,end_frame:85,media:{content_motion_sequence:r}}]});assert.equal(p[0].illustrative,true);assert.equal(p[0].source_sha256,hash);
 const decoded=spawnSync('ffmpeg',['-v','error','-i',r.file,'-vf','scale=160:90,format=gray','-f','rawvideo','pipe:1'],{maxBuffer:3000000});assert.equal(decoded.status,0);const f=n=>decoded.stdout.subarray(n*14400,(n+1)*14400);for(const [a,b] of [[5,23],[33,51],[61,80]])assert.equal(pixelMotion(f(a),f(b)).measured_motion,true);
});

test('a new supplied process clip reaches actual selection before repeating unchanged gap research',{skip:!process.env.PHP_ILLUSTRATION_MP4},async t=>{
 const {ensureAutomaticMaterialPlan}=await import('../scripts/automatic-material-plan.mjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'php-candidate-pool-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const id='job_11111111-2222-4333-8444-555555555555',dir=path.join(root,'.sites-runtime/authorized-inputs',id,'revision-1');fs.mkdirSync(path.join(dir,'content-motion'),{recursive:true});
 const draft={script,storyboard:[{narration:script,asset_id:'pending_video',visual:'说明漏洞评分',start:0,end:2}]},raw=JSON.stringify(draft),binding={revision:1,script_hash:sha(raw),mode_epoch:2,contract_hash:'c'.repeat(64),scope_id:'scope-1'},scope={id:'scope-1',scope:'private-video',owner_confirmed:true,authorization_source:'owner-private-video',new_paid_authorization:false,publication_authorization:false,binding:{revision:1,script_hash:binding.script_hash,mode_epoch:2,contract_hash:binding.contract_hash}},job={id,status:'approved',review_mode:'node',revision:1,approved_revision:1,approved_hash:binding.script_hash,mode_epoch:2,contract_hash:binding.contract_hash,review_note:'',source_snapshot:JSON.stringify({title:'PHP 漏洞',url:'https://example.org/SYNTHETIC'}),media_continuation:{scope},drafts:[{revision:1,content_hash:binding.script_hash,content:raw}]};
 const file=path.join(dir,'candidate.mp4');fs.copyFileSync(process.env.PHP_ILLUSTRATION_MP4,file);const hash=sha(fs.readFileSync(file)),candidate={asset_id:'illustration',kind:'video',file,sha256:hash,size_bytes:fs.statSync(file).size,source_url:'https://example.org/SYNTHETIC',probe:{duration_seconds:3},illustrative_mechanism:metadata(hash)};fs.writeFileSync(path.join(dir,'material-plan-candidates.json'),JSON.stringify({job_id:id,binding,media:[candidate]}));fs.writeFileSync(path.join(dir,'content-motion/latest-export-gap.json'),JSON.stringify({feedback_sha256:sha(''),gap_sha256:sha('gap'),details:[]}));
 let calls=0;const runCli=async a=>{calls++;const p=JSON.parse(a.prompt.slice(a.prompt.indexOf('{'))),attached=p.media.find(m=>m.asset_id==='illustration');assert.equal(attached.illustrative_mechanism.illustrative,true);assert.equal(p.tasks[0].required_frames,90);fs.writeFileSync(a.output,JSON.stringify({short_title:'漏洞评分说明',segments:[{index:0,shots:[{...shot,frames:90,frame_ids:[p.attachments[0].frame_id]}]}]}));return{error_code:'CLI_COMPLETED',exit_code:0};};
 const result=await ensureAutomaticMaterialPlan({job,binding,media:[],root},{runCli,research:()=>{throw Error('new supplied candidate should be tried before repeated research')},discover:()=>{throw Error('new supplied candidate already has enough duration')}});assert.equal(calls,1);assert.equal(result.media[0].content_motion_sequence.shots[0].illustrative_mechanism.illustrative,true);assert.equal(result.material_coverage.segments[0].contains_illustrative,true);assert.match(result.visual_plan.storyboard[0].visual,/原理示意/);assert.equal(result.automatic_editing.quality_approved,false);
});
