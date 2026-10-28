import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
// Private call locations make uncategorized failures diagnosable without
// retaining messages, response bodies, approved text or credentials.
export function recordPrivateStageFailure(error,{run_id,job_id,cwd=process.cwd()}={}){
 try{
 if(!/^[0-9TZ.-]+-[a-f0-9-]{36}$/.test(run_id||'')||!/^job_[a-f0-9-]{36}$/.test(job_id||''))return;
 const root=path.resolve(cwd),frames=String(error?.stack||'').split('\n').slice(1).flatMap(line=>{try{const match=/((?:file:\/\/\/|[A-Za-z]:[\\/]|\/)[^()\n]+\.(?:mjs|mts|ts|js)):(\d+):(\d+)/.exec(line);if(!match)return[];const file=path.resolve(match[1].startsWith('file:')?fileURLToPath(match[1]):match[1]);if(!file.startsWith(root+path.sep))return[];return[{file:path.relative(root,file).split(path.sep).join('/'),line:Number(match[2]),column:Number(match[3])}];}catch{return[];}}).slice(0,12);
 const dir=path.join(root,'.sites-runtime','periodic-runs',run_id,'private-stage-failures');fs.mkdirSync(dir,{recursive:true});
 const rpc=error?.rpc_diagnostic,method=['initialize','thread/start','mcpServerStatus/list','app/list','config/mcpServer/reload','mcpServer/tool/call','other'].includes(rpc?.method)?rpc.method:null,category=['timeout','connection','rate_limit','authorization','other'].includes(rpc?.category)?rpc.category:null;
 const actions=['read','dispatch_next','native_preparation_read','native_preparation_ensure','native_preparation_claim','native_preparation_progress','local_review_draft_read','local_review_draft_begin','local_review_draft_return','site_archive_read_part','site_archive_start','site_archive_part','site_archive_finalize','site_archive_confirm','promo_list','post_video_preparation_read','post_video_preparation_begin','post_video_preparation_complete'];
 const rpc_diagnostic=method&&category?{method,category,...(actions.includes(rpc.action)?{action:rpc.action}:{}),...(Number.isSafeInteger(rpc.rpc_code)&&Math.abs(rpc.rpc_code)<=100000?{rpc_code:rpc.rpc_code}:{}),...(Number.isInteger(rpc.http_status)&&rpc.http_status>=100&&rpc.http_status<=599?{http_status:rpc.http_status}:{})}:null;
 const value={job_id,observed_at:new Date().toISOString(),code:/^[A-Z_0-9]{1,80}$/.test(error?.code||'')?error.code:null,message_sha256:createHash('sha256').update(String(error?.message||error)).digest('hex'),frames,...(rpc_diagnostic?{rpc_diagnostic}:{})};fs.writeFileSync(path.join(dir,randomUUID()+'.json'),JSON.stringify(value,null,2),{flag:'wx'});
 }catch{return null;}
}
