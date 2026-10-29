import {db} from './store';
import {getJob} from './production';
import {bindingMatches,scopeBinding} from './media-continuation-contract';
import {preparationRegistrationBinding,PREPARATION_REGISTRATION_EXCLUSIONS} from './preparation-registration-contract.mts';
import {approvedScriptProductionCandidate,legacyApprovedProductionCandidate} from './approved-production-policy.mts';
type AutomaticJob=Parameters<typeof preparationRegistrationBinding>[0]&{review_mode:string};
// Selecting full-auto includes zero-new-fee local production, not just inventory.
// An explicit preparation-only owner choice, cancellation or unknown execution
// is never silently upgraded by this compatibility repair.
export function automaticPrivatePreparationBinding(j:AutomaticJob,owner:string,nativeRaw:string|null=null){
 if((j.review_mode!=='auto'&&!approvedScriptProductionCandidate(j))||PREPARATION_REGISTRATION_EXCLUSIONS.some(id=>id===j.id)&&!legacyApprovedProductionCandidate(j)||j.id==='job_3c14fe6f-44b0-472c-8455-e75040b695bb')return null;
 if(!preparationOnlyNativeState(j,nativeRaw,owner))return null;
 if(preparationRegistrationBinding(j,owner))return scopeBinding(j);
 const s=j.media_continuation?.scope;
 if(!s||s.schema!=='owner-media-scope-v1'||s.scope!=='preparation'||s.authorization_source!=='included-free-preparation'||s.owner_confirmed!==false||s.id!==j.media_continuation?.current_id||!bindingMatches(j,s.binding)||s.new_paid_authorization!==false||s.publication_authorization!==false||s.quality_approved!==false)return null;
 const clean={...j,media_continuation:{...j.media_continuation,current_id:'',scope:null},stages:j.stages?.filter(s=>!['media_inventory','media_inputs'].includes(String(s.stage))),reviews:j.reviews?.filter(r=>!['media_scope','native_preparation_handoff_event','media_probe_receipt'].includes(String(r.decision)))};
 if(j.stages?.some(s=>['running','prepared','paused'].includes(String(s.status))))return null;
 return preparationRegistrationBinding(clean,owner)?scopeBinding(j):null;
}
export function preparationOnlyNativeState(j:AutomaticJob,raw:string|null,owner:string){
 try{if(!raw)return true;const n=JSON.parse(raw),artifacts=n.checkpoint?.artifacts,prefix='.sites-runtime/authorized-inputs/'+j.id+'/revision-'+j.revision+'/native-preparation/'+n.queue_id+'/';
  if(n.schema!=='native-preparation-handoff-v1'||n.job_id!==j.id||n.owner_id!==owner||!/^native_prep_[a-f0-9]{64}$/.test(n.queue_id)||!['queued','blocked','completed'].includes(n.status)||n.binding?.scope!=='preparation'||n.binding.scope_id!==j.media_continuation?.current_id||n.binding.revision!==j.revision||n.binding.script_hash!==j.approved_hash||n.binding.mode_epoch!==j.mode_epoch||n.binding.contract_hash!==j.contract_hash||n.quality_approved!==false||n.new_paid_calls!==0||n.publication_authorized!==false||n.lease_until!=null||n.lease_hash!=null||n.checkpoint?.reconciliation&&n.checkpoint.reconciliation.state!=='resolved'||!Array.isArray(artifacts))return false;
  if(!Number.isSafeInteger(n.version)||n.version<1||!Array.isArray(n.missing)||!Number.isFinite(Date.parse(n.created_at))||!Number.isFinite(Date.parse(n.updated_at))||typeof n.checkpoint?.note!=='string'||n.status==='queued'&&(n.executor!=null||n.invocation_id!=null)||n.status!=='queued'&&(n.executor!=='finite-existing-source-preparation-v1'||!/^native-preparation-consumer-[a-f0-9-]{36}$/.test(n.invocation_id||'')))return false;
  if(artifacts.length&&n.executor!=='finite-existing-source-preparation-v1')return false;
  return artifacts.every((a:any)=>a.kind==='local-file'&&['source-media','timeline'].includes(a.purpose)&&typeof a.file==='string'&&a.file.startsWith(prefix)&&!a.file.includes('..')&&!a.file.includes('\\')&&(a.purpose!=='timeline'||/^(?:supplement-[a-f0-9]{64}\/)?(?:editor-preparation-plan|preparation-manifest)\.json$/.test(a.file.slice(prefix.length))));
 }catch{return false;}
}
export const AUTOMATIC_PRIVATE_UPGRADE_SQL=`production_jobs.review_mode IN ('auto','node') AND production_jobs.is_test=0
 AND production_jobs.lease_hash IS NULL AND production_jobs.lease_until IS NULL AND COALESCE(production_jobs.error,'')=''
 AND (production_jobs.review_mode='auto' OR (SELECT count(DISTINCT m.node) FROM production_milestones m WHERE m.job_id=production_jobs.id AND m.revision=production_jobs.revision AND m.node IN ('source','script') AND m.status='approved' AND m.mode_epoch=production_jobs.mode_epoch AND m.artifact_hash=production_jobs.approved_hash)=2)
 AND NOT EXISTS(SELECT 1 FROM production_milestones v WHERE v.job_id=production_jobs.id AND v.revision=production_jobs.revision AND v.node='video')
 AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=production_jobs.id AND v.published_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM dispositions d WHERE d.topic_id=production_jobs.topic_id AND d.status IN ('produced','rejected'))
 AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=production_jobs.id AND o.status NOT IN ('completed','abandoned','cancelled'))
 AND NOT EXISTS(SELECT 1 FROM app_state n WHERE n.key='native_preparation_handoff_v1:'||production_jobs.id AND CASE WHEN json_valid(n.value) THEN json_extract(n.value,'$.status') NOT IN ('queued','blocked','completed') ELSE 1 END)
 AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=production_jobs.id AND m.revision=production_jobs.revision AND m.node IN ('source','script') AND m.artifact_version=(SELECT max(newer.artifact_version) FROM production_milestones newer WHERE newer.job_id=m.job_id AND newer.revision=m.revision AND newer.node=m.node) AND (m.status!='approved' OR m.mode_epoch!=production_jobs.mode_epoch OR m.artifact_hash!=production_jobs.approved_hash))`;
export async function nextAutomaticPrivatePreparation(excludeIds:string[]=[]){
 const rows=(await db().prepare("SELECT j.id,j.owner_id FROM production_jobs j WHERE j.review_mode IN ('auto','node') AND j.is_test=0 AND j.status='approved' AND j.approved_revision=j.revision AND j.lease_hash IS NULL AND j.lease_until IS NULL AND COALESCE(j.error,'')='' ORDER BY j.created_at,j.id LIMIT 100").all<{id:string;owner_id:string}>()).results;
 for(const row of rows){
  if(excludeIds.includes(row.id))continue;let job;try{const scope=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('media_scope_v1:'+row.id).first<{value:string}>();if(scope){const s=JSON.parse(scope.value);if(typeof s?.id!=='string'||!s.id||!Object.hasOwn(s,'scope')||s.scope!==null&&(!s.scope||typeof s.scope!=='object'))continue;}job=await getJob(row.id);}catch(error){if(error instanceof SyntaxError)continue;throw error;}
  const native=await db().prepare('SELECT value FROM app_state WHERE key=?').bind('native_preparation_handoff_v1:'+row.id).first<{value:string}>(),binding=automaticPrivatePreparationBinding(job,row.owner_id,native?.value||null);if(!binding)continue;
  const disposed=await db().prepare("SELECT topic_id FROM dispositions WHERE topic_id=? AND status IN ('produced','rejected') LIMIT 1").bind(job.topic_id).first();if(disposed)continue;const state=native?.value?JSON.parse(native.value):null;
  return{job,kind:'preparation-registration',binding,automatic_private_video:true,...(state?.checkpoint?.artifacts?.length?{preparation_upgrade:{queue_id:state.queue_id,binding:state.binding,artifacts:state.checkpoint.artifacts}}:{}),automatic_trigger:false,execution_started:false,new_paid_calls:0,quality_approval:false,publication_authorization:false};
 }
 return null;
}
