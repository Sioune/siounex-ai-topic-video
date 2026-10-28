// Synthetic temporary source bytes only. No live Site, network or media tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {prepareNativeInputs,runNativePreparation} from '../scripts/native-preparation-consumer.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const JOB='job_11111111-1111-4111-8111-111111111111',QUEUE='native_prep_'+'a'.repeat(64),AT='2026-10-20T04:00:00Z';
function fixture(t,{images=2,source=true,title='SYNTHETIC article',sourceRequirements={}}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-native-preparation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceBytes=Buffer.from('<article>SYNTHETIC exact frozen full source article.</article>'),evidence=[{url:'https://example.org/SYNTHETIC-article',sha256:sha(sourceBytes)},...Array.from({length:images},(_,i)=>({url:'https://example.org/image-'+i+'.png',sha256:sha(Buffer.from('SYNTHETIC original image bytes '+i))}))];
 const draftRaw=JSON.stringify({script:'SYNTHETIC approved narration, unchanged.',storyboard:[{start:0,end:3,narration:'SYNTHETIC approved narration, unchanged.',visual:'SYNTHETIC existing source still, planned only.',asset_id:'image_0'}],media_readiness:{problems:[]},evidence}),scriptHash=sha(draftRaw),snapshot=JSON.stringify({url:'https://example.org/SYNTHETIC-article',title,...sourceRequirements}),binding={revision:2,script_hash:scriptHash,mode_epoch:1,contract_hash:'b'.repeat(64),scope_id:'SYNTHETIC-scope',scope:'preparation'},job={id:JOB,is_test:0,status:'approved',review_mode:'auto',revision:2,approved_revision:2,approved_hash:scriptHash,mode_epoch:1,contract_hash:binding.contract_hash,source_snapshot:snapshot,drafts:[{revision:2,content_hash:scriptHash,content:draftRaw}]},selection={job,native_preparation:{job_id:JOB,binding}};
 const base=path.join(root,'.sites-runtime/dispatch-sources',JOB,binding.contract_hash),imageDir=path.join(base,'source-images');fs.mkdirSync(imageDir,{recursive:true});
 const entries=[];
 if(source){fs.writeFileSync(path.join(base,'source.txt'),sourceBytes);fs.writeFileSync(path.join(base,'source-receipt.json'),JSON.stringify({source_snapshot_hash:sha(snapshot),url:JSON.parse(snapshot).url,sha256:sha(sourceBytes),complete_response:true}));for(let i=0;i<images;i++){const bytes=Buffer.from('SYNTHETIC original image bytes '+i),file=path.join(imageDir,'original-'+i+'.png');fs.writeFileSync(file,bytes);entries.push({file,url:'https://example.org/image-'+i+'.png',sha256:sha(bytes),size_bytes:bytes.length,width:2,height:2})}fs.writeFileSync(path.join(imageDir,'source-brief.json'),JSON.stringify({source_url:JSON.parse(snapshot).url,source_sha256:sha(sourceBytes),images:entries}))}
 return {root,selection,base,imageDir,entries,binding};
}
function service(binding,{loseProgress=false,recordProgress=true,loseRead=false,status='queued',artifacts=[]}={}){
 let state={queue_id:QUEUE,binding,status,version:1,missing:[{code:'old',detail:'SYNTHETIC old missing'}],checkpoint:{note:'SYNTHETIC queued',artifacts},invocation_id:null},calls=[];
 return {calls,state:()=>structuredClone(state),call:async body=>{calls.push(structuredClone(body));if(body.action==='native_preparation_ensure')return {handoff:structuredClone(state)};if(body.action==='native_preparation_claim'){if(state.status==='claimed')throw Error('Synthetic concurrent claim rejected');state={...state,status:'claimed',version:state.version+1,invocation_id:body.invocation_id,executor:body.executor};return {handoff:structuredClone(state),lease_token:'SYNTHETIC-secret-never-persisted'}}if(body.action==='native_preparation_progress'){assert.equal(body.version,state.version);assert.equal(body.lease_token,'SYNTHETIC-secret-never-persisted');if(recordProgress){const combined=[...state.checkpoint.artifacts,...body.artifacts].filter((a,i,all)=>all.findIndex(v=>JSON.stringify(v)===JSON.stringify(a))===i);state={...state,status:body.status,version:state.version+1,checkpoint:{note:body.note,artifacts:combined},missing:body.missing};}if(loseProgress)throw Error('Synthetic lost response');return {handoff:structuredClone(state)}}if(body.action==='native_preparation_read'){if(loseRead)throw Error('Synthetic read failure');return {handoff:structuredClone(state)}}throw Error('Unexpected side effect '+body.action)}};
}
function allFiles(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{const p=path.join(root,entry.name);return entry.isDirectory()?allFiles(p):[p]})}

test('consumer genuinely claims, restores exact source images and unchanged script, persists blocked facts and reads them back',async t=>{
 const f=fixture(t),s=service(f.binding),result=await runNativePreparation(f.selection,{call:s.call,root:f.root,now:()=>AT});
 assert.deepEqual(s.calls.map(c=>c.action),['native_preparation_ensure','native_preparation_claim','native_preparation_progress','native_preparation_read']);
 assert.equal(result.status,'native-preparation-returned');assert.equal(result.persisted,true);assert.equal(result.claimed,true);assert.equal(result.handoff_status,'blocked');assert.equal(result.image_count,2);assert.equal(result.artifacts_count,3);assert.equal(result.generation_started,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(f.root,result.manifest_file),'utf8')),plan=JSON.parse(fs.readFileSync(path.join(f.root,manifest.plan_file),'utf8'));
 assert.equal(manifest.ready,false);assert.equal(manifest.native_composition_started,false);assert.equal(plan.actual_native_timeline_created,false);assert.equal(plan.audio_generated,false);assert.equal(plan.video_generated,false);assert.deepEqual(plan.planned_storyboard,JSON.parse(f.selection.job.drafts[0].content).storyboard);assert.equal(plan.script_text,JSON.parse(f.selection.job.drafts[0].content).script);
 for(let i=0;i<2;i++)assert.deepEqual(fs.readFileSync(path.join(f.root,manifest.source_images[i].file)),fs.readFileSync(f.entries[i].file));
 assert.ok(s.state().missing.some(m=>m.code==='authorized-audio-unverified'));assert.ok(!s.state().missing.some(m=>m.code==='old'));assert.equal(result.handoff.invocation_id,s.calls[1].invocation_id);
 const names=allFiles(f.root).map(p=>path.basename(p));assert.ok(names.includes('approved-script.txt'));assert.ok(names.includes('source.txt'));assert.ok(!names.includes('ready.json'));assert.ok(!allFiles(f.root).some(p=>/\.(?:mp4|wav|mp3)$/i.test(p)));
 for(const file of allFiles(f.root))assert.ok(!fs.readFileSync(file).includes(Buffer.from('SYNTHETIC-secret-never-persisted')));assert.ok(!JSON.stringify(result).includes('SYNTHETIC-secret-never-persisted'));
});
test('repeated observation reuses byte-checked frozen preparation without another claim or write',async t=>{
 const f=fixture(t),s=service(f.binding),first=await runNativePreparation(f.selection,{call:s.call,root:f.root,now:()=>AT}),files=allFiles(f.root).map(p=>[p,sha(fs.readFileSync(p)),fs.statSync(p).mtimeMs]);
 const second=await runNativePreparation(f.selection,{call:s.call,root:f.root,now:()=>AT});assert.equal(second.reused,true);assert.equal(second.claimed,false);assert.equal(second.queue_id,first.queue_id);assert.equal(s.calls.filter(c=>c.action==='native_preparation_claim').length,1);assert.deepEqual(allFiles(f.root).map(p=>[p,sha(fs.readFileSync(p)),fs.statSync(p).mtimeMs]),files);
 const local=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});assert.equal(local.reused,true);assert.equal(local.artifacts.length,3);
});
test('a lost progress response is reconciled with one read, never repeated or reclaimed',async t=>{
 const f=fixture(t),s=service(f.binding,{loseProgress:true}),result=await runNativePreparation(f.selection,{call:s.call,root:f.root,now:()=>AT});assert.equal(result.persisted,true);assert.equal(result.reconciled_readback,true);assert.equal(s.calls.filter(c=>c.action==='native_preparation_claim').length,1);assert.equal(s.calls.filter(c=>c.action==='native_preparation_progress').length,1);assert.equal(s.calls.at(-1).action,'native_preparation_read');
});
test('a lost claim response only reads current state and never restores files without its token',async t=>{
 const f=fixture(t),s=service(f.binding),call=async body=>{const response=await s.call(body);if(body.action==='native_preparation_claim')throw Error('SYNTHETIC lost claim');return response},result=await runNativePreparation(f.selection,{call,root:f.root});assert.equal(result.status,'native-preparation-result-unknown');assert.equal(result.phase,'claim-readback-required');assert.equal(result.handoff.status,'claimed');assert.equal(result.claimed,true);assert.equal(result.claim_attempted,true);assert.equal(result.claim_result_unknown,false);assert.equal(result.retry_without_reconciliation,false);assert.deepEqual(s.calls.map(c=>c.action),['native_preparation_ensure','native_preparation_claim','native_preparation_read']);assert.equal(fs.existsSync(path.join(f.root,'.sites-runtime/authorized-inputs')),false);
});
for(const observation of ['still-queued','read-unavailable'])test('unconfirmed claim '+observation+' is reported as an attempt, without claiming it succeeded',async t=>{
 const f=fixture(t),s=service(f.binding,{loseRead:observation==='read-unavailable'}),calls=[],call=async body=>{calls.push(body.action);if(body.action==='native_preparation_claim'){if(observation==='read-unavailable')await s.call(body);throw Error('SYNTHETIC unknown claim')}return s.call(body)},result=await runNativePreparation(f.selection,{call,root:f.root});assert.equal(result.status,'native-preparation-result-unknown');assert.equal(result.claimed,false);assert.equal(result.claim_attempted,true);assert.equal(result.claim_result_unknown,true);assert.equal(result.retry_without_reconciliation,false);assert.deepEqual(calls,['native_preparation_ensure','native_preparation_claim','native_preparation_read']);assert.equal(fs.existsSync(path.join(f.root,'.sites-runtime/authorized-inputs')),false);
});
for(const lost of ['no-persist','read-unavailable'])test('unknown '+lost+' does not retry progress, re-claim or report completion',async t=>{
 const f=fixture(t),s=service(f.binding,{loseProgress:true,recordProgress:lost!=='no-persist',loseRead:lost==='read-unavailable'}),result=await runNativePreparation(f.selection,{call:s.call,root:f.root});assert.equal(result.status,'native-preparation-result-unknown');assert.equal(result.persisted,false);assert.equal(result.retry_without_reconciliation,false);assert.equal(s.calls.filter(c=>c.action==='native_preparation_claim').length,1);assert.equal(s.calls.filter(c=>c.action==='native_preparation_progress').length,1);
});
test('missing cache gives a real plan and exact cache gap, without fetching or fake source evidence',async t=>{
 const f=fixture(t,{source:false}),s=service(f.binding),result=await runNativePreparation(f.selection,{call:s.call,root:f.root});assert.equal(result.source_restored,false);assert.equal(result.image_count,0);assert.equal(result.artifacts_count,1);assert.ok(result.missing.some(m=>m.code==='frozen-source-cache-missing'));assert.ok(!allFiles(path.join(f.root,'.sites-runtime/authorized-inputs')).some(p=>path.basename(p)==='source.txt'));
});
test('corrupt original bytes stop before restoration and persist the specific local-check failure',async t=>{
 const f=fixture(t),s=service(f.binding);fs.appendFileSync(f.entries[0].file,'CHANGED');const result=await runNativePreparation(f.selection,{call:s.call,root:f.root});assert.equal(result.failure_code,'PREPARATION_IMAGE_BYTES_CHANGED');assert.equal(result.preparation_completed,false);assert.equal(result.artifacts_count,0);assert.equal(result.handoff_status,'blocked');assert.ok(result.missing.some(m=>m.code==='PREPARATION_IMAGE_BYTES_CHANGED'));assert.ok(!allFiles(path.join(f.root,'.sites-runtime/authorized-inputs')).some(p=>/approved-script|source-.*png|ready.json/.test(path.basename(p))));
});
test('legacy image receipts derive missing byte lengths from the exact frozen originals without refetching or rewriting them',t=>{
 const f=fixture(t),briefFile=path.join(f.imageDir,'source-brief.json'),brief=JSON.parse(fs.readFileSync(briefFile));for(const image of brief.images)delete image.size_bytes;fs.writeFileSync(briefFile,JSON.stringify(brief));
 const originals=[briefFile,...f.entries.map(i=>i.file)].map(file=>({file,bytes:fs.readFileSync(file),mtime:fs.statSync(file).mtimeMs}));t.mock.method(globalThis,'fetch',()=>{throw Error('SYNTHETIC legacy originals must never be fetched again');});
 const result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});assert.equal(result.image_count,2);for(let i=0;i<2;i++){assert.equal(result.source_images[i].size_bytes,f.entries[i].size_bytes);assert.equal(result.source_images[i].sha256,f.entries[i].sha256);assert.deepEqual(fs.readFileSync(path.join(f.root,result.source_images[i].file)),originals[i+1].bytes);}for(const original of originals){assert.deepEqual(fs.readFileSync(original.file),original.bytes);assert.equal(fs.statSync(original.file).mtimeMs,original.mtime);}
});
test('a missing legacy image byte length never bypasses the approved SHA or permits corrupt originals',t=>{
 const f=fixture(t),briefFile=path.join(f.imageDir,'source-brief.json'),brief=JSON.parse(fs.readFileSync(briefFile));delete brief.images[0].size_bytes;fs.writeFileSync(briefFile,JSON.stringify(brief));fs.appendFileSync(f.entries[0].file,'SYNTHETIC corrupt bytes');const before=fs.readFileSync(f.entries[0].file),originalBrief=fs.readFileSync(briefFile);
 assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE}),/PREPARATION_IMAGE_BYTES_CHANGED/);assert.deepEqual(fs.readFileSync(f.entries[0].file),before);assert.deepEqual(fs.readFileSync(briefFile),originalBrief);assert.ok(!allFiles(f.root).some(file=>path.basename(file)==='approved-script.txt'));
});
for(const invalid of [null,0,-1,'40'])test('an explicitly invalid legacy image byte length is rejected: '+JSON.stringify(invalid),t=>{
 const f=fixture(t),file=path.join(f.imageDir,'source-brief.json'),brief=JSON.parse(fs.readFileSync(file));brief.images[0].size_bytes=invalid;fs.writeFileSync(file,JSON.stringify(brief));assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE}),/PREPARATION_IMAGE_RECEIPT_INVALID/);
});
test('changed approved draft or queue binding rejects before claim and preserves approvals',async t=>{
 const f=fixture(t),s=service(f.binding);f.selection.job.drafts[0].content+=' ';await assert.rejects(()=>runNativePreparation(f.selection,{call:s.call,root:f.root}),/PREPARATION_APPROVED_DRAFT_CHANGED/);assert.equal(s.calls.length,0);
});
test('source receipt must name the exact frozen source snapshot and full response',t=>{
 const f=fixture(t),file=path.join(f.base,'source-receipt.json'),receipt=JSON.parse(fs.readFileSync(file,'utf8'));receipt.source_snapshot_hash='c'.repeat(64);fs.writeFileSync(file,JSON.stringify(receipt));assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE}),/PREPARATION_FROZEN_SOURCE_CHANGED/);
});
test('changing both cached article and matching receipt cannot replace the approved source bytes',t=>{
 const f=fixture(t),file=path.join(f.base,'source-receipt.json'),receipt=JSON.parse(fs.readFileSync(file,'utf8')),changed=Buffer.from('SYNTHETIC replacement article under same URL');fs.writeFileSync(path.join(f.base,'source.txt'),changed);receipt.sha256=sha(changed);fs.writeFileSync(file,JSON.stringify(receipt));assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE}),/PREPARATION_APPROVED_SOURCE_CHANGED/);
});
test('changing both image bytes and cache metadata cannot replace an image bound by approved evidence',t=>{
 const f=fixture(t),file=path.join(f.imageDir,'source-brief.json'),brief=JSON.parse(fs.readFileSync(file,'utf8')),changed=Buffer.from('SYNTHETIC replacement image under same URL');fs.writeFileSync(f.entries[0].file,changed);brief.images[0].sha256=sha(changed);brief.images[0].size_bytes=changed.length;fs.writeFileSync(file,JSON.stringify(brief));assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE}),/PREPARATION_APPROVED_IMAGE_CHANGED/);
});
test('an unreviewed original image remains preparation only when the approved draft has no image evidence',t=>{
 const f=fixture(t),draft=JSON.parse(f.selection.job.drafts[0].content);draft.evidence=draft.evidence.filter(e=>e.url==='https://example.org/SYNTHETIC-article');const raw=JSON.stringify(draft),hash=sha(raw);f.selection.job.approved_hash=hash;f.selection.job.drafts[0].content=raw;f.selection.job.drafts[0].content_hash=hash;f.binding.script_hash=hash;const result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE});assert.equal(result.image_count,2);assert.equal(result.ready,false);assert.equal(result.quality_approved,false);assert.ok(result.source_images.every(i=>i.visual_inspected_this_pass===false&&i.rights_status==='unconfirmed'));
});
test('output tampering never gets hidden by overwrite or a changed manifest',t=>{
 const f=fixture(t),first=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});fs.appendFileSync(path.join(f.root,first.source_images[0].file),'CHANGED');assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT}),/PREPARATION_OUTPUT_CHANGED/);
});
test('source images outside the exact cached source tree cannot enter a scoped preparation',t=>{
 const f=fixture(t),outside=path.join(f.root,'unrelated.png'),bytes=Buffer.from('SYNTHETIC unrelated bytes');fs.writeFileSync(outside,bytes);const file=path.join(f.imageDir,'source-brief.json'),brief=JSON.parse(fs.readFileSync(file,'utf8'));brief.images[0]={...brief.images[0],file:outside,sha256:sha(bytes),size_bytes:bytes.length};fs.writeFileSync(file,JSON.stringify(brief));assert.throws(()=>prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE}),/PREPARATION_IMAGE_BYTES_CHANGED/);
});
test('an active original session is observed without stealing its lease',async t=>{
 const f=fixture(t),s=service(f.binding,{status:'claimed'}),result=await runNativePreparation(f.selection,{call:s.call,root:f.root});assert.equal(result.claimed,false);assert.equal(result.handoff_status,'claimed');assert.deepEqual(s.calls.map(c=>c.action),['native_preparation_ensure']);assert.equal(fs.existsSync(path.join(f.root,'.sites-runtime/authorized-inputs')),false);
});
test('owner-required Chongzhen real gameplay comparison remains an explicit material gap',t=>{
 const f=fixture(t,{title:'同一场朝政危机，下两道相反诏令：AI崇祯游戏会怎样回应？'}),result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});assert.ok(result.missing.some(m=>m.code==='owner-gameplay-comparison-required'));assert.equal(result.ready,false);assert.equal(result.image_count,2);
});

function bindDraft(f,change){const d=JSON.parse(f.selection.job.drafts[0].content);change(d);const raw=JSON.stringify(d),hash=sha(raw);Object.assign(f.selection.job.drafts[0],{content:raw,content_hash:hash});f.selection.job.approved_hash=hash;f.binding.script_hash=hash;}
function authorDeclarations(f,{receipt=true}={}){
 const images=Array.from({length:3},(_,i)=>{const bytes=Buffer.from('SYNTHETIC previously approved author example '+i);return{id:'author-'+i,file:path.join(f.root,'.sites-runtime/author-cache/example-'+i+'.png'),url:'https://example.org/author/'+i+'.png',sha256:sha(bytes),width:4,height:3,bytes};});
 bindDraft(f,d=>{d.evidence.push(...images.map(({url,sha256})=>({url,sha256})));d.execution={receipt:{image_hashes:receipt?images.map(i=>i.sha256):[]}};d.media_readiness={required:true,blocked:true,problems:['SYNTHETIC legacy demonstration rule']};});return images;
}
function saveAuthorCache(f,images){
 const brief=path.join(f.root,'.sites-runtime/author-cache/production-brief.json');fs.mkdirSync(path.dirname(brief),{recursive:true});for(const image of images)fs.writeFileSync(image.file,image.bytes);fs.writeFileSync(brief,JSON.stringify({images:images.map(({bytes,...image})=>image)}));
 const ready=path.join(f.root,'.sites-runtime/authorized-inputs',JOB,'revision-1/ready.json');fs.mkdirSync(path.dirname(ready),{recursive:true});fs.writeFileSync(ready,JSON.stringify({revision:1,contract_hash:f.binding.contract_hash,production_brief_file:brief}));return brief;
}
function legacyPreparation(f){
 const result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT}),manifestFile=path.join(f.root,result.manifest_file),manifest=JSON.parse(fs.readFileSync(manifestFile)),planFile=path.join(f.root,manifest.plan_file),plan=JSON.parse(fs.readFileSync(planFile));
 // A pre-upgrade fixture: keep its original stale diagnostic as immutable history.
 delete plan.input_hash;delete manifest.input_hash;const gap={code:'required-demonstration-missing',detail:'SYNTHETIC legacy demonstration rule'};plan.missing.push(gap);manifest.missing.push(gap);const bytes=Buffer.from(JSON.stringify(plan,null,2));fs.writeFileSync(planFile,bytes);manifest.plan_sha256=sha(bytes);manifest.plan_size_bytes=bytes.length;const ref=manifest.files.find(f=>f.file===manifest.plan_file);ref.sha256=sha(bytes);ref.size_bytes=bytes.length;fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
 return{...result,artifacts:result.artifacts.map(a=>a.file===manifest.plan_file?{...a,sha256:sha(bytes),size_bytes:bytes.length}:a),manifest_file:result.manifest_file};
}
test('approved author images recover through exact current receipt SHA and URL without source HTML images or provider calls',t=>{
 const f=fixture(t,{images:0}),images=authorDeclarations(f);saveAuthorCache(f,images);const originalDraft=f.selection.job.drafts[0].content;t.mock.method(globalThis,'fetch',()=>{throw Error('Unexpected external call');});
 const result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});assert.equal(result.image_count,3);assert.ok(result.source_images.every(i=>i.kind==='approved-declared-image'&&i.approval_binding==='current-approved-draft-evidence-and-cli-image-receipt'));
 for(const image of result.source_images)assert.equal(sha(fs.readFileSync(path.join(f.root,image.file))),image.sha256);
 assert.ok(!result.missing.some(m=>['source-images-missing','required-demonstration-missing'].includes(m.code)));assert.ok(result.missing.some(m=>m.code==='preparation-only-scope'));assert.ok(result.missing.some(m=>m.code==='authorized-audio-unverified'));assert.equal(result.video_generated,false);assert.equal(result.new_paid_calls,0);assert.equal(result.ready,false);assert.equal(f.selection.job.drafts[0].content,originalDraft);
});
test('new author inputs supplement a legacy blocked plan, retain old bytes and append normal service artifacts exactly once',async t=>{
 const f=fixture(t,{images:0}),images=authorDeclarations(f),old=legacyPreparation(f),oldDir=path.dirname(path.join(f.root,old.manifest_file)),oldFiles=allFiles(oldDir).map(file=>[file,sha(fs.readFileSync(file)),fs.statSync(file).mtimeMs]),s=service(f.binding,{status:'blocked',artifacts:old.artifacts});saveAuthorCache(f,images);
 const result=await runNativePreparation(f.selection,{root:f.root,call:s.call,now:()=>AT});assert.equal(result.image_count,3);assert.match(result.manifest_file,/supplement-[a-f0-9]{64}/);assert.equal(result.claimed,true);assert.equal(result.handoff_status,'blocked');assert.equal(result.new_paid_calls,0);assert.ok(!result.missing.some(m=>m.code==='required-demonstration-missing'));
 const manifest=JSON.parse(fs.readFileSync(path.join(f.root,result.manifest_file)));assert.equal(manifest.supplement_of.sha256,oldFiles.find(([file])=>file===path.join(f.root,old.manifest_file))[1]);assert.match(manifest.input_hash,/^[a-f0-9]{64}$/);assert.ok(s.state().checkpoint.artifacts.some(a=>a.file===result.manifest_file));for(const a of old.artifacts)assert.ok(s.state().checkpoint.artifacts.some(x=>JSON.stringify(x)===JSON.stringify(a)));
 assert.deepEqual(oldFiles.map(([file])=>[file,sha(fs.readFileSync(file)),fs.statSync(file).mtimeMs]),oldFiles);const all=allFiles(f.root).map(file=>[file,sha(fs.readFileSync(file)),fs.statSync(file).mtimeMs]);
 const repeated=await runNativePreparation(f.selection,{root:f.root,call:s.call,now:()=>AT});assert.equal(repeated.reused,true);assert.equal(repeated.claimed,false);assert.equal(s.calls.filter(c=>c.action==='native_preparation_claim').length,1);assert.deepEqual(allFiles(f.root).map(file=>[file,sha(fs.readFileSync(file)),fs.statSync(file).mtimeMs]),all);
});
for(const defect of ['wrong-url','missing-receipt','wrong-contract'])test('declared image '+defect+' cannot borrow unrelated cached media',t=>{
 const f=fixture(t,{images:0}),images=authorDeclarations(f,{receipt:defect!=='missing-receipt'});if(defect==='wrong-url')images.forEach(i=>i.url='https://example.org/unapproved/'+i.id+'.png');saveAuthorCache(f,images);if(defect==='wrong-contract'){const ready=path.join(f.root,'.sites-runtime/authorized-inputs',JOB,'revision-1/ready.json'),v=JSON.parse(fs.readFileSync(ready));v.contract_hash='c'.repeat(64);fs.writeFileSync(ready,JSON.stringify(v));}
 const result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});assert.equal(result.image_count,0);assert.ok(result.missing.some(m=>m.code==='source-images-missing'));
});
test('approved author cache corruption cannot be hidden behind the declared SHA',async t=>{
 const f=fixture(t,{images:0}),images=authorDeclarations(f);saveAuthorCache(f,images);fs.appendFileSync(images[0].file,'CHANGED');const s=service(f.binding),result=await runNativePreparation(f.selection,{root:f.root,call:s.call});assert.equal(result.failure_code,'PREPARATION_DECLARED_IMAGE_BYTES_CHANGED');assert.equal(result.preparation_completed,false);assert.equal(result.artifacts_count,0);
});
test('trusted source explicit demonstration requirements remain blocked even with approved still images',t=>{
 const f=fixture(t,{images:0,sourceRequirements:{production_requirements:{demonstration_required:true}}}),images=authorDeclarations(f);saveAuthorCache(f,images);const result=prepareNativeInputs(f.selection,{root:f.root,queue_id:QUEUE,observed_at:AT});assert.equal(result.image_count,3);assert.ok(result.missing.some(m=>m.code==='required-demonstration-missing'));assert.equal(result.ready,false);
});
test('a lost supplement claim is only read back and cannot create a supplement or steal the unknown lease',async t=>{
 const f=fixture(t,{images:0}),images=authorDeclarations(f),old=legacyPreparation(f),s=service(f.binding,{status:'blocked',artifacts:old.artifacts});saveAuthorCache(f,images);const before=allFiles(f.root).map(file=>[file,sha(fs.readFileSync(file))]);
 const call=async body=>{const value=await s.call(body);if(body.action==='native_preparation_claim')throw Error('SYNTHETIC lost supplement claim');return value;};const first=await runNativePreparation(f.selection,{root:f.root,call});assert.equal(first.status,'native-preparation-result-unknown');assert.equal(first.retry_without_reconciliation,false);assert.deepEqual(allFiles(f.root).map(file=>[file,sha(fs.readFileSync(file))]),before);
 const next=await runNativePreparation(f.selection,{root:f.root,call:s.call});assert.equal(next.claimed,false);assert.equal(next.handoff_status,'claimed');assert.equal(s.calls.filter(c=>c.action==='native_preparation_claim').length,1);
});
test('unknown supplement progress preserves local evidence and never reclaims to append again',async t=>{
 const f=fixture(t,{images:0}),images=authorDeclarations(f),old=legacyPreparation(f),s=service(f.binding,{status:'blocked',artifacts:old.artifacts,loseProgress:true,recordProgress:false});saveAuthorCache(f,images);
 const first=await runNativePreparation(f.selection,{root:f.root,call:s.call});assert.equal(first.status,'native-preparation-result-unknown');assert.equal(first.persisted,false);assert.equal(first.retry_without_reconciliation,false);const files=allFiles(f.root).map(file=>[file,sha(fs.readFileSync(file))]);
 await runNativePreparation(f.selection,{root:f.root,call:s.call});assert.equal(s.calls.filter(c=>c.action==='native_preparation_claim').length,1);assert.equal(s.calls.filter(c=>c.action==='native_preparation_progress').length,1);assert.deepEqual(allFiles(f.root).map(file=>[file,sha(fs.readFileSync(file))]),files);
});


test('text and cached source preparation uses only preparation and releases it before return',async t=>{const f=fixture(t),s=service(f.binding),seen=[];let active=null;const r=await runNativePreparation(f.selection,{root:f.root,call:async b=>{if(b.action==='native_preparation_claim')assert.equal(active,'preparation');if(b.action==='native_preparation_progress')assert.equal(active,null);return s.call(b)},workstations:{run:async(kind,job,fn)=>{assert.equal(job,JOB);assert.equal(active,null);active=kind;seen.push(kind);try{return await fn()}finally{active=null}}}});assert.equal(r.status,'native-preparation-returned');assert.deepEqual(seen,['preparation']);});
test('waiting for text preparation budget never claims a native invocation',async t=>{const f=fixture(t),s=service(f.binding),r=await runNativePreparation(f.selection,{root:f.root,call:s.call,workstations:{run:async()=>{throw Object.assign(Error('SYNTHETIC wait'),{code:'PRODUCTION_STATION_BUDGET_DEFERRED'})}}});assert.equal(r.status,'native-preparation-budget-deferred');assert.equal(r.claimed,false);assert.deepEqual(s.calls.map(b=>b.action),['native_preparation_ensure']);});
