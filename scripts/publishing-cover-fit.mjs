// Technical publishing-layout adapter. Source image bytes are never modified.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {COVER_FIT_ALGORITHM,coverFitGeometry} from '../lib/publishing-cover-adaptation.mts';
const args=Object.fromEntries(process.argv.slice(2).reduce((rows,v,i,a)=>i%2?rows:[...rows,[v,a[i+1]]],[]));
for(const key of ['--source','--source-sha','--source-archive','--output','--ffmpeg'])if(!args[key])throw Error('Missing '+key);
const source=path.resolve(args['--source']),output=path.resolve(args['--output']);if(source===output||!output.toLowerCase().endsWith('.png'))throw Error('Output must be a separate PNG');
const digest=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(source);if(digest(bytes)!==args['--source-sha'])throw Error('Approved source SHA mismatch');
function size(b){if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected real PNG');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}
const original=size(bytes);if(original.width*3!==original.height*4)throw Error('Approved source must be4:3');const rect=coverFitGeometry(original.width,original.height);
await fs.mkdir(path.dirname(output),{recursive:true});const reportFile=output+'.json';let exists=false;try{await fs.access(output);exists=true}catch{}
if(!exists){const filter=`scale=${rect.width}:${rect.height}:flags=lanczos,pad=1920:1080:${rect.x}:${rect.y}:color=0x101827`;await promisify(execFile)(args['--ffmpeg'],['-hide_banner','-loglevel','error','-nostdin','-n','-i',source,'-vf',filter,'-frames:v','1','-threads','1','-c:v','png','-pix_fmt','rgb24',output],{windowsHide:true,maxBuffer:2e6});}
const result=await fs.readFile(output),actual=size(result);if(actual.width!==1920||actual.height!==1080)throw Error('Unexpected output dimensions');
const adaptation={algorithm:COVER_FIT_ALGORITHM,source:{role:'cover_4_3',site_archive_id:args['--source-archive'],sha256:args['--source-sha'],size_bytes:bytes.length,...original},file:{file:output,sha256:digest(result),size_bytes:result.length,...actual},content_rect:rect,background:'#101827',source_pixels_retained:true,no_new_editorial_content:true,local_sha256_verified:true,visual_check_note:'待执行器查看最终适配图后填写实际视觉核查；此脚本不声称已经看图',evidence_reference:reportFile,observed_at:new Date().toISOString()};
if(exists){const old=JSON.parse(await fs.readFile(reportFile,'utf8'));if(old.file.sha256!==adaptation.file.sha256||old.source.sha256!==adaptation.source.sha256||old.algorithm!==adaptation.algorithm)throw Error('Existing adaptation identity changed');}
else await fs.writeFile(reportFile,JSON.stringify(adaptation,null,2)+'\n');
process.stdout.write(JSON.stringify({report_file:reportFile,adaptation,reused:exists})+'\n');
