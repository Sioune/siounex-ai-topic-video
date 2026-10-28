// Recover candidates from the original, immutable acquisition receipts. A new
// search result must extend the available originals instead of replacing them.
import fs from 'node:fs';import path from 'node:path';
import {motionCanonical as canonical,motionSha as sha} from '../lib/content-motion-contract.mts';
const inside=(base,file)=>{const rel=path.relative(base,file);return rel&&!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)};
export function retainedMotionCandidates({jobDir,binding,limit=32}){
 const base=fs.realpathSync(jobDir),parent=path.join(base,'material-acquisition');if(!fs.existsSync(parent))return [];
 const candidates=[],receipts=[];const expected={...binding,scope:'private-video'};let count=0;
 for(const input of fs.readdirSync(parent,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!input.isDirectory()||!/^[a-f0-9]{64}$/.test(input.name))continue;
  const inputDir=path.join(parent,input.name);if(fs.lstatSync(inputDir).isSymbolicLink())continue;
  for(const attempt of fs.readdirSync(inputDir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(!attempt.isDirectory()||attempt.isSymbolicLink())continue;if(++count>512)throw Object.assign(Error('MOTION_CANDIDATE_HISTORY_LIMIT'),{code:'MOTION_CANDIDATE_HISTORY_LIMIT'});
   const file=path.join(inputDir,attempt.name,'attempt.json');if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>5000000)continue;
   const receipt=JSON.parse(fs.readFileSync(file));if(receipt.schema!=='finite-public-material-discovery-v1'||receipt.job_id!==path.basename(path.dirname(base))||receipt.input_hash!==input.name||canonical(receipt.binding)!==canonical(expected))continue;
   receipts.push({receipt,file});
  }
 }
 for(const {receipt}of receipts.sort((a,b)=>String(a.receipt.observed_at||'').localeCompare(String(b.receipt.observed_at||''))||a.file.localeCompare(b.file))){
   for(const row of receipt.candidates||[]){
    if(!['video','image'].includes(row.kind)||!/^candidate_[a-f0-9]{64}$/.test(row.id||'')||row.id!=='candidate_'+row.sha256||typeof row.file!=='string'||!inside(base,path.resolve(row.file)))continue;
    const actual=fs.realpathSync(row.file),stat=fs.statSync(actual);if(!inside(base,actual)||fs.lstatSync(row.file).isSymbolicLink()||!stat.isFile()||stat.size!==row.size_bytes||stat.size>64000000||sha(fs.readFileSync(actual))!==row.sha256)throw Object.assign(Error('MOTION_SOURCE_BYTES_CHANGED'),{code:'MOTION_SOURCE_BYTES_CHANGED'});
    if(!candidates.some(m=>m.sha256===row.sha256))candidates.push({...row,asset_id:row.id,source_url:row.source_url||row.url,file:actual});
   }
 }
 // Retain videos before optional stills. Stable byte identity keeps subsequent
 // cache reads independent of acquisition time, path and duplicate URL aliases.
 return candidates.sort((a,b)=>(a.kind==='video'?0:1)-(b.kind==='video'?0:1)||a.sha256.localeCompare(b.sha256)).slice(0,limit);
}
