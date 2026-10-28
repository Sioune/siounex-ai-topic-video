import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {videoHasRequiredFrames,knownFrameBoundaryRetry} from '../scripts/private-review-producer.mjs';

const actual={format:{duration:'8.333333'},streams:[{codec_type:'video',r_frame_rate:'30/1',avg_frame_rate:'30/1',time_base:'1/30000',duration_ts:250000,nb_frames:'250'}]};
test('microsecond display rounding accepts the exact 250-frame boundary',()=>{
 assert.equal(videoHasRequiredFrames(actual,0,250),true);
 assert.equal(videoHasRequiredFrames(actual,1,220),true);
});
test('rounding exception requires exact frame count and exact timebase',()=>{
 for(const stream of [{...actual.streams[0],nb_frames:'249'},{...actual.streams[0],duration_ts:249969},{...actual.streams[0],avg_frame_rate:'29/1'},{...actual.streams[0],time_base:'N/A'},{...actual.streams[0],nb_frames:'N/A'}])assert.equal(videoHasRequiredFrames({...actual,streams:[stream]},0,250),false);
 assert.equal(videoHasRequiredFrames(actual,0,251),false);
 assert.equal(videoHasRequiredFrames(actual,0.000001,250),false);
 assert.equal(videoHasRequiredFrames({...actual,format:{duration:'8.332'}},0,250),false);
 assert.equal(videoHasRequiredFrames({...actual,format:{duration:'N/A'}},0,250),false);
});
test('sub-millisecond last timestamp with the entire 230-frame stream is accepted; genuinely short streams are not',()=>{const p={format:{duration:'7.666000'},streams:[{codec_type:'video',r_frame_rate:'30/1',avg_frame_rate:'115000/3833',time_base:'1/30000',duration_ts:229980,nb_frames:'230'}]};assert.equal(videoHasRequiredFrames(p,0,230),true);assert.equal(videoHasRequiredFrames({...p,streams:[{...p.streams[0],nb_frames:'229'}]},0,230),false);assert.equal(videoHasRequiredFrames({...p,format:{duration:'7.632667'},streams:[{...p.streams[0],nb_frames:'229',duration_ts:229000}]},0,230),false);assert.equal(videoHasRequiredFrames({...p,streams:[{...p.streams[0],duration_ts:229969}]},0,230),false);});
test('actual animation fourth segment decodes all 230 frames despite the shorter container duration',{skip:!process.env.ANIME_CURRENT_PROJECT},()=>{const dir=path.dirname(process.env.ANIME_CURRENT_PROJECT),p=JSON.parse(fs.readFileSync(process.env.ANIME_CURRENT_PROJECT)),s=p.source_to_timeline[3],file=path.resolve(dir,s.media.file),probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,nb_frames,r_frame_rate,avg_frame_rate,time_base,duration_ts','-of','json',file],{encoding:'utf8'}));assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),s.media.sha256);assert.equal(s.end_frame-s.start_frame,230);assert.equal(Number(probe.format.duration)<230/30,true);assert.equal(videoHasRequiredFrames(probe,0,230),true);const raw=execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames','-of','json',file],{encoding:'utf8'});assert.equal(Number(JSON.parse(raw).streams[0].nb_read_frames),230);});
test('existing complete-video behavior remains available for longer ordinary clips',()=>{
 assert.equal(videoHasRequiredFrames({format:{duration:'20'},streams:[]},2,250),true);
 assert.equal(videoHasRequiredFrames(actual,-1,250),false);
});
test('only the exact diagnosed MiniCPM input receives a new visual recovery identity',()=>{
 const x={job:{id:'job_9ef39025-d92e-4770-82d0-05881451c5df'},binding:{script_hash:'253d179d7cc75d5eb9b2b1d04f179333ea4a028206894afd0d96e1b4c3f86a2e'},media:[{sha256:'68d914af61236b9e73422b4283d2cadfd417dcb13db1c89ca71315f7efd8bcce'}]};
 const c={material_resume_verified:{processed_audio:{voice:{sha256:'ce166b4c6bd23de4bd08907c3483fd628e5cc7e0b08cda96a582a81a6766625e'},project:{sha256:'31f6b3cec45ec8b671d1220313e7975f96a098f86bf61b9cc5ffd527c7a58892'}}}};
 assert.equal(knownFrameBoundaryRetry(x,c),true);
 assert.equal(knownFrameBoundaryRetry({...x,job:{id:'job_11111111-1111-4111-8111-111111111111'}},c),false);
 assert.equal(knownFrameBoundaryRetry({...x,binding:{script_hash:'a'.repeat(64)}},c),false);
 assert.equal(knownFrameBoundaryRetry({...x,media:[]},c),false);
 assert.equal(knownFrameBoundaryRetry(x,{material_resume_verified:{processed_audio:{...c.material_resume_verified.processed_audio,voice:{sha256:'b'.repeat(64)}}}}),false);
 assert.equal(knownFrameBoundaryRetry(x,{material_resume_verified:{processed_audio:{...c.material_resume_verified.processed_audio,project:{sha256:'c'.repeat(64)}}}}),false);
 assert.equal(knownFrameBoundaryRetry(x,{}),false);
});
test('read-only actual MiniCPM source probe preserves the complete 250 frames',{skip:!process.env.MINICPM_FRAME_SOURCE},()=>{
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,nb_frames,r_frame_rate,avg_frame_rate,time_base,duration_ts','-of','json',process.env.MINICPM_FRAME_SOURCE],{encoding:'utf8'}));
 assert.equal(Number(probe.format.duration)<250/30,true,'original comparison incorrectly rejects this actual input');
 assert.equal(videoHasRequiredFrames(probe,0,250),true);
 assert.equal(videoHasRequiredFrames(probe,0,251),false);
});
test('read-only actual MiniCPM project source lengths cover all planned segments',{skip:!process.env.MINICPM_FRAME_PROJECT},()=>{
 const dir=path.dirname(process.env.MINICPM_FRAME_PROJECT),p=JSON.parse(fs.readFileSync(process.env.MINICPM_FRAME_PROJECT,'utf8'));
 const resume=JSON.parse(fs.readFileSync(path.join(dir,'material-resume-proof.json'),'utf8'));
 assert.equal(knownFrameBoundaryRetry({job:{id:p.job_id},binding:p.binding,media:p.source_to_timeline.map(s=>s.media)}, {material_resume_verified:resume}),true,'exact preserved audio and chosen media match the diagnosed recovery');
 for(const segment of p.source_to_timeline){
  const media=segment.media;if(media.kind!=='video')continue;
  const file=path.resolve(dir,media.file),bytes=fs.readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),media.sha256,`segment ${segment.index} bytes`);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,nb_frames,r_frame_rate,avg_frame_rate,time_base,duration_ts','-of','json',file],{encoding:'utf8'}));
  assert.equal(videoHasRequiredFrames(probe,Number(media.start_seconds||0),segment.end_frame-segment.start_frame),true,`segment ${segment.index} coverage`);
 }
});
test('only the two exact animation sources with their retained audio and project receive the recovery identity',()=>{
 const x={job:{id:'job_120f0dc1-458c-49a7-8cdc-58353058538b'},binding:{script_hash:'c7ae788e8b9cf967707bfa3b69ba9fefb49ca21189389b7fb58b1a5046a71069'},media:[{sha256:'9fe05ab7b096416f59de6f70fe048b19aa9deae385f27f5fc66635b9debab121'}]};const c={material_resume_verified:{processed_audio:{voice:{sha256:'ed1d688ea44f4d54e1aeca261afc0e9d83f0c11ca193fcd4d6cbfd4f604fcfe0'},project:{sha256:'ec6ce28211830f0fe040eb9e265a07812185666228eed5648f90ab336d916133'}}}};assert.equal(knownFrameBoundaryRetry(x,c),true);assert.equal(knownFrameBoundaryRetry({...x,media:[{sha256:'1c363a0e09e745da7ccdf1403e46857713c612e0c7057e16dd308b18567d54fe'}]},c),true);assert.equal(knownFrameBoundaryRetry({...x,media:[{sha256:'a'.repeat(64)}]},c),false);assert.equal(knownFrameBoundaryRetry({...x,job:{id:'job_11111111-1111-4111-8111-111111111111'}},c),false);assert.equal(knownFrameBoundaryRetry(x,{material_resume_verified:{processed_audio:{...c.material_resume_verified.processed_audio,voice:{sha256:'b'.repeat(64)}}}}),false);
});
test('actual animation next source proves the same 112-frame rounding',{skip:!process.env.ANIME_FRAME_PROJECT},()=>{const dir=path.dirname(process.env.ANIME_FRAME_PROJECT),p=JSON.parse(fs.readFileSync(process.env.ANIME_FRAME_PROJECT)),resume=JSON.parse(fs.readFileSync(path.join(dir,'material-resume-proof.json'))),segment=p.source_to_timeline[1],media=segment.media,file=path.resolve(dir,media.file);assert.equal(knownFrameBoundaryRetry({job:{id:p.job_id},binding:p.binding,media:p.source_to_timeline.map(s=>s.media)},{material_resume_verified:resume}),true);assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),media.sha256);const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,nb_frames,r_frame_rate,avg_frame_rate,time_base,duration_ts','-of','json',file],{encoding:'utf8'}));assert.equal(segment.end_frame-segment.start_frame,112);assert.equal(Number(probe.format.duration)<112/30,true);assert.equal(videoHasRequiredFrames(probe,0,112),true);});
