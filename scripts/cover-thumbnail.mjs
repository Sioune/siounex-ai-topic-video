import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// This helper only derives a preview from the exact archived original supplied
// by the caller. It never changes, replaces, or approves that original.
export function makeCoverThumbnail(bytes,sourceSha256,{run=spawnSync}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>=50*1024*1024||!/^([a-f0-9]{64})$/.test(sourceSha256)||hash(bytes)!==sourceSha256||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('THUMBNAIL_SOURCE_MISMATCH');
 const result=run('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libwebp','-quality','76','-f','webp','pipe:1'],{input:bytes,windowsHide:true,timeout:15000,maxBuffer:512000});
 if(result.error||result.status!==0||!Buffer.isBuffer(result.stdout)||result.stdout.length<12||result.stdout.length>120000||result.stdout.subarray(0,4).toString()!=='RIFF'||result.stdout.subarray(8,12).toString()!=='WEBP')throw Error('THUMBNAIL_GENERATION_FAILED');
 return {bytes:result.stdout,source_sha256:sourceSha256,thumbnail_sha256:hash(result.stdout),mime_type:'image/webp'};
}
