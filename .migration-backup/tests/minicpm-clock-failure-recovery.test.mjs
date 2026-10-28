import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {knownFilterClockFailure,knownAnimationDurationFailure} from '../scripts/private-review-continuation.mjs';

test('the real failed plane can be identified without changing it or accepting a live lease',async t=>{
 const root=process.env.MINICPM_FAILURE_ROOT;if(!root){t.skip('real local failure snapshot not supplied');return;}
 const job='job_9ef39025-d92e-4770-82d0-05881451c5df',old='dfe23fdae9f621c4c559fb13e6b8cae09955bf51a428bd834a83c46b732698d7',dir=path.join(root,'.sites-runtime','authorized-inputs',job,'revision-3','private-review',old),start=JSON.parse(fs.readFileSync(path.join(dir,'producer-started.json')));
 const c={job:{id:job},binding:start.binding,material_resume_verified:{processed_audio:{}}},h={status:'blocked',lease_until:null,missing:[{code:'local-production:PRIVATE_PRODUCER_RESULT_UNKNOWN'}]},opts={root,inputHash:()=>old};
 assert.equal(await knownFilterClockFailure(c,h,opts),true);
 assert.equal(await knownFilterClockFailure(c,{...h,lease_until:'2099-01-01T00:00:00Z'},opts),false);
 assert.equal(await knownFilterClockFailure(c,{...h,status:'claimed'},opts),false);
 const completed={...h,status:'completed',missing:[]};
 assert.equal(await knownFilterClockFailure(c,completed,opts),false);
 assert.equal(await knownFilterClockFailure(c,completed,{...opts,knownExportGap:true}),true);
 assert.equal(await knownFilterClockFailure(c,{...completed,lease_until:1},{...opts,knownExportGap:true}),false);
 assert.equal(await knownFilterClockFailure({...c,job:{id:'job_other'}},h,opts),false);
 assert.equal(await knownFilterClockFailure(c,h,{...opts,inputHash:()=>('a'.repeat(64))}),false);
 assert.equal(await knownFilterClockFailure(c,h,{...opts,readFrames:async()=>({frames:1679,rate:'30/1',width:1024,height:576})}),false);
});

test('actual animation failure is isolated under a new output only for the same stopped 230-frame attempt',async t=>{
 const root=process.env.ANIME_FAILURE_ROOT;if(!root){t.skip('actual animation failure snapshot not supplied');return;}
 const job='job_120f0dc1-458c-49a7-8cdc-58353058538b',old='0ec0781e55de49dd589cbaae6085158ed3bce0b3aa34c735a34ca54955c4d250',dir=path.join(root,'.sites-runtime','authorized-inputs',job,'revision-1','private-review',old),start=JSON.parse(fs.readFileSync(path.join(dir,'producer-started.json'))),c={job:{id:job},binding:start.binding,material_resume_verified:{processed_audio:{}}},h={status:'blocked',lease_until:null,missing:[{code:'local-production:PRIVATE_VIDEO_RANGE_MISSING'}]},opts={root,inputHash:()=>old};
 assert.equal(await knownAnimationDurationFailure(c,h,opts),true);
 assert.equal(await knownAnimationDurationFailure(c,{...h,lease_until:1},opts),false);
 assert.equal(await knownAnimationDurationFailure(c,{...h,missing:[]},opts),false);
 assert.equal(await knownAnimationDurationFailure({...c,job:{id:'job_other'}},h,opts),false);
 assert.equal(await knownAnimationDurationFailure(c,h,{...opts,inputHash:()=>('a'.repeat(64))}),false);
 assert.equal(await knownAnimationDurationFailure(c,h,{...opts,readFrames:async()=>({frames:229,rate:'30/1'})}),false);
});
