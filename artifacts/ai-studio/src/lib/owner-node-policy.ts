import {db} from './store';
import {ProductionError} from './production-contract';

// This is an explicit owner instruction, not an approval of any artifact.
export const ownerNodePolicyKey=(owner:string)=>'owner_manual_review_policy_v1:'+owner;
const activeSql=`status NOT IN ('completed','cancelled') AND is_test=0`;
const idleSql=`status NOT IN ('running','ai_running') AND COALESCE(lease_until,0)=0
 AND NOT EXISTS(SELECT 1 FROM production_milestones m WHERE m.job_id=production_jobs.id AND (m.status='ai_running' OR COALESCE(m.review_until,0)>0))
 AND NOT EXISTS(SELECT 1 FROM production_operations o WHERE o.job_id=production_jobs.id AND o.status IN ('running','prepared'))
 AND NOT EXISTS(SELECT 1 FROM production_stages s WHERE s.job_id=production_jobs.id AND s.status='running')
 AND NOT EXISTS(SELECT 1 FROM production_promo_packages p WHERE p.job_id=production_jobs.id AND p.status='running')
 AND NOT EXISTS(SELECT 1 FROM app_state h WHERE h.key='native_preparation_handoff_v1:'||production_jobs.id AND CASE WHEN json_valid(h.value) THEN json_extract(h.value,'$.status')='claimed' ELSE 1 END)
 AND NOT EXISTS(SELECT 1 FROM app_state d WHERE d.key>='local_review_draft_v1:'||production_jobs.id||':' AND d.key<'local_review_draft_v1:'||production_jobs.id||';' AND CASE WHEN json_valid(d.value) THEN json_extract(d.value,'$.status')='staging' ELSE 1 END)`;
export async function ownerNodePolicyEnabled(owner:string){if(!owner)return false;const r=await db().prepare("SELECT value FROM app_state WHERE key=? AND json_valid(value) AND json_extract(value,'$.status')='enabled'").bind(ownerNodePolicyKey(owner)).first();return !!r;}
export async function applyOwnerNodePolicy(owner:string){
 if(!owner||!await ownerNodePolicyEnabled(owner))return {enabled:false,converted:0,pending:0};
 const t=new Date().toISOString(),result=await db().batch([
  db().prepare(`UPDATE production_jobs SET review_mode='node',updated_at=? WHERE owner_id=? AND ${activeSql} AND review_mode='auto' AND ${idleSql} AND EXISTS(SELECT 1 FROM app_state policy WHERE policy.key=? AND json_valid(policy.value) AND json_extract(policy.value,'$.status')='enabled')`).bind(t,owner,ownerNodePolicyKey(owner)),
  db().prepare(`UPDATE production_milestones SET status='awaiting_human',updated_at=? WHERE status='awaiting_ai' AND EXISTS(SELECT 1 FROM production_jobs j WHERE j.id=production_milestones.job_id AND j.owner_id=? AND j.is_test=0 AND j.status NOT IN ('completed','cancelled') AND j.review_mode='node' AND j.revision=production_milestones.revision AND j.mode_epoch=production_milestones.mode_epoch) AND EXISTS(SELECT 1 FROM app_state policy WHERE policy.key=? AND json_valid(policy.value) AND json_extract(policy.value,'$.status')='enabled')`).bind(t,owner,ownerNodePolicyKey(owner))
 ]);
 const rows=await db().prepare(`SELECT id,status,review_mode FROM production_jobs WHERE owner_id=? AND ${activeSql} AND review_mode='auto' ORDER BY id`).bind(owner).all<{id:string;status:string;review_mode:string}>();
 return {enabled:true,converted:Number(result[0].meta.changes),pending:rows.results.length,pending_jobs:rows.results.map(r=>({id:r.id,status:r.status})),mode_epoch_preserved:true,quality_approval:false,publication_authorized:false};
}
export async function enableOwnerNodePolicy(owner:string){if(!owner)throw new ProductionError('仅本人可设置人工审核模式',403);const key=ownerNodePolicyKey(owner),value=JSON.stringify({schema:'owner-manual-review-policy-v1',status:'enabled'});await db().prepare('INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING').bind(key,value).run();const r=await db().prepare('SELECT value FROM app_state WHERE key=?').bind(key).first<{value:string}>();if(r?.value!==value)throw new ProductionError('本人审核策略状态异常，未覆盖原记录',409);return applyOwnerNodePolicy(owner);}
