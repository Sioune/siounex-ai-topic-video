// Read immutable owned-process evidence before allowing any new selection call.
// No model, media, credential or network access occurs in this module.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {cliFailureDiagnostic} from './cli-failure-recovery.mjs';
import {safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {inspectStaleMaterialSelection} from './stale-material-selection.mjs';
import {inspectSpawnFailureSelection} from './spawn-failure-material-selection.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const phase='automatic-material-selection';
const bindingValid=b=>b&&Object.keys(b).sort().join(',')==='contract_hash,mode_epoch,revision,scope_id,script_hash'&&['revision','mode_epoch'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0)&&['script_hash','contract_hash'].every(k=>hash(b[k]))&&typeof b.scope_id==='string'&&!!b.scope_id;
function bytes(file,max=32000000){if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile()||fs.statSync(file).size>max)throw Error('unconfirmed-file');return fs.readFileSync(file);}
function immutable(file,value){const b=Buffer.from(JSON.stringify(value,null,2));if(fs.existsSync(file)){if(sha(bytes(file))!==sha(b))throw Error('reconciliation-proof-changed');}else fs.writeFileSync(file,b,{flag:'wx'});return sha(b);}
function diagnostic(state,code,evidence,extra={}){return{schema:'native-preclaim-reconciliation-v1',state,code,phase,fingerprint:sha(canonical({state,code,evidence,...extra})),evidence_hashes:[...new Set(evidence)].filter(hash).sort(),...extra};}
function failure(d){throw Object.assign(Error(d.code),{code:d.code,phase:d.phase,material_reconciliation:d});}
export function inspectMaterialSelectionHistory(parent,binding,{persist=true,now=Date.now,isProcessAlive}={}){
 if(!bindingValid(binding))failure(diagnostic('unknown','AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED',[]));
 const attempts=[],evidence=[];let count=0;
 function walk(dir,depth=0){
  if(depth>5||++count>512||fs.lstatSync(dir).isSymbolicLink())throw Error('unconfirmed-directory');
  const intent=path.join(dir,'selection-started.json');
  if(fs.existsSync(intent)){
   const ib=bytes(intent),started=JSON.parse(ib),input_hash=dir.split(path.sep).reverse().find(hash);evidence.push(sha(ib));
   if(!input_hash||started.input_hash!==input_hash||!Number.isFinite(Date.parse(started.started_at))||started.binding!==undefined&&!bindingValid(started.binding))throw Error('unconfirmed-intent');
   if(!started.binding||canonical(started.binding)===canonical(binding)){
    const prompt=bytes(path.join(dir,'prompt.txt'),1000000),prompt_sha256=sha(prompt),output=path.join(dir,'selection.json'),receiptFile=path.join(dir,'selection-receipt.json');evidence.push(prompt_sha256);
    if(fs.existsSync(receiptFile)){
     const rb=bytes(receiptFile),r=JSON.parse(rb),out=bytes(output);evidence.push(sha(rb),sha(out));
     if(r.input_hash!==input_hash||r.prompt_sha256!==prompt_sha256||r.output_sha256!==sha(out)||!Number.isFinite(Date.parse(r.finished_at))||r.process?.error_code!=='CLI_COMPLETED'||r.process?.exit_code!==0||r.process?.result_unknown===true||r.process?.timed_out===true||r.process?.termination_unconfirmed===true||r.process?.output_present===false||r.process?.output_sha256&&r.process.output_sha256!==r.output_sha256||r.binding&&canonical(r.binding)!==canonical(binding))throw Error('unconfirmed-completed-receipt');
     if(r.original_output_sha256){const base=dir.slice(0,dir.indexOf(path.sep+'correction-1'));if(base===dir||sha(bytes(path.join(base,'selection.json')))!==r.original_output_sha256)throw Error('correction-origin-changed');}
     attempts.push({directory:dir,input_hash,status:'completed',finished_at:r.finished_at,prompt_sha256,receipt:r});
    }else{
     const processDir=path.join(dir,'process');if(!fs.existsSync(processDir)||fs.lstatSync(processDir).isSymbolicLink())throw Error('unconfirmed-process');
     if(!fs.existsSync(path.join(processDir,'cli-process-exit.json'))){
      let proof,proofName='selection-stale-readonly.json';try{proof=inspectStaleMaterialSelection({dir,started,intent:ib,prompt,binding,read:bytes,isProcessAlive});}catch{proof=inspectSpawnFailureSelection({dir,started,intent:ib,prompt,binding,read:bytes});proofName='selection-spawn-failure-readonly.json';}
      const proof_sha256=persist?immutable(path.join(dir,proofName),proof):sha(Buffer.from(JSON.stringify(proof,null,2)));
      if(proof.owned_process_sha256)evidence.push(proof.process_started_sha256,proof.owned_process_sha256,proof.event_log_sha256,proof_sha256);else evidence.push(proof.process_started_sha256,proof.event_log_sha256,proof_sha256,...[proof.failure_sha256,proof.station_started_sha256,proof.station_finished_sha256].filter(hash));
      attempts.push({directory:dir,input_hash,status:'stale-readonly',started_at:started.started_at,prompt_sha256,proof_sha256,original_result_unknown:true});
     }else{
     for(const f of ['cli-process-started.json','cli-owned-child.json','cli-process-exit.json','cli-events.log'])bytes(path.join(processDir,f));
     const d=cliFailureDiagnostic({metadataDir:processDir,output,prompt:prompt.toString('utf8')}),exit=JSON.parse(bytes(path.join(processDir,'cli-process-exit.json')));if(!d)throw Error('unconfirmed-process-binding');
     evidence.push(d.process_receipt_sha256,d.event_log_sha256);
     if(safeRateLimitFailure(d)){
      const next_retry_at=new Date(Date.parse(d.finished_at)+Math.max(900000,Math.min(3600000,Number(d.retry_after_seconds||0)*1000))).toISOString();
      const proof={schema:'material-selection-reconciliation-v1',input_hash,intent_sha256:sha(ib),original_binding:started.binding??null,prompt_sha256,process_receipt_sha256:d.process_receipt_sha256,event_log_sha256:d.event_log_sha256,code:'CLI_RATE_LIMITED',confirmed_no_result:true,result_unknown:false,finished_at:d.finished_at,next_retry_at,original_files_preserved:true};
      const proof_sha256=persist?immutable(path.join(dir,'selection-reconciliation.json'),proof):sha(Buffer.from(JSON.stringify(proof,null,2)));evidence.push(proof_sha256);attempts.push({directory:dir,input_hash,status:'rate-limited',finished_at:d.finished_at,next_retry_at,prompt_sha256,proof_sha256});
     }else if(d.code==='CLI_COMPLETED'&&d.tool_events===0&&hash(exit.output_sha256)&&exit.output_sha256===sha(bytes(output))){
      const r={input_hash,...(started.binding?{binding:started.binding}:{}),...(started.original_output_sha256?{original_output_sha256:started.original_output_sha256}:{}),prompt_sha256,output_sha256:exit.output_sha256,finished_at:exit.finished_at,process:exit,reconciled_from_owned_process:true};
      if(persist)immutable(receiptFile,r);evidence.push(sha(Buffer.from(JSON.stringify(r,null,2))));attempts.push({directory:dir,input_hash,status:'completed',finished_at:r.finished_at,prompt_sha256,receipt:r});
     }else throw Error('original-result-unknown');
     }
    }
   }
  }
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('linked-history');if(e.isDirectory()&&(hash(e.name)||e.name==='correction-1'||/^(?:retry|recovery-unknown)-[12]$/.test(e.name)))walk(path.join(dir,e.name),depth+1);}
 }
 try{if(fs.existsSync(parent))walk(parent);}catch{failure(diagnostic('unknown','AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED',evidence));}
 const ordered=attempts.toSorted((a,b)=>Date.parse(a.finished_at||a.started_at)-Date.parse(b.finished_at||b.started_at)),lastComplete=ordered.findLastIndex(a=>a.status==='completed'),failed=ordered.slice(lastComplete+1).filter(a=>a.status==='rate-limited');
 if(failed.length>=3)failure(diagnostic('exhausted','AUTO_MATERIAL_RETRY_EXHAUSTED',evidence));
 const last=failed.at(-1);if(last&&Date.parse(last.next_retry_at)>now())failure(diagnostic('cooldown','AUTO_MATERIAL_RATE_LIMITED',evidence,{next_retry_at:last.next_retry_at}));
 return{attempts,evidence_hashes:[...new Set(evidence)].sort(),fingerprint:sha(canonical({binding,evidence})),consecutive_rate_limits:failed.length};
}
export function materialSelectionAttempt({parent,baseDir,binding,prompt,now=Date.now,isProcessAlive}){
 const h=inspectMaterialSelectionHistory(parent,binding,{now,isProcessAlive}),prompt_sha256=sha(prompt),done=h.attempts.filter(a=>(a.directory===baseDir||a.directory.startsWith(baseDir+path.sep+'retry-')||a.directory.startsWith(baseDir+path.sep+'recovery-unknown-'))&&a.status==='completed'&&a.prompt_sha256===prompt_sha256).at(-1);if(done)return done.directory;
 if(!fs.existsSync(path.join(baseDir,'selection-started.json'))&&!fs.existsSync(path.join(baseDir,'selection.json')))return baseDir;
 if(h.attempts.some(a=>a.directory===baseDir&&a.status==='stale-readonly')){
  if(fs.existsSync(path.join(baseDir,'selection.json'))||fs.existsSync(path.join(baseDir,'selection-receipt.json')))failure(diagnostic('unknown','AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED',h.evidence_hashes));
  for(let n=1;n<=2;n++){const dir=path.join(baseDir,'recovery-unknown-'+n);if(!fs.existsSync(path.join(dir,'selection-started.json'))&&!fs.existsSync(path.join(dir,'selection.json')))return dir;}
  failure(diagnostic('exhausted','AUTO_MATERIAL_RETRY_EXHAUSTED',h.evidence_hashes));
 }
 if(!h.attempts.some(a=>a.directory===baseDir&&a.status==='rate-limited'))failure(diagnostic('unknown','AUTO_MATERIAL_RESULT_RECONCILIATION_REQUIRED',h.evidence_hashes));
 for(let n=1;n<=2;n++){const dir=path.join(baseDir,'retry-'+n);if(!fs.existsSync(path.join(dir,'selection-started.json'))&&!fs.existsSync(path.join(dir,'selection.json')))return dir;}
 failure(diagnostic('exhausted','AUTO_MATERIAL_RETRY_EXHAUSTED',h.evidence_hashes));
}
