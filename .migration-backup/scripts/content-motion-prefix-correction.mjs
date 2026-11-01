import fs from 'node:fs';import path from 'node:path';
import {motionCanonical as canonical,motionSha as sha} from '../lib/content-motion-contract.mts';
// Only fix a prefix containing images alone when this same segment already
// selected a video carrying substantive content after that prefix. Never
// manufacture media or change durations, source ranges, annotations or audio.
export function reorderStaticOnlyPrefixes(value,error,currentTiming,validate){
 if(error?.code!=='MOTION_TASK_HAS_ONLY_BACKGROUND'||!error.missing?.some(x=>String(x.detail||'').startsWith('当前实测口播使用的每段素材前缀'))||!Array.isArray(value?.segments))return null;
 const changed=structuredClone(value),moves=[];
 for(const row of changed.segments){const n=currentTiming?.[row.index];if(!Number.isSafeInteger(n)||n<1||!Array.isArray(row.shots))continue;let still=0;for(const s of row.shots){if(s.kind!=='image')break;still+=s.frames;}if(still<n)continue;
  const from=row.shots.findIndex((s,i)=>i>0&&['video','recording'].includes(s.kind)&&['core','explanation'].includes(s.role)&&Number.isSafeInteger(s.frames)&&s.frames>0);
  if(from<0)continue;const [shot]=row.shots.splice(from,1);row.shots.unshift(shot);moves.push({segment:row.index,from,to:0,asset_id:shot.asset_id,frames:shot.frames,source_start_frame:shot.source_start_frame});
 }
 if(!moves.length)return null;try{validate(changed)}catch{return null}return {value:changed,moves};
}
function immutable(file,bytes){if(fs.existsSync(file)){if(sha(fs.readFileSync(file))!==sha(bytes))throw Object.assign(Error('MOTION_PLAN_CACHE_CHANGED'),{code:'MOTION_PLAN_CACHE_CHANGED'});}else fs.writeFileSync(file,bytes,{flag:'wx'});}
export function recordStaticPrefixReorder({dir,inputHash,binding,original,originalReceiptFile,reordered,now}){
 const source=fs.readFileSync(path.join(dir,'selection.json')),receipt=fs.readFileSync(originalReceiptFile),original_hash=sha(source),derived=Buffer.from(JSON.stringify(reordered.value,null,2)),derived_hash=sha(derived);if(canonical(JSON.parse(source))!==canonical(original))throw Object.assign(Error('MOTION_PLAN_CACHE_CHANGED'),{code:'MOTION_PLAN_CACHE_CHANGED'});
 const file=path.join(dir,'prefix-reorder-'+derived_hash+'.json'),resultFile=path.join(dir,'prefix-reorder-result-'+derived_hash+'.json');immutable(resultFile,derived);
 const record={schema:'content-motion-prefix-reorder-v1',input_hash:inputHash,binding,original_output_sha256:original_hash,original_receipt_sha256:sha(receipt),derived_output_sha256:derived_hash,result_file:path.basename(resultFile),moves:reordered.moves,original_selection_preserved:true,original_receipt_preserved:true,new_model_calls:0,quality_approved:false,publication_authorized:false};
 if(fs.existsSync(file)){const prior=JSON.parse(fs.readFileSync(file));const {finished_at,...old}=prior;if(canonical(old)!==canonical(record)||!Number.isFinite(Date.parse(finished_at)))throw Object.assign(Error('MOTION_PLAN_CACHE_CHANGED'),{code:'MOTION_PLAN_CACHE_CHANGED'});return {value:reordered.value,receipt:prior,receiptFile:file};}
 const saved={...record,finished_at:now()};immutable(file,Buffer.from(JSON.stringify(saved,null,2)));return {value:reordered.value,receipt:saved,receiptFile:file};
}
