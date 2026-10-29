import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {extractMotionSample} from '../scripts/content-motion-qa.mjs';import {command} from '../scripts/media-adapter.mjs';
test('one decode preserves PNG and grayscale pixels and partial caches recover without overwriting',{timeout:60000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-sample-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const video=path.join(dir,'input.mp4'),layout={x:0,y:0,width:640,height:360};
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-y',video],{windowsHide:true});
 for(const frame of [0,9,21]){
  const png=path.join(dir,`new-${frame}.png`),gray=path.join(dir,`new-${frame}.gray`),oldpng=path.join(dir,`old-${frame}.png`),oldgray=path.join(dir,`old-${frame}.gray`);let calls=0;
  await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-ss',String(frame/30),'-i',video,'-vf','crop=640:360:0:0,scale=640:360','-frames:v','1','-n',oldpng],180000);
  await command('ffmpeg',['-nostdin','-hide_banner','-v','error','-i',oldpng,'-vf','scale=160:90,format=gray','-frames:v','1','-f','rawvideo','-n',oldgray],180000);
  await extractMotionSample({frame,video,layout,png,gray,command:async(...args)=>{calls++;return command(...args)}});assert.equal(calls,1);assert.deepEqual(fs.readFileSync(png),fs.readFileSync(oldpng));assert.deepEqual(fs.readFileSync(gray),fs.readFileSync(oldgray));
  await extractMotionSample({frame,video,layout,png,gray,command:()=>{throw Error('cached samples must not be regenerated')}});
  fs.unlinkSync(gray);calls=0;await extractMotionSample({frame,video,layout,png,gray,command:async(...args)=>{calls++;return command(...args)}});assert.equal(calls,1);assert.deepEqual(fs.readFileSync(gray),fs.readFileSync(oldgray));
  fs.unlinkSync(png);calls=0;await extractMotionSample({frame,video,layout,png,gray,command:async(...args)=>{calls++;return command(...args)}});assert.equal(calls,1);assert.deepEqual(fs.readFileSync(png),fs.readFileSync(oldpng));assert.deepEqual(fs.readFileSync(gray),fs.readFileSync(oldgray));
 }
});
test('failed combined decode never promotes partial artifacts',{timeout:60000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-incomplete-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const png=path.join(dir,'frame.png'),gray=path.join(dir,'frame.gray');
 await assert.rejects(()=>extractMotionSample({frame:0,video:'missing.mp4',layout:{x:0,y:0,width:640,height:360},png,gray,command:async(_exe,args)=>{fs.writeFileSync(args.find(x=>x.endsWith('.png')),'partial');throw Error('decode failed')}}),/decode failed/);
 assert.equal(fs.existsSync(png),false);assert.equal(fs.existsSync(gray),false);assert.deepEqual(fs.readdirSync(dir),[]);
});
