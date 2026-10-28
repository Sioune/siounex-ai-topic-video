import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectMaterialSelectionHistory} from './material-selection-reconciliation.mjs';
import {legacySelectionPolicyTransition,materialSelectionParent} from './legacy-selection-policy-transition.mjs';
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function saveSelectionReconciliation(selection,diagnostic,{call}){
 const {handoff:h}=await call({action:'native_preparation_read',id:selection.job.id}),b=selection.native_preparation?.binding;
 if(!h||h.queue_id!==(selection.native_preparation.queue_id||selection.native_preparation.handoff?.queue_id)||canonical(h.binding)!==canonical(b))throw Error('PRIVATE_SELECTION_RECONCILIATION_BINDING_CHANGED');
 if(h.reconciliation&&canonical(h.reconciliation)===canonical(diagnostic))return h;
 return(await call({action:'native_preparation_reconcile_diagnostic',id:selection.job.id,queue_id:h.queue_id,version:h.version,binding:h.binding,request_id:'native-reconcile-'+sha(canonical([h.queue_id,h.version,diagnostic])),diagnostic})).handoff;
}
export function selectionReconciliationResult(selection,h){return{status:h.reconciliation?.state==='unknown'?'private-review-result-unknown':'private-review-selection-deferred',job_id:selection.job.id,queue_id:h.queue_id,claimed:false,generation_started:false,waiting_for:h.waiting_for,handoff:h,failure:{code:h.reconciliation?.code,phase:'automatic-material-selection'},next_retry_at:h.reconciliation?.next_retry_at,retry_without_reconciliation:false,new_paid_calls:0,quality_approved:false,publication_authorized:false};}
export async function reconcileHeldSelection(selection,{call,root=process.cwd(),now=Date.now}={}){
 const h=selection.native_preparation?.handoff||selection.native_preparation,r=h?.reconciliation;if(!r||['resolved','superseded'].includes(r.state))return{selection};
 const transition=legacySelectionPolicyTransition(selection,{root});if(transition){const saved=await saveSelectionReconciliation(selection,transition,{call});return{selection:{...selection,native_preparation:{...selection.native_preparation,...h,...saved,job_id:selection.job.id}}};}
 if(r.state==='cooldown'&&Date.parse(r.next_retry_at)>now())return{result:selectionReconciliationResult(selection,h)};
 const {scope,...binding}=h.binding,parent=materialSelectionParent(path.resolve(root,'.sites-runtime/authorized-inputs',selection.job.id,'revision-'+binding.revision),binding);
 let history;try{history=inspectMaterialSelectionHistory(parent,binding,{now});}catch(error){if(!error.material_reconciliation)throw error;const saved=await saveSelectionReconciliation(selection,error.material_reconciliation,{call});return{result:selectionReconciliationResult(selection,saved)};}
 if(!r.evidence_hashes?.length||!history.evidence_hashes.length||!r.evidence_hashes.every(hash=>history.evidence_hashes.includes(hash)))return{result:selectionReconciliationResult(selection,h)};
 const diagnostic={schema:'native-preclaim-reconciliation-v1',state:'resolved',code:'AUTO_MATERIAL_RECONCILED',phase:'automatic-material-selection',fingerprint:sha(canonical([r.fingerprint,history.fingerprint])),previous_fingerprint:r.fingerprint,evidence_hashes:history.evidence_hashes};
 const saved=await saveSelectionReconciliation(selection,diagnostic,{call});return{selection:{...selection,native_preparation:{...selection.native_preparation,...h,...saved,job_id:selection.job.id}}};
}
