// Resource restoration only: this proof never covers a producer/model call.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const schema='private-review-preclaim-resource-failure-v1';
export function resourcePreclaimError(error){
 if(error?.code==='PRIVATE_CONTINUATION_BUDGET_DEFERRED')return error;
 const message=String(error?.message||error).slice(0,500),history=/history|History|series/i.test(message);
 const detail=history?'三期历史资源尚未就绪：'+(/actual job file identity/.test(message)?'已锁定的三期中存在没有真实任务文件身份的记录。':/approved cover/.test(message)?'已锁定的历史任务缺少已批准封面。':/landscape cover/.test(message)?'已锁定的历史任务缺少精确绑定的4:3封面归档。':/confirmed exact archive/.test(message)?'已锁定的历史封面归档尚未确认。':'当前系列选择或历史封面文件未通过精确校验。')+' 请在制作台“系列模板与最近三期”沿用当前模板、刷新并确认三期真实任务；不猜测旧记录或替换已审图片。':'可复用制作资源未通过实际文件校验：'+message+'。请恢复所选片尾、配乐或对应资源的原始文件与绑定，再继续当前任务；不使用替代素材。';
 const specific=Array.isArray(error?.history_missing_jobs)?' 实际缺项：'+error.history_missing_jobs.map(h=>'第'+h.index+'期“'+h.title+'”没有真实job文件').join('；')+'。':'';
 return Object.assign(Error(detail+specific),{code:'PRIVATE_REVIEW_PRECLAIM_RESOURCE_FAILURE',preclaim_resource_failure:{schema,phase:'resource-restore-before-material-plan',confirmed_no_generation:true,original_error:message,missing:[{code:history?'private-review-history-resources':'private-review-reusable-resources',detail:detail+specific}]},cause:error});
}
function noProducer(job,root){
 const dir=path.resolve(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'private-review');
 if(!fs.existsSync(dir))return true;
 const walk=p=>{for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.isSymbolicLink())return false;if(e.isDirectory()){if(!walk(path.join(p,e.name)))return false;}else if(/^(?:producer-started|producer-receipt)\.json$/.test(e.name))return false;}return true;};return walk(dir);
}
function fileProof(a,root){
 if(a?.kind!=='local-file'||!a.file?.endsWith('/preclaim-resource-failure.json'))return null;
 try{const base=fs.realpathSync(root),file=fs.realpathSync(path.resolve(root,a.file));if(!file.startsWith(base+path.sep))return null;const bytes=fs.readFileSync(file);if(bytes.length!==a.size_bytes||sha(bytes)!==a.sha256)return null;return JSON.parse(bytes.toString('utf8'));}catch{return null;}
}
export function readResourcePreclaimFailure(job,h,{root,binding}={}){
 if(!isResourcePreclaimCandidate(h)||!noProducer(job,root))return null;
 const p=(h.checkpoint?.artifacts||[]).map(a=>fileProof(a,root)).filter(Boolean).at(-1);
 if(!p||p.schema!==schema||p.job_id!==job.id||p.queue_id!==h.queue_id||p.invocation_id!==h.invocation_id||p.producer_claimed!==false||p.confirmed_no_generation!==true||canonical(p.binding)!==canonical(binding)||p.scope_hash!==sha(canonical(job.media_continuation.scope))||canonical(p.missing)!==canonical(h.missing))return null;
 return p;
}
// Selection hint only; the continuation must verify proof bytes/current scope.
export function isResourcePreclaimCandidate(h){return h?.status==='blocked'&&!h.base_video&&h.lease_until==null&&h.binding?.scope==='private-video'&&h.executor==='finite-local-private-resource-preflight-v1'&&/^private-resource-preflight-[a-f0-9-]{36}$/.test(h.invocation_id||'')&&h.checkpoint?.artifacts?.some(a=>a.kind==='local-file'&&a.file?.endsWith('/preclaim-resource-failure.json'))===true;}
export async function persistResourcePreclaimFailure(job,h,prepared,error,{call,root,binding,now=Date.now}={}){
 const failure=error.preclaim_resource_failure;
 if(failure?.schema!==schema||failure.confirmed_no_generation!==true||h.base_video||!['queued','blocked'].includes(h.status)||!noProducer(job,root))throw error;
 const prior=readResourcePreclaimFailure(job,h,{root,binding});if(h.status==='blocked'&&!prior)throw error;
 const identity={job_id:job.id,queue_id:h.queue_id,binding,scope_hash:sha(canonical(job.media_continuation.scope)),series_hash:sha(canonical(job.series?.current||null)),prepared_input_hash:prepared?.input_hash||null,prepared_artifacts:(prepared?.artifacts||[]).map(({verified_at,...a})=>a),missing:failure.missing};
 const same=prior&&prior.input_hash===sha(canonical(identity));
 const result=handoff=>({status:'private-review-resources-blocked',job_id:job.id,queue_id:h.queue_id,claimed:false,generation_started:false,confirmed_no_generation:true,producer_claimed:false,missing:failure.missing,handoff,local_files_retained:true,retry_after_resource_fix:true,new_paid_calls:0,quality_approved:false,publication_authorized:false});
 if(same)return result(h);
 const invocation='private-resource-preflight-'+randomUUID(),proof={schema,...identity,input_hash:sha(canonical(identity)),invocation_id:invocation,phase:failure.phase,original_error:failure.original_error,producer_claimed:false,confirmed_no_generation:true,created_at:new Date(now()).toISOString()},bytes=Buffer.from(canonical(proof)),dir=path.resolve(root,'.sites-runtime/authorized-inputs',job.id,'revision-'+job.revision,'native-preparation',h.queue_id,'preclaim-failures',sha(bytes)),file=path.join(dir,'preclaim-resource-failure.json');
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});
 const artifact={kind:'local-file',file:path.relative(root,file).split(path.sep).join('/'),sha256:sha(bytes),size_bytes:bytes.length,purpose:'render-receipt',verified_at:proof.created_at,verification:'executor-reported-local-bytes'};
 let claim;try{
  claim=await call({action:'native_preparation_claim',id:job.id,queue_id:h.queue_id,version:h.version,executor:'finite-local-private-resource-preflight-v1',invocation_id:invocation,...(prior?{reason:'此前仅资源预检失败、确认没有生产调用；保存本次精确输入缺项，保留已恢复图片与计划。'}:{})});
  const saved=await call({action:'native_preparation_progress',id:job.id,queue_id:h.queue_id,version:claim.handoff.version,invocation_id:invocation,lease_token:claim.lease_token,status:'blocked',artifacts:[...(prepared?.artifacts||[]),artifact],missing:failure.missing,note:'制作前资源检查已停止，确认尚未领取生产器或调用生成；已恢复的作者图片和编辑计划保留。修正下列资源后继续同一任务，不重做来源与口播审核。'});
  return result(saved.handoff);
 }catch{
  const read=await call({action:'native_preparation_read',id:job.id}).catch(()=>null),p=readResourcePreclaimFailure(job,read?.handoff,{root,binding});
  if(p?.invocation_id===invocation)return result(read.handoff);
  return{status:'private-review-result-unknown',job_id:job.id,queue_id:h.queue_id,claimed:false,generation_started:false,producer_claimed:false,missing:failure.missing,local_files_retained:true,retry_without_reconciliation:false,phase:'save-resource-preflight-failure',new_paid_calls:0,publication_authorized:false};
 }finally{if(claim)claim.lease_token='';}
}