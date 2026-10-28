// New calls reserve bounded model time and a separate return margin.
export const WORKFLOW_RETURN_MARGIN_MS=60000;
export function workflowStageBudget(stage,deadline=Infinity,now=Date.now()){
 if(deadline!==Infinity&&(!Number.isFinite(deadline)||deadline<0))throw Error('Invalid inherited workflow deadline');
 const model_ms=stage==='generation'?360000:stage==='review'?180000:0,remaining_ms=deadline-now,required_ms=model_ms+WORKFLOW_RETURN_MARGIN_MS;
 return {stage,remaining_ms,required_ms,can_start:remaining_ms>=required_ms,model_timeout_ms:model_ms||null};
}
export function workflowBudgetDeferred(job,stage,budget){return {workflow_result:true,status:'workflow-stage-budget-deferred',job_id:job.id,revision:job.revision,phase:stage,claimed:false,new_model_calls:0,remaining_ms:Math.max(0,budget.remaining_ms),required_ms:budget.required_ms,existing_outputs_retained:true};}
