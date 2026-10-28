import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {pictureVideoInputArgs} from '../scripts/private-review-producer.mjs';

test('a video whose colour metadata changes retains the complete 30fps clock',t=>{
 if(spawnSync('ffmpeg',['-version']).status!==0||spawnSync('ffprobe',['-version']).status!==0){t.skip('FFmpeg unavailable');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'video-clock-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const run=(exe,args)=>execFileSync(exe,args,{stdio:'pipe',timeout:120000});
 const a=path.join(dir,'a.mp4'),b=path.join(dir,'b.mp4'),input=path.join(dir,'mixed.mp4'),output=path.join(dir,'out.mp4');
 for(const [file,seconds,color] of [[a,2.8,false],[b,3.2,true]])run('ffmpeg',['-v','error','-f','lavfi','-i',`testsrc2=s=320x180:r=30:d=${seconds}`,'-an','-c:v','libx264','-pix_fmt','yuv420p',...(color?['-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709']:[]),'-threads','2','-y',file]);
 const list=path.join(dir,'input.txt'),quote=f=>f.replaceAll('\\','/').replaceAll("'","'\\''");fs.writeFileSync(list,`file '${quote(a)}'\nfile '${quote(b)}'\n`);
 run('ffmpeg',['-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-y',input]);
 const filter='scale=1024:576:force_original_aspect_ratio=decrease,pad=1024:576:(ow-iw)/2:(oh-ih)/2:color=0x152b40,setsar=1,fps=30,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709,settb=expr=1/30000,setpts=N/(30*TB)';
 run('ffmpeg',[...pictureVideoInputArgs(input,0),'-vf',filter,'-frames:v','180','-fps_mode','passthrough','-an','-c:v','libx264','-pix_fmt','yuv420p','-video_track_timescale','30000','-threads','2','-preset','veryfast','-crf','18','-y',output]);
 const result=JSON.parse(run('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,r_frame_rate,avg_frame_rate,duration','-of','json',output]).toString()).streams[0];
 assert.equal(Number(result.nb_read_frames),180);assert.equal(result.r_frame_rate,'30/1');assert.equal(result.avg_frame_rate,'30/1');assert.equal(Number(result.duration),6);
});
