// Temporary synthetic tones/32px color clips only. No project, provider or owner media.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {joinPinnedOutroAudio} from '../scripts/pinned-outro-audio.mjs';
import {command,probe} from '../scripts/media-adapter.mjs';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const temporary=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"SYNTHETIC audio's space 路径-"));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
async function tones(t,{bodyFrames=97,outroFrames=119,bodyRate=48000}={}){
 const root=temporary(t),body=path.join(root,'body tone.m4a'),outro=path.join(root,'synthetic original outro.mp4'),output=path.join(root,'joined.m4a'),tailSeconds=outroFrames===119?3.95:4;
 await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-f','lavfi','-i',`sine=frequency=440:sample_rate=${bodyRate}:duration=${bodyFrames/30}`,'-ac','2','-c:a','aac','-b:a','160k','-n',body]);
 await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-f','lavfi','-i',`color=c=blue:s=32x32:r=30:d=${outroFrames/30}`,'-f','lavfi','-i',`sine=frequency=880:sample_rate=48000:duration=${tailSeconds}`,'-frames:v',String(outroFrames),'-c:v','libx264','-threads','1','-preset','ultrafast','-pix_fmt','yuv420p','-ac','2','-c:a','aac','-b:a','160k','-n',outro]);
 const trace=[],run=async(exe,args,...rest)=>{trace.push({exe,args});return command(exe,args,...rest);};return{root,body,outro,output,bodyFrames,outroFrames,trace,run};
}
async function packets(file){return JSON.parse((await command('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=data_hash,pts_time,duration_time','-of','json',file])).out).packets;}

for(const outroFrames of [119,120])test(`actual stream-copy join preserves all original ${outroFrames}-frame tail AAC packets at the fractional body frame clock`,async t=>{
 const f=await tones(t,{outroFrames}),original=sha(f.outro),bodyHash=sha(f.body),bodyPackets=await packets(f.body),tailPackets=await packets(f.outro),r=await joinPinnedOutroAudio({...f,command:f.run}),actual=await packets(f.output),hashes=rows=>rows.map(p=>p.data_hash),info=await probe(f.output),outroInfo=await probe(f.outro);
 assert.deepEqual(hashes(actual),[...hashes(bodyPackets),...hashes(tailPackets)]);assert.equal(r.original_aac_sequence_start_packet,bodyPackets.length);assert.equal(r.original_aac_packets,tailPackets.length);assert.equal(r.outro_frames,outroFrames);assert.equal(r.body_duration_seconds,97/30);assert.equal(r.stream_copy_join,true);assert.equal(sha(f.outro),original);assert.equal(sha(f.body),bodyHash);assert.equal(Number(outroInfo.streams.find(s=>s.codec_type==='video').nb_frames),outroFrames);
 assert.ok(Math.abs(Number(actual[bodyPackets.length].pts_time)-97/30)<.025,'tail packet clock follows the exact body frame duration within one AAC packet plus container rounding');assert.ok(Math.abs(Number(info.format.duration)-(97/30+Number(outroInfo.streams.find(s=>s.codec_type==='audio').duration)))<.06);assert.ok(actual.every((p,i)=>i===0||Number(p.pts_time)>=Number(actual[i-1].pts_time)));
 const list=fs.readFileSync(path.join(f.root,'body-outro-audio.concat.txt'),'utf8');assert.ok(list.startsWith('ffconcat version 1.0\n'));assert.match(list,/duration 3\.2333333333333334\n/);assert.doesNotMatch(list,/\\\\(?!')/);assert.ok(list.includes("'\\''"),'the apostrophe in the real path is escaped for ffconcat');assert.equal(fs.readFileSync(path.join(f.root,'body-outro-audio.concat.txt'))[0],0x66);
 const mediaCalls=f.trace.filter(c=>c.exe==='ffmpeg');assert.equal(mediaCalls.length,2);for(const c of mediaCalls){assert.ok(c.args.includes('-nostdin'));assert.ok(c.args.includes('-hide_banner'));assert.ok(c.args.includes('-n'));assert.equal(c.args[c.args.indexOf('-c:a')+1],'copy');assert.ok(!c.args.includes('-af'));}
});

test('tampering with the extracted tail is rejected before any joined output is created',async t=>{
 const f=await tones(t),original=sha(f.outro),run=async(exe,args,...rest)=>{const result=await command(exe,args,...rest);if(exe==='ffmpeg'&&args.at(-1)===path.join(f.root,'original-outro-audio.m4a'))await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=3.95','-ac','2','-c:a','aac','-y',args.at(-1)]);return result;};
 await assert.rejects(()=>joinPinnedOutroAudio({...f,command:run}),/PINNED_OUTRO_AUDIO_CHANGED/);assert.equal(sha(f.outro),original);assert.equal(fs.existsSync(f.output),false);
});
test('a source-byte change during joining is rejected even when the original AAC packets remain readable',async t=>{
 const f=await tones(t),original=sha(f.outro),run=async(exe,args,...rest)=>{const result=await command(exe,args,...rest);if(exe==='ffmpeg'&&args.at(-1)===f.output)fs.appendFileSync(f.outro,'SYNTHETIC changed metadata bytes');return result;};await assert.rejects(()=>joinPinnedOutroAudio({...f,command:run}),/PINNED_OUTRO_AUDIO_CHANGED/);assert.notEqual(sha(f.outro),original);
});
test('incompatible AAC stream headers are rejected before stream-copying a mismatched sample clock',async t=>{
 const f=await tones(t,{bodyRate:44100});await assert.rejects(()=>joinPinnedOutroAudio({...f,command:f.run}),/PINNED_AUDIO_HEADER_MISMATCH/);assert.equal(f.trace.some(c=>c.exe==='ffmpeg'),false);assert.equal(fs.existsSync(f.output),false);
});
test('the declared frame duration cannot silently shorten a longer complete body track',async t=>{
 const f=await tones(t);await assert.rejects(()=>joinPinnedOutroAudio({...f,bodyFrames:90,command:f.run}),/PINNED_AUDIO_BODY_DURATION_MISMATCH/);assert.equal(f.trace.some(c=>c.exe==='ffmpeg'),false);
});
test('119 and historical120 frames use their own exact sixty-second budget without media work',async t=>{
 for(const [bodyFrames,outroFrames,allowed] of [[1681,119,true],[1680,120,true],[1682,119,false],[1681,120,false],[0,119,false],[97,0,false]]){
  const root=temporary(t),body=path.join(root,'body.m4a'),outro=path.join(root,'outro.m4a'),output=path.join(root,'joined.m4a');fs.writeFileSync(body,'SYNTHETIC body');fs.writeFileSync(outro,'SYNTHETIC tail');const calls=[],bodyPacket='SHA256:'+'a'.repeat(64),tailPacket='SHA256:'+'b'.repeat(64),run=async(exe,args)=>{calls.push({exe,args});const file=args.at(-1);if(exe==='ffmpeg'){fs.writeFileSync(file,'SYNTHETIC copied audio');return{out:''};}if(args.includes('-show_streams'))return{out:JSON.stringify({streams:[{codec_name:'aac',profile:'LC',sample_rate:'48000',channels:2,channel_layout:'stereo',extradata_hash:'SHA256:'+'c'.repeat(64),duration:String(bodyFrames/30)}]})};return{out:JSON.stringify({packets:(file===output?[bodyPacket,tailPacket]:file===body?[bodyPacket]:[tailPacket]).map(data_hash=>({data_hash}))})};};
  if(allowed){const r=await joinPinnedOutroAudio({body,outro,bodyFrames,outroFrames,output,command:run});assert.equal(r.body_frames+r.outro_frames,1800);}else{await assert.rejects(()=>joinPinnedOutroAudio({body,outro,bodyFrames,outroFrames,output,command:run}),/PINNED_AUDIO_FRAME_BUDGET/);assert.equal(calls.length,0);}
 }
});
test('an existing result or partial concat journal is retained and cannot trigger another media attempt',async t=>{
 const root=temporary(t),body=path.join(root,'body.m4a'),outro=path.join(root,'outro.m4a'),output=path.join(root,'joined.m4a');fs.writeFileSync(body,'SYNTHETIC body');fs.writeFileSync(outro,'SYNTHETIC tail');fs.writeFileSync(output,'SYNTHETIC unknown completed result');let calls=0;await assert.rejects(()=>joinPinnedOutroAudio({body,outro,bodyFrames:97,output,command:()=>{calls++;throw Error('Must not run');}}),/PINNED_AUDIO_RESULT_EXISTS/);assert.equal(calls,0);assert.equal(fs.readFileSync(output,'utf8'),'SYNTHETIC unknown completed result');
});
