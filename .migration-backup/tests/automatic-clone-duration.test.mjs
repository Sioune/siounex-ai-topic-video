import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planCloneDuration,validateCloneDurationPolicy,CLONE_DURATION_POLICY,LEGACY_CLONE_DURATION_POLICY} from '../lib/automatic-clone-duration.mts';
import {OWNER_BODY_PACE_TEMPO,OWNER_BODY_PACE_POLICY,OWNER_BODY_PACE_POLICY_JSON,OWNER_BODY_PACE_POLICY_SHA256} from '../lib/owner-body-pace.mts';

const context=p=>({raw_body_seconds:p.raw_body_seconds,outro_frames:p.original_outro_frames,result_total_seconds:(p.body_frames+p.original_outro_frames)/30});
// Frozen historical v1 shape, constructed independently of the new planner.
function legacy(raw,tail){const total=raw+tail/30,max=1800-tail,speed=total>60+1e-7||Math.ceil(raw*30-1e-7)>max,target=Math.min(1680,max-1),tempo=speed?Math.max(1,Math.ceil(raw/(target/30-.04)*1000)/1000):1,processed=raw/tempo;return{schema:'automatic-clone-duration-policy-v1',policy:LEGACY_CLONE_DURATION_POLICY,raw_body_seconds:raw,original_outro_frames:tail,source_total_seconds:total,max_source_total_seconds:70,target_total_frames:1800,tempo,processed_body_seconds:processed,body_frames:Math.max(90,Math.ceil(processed*30-1e-7)),source_audio_complete:true,speech_trimmed:false,preserve_pitch:true,body_only:true};}

test('shared body pace has one stable pure hash, with v5 reference and an unchanged ending clock',()=>{
 assert.equal(OWNER_BODY_PACE_TEMPO,1.15);assert.equal(OWNER_BODY_PACE_POLICY.body_tempo,1.15);assert.equal(OWNER_BODY_PACE_POLICY.preserve_pitch,true);assert.equal(OWNER_BODY_PACE_POLICY.reference_outro_policy,'outro-v5-20261021');assert.equal(OWNER_BODY_PACE_POLICY.outro_playback_rate,1);assert.equal(OWNER_BODY_PACE_POLICY.material_source_speed,1);assert.equal(OWNER_BODY_PACE_POLICY.timeline_clock,'same-body-tempo');assert.equal(OWNER_BODY_PACE_POLICY.duration_control,'script-length-at-fixed-pace');assert.equal(Object.isFrozen(OWNER_BODY_PACE_POLICY),true);assert.equal(createHash('sha256').update(OWNER_BODY_PACE_POLICY_JSON).digest('hex'),OWNER_BODY_PACE_POLICY_SHA256);assert.notEqual(createHash('sha256').update(OWNER_BODY_PACE_POLICY_JSON.replace('1.15','1')).digest('hex'),OWNER_BODY_PACE_POLICY_SHA256);
});

for(const tail of [119,120])for(const total of [30,45,60,60.01,66.3])test('every new complete '+total+'s recording uses fixed1.15 and original '+tail+' tail frames',()=>{
 const raw=total-tail/30,p=planCloneDuration({raw_body_seconds:raw,outro_frames:tail});assert.equal(p.schema,'automatic-clone-duration-policy-v2');assert.equal(p.policy,CLONE_DURATION_POLICY);assert.equal(p.tempo,1.15);assert.equal(p.pace_policy_sha256,OWNER_BODY_PACE_POLICY_SHA256);assert.equal(p.original_outro_frames,tail);assert.equal(p.source_total_seconds,total);assert.equal(p.processed_body_seconds,raw/1.15);assert.ok(p.body_frames+tail<=1800);assert.equal(p.source_audio_complete,true);assert.equal(p.speech_trimmed,false);assert.equal(p.preserve_pitch,true);assert.equal(p.body_only,true);assert.equal(validateCloneDurationPolicy(p,context(p)),true);assert.equal('max_source_total_seconds' in p,false);
});

for(const tail of [119,120])test('fixed pace frame boundary is exact for tail '+tail+' and never raises speed to squeeze longer copy',()=>{
 const maxBody=(1800-tail)/30,raw=maxBody*1.15,p=planCloneDuration({raw_body_seconds:raw,outro_frames:tail,max_tempo:1.15});assert.equal(p.body_frames+tail,1800);assert.equal(p.tempo,1.15);assert.throws(()=>planCloneDuration({raw_body_seconds:raw+.1,outro_frames:tail,max_tempo:1.3}),e=>e.code==='AUTOMATIC_CLONE_RENDER_BLOCKED'&&e.reason_code==='OWNER_SCRIPT_REVISION_REQUIRED'&&e.detail.includes('固定1.15'));
});

test('the old66.3s body evidence fits at the fixed pace while a still-long fixed result requests script adjustment',()=>{
 const p=planCloneDuration({raw_body_seconds:62.333333333333336,outro_frames:119});assert.equal(p.tempo,1.15);assert.ok((p.body_frames+119)/30<60);
 for(const raw of [65,67,75,80])assert.throws(()=>planCloneDuration({raw_body_seconds:raw,outro_frames:119}),e=>e.reason_code==='OWNER_SCRIPT_REVISION_REQUIRED'&&e.detail.includes('固定1.15')&&!e.detail.includes('超过70'));
});

test('actual processed clock is verified in full and cannot be silently shortened or accelerated again',()=>{
 const raw=62.333333333333336,first=planCloneDuration({raw_body_seconds:raw,outro_frames:119}),actual=raw/1.15+.015,p=planCloneDuration({raw_body_seconds:raw,outro_frames:119,tempo_override:1.15,processed_body_seconds:actual});assert.equal(p.processed_body_seconds,actual);assert.equal(p.tempo,first.tempo);assert.ok(p.body_frames+119<=1800);
 for(const processed of [NaN,Infinity,-1,45])assert.throws(()=>planCloneDuration({raw_body_seconds:raw,outro_frames:119,processed_body_seconds:processed}),/PROCESSED_AUDIO_CHANGED/);
 for(const tempo of [1,1.1,1.151,1.3,NaN,Infinity])assert.throws(()=>planCloneDuration({raw_body_seconds:raw,outro_frames:119,tempo_override:tempo}),/TEMPO_INVALID/);
 assert.throws(()=>planCloneDuration({raw_body_seconds:raw,outro_frames:119,max_tempo:1.1}),/TEMPO_INVALID/);
 const boundary=(1800-119)/30;assert.throws(()=>planCloneDuration({raw_body_seconds:boundary*1.15,outro_frames:119,processed_body_seconds:boundary+.015}),e=>e.reason_code==='OWNER_SCRIPT_REVISION_REQUIRED');
});

test('v2 evidence binds fixed pace hash, complete audio, body frame clock and unchanged ending',()=>{
 const p=planCloneDuration({raw_body_seconds:50,outro_frames:119}),c=context(p);assert.equal(validateCloneDurationPolicy(p,c),true);
 for(const patch of [{schema:'automatic-clone-duration-policy-v1'},{schema:'unknown'},{policy:LEGACY_CLONE_DURATION_POLICY},{pace_policy_sha256:'a'.repeat(64)},{tempo:1},{tempo:1.3},{raw_body_seconds:NaN},{raw_body_seconds:49},{processed_body_seconds:30},{body_frames:p.body_frames-1},{source_total_seconds:60},{source_audio_complete:false},{speech_trimmed:true},{body_only:false},{preserve_pitch:false},{duration_control:'variable-speed'},{unknown:'field'}])assert.equal(validateCloneDurationPolicy({...p,...patch},c),false,JSON.stringify(patch));
 assert.equal(validateCloneDurationPolicy(p,{...c,outro_frames:120}),false);assert.equal(validateCloneDurationPolicy(p,{...c,result_total_seconds:c.result_total_seconds-1}),false);
});

for(const tail of [119,120])for(const total of [45,60,66.3,70])test('frozen v1 '+total+'s evidence with tail '+tail+' retains its original speed and exact schema',()=>{
 const p=legacy(total-tail/30,tail),before=JSON.stringify(p);assert.equal(validateCloneDurationPolicy(p,context(p)),true);assert.equal(JSON.stringify(p),before);if(total<=60)assert.equal(p.tempo,1);assert.equal('pace_policy_sha256' in p,false);
 for(const patch of [{tempo:1.15},{policy:CLONE_DURATION_POLICY},{schema:'automatic-clone-duration-policy-v2'},{pace_policy_sha256:OWNER_BODY_PACE_POLICY_SHA256},{source_audio_complete:false},{body_frames:p.body_frames-1}])assert.equal(validateCloneDurationPolicy({...p,...patch},context(p)),false);
});

test('legacy proofs retain the original70s ceiling and cannot be relabeled as new fixed pace',()=>{
 const p=legacy(71-119/30,119);assert.equal(validateCloneDurationPolicy(p,context(p)),false);assert.equal(validateCloneDurationPolicy({...p,schema:'automatic-clone-duration-policy-v2',policy:CLONE_DURATION_POLICY},context(p)),false);
});
