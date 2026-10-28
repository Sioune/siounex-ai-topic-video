// Serialize this machine's upload of one immutable private producer result.
// A stale or unreadable lock requires reconciliation; elapsed time never grants ownership.
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
const SCHEMA='local-private-upload-lock-v1',NAME='.private-site-upload.lock.json',digest=/^[a-f0-9]{64}$/;
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const failure=(code)=>Object.assign(Error(code),{code});
function preciseBinding(b){if(!b||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(b.mode_epoch)||b.mode_epoch<0||!digest.test(b.script_hash||'')||!digest.test(b.contract_hash||'')||typeof b.scope_id!=='string'||!b.scope_id.trim()||b.scope_id.length>160||b.scope!==undefined&&b.scope!=='private-video')throw failure('LOCAL_UPLOAD_LOCK_BINDING_INVALID');return{revision:b.revision,script_hash:b.script_hash,mode_epoch:b.mode_epoch,contract_hash:b.contract_hash,scope_id:b.scope_id,...(b.scope===undefined?{}:{scope:b.scope})};}
function parsedLock(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>4096)throw failure('LOCAL_UPLOAD_LOCK_UNREADABLE');const v=JSON.parse(fs.readFileSync(file,'utf8'));if(v?.schema!==SCHEMA||!digest.test(v.input_hash||'')||!/^job_[a-f0-9-]{36}$/.test(v.job_id||'')||typeof v.nonce!=='string'||!/^[a-f0-9-]{36}$/.test(v.nonce)||!Number.isSafeInteger(v.owner_pid)||v.owner_pid<=0||!Number.isFinite(Date.parse(v.created_at)))throw failure('LOCAL_UPLOAD_LOCK_UNREADABLE');preciseBinding(v.binding);return v;}
const sameBinding=(a,b)=>a.input_hash===b.input_hash&&a.job_id===b.job_id&&canonical(a.binding)===canonical(b.binding);
function freezeLock(v){return Object.freeze({...v,binding:Object.freeze({...v.binding})});}

export async function withLocalUploadLock(outputDir,{inputHash,jobId,binding},work,{onConflict}={}){
 if(!digest.test(inputHash||'')||!/^job_[a-f0-9-]{36}$/.test(jobId||'')||typeof work!=='function'||onConflict!==undefined&&typeof onConflict!=='function')throw failure('LOCAL_UPLOAD_LOCK_INPUT_INVALID');
 const root=fs.realpathSync(outputDir);if(!fs.statSync(root).isDirectory())throw failure('LOCAL_UPLOAD_LOCK_DIRECTORY_INVALID');const lockPath=path.join(root,NAME),record={schema:SCHEMA,input_hash:inputHash,job_id:jobId,binding:preciseBinding(binding),nonce:randomUUID(),owner_pid:process.pid,created_at:new Date().toISOString()};
 let fd;try{fd=fs.openSync(lockPath,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e;let lock=null;try{lock=parsedLock(lockPath)}catch{}const matches=!!lock&&sameBinding(lock,record),reason=!lock?'lock-unreadable':matches?'busy':'binding-mismatch';if(!onConflict)throw failure('LOCAL_UPLOAD_LOCK_HELD');return await onConflict(Object.freeze({reason,lockPath,lock:lock?freezeLock(lock):null,matches}));}
 try{fs.writeFileSync(fd,canonical(record),'utf8');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 try{return await work()}finally{
  // Never remove a replaced, malformed or other invocation's lock. No PID/TTL stealing.
  let current=null;try{current=parsedLock(lockPath)}catch{}if(current?.nonce===record.nonce&&sameBinding(current,record)&&canonical(current)===canonical(record))fs.unlinkSync(lockPath);
 }
}
