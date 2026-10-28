// Small actual FFmpeg fixtures; no product assets, speech or service calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {command} from '../scripts/media-adapter.mjs';
import {prepareSourcePlane,actualPlaneFrames} from '../scripts/prepare-unified-project.mjs';

test('mixed decoded pixel/color formats preserve every real frame across exact trim and reorder',async t=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-mixed-frame-plane-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
 const pieces=[{n:54,fmt:'yuv444p',color:'bt709'},{n:72,fmt:'yuv420p',color:'bt470bg'},{n:55,fmt:'yuv444p',color:'bt709'}];
 for(const [i,p]of pieces.entries())await command('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','testsrc=size=48x32:rate=30','-vf',`format=${p.fmt},setparams=range=tv:colorspace=${p.color}`,'-frames:v',String(p.n),'-an','-c:v','libx264','-crf','0','-threads','1','-n',path.join(out,`part-${i}.mp4`)]);
 const list=path.join(out,'inputs.txt');fs.writeFileSync(list,pieces.map((_,i)=>`file 'part-${i}.mp4'`).join('\n'));
 const source=path.join(out,'mixed.mp4');await command('ffmpeg',['-nostdin','-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-n',source]);
 const hashes=async file=>(await command('ffmpeg',['-nostdin','-v','error','-reinit_filter','0','-i',file,'-vf','format=yuv420p','-fps_mode','passthrough','-f','framemd5','-'])).out.split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(x=>x.split(',').at(-1).trim());
 const original=await hashes(source);assert.equal(original.length,181);
 for(const a of [0,61]){
  const dir=path.join(out,'prepare-'+a);fs.mkdirSync(dir);
  const r=await prepareSourcePlane({source,out:dir,frames:181,openingStart:a,rectangle:[0,0,48,32]});
  assert.deepEqual(r.proof.map(x=>x.frames),a?[90,61,30]:[90,91]);
  const expected=[...original.slice(a,a+90),...original.slice(0,a),...original.slice(a+90)];
  assert.deepEqual(await hashes(r.ordered),expected);
  assert.equal((await actualPlaneFrames(r.ordered)).frames,181);
  const timestamps=(await command('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','csv=p=0',r.ordered])).out.trim().split(/\r?\n/).map(Number);
  assert.equal(timestamps.length,181);assert.ok(timestamps.every((x,i)=>Math.abs(x-i/30)<.0008));
 }
});

test('exact range proof rejects short decoder output before concatenation',async t=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-short-plane-'));t.after(()=>fs.rmSync(out,{recursive:true,force:true}));let concats=0;
 await assert.rejects(()=>prepareSourcePlane({source:'SYNTHETIC.mp4',out,frames:181,openingStart:0,rectangle:[0,0,48,32]},{run:async(exe,args)=>{
  if(exe==='ffprobe')return {out:JSON.stringify({streams:[{codec_type:'video',r_frame_rate:'30/1',nb_read_frames:'89',width:48,height:32}]})};
  if(args.includes('concat'))concats++;return {out:''};
 }}),/exact source range frame count differs/);assert.equal(concats,0);
});
