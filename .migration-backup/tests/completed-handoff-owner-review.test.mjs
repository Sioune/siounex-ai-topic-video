import test from 'node:test';
import assert from 'node:assert/strict';
import {completedHandoffAwaitsOwnerReview} from '../scripts/production-autonomous-pass.mjs';

test('a completed old handoff does not replace the current node review video',()=>{
 const video={node:'video',revision:3,mode_epoch:0,artifact_version:5,id:'video-v5',artifact_hash:'hash-v5',status:'awaiting_human'};
 const job={review_mode:'node',revision:3,mode_epoch:0,milestones:[video]};
 const h={status:'completed',lease_until:null,reconciliation:null,base_pending_video:{id:video.id,artifact_hash:video.artifact_hash,artifact_version:video.artifact_version}};
 assert.equal(completedHandoffAwaitsOwnerReview(job,h),true);
 assert.equal(completedHandoffAwaitsOwnerReview({...job,review_mode:'auto'},h),false);
 assert.equal(completedHandoffAwaitsOwnerReview({...job,milestones:[{...video,status:'revise'}]},h),false);
 assert.equal(completedHandoffAwaitsOwnerReview(job,{...h,reconciliation:{state:'unknown'}}),false);
 assert.equal(completedHandoffAwaitsOwnerReview(job,{...h,status:'claimed'}),false);
 assert.equal(completedHandoffAwaitsOwnerReview(job,{...h,base_pending_video:{...h.base_pending_video,id:'other'}}),false);
});
