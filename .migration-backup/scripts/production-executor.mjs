import {executorFetch as fetch} from './native-production-transport.mjs';
// Explicit, single-job, operator-assisted runner; never a daemon or billed media adapter.
// Input: {token,job_id,draft_file,source_file,submission_id}. All paths must exist locally.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const origin='https://siounex-ai-topic-library.siounexzhao.chatgpt.site';
const digest=s=>createHash('sha256').update(s).digest('hex');
const input=await new Promise((r,j)=>{let s='';const tty=process.stdin.isTTY;function done(e){process.stdin.removeListener('data',data);if(tty)process.stdin.setRawMode(false);process.stdin.pause();e?j(e):r(s)}function data(c){s+=c;if(s.includes('\u0003'))done(Error('Cancelled'));else if(s.length>10000)done(Error('Input too large'));else if(/[\r\n]/.test(s))done()}if(tty)process.stdin.setRawMode(true);console.log('Ready for executor JSON on stdin (input hidden).');process.stdin.setEncoding('utf8');process.stdin.on('data',data);process.stdin.on('end',()=>done());process.stdin.resume()});
const config=JSON.parse(input);for(const key of ['draft_file','source_file'])if(!existsSync(resolve(config[key])))throw Error('Required Windows-local input missing: '+key);
const draft=JSON.parse(readFileSync(config.draft_file,'utf8'));const sourceFile=readFileSync(config.source_file);if(draft.execution?.mode!=='operator-assisted')throw Error('This runner only accepts honestly labelled operator-assisted drafts');
if(!draft.evidence?.some(e=>e.sha256===digest(sourceFile)))throw Error('Evidence hash does not match locally materialized source');
async function call(body){const response=await fetch(origin+'/api/executor',{method:'POST',headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${config.token}`},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});const d=await response.json();if(!response.ok)throw Error(JSON.stringify({status:response.status,result:d}));return d}
const prior=await call({action:'read',id:config.job_id});const sid=config.submission_id;if(!sid||typeof sid!=='string')throw Error('Stable submission_id required');
const skill=JSON.parse(prior.job.skill_snapshot);if(draft.execution.skill_hash!==skill.sha256)throw Error('Draft must match the job frozen skill, not the current default');
if(prior.job.drafts.some(x=>x.submission_id===sid)){console.log(JSON.stringify({status:'already-submitted',job_id:config.job_id,revision:prior.job.revision}));process.exit(0)}
draft.execution.source_hash=digest(prior.job.source_snapshot);
const claimed=await call({action:'claim',id:config.job_id,executor:'windows-local-operator-assisted-v1'});if(!claimed.job)throw Error('Job not claimable; read current state before retrying');
const lease={id:claimed.job.id,lease_token:claimed.lease_token};
try{await call({action:'checkpoint',...lease,checkpoint_version:claimed.job.checkpoint_version,checkpoint:{phase:'source-verified-draft-ready',submission_id:sid,source_sha256:digest(sourceFile),skill_sha256:skill.sha256,execution_mode:'operator-assisted',paid_calls:0,local_inputs_verified:true}});
const result=await call({action:'submit',...lease,base_revision:claimed.job.revision,submission_id:sid,draft});mkdirSync('.sites-runtime',{recursive:true});writeFileSync('.sites-runtime/acceptance-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.job.status,job_id:result.job.id,revision:result.job.revision,content_hash:result.job.drafts[0].content_hash,mode:'operator-assisted',paid_calls:0,result_saved:'.sites-runtime/acceptance-result.json'}));}
catch(e){console.error('Result uncertain: do not re-run model or billed service. Read /api/executor action=read first. Checkpoint survives; expired lease can be reclaimed.');throw e}
