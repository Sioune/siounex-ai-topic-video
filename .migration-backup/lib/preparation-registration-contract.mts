import type {ProductionJob} from './production-contract';
import {bindingMatches,scopeBinding} from './media-continuation-contract';
import {legacyApprovedProductionCandidate} from './approved-production-policy.mts';

export const PREPARATION_REGISTRATION_EXCLUSIONS=[
 'job_9ef39025-d92e-4770-82d0-05881451c5df',
 'job_bf4b0b5a-3adc-4bb7-8560-25f20c3eeaee'
] as const;
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const preparationStages=new Set(['media_inventory','media_inputs']);
const candidateReviews=new Set(['native_video_candidate','native_video_archive_v1','private_publicity_files','media_preparation']);
const settledOperations=new Set(['completed','abandoned','cancelled']);
// Selection mirrors prepStage's full binding rather than repeatedly returning a
// stale queue that claimPreparation must reject. Invalid JSON stays unselected.
export const CURRENT_PREPARATION_QUEUE_SQL=`
 j.status='approved' AND j.approved_revision=j.revision
 AND s.review_revision=j.revision AND s.review_hash=j.approved_hash
 AND s.stage IN ('media_inventory','media_inputs') AND s.status='queued'
 AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=j.id AND v.published_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM dispositions dt WHERE dt.topic_id=j.topic_id AND dt.status IN ('produced','rejected'))
 AND CASE WHEN json_valid(s.result) AND json_valid(a.value) THEN
  json_extract(s.result,'$.schema')='media-input-probe-v1'
  AND json_type(s.result,'$.attempt')='integer' AND json_extract(s.result,'$.attempt') BETWEEN 0 AND 2
  AND json_extract(a.value,'$.scope.schema')='owner-media-scope-v1'
  AND json_extract(a.value,'$.scope.scope') IN ('preparation','private-video')
  AND json_extract(a.value,'$.scope.new_paid_authorization')=0
  AND json_extract(a.value,'$.scope.publication_authorization')=0
  AND json_extract(a.value,'$.scope.quality_approved')=0
  AND json_type(a.value,'$.id')='text' AND length(json_extract(a.value,'$.id'))>0
  AND json_extract(a.value,'$.id')=json_extract(a.value,'$.scope.id')
  AND json_type(s.result,'$.scope_id')='text'
  AND json_extract(s.result,'$.scope_id')=json_extract(a.value,'$.id')
  AND json_type(a.value,'$.scope.binding.revision')='integer'
  AND json_type(a.value,'$.scope.binding.mode_epoch')='integer'
  AND json_extract(a.value,'$.scope.binding.revision')=j.revision
  AND json_extract(a.value,'$.scope.binding.script_hash')=j.approved_hash
  AND json_extract(a.value,'$.scope.binding.mode_epoch')=j.mode_epoch
  AND json_extract(a.value,'$.scope.binding.contract_hash')=j.contract_hash
  AND json_type(s.result,'$.binding.revision')='integer'
  AND json_type(s.result,'$.binding.mode_epoch')='integer'
  AND json_extract(s.result,'$.binding.revision')=j.revision
  AND json_extract(s.result,'$.binding.script_hash')=j.approved_hash
  AND json_extract(s.result,'$.binding.mode_epoch')=j.mode_epoch
  AND json_extract(s.result,'$.binding.contract_hash')=j.contract_hash
 ELSE 0 END
`;
type RegistrationJob=Pick<ProductionJob,'id'|'is_test'|'status'|'revision'|'approved_revision'|'approved_hash'|'mode_epoch'|'contract_hash'|'error'|'lease_until'|'media_continuation'>&{
 publication_reports?:unknown[];facts?:{candidate_present?:unknown};
 drafts?:{revision?:unknown;content_hash?:unknown;content?:unknown}[];
 milestones?:{revision?:unknown;node?:unknown;artifact_version?:unknown;status?:unknown;mode_epoch?:unknown;artifact_hash?:unknown}[];
 operations?:{status?:unknown;revision?:unknown;node?:unknown}[];
 stages?:{status?:unknown;review_revision?:unknown;stage?:unknown}[];
 reviews?:{revision?:unknown;decision?:unknown}[];
};

// The SQL prefilter and this second read agree on the registration boundary.
// This does not grant scope or repair partial stages: registerFreePreparation's
// existing exact-binding/state CAS remains the only mutation.
export function preparationRegistrationBinding(j:RegistrationJob,ownerId:string|null){
 if(!ownerId?.trim()||j.is_test||PREPARATION_REGISTRATION_EXCLUSIONS.some(id=>id===j.id)&&!legacyApprovedProductionCandidate(j)||j.status!=='approved'||j.revision<1||j.approved_revision!==j.revision||!hash(j.approved_hash)||!hash(j.contract_hash)||j.error||j.lease_until!=null||j.publication_reports?.length||j.facts?.candidate_present)return null;
 const draft=j.drafts?.find(d=>d.revision===j.revision&&d.content_hash===j.approved_hash);
 try{if(!draft||typeof draft.content!=='string'||typeof JSON.parse(draft.content).script!=='string'||!JSON.parse(draft.content).script.trim())return null}catch{return null}
 const textNodes=(j.milestones||[]).filter(m=>m.revision===j.revision&&['source','script'].includes(String(m.node)));
 if(textNodes.length){for(const node of ['source','script']){const current=textNodes.filter(m=>m.node===node).sort((a,b)=>Number(b.artifact_version)-Number(a.artifact_version))[0];if(!current||current.status!=='approved'||current.mode_epoch!==j.mode_epoch||current.artifact_hash!==j.approved_hash)return null}}
 if(j.milestones?.some(m=>m.status==='ai_running'||m.revision===j.revision&&m.node==='video'))return null;
 if(j.operations?.some(o=>!settledOperations.has(String(o.status))||o.revision===j.revision&&o.node==='video'&&o.status==='completed'))return null;
 if(j.stages?.some(s=>['running','prepared','paused'].includes(String(s.status))||s.review_revision===j.revision&&(preparationStages.has(String(s.stage))||s.stage==='video')))return null;
 if(j.reviews?.some(r=>Number(r.revision)===j.revision&&candidateReviews.has(String(r.decision))))return null;
 const continuation=j.media_continuation,current=continuation?.scope;
 if(continuation?.current_id){
  if(!current||current.id!==continuation.current_id||current.schema!=='owner-media-scope-v1'||!['preparation','private-video'].includes(current.scope)||current.new_paid_authorization!==false||current.publication_authorization!==false||current.quality_approved!==false||!Number.isInteger(current.binding?.revision)||!Number.isInteger(current.binding?.mode_epoch)||current.binding.revision<1||current.binding.mode_epoch<0||current.binding.revision>j.revision||current.binding.mode_epoch>j.mode_epoch||!hash(current.binding?.script_hash)||!hash(current.binding?.contract_hash)||bindingMatches(j,current.binding)||current.binding.revision===j.revision&&current.binding.mode_epoch===j.mode_epoch)return null;
 }else if(current||j.reviews?.some(r=>['media_scope','media_scope_cancel'].includes(String(r.decision))))return null;
 return scopeBinding(j);
}

// Aliases: j=production_jobs; registration_scope=its media_scope app_state row.
// CASE protects JSON access so a corrupt/unknown scope is skipped, not retried.
export const PREPARATION_REGISTRATION_SQL=`
 j.is_test=0 AND j.id NOT IN (${PREPARATION_REGISTRATION_EXCLUSIONS.map(id=>"'"+id+"'").join(',')})
 AND j.owner_id IS NOT NULL AND length(trim(j.owner_id))>0
 AND j.status='approved' AND j.revision>0 AND j.approved_revision=j.revision
 AND length(j.approved_hash)=64 AND j.approved_hash NOT GLOB '*[^a-f0-9]*'
 AND length(j.contract_hash)=64 AND j.contract_hash NOT GLOB '*[^a-f0-9]*'
 AND COALESCE(j.error,'')='' AND j.lease_hash IS NULL AND j.lease_until IS NULL
 AND EXISTS(SELECT 1 FROM production_drafts d WHERE d.job_id=j.id AND d.revision=j.revision AND d.content_hash=j.approved_hash AND CASE WHEN json_valid(d.content) THEN json_type(d.content,'$.script')='text' AND length(trim(json_extract(d.content,'$.script')))>0 ELSE 0 END)
 AND NOT EXISTS(SELECT 1 FROM production_data_videos v WHERE v.job_id=j.id AND v.published_at IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM dispositions dt WHERE dt.topic_id=j.topic_id AND dt.status IN ('produced','rejected'))
 AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND (m.status='ai_running' OR (m.revision=j.revision AND m.node='video')))
 AND (SELECT count(DISTINCT m.node) FROM production_milestones m WHERE m.job_id=j.id AND m.revision=j.revision AND m.node IN ('source','script')) IN (0,2)
 AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=j.id AND m.revision=j.revision AND m.node IN ('source','script') AND m.artifact_version=(SELECT max(newer.artifact_version) FROM production_milestones newer WHERE newer.job_id=m.job_id AND newer.revision=m.revision AND newer.node=m.node) AND (m.status!='approved' OR m.mode_epoch!=j.mode_epoch OR m.artifact_hash!=j.approved_hash))
 AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=j.id AND (o.status NOT IN ('completed','abandoned','cancelled') OR (o.revision=j.revision AND o.node='video' AND o.status='completed')))
 AND NOT EXISTS(SELECT 1 FROM production_stages s WHERE s.job_id=j.id AND (s.status IN ('running','prepared','paused') OR (s.review_revision=j.revision AND s.stage IN ('media_inventory','media_inputs','video'))))
 AND NOT EXISTS(SELECT 1 FROM production_reviews r WHERE r.job_id=j.id AND r.revision=j.revision AND r.decision IN ('native_video_candidate','native_video_archive_v1','private_publicity_files','media_preparation'))
 AND (registration_scope.key IS NOT NULL OR NOT EXISTS(SELECT 1 FROM production_reviews r WHERE r.job_id=j.id AND r.decision IN ('media_scope','media_scope_cancel')))
 AND (registration_scope.key IS NULL OR CASE WHEN json_valid(registration_scope.value) THEN
  json_type(registration_scope.value,'$.scope')='object'
  AND length(json_extract(registration_scope.value,'$.id'))>0
  AND json_extract(registration_scope.value,'$.id')=json_extract(registration_scope.value,'$.scope.id')
  AND json_extract(registration_scope.value,'$.scope.schema')='owner-media-scope-v1'
  AND json_extract(registration_scope.value,'$.scope.scope') IN ('preparation','private-video')
  AND json_extract(registration_scope.value,'$.scope.new_paid_authorization')=0
  AND json_extract(registration_scope.value,'$.scope.publication_authorization')=0
  AND json_extract(registration_scope.value,'$.scope.quality_approved')=0
  AND json_type(registration_scope.value,'$.scope.binding.revision')='integer'
  AND json_type(registration_scope.value,'$.scope.binding.mode_epoch')='integer'
  AND length(json_extract(registration_scope.value,'$.scope.binding.script_hash'))=64
  AND json_extract(registration_scope.value,'$.scope.binding.script_hash') NOT GLOB '*[^a-f0-9]*'
  AND length(json_extract(registration_scope.value,'$.scope.binding.contract_hash'))=64
  AND json_extract(registration_scope.value,'$.scope.binding.contract_hash') NOT GLOB '*[^a-f0-9]*'
  AND json_extract(registration_scope.value,'$.scope.binding.revision') BETWEEN 1 AND j.revision
  AND json_extract(registration_scope.value,'$.scope.binding.mode_epoch') BETWEEN 0 AND j.mode_epoch
  AND (json_extract(registration_scope.value,'$.scope.binding.revision')<j.revision OR json_extract(registration_scope.value,'$.scope.binding.mode_epoch')<j.mode_epoch)
 ELSE 0 END)
`;
