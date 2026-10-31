import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectNativeCoverHistory} from '../scripts/native-cover-reconciliation.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
test('unknown prior video remains untouched while current video differs; same video or request remains blocked',t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'cover-prior-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const binding={revision:2,script_hash:'a'.repeat(64),candidate_sha256:'b'.repeat(64)},old={job_id:'job-one',request_id:'aigc_cover_'+'1'.repeat(64),binding,video_sha256:'b'.repeat(64)},dir=path.join(base,old.request_id),role=path.join(dir,'cover_3_4');fs.mkdirSync(role,{recursive:true});
 const raw=JSON.stringify({request:old}),intent={request_id:old.request_id,request_sha256:sha(raw),binding,video_sha256:old.video_sha256,role:'cover_3_4'},intentText=JSON.stringify(intent);fs.writeFileSync(path.join(dir,'request.json'),raw);fs.writeFileSync(path.join(role,'intent.json'),intentText);
 const current={...old,request_id:'aigc_cover_'+'2'.repeat(64),video_sha256:'c'.repeat(64),binding:{...binding,candidate_sha256:'c'.repeat(64)}};
 const found=inspectNativeCoverHistory(base,{currentRequest:current});assert.equal(found.length,1);assert.equal(found[0].status,'prior-video-result-unknown');assert.equal(found[0].request_id,old.request_id);assert.equal(fs.readFileSync(path.join(role,'intent.json'),'utf8'),intentText);
 for(const c of [{...current,video_sha256:old.video_sha256,binding},{...current,request_id:old.request_id},{...current,job_id:'other'},{...current,binding:{...current.binding,script_hash:'d'.repeat(64)}},{...current,binding:{...current.binding,revision:3}}])assert.throws(()=>inspectNativeCoverHistory(base,{currentRequest:c}),/NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED/);
 assert.throws(()=>inspectNativeCoverHistory(base),/NATIVE_COVER_PRIOR_RESULT_RECONCILIATION_REQUIRED/);
});
