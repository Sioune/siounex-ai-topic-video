import type {ProductionJob,MediaOperation} from './production-contract';

// Mirrors the claim boundary without reserving work or changing stale history.
export const CURRENT_OWNER_LICENSE_SQL="NOT EXISTS(SELECT 1 FROM production_reviews ci,json_each(ci.note,'$.proposal.media') im WHERE ci.job_id=j.id AND ci.decision='intake_accepted' AND ci.reviewer=j.owner_id AND json_extract(ci.note,'$.contract_hash')=j.contract_hash AND EXISTS(SELECT 1 FROM production_reviews cl WHERE cl.job_id=j.id AND cl.decision='media_license' AND cl.reviewer=j.owner_id AND json_extract(cl.note,'$.library_file_id')=json_extract(im.value,'$.library_file_id') AND json_extract(cl.note,'$.sha256')=json_extract(im.value,'$.sha256') AND json_extract(cl.note,'$.status')='denied' AND cl.rowid=(SELECT MAX(newer.rowid) FROM production_reviews newer WHERE newer.job_id=j.id AND newer.decision='media_license' AND newer.reviewer=j.owner_id AND json_extract(newer.note,'$.library_file_id')=json_extract(cl.note,'$.library_file_id') AND json_extract(newer.note,'$.sha256')=json_extract(cl.note,'$.sha256'))))";
export const CURRENT_MEDIA_OPERATION_SQL="o.base_artifact_version=COALESCE((SELECT MAX(cm.artifact_version) FROM production_milestones cm WHERE cm.job_id=j.id AND cm.node=o.node AND cm.revision=j.revision),0) AND ((NOT EXISTS(SELECT 1 FROM production_reviews ci WHERE ci.job_id=j.id AND ci.decision='intake_accepted') AND NOT EXISTS(SELECT 1 FROM app_state cs WHERE cs.key='media_scope_v1:'||j.id)) OR EXISTS(SELECT 1 FROM app_state cs WHERE cs.key='media_scope_v1:'||j.id AND json_extract(cs.value,'$.scope.scope')='private-video' AND json_extract(cs.value,'$.scope.binding.revision')=j.revision AND json_extract(cs.value,'$.scope.binding.script_hash')=j.approved_hash AND json_extract(cs.value,'$.scope.binding.mode_epoch')=j.mode_epoch AND json_extract(cs.value,'$.scope.binding.contract_hash')=j.contract_hash AND (NOT EXISTS(SELECT 1 FROM production_reviews ci WHERE ci.job_id=j.id AND ci.decision='intake_accepted') OR json_extract(cs.value,'$.scope.id')=json_extract(o.plan,'$.media_scope_id')))) AND "+CURRENT_OWNER_LICENSE_SQL;

type Job=Pick<ProductionJob,'id'|'revision'|'approved_hash'|'mode_epoch'|'contract_hash'|'milestones'|'intake'|'media_continuation'>;
export function currentMediaOperation(j:Job,o:Pick<MediaOperation,'node'|'revision'|'script_hash'|'mode_epoch'|'base_artifact_version'|'plan'>|Record<string,unknown>){
 if(o.revision!==j.revision||o.script_hash!==j.approved_hash||o.mode_epoch!==j.mode_epoch)return false;
 const latest=Math.max(0,...(j.milestones||[]).filter(m=>m.node===o.node&&m.revision===j.revision).map(m=>m.artifact_version));
 if(o.base_artifact_version!==latest)return false;
 const c=j.media_continuation,s=c?.scope,b=s?.binding;
 if(j.intake||s||c?.current_id){
  if(!s||s.scope!=='private-video'||b?.revision!==j.revision||b.script_hash!==j.approved_hash||b.mode_epoch!==j.mode_epoch||b.contract_hash!==j.contract_hash)return false;
  if(j.intake){try{if(JSON.parse(String(o.plan)).media_scope_id!==s.id)return false}catch{return false}}
  for(const m of j.intake?.proposal.media||[]){if(c?.licenses.some(l=>l.library_file_id===m.library_file_id&&l.sha256===m.sha256&&l.status==='denied'))return false;}
 }
 return true;
}
