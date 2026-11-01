import path from 'node:path';import {fileURLToPath} from 'node:url';
import {backfillCoverThumbnail} from './cover-thumbnail-backfill.mjs';
// Map only exact, locally defined codes. Never persist upstream error text,
// arguments, tokens, private media metadata or any other exception content.
export function thumbnailErrorClass(error){
 const exact=typeof error?.code==='string'?error.code:typeof error?.message==='string'?error.message:'';
 const classes={NATIVE_PRODUCTION_RESULT_UNKNOWN:'result_unknown',NATIVE_PRODUCTION_TOOL_FAILED:'transport_failed',NATIVE_PRODUCTION_TOOL_REJECTED:'tool_rejected',NATIVE_PRODUCTION_START_FAILED:'runtime_unavailable',NATIVE_PRODUCTION_CLI_UNAVAILABLE:'runtime_unavailable',NATIVE_PRODUCTION_CLI_IDENTITY_CHANGED:'runtime_unavailable',NATIVE_PRODUCTION_TOOL_UNAVAILABLE:'runtime_unavailable',NATIVE_PRODUCTION_INTERACTION_REQUIRED:'interaction_required',THUMBNAIL_WORKER_CLAIM_FAILED:'claim_failed',THUMBNAIL_WORKER_SCAN_FAILED:'scan_failed',THUMBNAIL_WORKER_FINISH_FAILED:'finish_failed',THUMBNAIL_WORKER_DEADLINE:'deadline',THUMBNAIL_SOURCE_READ_FAILED:'source_read_failed',THUMBNAIL_SOURCE_BINDING_CHANGED:'source_changed',THUMBNAIL_SOURCE_PART_CHANGED:'source_changed',THUMBNAIL_SOURCE_CHANGED:'source_changed',THUMBNAIL_SOURCE_MISMATCH:'source_changed',THUMBNAIL_GENERATION_FAILED:'generation_failed',THUMBNAIL_SAVE_UNCONFIRMED:'save_unconfirmed'};
 return Object.hasOwn(classes,exact)?classes[exact]:'unknown';
}
// One item per invocation. This process is separate from production; deployment
// of a scheduler is deliberate and not performed by this script.
export async function runCoverThumbnailSweep(call,{now=Date.now}={}){
 const claim=await call({action:'site_cover_worker_claim'});if(claim.status!==200)throw Error('THUMBNAIL_WORKER_CLAIM_FAILED');if(!claim.body?.claimed)return{status:'waiting'};
 const {token,until}=claim.body;if(typeof token!=='string'||!Number.isSafeInteger(until))throw Error('THUMBNAIL_WORKER_LEASE_INVALID');let cursor;
 try{
  const next=await call({action:'site_cover_worker_next',token});if(next.status!==200)throw Error('THUMBNAIL_WORKER_SCAN_FAILED');
  if(next.body.done){const done=await call({action:'site_cover_worker_finish',token,done:true});if(done.status!==200)throw Error('THUMBNAIL_WORKER_FINISH_FAILED');return{status:'scan-complete'};}
  cursor=next.body.cursor;if(typeof cursor!=='string')throw Error('THUMBNAIL_WORKER_CURSOR_INVALID');
  if(!next.body.skip&&!next.body.exists){await backfillCoverThumbnail(next.body.item,body=>{if(now()+30000>=until)throw Error('THUMBNAIL_WORKER_DEADLINE');return call(body);});}
  const completed=await call({action:'site_cover_worker_finish',token,cursor});if(completed.status!==200)throw Error('THUMBNAIL_WORKER_FINISH_FAILED');return{status:next.body.skip?'skipped':next.body.exists?'already-present':'created'};
 }catch(error){if(now()<until)try{await call({action:'site_cover_worker_finish',token,failed:true,...(cursor?{cursor}:{})});}catch{}throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let transport;
 try{const {createNativeProductionTransport}=await import('./native-production-transport.mjs');transport=createNativeProductionTransport({timeoutMs:15000});const value=await runCoverThumbnailSweep(body=>transport.call(body));process.stdout.write(JSON.stringify(value)+'\n');}
 catch(error){process.stdout.write(JSON.stringify({status:'failed',error_class:thumbnailErrorClass(error)})+'\n');process.exitCode=1;}
 finally{if(transport)await transport.close();}
}
