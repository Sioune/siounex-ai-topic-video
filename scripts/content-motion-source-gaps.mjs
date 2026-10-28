// Reuse positive observations of failed original ranges before another render.
// An unknown observation is never converted into either approval or rejection.
import fs from 'node:fs';
import path from 'node:path';
import {motionSha as sha} from '../lib/content-motion-contract.mts';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const rejected=new Set(['text-only','decorative-motion','unrelated']);
function read(file){if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>8000000)return null;return JSON.parse(fs.readFileSync(file));}
export function rejectedMotionSourceRanges({jobDir,feedback_sha256}){
 const found=[];
 const add=(row,evidence)=>{if(!digest(row.source_sha256)||!Number.isSafeInteger(row.source_start_frame)||!Number.isSafeInteger(row.source_end_frame)||row.source_start_frame<0||row.source_end_frame<=row.source_start_frame)return;found.push({...row,evidence_sha256:evidence});};
 const reviews=path.join(jobDir,'private-review');
 for(const output of fs.existsSync(reviews)?fs.readdirSync(reviews,{withFileTypes:true}):[]){
  if(!output.isDirectory()||output.isSymbolicLink()||!digest(output.name))continue;
  const parent=path.join(reviews,output.name,'content-motion-qa');
  for(const entry of fs.existsSync(parent)?fs.readdirSync(parent,{withFileTypes:true}):[]){
   if(!entry.isDirectory()||entry.isSymbolicLink()||!digest(entry.name))continue;
   const directory=path.join(parent,entry.name);if(!fs.existsSync(path.join(directory,'gaps.json')))continue;
   const file=path.join(directory,'checked-report.json'),report=read(file);
   if(report?.feedback_sha256!==feedback_sha256||report.main_picture_only!==true||!Array.isArray(report.shots))continue;
   const evidence=sha(fs.readFileSync(file));
   for(const s of report.shots){
    if(!['video','recording'].includes(s.kind)||!rejected.has(s.observation?.classification))continue;
    add({source_sha256:s.source_sha256,source_start_frame:s.source_start_frame,source_end_frame:s.source_start_frame+s.end_frame-s.start_frame,classification:s.observation.classification,task_index:s.task_index,detail:s.observation.what_changed},evidence);
   }
  }
 }
 const failures=path.join(jobDir,'content-motion','export-gaps');
 for(const entry of fs.existsSync(failures)?fs.readdirSync(failures,{withFileTypes:true}):[]){
  if(!entry.isDirectory()||entry.isSymbolicLink()||!digest(entry.name))continue;
  for(const filename of fs.readdirSync(path.join(failures,entry.name)).filter(n=>/^gaps(?:-[a-f0-9]{64})?\.json$/.test(n))){
   const file=path.join(failures,entry.name,filename),value=read(file);if(value?.feedback_sha256!==feedback_sha256)continue;
   for(const row of value.missing||[])if(row.code==='MOTION_EXPORTED_TEXT_CARD'||rejected.has(row.classification))add({source_sha256:row.source_sha256,source_start_frame:row.source_start_frame,source_end_frame:row.source_end_frame,classification:row.classification||'text-only',task_index:row.task_index,detail:row.detail},sha(fs.readFileSync(file)));
  }
 }
 return [...new Map(found.filter(r=>r.classification!=='unrelated'||Number.isSafeInteger(r.task_index)&&r.task_index>=0).map(r=>[[r.source_sha256,r.source_start_frame,r.source_end_frame,r.classification,r.classification==='unrelated'?r.task_index:''].join(':'),r])).values()].sort((a,b)=>a.source_sha256.localeCompare(b.source_sha256)||a.source_start_frame-b.source_start_frame||(a.task_index??-1)-(b.task_index??-1)).slice(0,4096);
}
export function rejectedMotionRange(shot,source_sha256,ranges){return ranges.find(r=>r.source_sha256===source_sha256&&(r.classification!=='unrelated'||Number.isSafeInteger(r.task_index)&&r.task_index>=0&&r.task_index===shot.task_index)&&shot.source_start_frame<r.source_end_frame&&shot.source_start_frame+shot.frames>r.source_start_frame);}
