// A previously saved owner opinion can authorize exactly one new text revision.
// It is not an approval of that revision or of any media.
const parse=(v:any)=>{try{return typeof v==='string'?JSON.parse(v):v}catch{return null}};
export function ownerFeedbackContinuation(job:any){
 for(const g of job?.reviews||[]){if(g.decision!=='owner_feedback_continuation_v1'||g.reviewer!=='site-feedback-continuation')continue;const p=parse(g.note),r=job.reviews.find((x:any)=>x.id===p?.feedback_id&&x.decision==='script_feedback'),v=parse(r?.note),d=job.drafts?.find((x:any)=>x.revision===p?.source_revision);
  if(p?.schema==='owner-feedback-continuation-v1'&&p.job_id===job.id&&p.owner_id===r?.reviewer&&(!job.owner_id||job.owner_id===p.owner_id)&&v?.schema==='siounex-script-feedback-v1'&&v.note===p.feedback_note&&v.revision===r.revision&&v.script_hash===r.content_hash&&v.rework_started===false&&p.mode_epoch===job.mode_epoch&&p.contract_hash===job.contract_hash&&p.target_revision===p.source_revision+1&&[p.source_revision,p.target_revision].includes(job.revision)&&p.source_hash===d?.content_hash&&job.reworks===p.reworks&&Number.isSafeInteger(p.max_ai_calls)&&Number.isSafeInteger(p.max_attempts)&&p.quality_approval===false&&p.publication_authorized===false)return {...p,queue_id:g.id};
 }
 return null;
}
export function continuationSql(alias='j'){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias))throw Error('invalid alias');const q="CASE WHEN json_valid(g.note) THEN g.note ELSE '{}' END",f="CASE WHEN json_valid(op.note) THEN op.note ELSE '{}' END",v=(s:string)=>`json_extract(${q},'$.${s}')`;
 return `EXISTS(SELECT 1 FROM production_reviews g JOIN production_reviews op ON op.id=${v('feedback_id')} AND op.job_id=${alias}.id AND op.decision='script_feedback' AND op.reviewer=${alias}.owner_id JOIN production_drafts old ON old.job_id=${alias}.id AND old.revision=${v('source_revision')} AND old.content_hash=${v('source_hash')} WHERE g.job_id=${alias}.id AND g.decision='owner_feedback_continuation_v1' AND g.reviewer='site-feedback-continuation' AND ${v('schema')}='owner-feedback-continuation-v1' AND ${v('job_id')}=${alias}.id AND ${v('owner_id')}=${alias}.owner_id AND ${v('feedback_note')}=json_extract(${f},'$.note') AND json_extract(${f},'$.schema')='siounex-script-feedback-v1' AND json_extract(${f},'$.rework_started')=0 AND json_extract(${f},'$.revision')=op.revision AND json_extract(${f},'$.script_hash')=op.content_hash AND ${v('mode_epoch')}=${alias}.mode_epoch AND ${v('contract_hash')}=${alias}.contract_hash AND ${v('target_revision')}=${v('source_revision')}+1 AND ${alias}.revision IN (${v('source_revision')},${v('target_revision')}) AND ${v('reworks')}=${alias}.reworks AND json_extract(${q},'$.quality_approval')=0 AND json_extract(${q},'$.publication_authorized')=0)`;
}

export function continuationLimitSql(alias='j',kind:'generation'|'review'='review'){
 const field=kind==='generation'?'max_attempts':'max_ai_calls',fallback=kind==='generation'?6:8;
 return `(CASE WHEN ${continuationSql(alias)} THEN (SELECT MAX(CAST(json_extract(CASE WHEN json_valid(g.note) THEN g.note ELSE '{}' END,'$.${field}') AS INTEGER)) FROM production_reviews g WHERE g.job_id=${alias}.id AND g.decision='owner_feedback_continuation_v1' AND g.reviewer='site-feedback-continuation' AND json_extract(CASE WHEN json_valid(g.note) THEN g.note ELSE '{}' END,'$.reworks')=${alias}.reworks AND json_extract(CASE WHEN json_valid(g.note) THEN g.note ELSE '{}' END,'$.mode_epoch')=${alias}.mode_epoch) ELSE ${fallback} END)`;
}
