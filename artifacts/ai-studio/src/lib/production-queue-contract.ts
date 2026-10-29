import {cliContentBudget} from './cli-content-budget.mts';
import type {ProductionJob} from './production-contract';
import {currentMediaOperation} from './current-media-operation';
export const PROTECTED_JOB='job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee';
export type ExecutionBinding={revision:number;mode_epoch:number;checkpoint_version:number;contract_hash:string;kind:'text'|'review'|'media';target_id:string;target_hash:string};
export function executionBinding(j:ProductionJob,now=Date.now()):ExecutionBinding|null{
 if(j.is_test||j.id===PROTECTED_JOB||j.publication_reports?.length||j.reworks>2)return null;
 const common={revision:j.revision,mode_epoch:j.mode_epoch,checkpoint_version:j.checkpoint_version,contract_hash:j.contract_hash};
 if(j.status==='waiting_executor'&&cliContentBudget(j).generation_available)return {...common,kind:'text',target_id:'draft-'+(j.revision+1),target_hash:j.contract_hash};
 if(j.review_mode==='auto'&&['awaiting_review','approved'].includes(j.status)){
  const m=j.milestones?.find(m=>m.revision===j.revision&&m.mode_epoch===j.mode_epoch&&['source','script','promotion','delivery'].includes(m.node)&&(m.status==='awaiting_ai'&&cliContentBudget(j).review_available||m.status==='ai_running'&&Number(m.review_until)<now));
  if(m)return {...common,kind:'review',target_id:m.id,target_hash:m.artifact_hash};
 }
 if(j.status==='approved'&&j.approved_revision===j.revision&&j.approved_hash){
  const o=j.operations?.find(o=>o.status==='queued'&&currentMediaOperation(j,o));
  if(o)return {...common,kind:'media',target_id:o.id,target_hash:o.input_hash};
 }
 return null;
}
export function savedExecutionRequest(j:ProductionJob,binding=executionBinding(j)){
 if(!binding)return null;
 for(const r of j.reviews||[]){if(r.decision!=='execution_request')continue;try{const value=JSON.parse(String(r.note));if(value.schema==='siounex-execution-request-v1'&&JSON.stringify(value.binding)===JSON.stringify(binding))return {id:String(r.id),created_at:String(r.created_at)};}catch{}}
 return null;
}
