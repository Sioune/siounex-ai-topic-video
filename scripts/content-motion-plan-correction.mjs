import fs from 'node:fs';import path from 'node:path';
import {motionCanonical as canonical,motionSha as sha} from '../lib/content-motion-contract.mts';
import {motionVisionCall} from './content-motion-cli.mjs';
import {materialSelectionAttempt,inspectMaterialSelectionHistory} from './material-selection-reconciliation.mjs';
const correctable=new Set(['MOTION_KNOWN_FAILED_SOURCE_RANGE','MOTION_SOURCE_RANGE_TOO_SHORT','MOTION_TASK_HAS_ONLY_BACKGROUND','MOTION_MECHANISM_SPECIFIC_VISUAL_REQUIRED','MOTION_CONTENT_GAPS','MOTION_CLOSING_VIDEO_REQUIRED','MOTION_PARENT_DURATION_CHANGED','MOTION_UNKNOWN_SOURCE','MOTION_OBSERVED_SOURCE_FRAMES_REQUIRED','MOTION_MECHANISM_FACT_BINDING_REQUIRED','MOTION_DYNAMIC_COVERAGE_LOW','MOTION_STILL_COVERAGE_HIGH','MOTION_STILL_TOO_LONG','MOTION_REPEATED_IMAGE','MOTION_REPEATED_VIDEO_RANGE']);
export async function correctMotionPlan({dir,parent,inputHash,binding,prompt,value,error,schema,images,runCli,now,clock,validate}){
 if(!correctable.has(error.code)||!value.segments?.length)throw error;
 const original=fs.readFileSync(path.join(dir,'selection.json')),original_output_sha256=sha(original);
 const correctionPrompt=prompt+'\n上次方案已正常完成，但实际校验发现以下已知错误。只纠正这一次，保留已审原稿、完整音轨、已取得来源和正常原速；必须覆盖所有tasks的index，每段帧数分别等于required_frames，当前使用前缀也须达到80%有效动态。asset_id与frame_ids只能原样引用附件；机制节点必须来自同一个grounded_excerpt，该excerpt逐字来自approved_script。素材确实不足时返回空segments，并保留真实缺口；不得虚构素材、放宽质量或以文字卡充数。\n'+canonical({validation_code:error.code,validation_details:error.missing||[],completed_invalid_output:value});
 const correction=materialSelectionAttempt({parent,baseDir:path.join(dir,'correction-1'),binding,prompt:correctionPrompt,now:clock});fs.mkdirSync(correction,{recursive:true});
 const output=path.join(correction,'selection.json'),receiptFile=path.join(correction,'selection-receipt.json'),intent=path.join(correction,'selection-started.json');
 if(!fs.existsSync(receiptFile)){
  if(fs.existsSync(intent))throw Object.assign(Error('MOTION_SELECTION_RESULT_RECONCILIATION_REQUIRED'),{code:'MOTION_SELECTION_RESULT_RECONCILIATION_REQUIRED'});
  const put=(name,v)=>fs.writeFileSync(path.join(correction,name),typeof v==='string'?v:JSON.stringify(v,null,2),{flag:'wx'});
  put('prompt.txt',correctionPrompt);put('schema.json',schema);put('selection-started.json',{input_hash:inputHash,binding,original_output_sha256,started_at:now()});
  const process=await motionVisionCall({schemaPath:path.join(correction,'schema.json'),output,images,prompt:correctionPrompt,metadataDir:path.join(correction,'process')},runCli);
  if(process.error_code!=='CLI_COMPLETED'||process.exit_code!==0||!fs.existsSync(output)){inspectMaterialSelectionHistory(parent,binding,{now:clock});throw Object.assign(Error('MOTION_SELECTION_RESULT_RECONCILIATION_REQUIRED'),{code:'MOTION_SELECTION_RESULT_RECONCILIATION_REQUIRED'});}
  put('selection-receipt.json',{input_hash:inputHash,binding,original_output_sha256,output_sha256:sha(fs.readFileSync(output)),prompt_sha256:sha(correctionPrompt),finished_at:now(),process,known_invalid_correction:1});
 }
 const receipt=JSON.parse(fs.readFileSync(receiptFile));if(receipt.input_hash!==inputHash||receipt.original_output_sha256!==original_output_sha256||receipt.prompt_sha256!==sha(correctionPrompt)||receipt.output_sha256!==sha(fs.readFileSync(output)))throw Object.assign(Error('MOTION_PLAN_CACHE_CHANGED'),{code:'MOTION_PLAN_CACHE_CHANGED'});
 const corrected=JSON.parse(fs.readFileSync(output));validate(corrected);return {value:corrected,receipt,receiptFile};
}
