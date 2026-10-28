// Bounded independent immutable archive parts. The caller keeps its transfer
// lock until this resolves/rejects and persists each verified ACK in worker.
// Six independent 512KiB immutable requests bound payload in flight to3MiB.
// Archive ownership, per-part ACKs and full-file confirmation stay with caller.
export const SITE_ARCHIVE_PART_CONCURRENCY=6;
// The immutable part read can also retry a native RPC error: a failed read
// cannot upload or regenerate anything. Explicit authentication/conflict
// responses and every write keep their original behavior.
export async function readSiteArchivePart(call,body,{sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),beforeRetry=()=>{}}={}){
 if(typeof call!=='function'||body?.action!=='site_archive_read_part')throw Error('SITE_ARCHIVE_READ_ACTION_REQUIRED');
 for(let attempt=0;attempt<3;attempt++){
  try{return await call(body);}catch(error){const transient=Number(error?.status)===503||error?.status==null&&error?.code==='NATIVE_PRODUCTION_TOOL_FAILED';if(!transient||attempt===2)throw error;await sleep(250*(attempt+1));beforeRetry();}
 }
}
export async function runSiteArchiveParts(count,worker,{beforeStart=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<0||typeof worker!=='function'||typeof beforeStart!=='function')throw Error('SITE_ARCHIVE_BATCH_INPUT_INVALID');
 const results=new Array(count);let next=0,failed=false,firstError,workerFailed=false,workerError;
 async function lane(){while(!failed&&next<count){const index=next++;try{beforeStart(index);}catch(error){if(!failed){failed=true;firstError=error;}return;}try{results[index]=await worker(index);}catch(error){if(!workerFailed){workerFailed=true;workerError=error;}if(!failed){failed=true;firstError=error;}}}}
 // A lane records errors instead of rejecting early: in-flight acknowledgments
 // still finish and save before the caller can release its upload lock.
 await Promise.all(Array.from({length:Math.min(count,SITE_ARCHIVE_PART_CONCURRENCY)},lane));
 // An already-issued request failure must not be hidden by a later deadline.
 if(failed)throw workerFailed?workerError:firstError;return results;
}
