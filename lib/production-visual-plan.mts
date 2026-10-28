import {createHash} from 'node:crypto';
type Row = Record<string, any>;
const canonical = (value: any) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (code: string): never => { throw Object.assign(new Error(code), {code}); };
const text = (value: any) => typeof value === 'string' && value.trim().length > 0;
const keys = ['revision','script_hash','mode_epoch','contract_hash','scope_id'];

// Production delegation permits honest shot selection for an unchanged approved
// narration. It is separate from final video approval, and never edits the old
// approved draft. The exact original and effective plans travel in the project.
// A promised real demonstration cannot be converted to an explanatory still.
export function effectiveProductionStoryboard({job_id, binding, approved_storyboard, script, plan, demonstration_required = false}: {job_id: string; binding: Row; approved_storyboard: Row[]; script: string; plan?: any; demonstration_required?: boolean}) {
 if (plan == null) return approved_storyboard;
 const originalHash = sha(canonical(approved_storyboard));
 if (plan.schema !== 'owner-delegated-production-visual-plan-v1' || plan.job_id !== job_id || !plan.binding || keys.some(k => plan.binding[k] !== binding[k]) || plan.original_storyboard_sha256 !== originalHash || plan.script_text_sha256 !== sha(script)) fail('PRODUCTION_VISUAL_PLAN_BINDING_CHANGED');
 const a = plan.authorization;
 if (a?.kind !== 'owner-delegated-material-editing' || !text(a.request_text) || !text(a.evidence_reference) || !text(a.recorded_at) || a.final_quality_approved !== false || a.publication_authorized !== false || plan.narration_changed !== false || plan.simulated_evidence_allowed !== false || !Array.isArray(plan.storyboard) || plan.storyboard.length !== approved_storyboard.length || !Array.isArray(plan.changes) || !plan.changes.length) fail('PRODUCTION_VISUAL_PLAN_DELEGATION_REQUIRED');
 const seen = new Set<number>(), allowed = new Set(['asset_id','visual','material_kind']);
 const result = plan.storyboard.map((row: Row, index: number) => {
  const original = approved_storyboard[index];
  if (!row || Object.keys({...original,...row}).some(k => !allowed.has(k) && canonical(row[k]) !== canonical(original[k])) || !text(row.asset_id) || !text(row.visual) || !['image','video','article-quote'].includes(row.material_kind)) fail('PRODUCTION_VISUAL_PLAN_NARRATION_OR_TIMING_CHANGED');
  const changed = canonical(row) !== canonical(original), records = plan.changes.filter((c: Row) => c.storyboard_index === index);
  if (changed) {
   if (records.length !== 1 || !text(records[0].reason) || !text(records[0].evidence_reference) || records[0].review_kind !== 'executor-source-and-narration-match' || records[0].final_quality_approved !== false) fail('PRODUCTION_VISUAL_PLAN_CHANGE_EVIDENCE_REQUIRED');
   seen.add(index);
   if ((demonstration_required || original.demonstration_required === true) && row.material_kind !== 'video') fail('PRODUCTION_VISUAL_PLAN_REAL_DEMONSTRATION_REQUIRED');
  } else if (records.length) fail('PRODUCTION_VISUAL_PLAN_SPURIOUS_CHANGE');
  return {...row};
 });
 if (seen.size !== plan.changes.length || plan.changes.some((c: Row) => !Number.isInteger(c.storyboard_index) || !seen.has(c.storyboard_index)) || plan.effective_storyboard_sha256 !== sha(canonical(result))) fail('PRODUCTION_VISUAL_PLAN_EFFECTIVE_IDENTITY_CHANGED');
 return result;
}
