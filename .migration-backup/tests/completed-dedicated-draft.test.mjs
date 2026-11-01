import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {completedDedicatedDraft} from '../scripts/production-autonomous-pass.mjs';

test('only a unique completed current site-bound draft can be left',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'completed-draft-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id='job_12345678-1234-1234-1234-123456789abc',rid='acl_'+'a'.repeat(64),draft='b'.repeat(32);
 const dir=path.join(root,'.sites-runtime','authorized-inputs',id,'revision-1','automatic-clone',rid);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'studio-draft.json'),JSON.stringify({draft_id:draft,request_id:rid}));
 const job={id,revision:1,is_test:false,status:'approved'},state={request:{id:rid,job_id:id},clone:{is_current:true,stage:'awaiting_second_review',result_video_sha256:'c'.repeat(64)}};
 const call=async q=>q.action==='read'?{job}:state;
 assert.equal(await completedDedicatedDraft({root,call,draft_id:draft}),true);
 for(const status of ['paused','cancelled']) {job.status=status;assert.equal(await completedDedicatedDraft({root,call,draft_id:draft}),false);}job.status='approved';
 state.clone.stage='provider_unknown';assert.equal(await completedDedicatedDraft({root,call,draft_id:draft}),false);state.clone.stage='awaiting_second_review';state.clone.is_current=false;assert.equal(await completedDedicatedDraft({root,call,draft_id:draft}),false);state.clone.is_current=true;state.request.id='acl_'+'d'.repeat(64);assert.equal(await completedDedicatedDraft({root,call,draft_id:draft}),false);state.request.id=rid;
 const dir2=path.join(root,'.sites-runtime','authorized-inputs',id,'revision-2','automatic-clone',rid);fs.mkdirSync(dir2,{recursive:true});fs.copyFileSync(path.join(dir,'studio-draft.json'),path.join(dir2,'studio-draft.json'));assert.equal(await completedDedicatedDraft({root,call,draft_id:draft}),false);
});
