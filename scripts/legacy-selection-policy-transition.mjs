// The newly approved content-motion plan replaces an unfinished legacy READ
// proposal. It never resolves/replays that unknown call or reuses its output.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import policy from '../production/content-motion-policy.json' with {type:'json'};
import {isNativeMetadataWarning} from './native-speech-policy.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
// A recycled PID is not the original child. Also check that no surviving
// Codex/Node process still owns the original output path. Unavailable process
// inspection keeps the original unknown; it does not grant a new call.
export function legacyProcessAlive(pid,{startedAt,output}={}){
 if(process.platform!=='win32'){try{process.kill(pid,0);return true}catch(e){return e.code!=='ESRCH'}}
 try{
  const script=`$p=Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or (($_.Name -eq 'node.exe' -or $_.Name -eq 'codex.exe') -and $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($env:SIOUNEX_SELECTION_OUTPUT.ToLowerInvariant())) }; ConvertTo-Json -Compress -InputObject @($p | ForEach-Object { @{pid=$_.ProcessId; created=$_.CreationDate.ToUniversalTime().ToString('o'); owns_output=($_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($env:SIOUNEX_SELECTION_OUTPUT.ToLowerInvariant()))} })`;
  const raw=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:10000,windowsHide:true,env:{...process.env,SIOUNEX_SELECTION_OUTPUT:path.resolve(output)}}).trim();
  const rows=raw?JSON.parse(raw):[];if(!Array.isArray(rows))return true;
  const start=Date.parse(startedAt);if(!Number.isFinite(start))return true;
  return rows.some(r=>r.owns_output===true||r.pid===pid&&(!Number.isFinite(Date.parse(r.created))||Date.parse(r.created)<=start+2000));
 }catch{return true;}
}
// Transient transport diagnostics say nothing about whether the old call
// completed. They are not tool activity; retain the original unknown status.
function legacySelectionEvents(log){return log.trim().split(/\r?\n/).map(line=>{try{return JSON.parse(line)}catch{if(/^\d{4}-\d\d-\d\dT.* ERROR codex_models_manager::manager: failed to refresh available models: timeout waiting for child process to exit$/.test(line))return {type:'transport-diagnostic'};throw Error('unknown event')}});}
const safeLegacyEvent=v=>['thread.started','turn.started','transport-diagnostic'].includes(v.type)||(v.type==='item.completed'&&v.item?.type==='error'&&isNativeMetadataWarning(v.item.message))||(v.type==='error'&&/^Reconnecting\.\.\. \d+\/\d+ \(request timed out\)$/.test(v.message||''));
function selectionDirectories(parent){const dirs=[];function walk(dir,depth){if(depth>5||dirs.length>512||fs.lstatSync(dir).isSymbolicLink())throw Error('unconfirmed history');for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('linked history');if(e.isDirectory()&&(/^[a-f0-9]{64}$/.test(e.name)||e.name==='correction-1'||/^retry-[12]$/.test(e.name))){const child=path.join(dir,e.name);dirs.push(child);walk(child,depth+1);}}}walk(parent,0);return dirs;}

// A later input snapshot may predate the server transition. Keep the validated
// namespace bound to its immutable proof, rather than a transient job field.
export function materialSelectionParent(jobDir,binding){
 const legacy=path.join(jobDir,'automatic-material-plan'),current=path.join(jobDir,'content-motion-plans'),proofDir=path.join(jobDir,'content-motion');
 try{
  const read=file=>{const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>2000000)throw Error('unconfirmed proof');return fs.readFileSync(file);};
  if(fs.lstatSync(legacy).isSymbolicLink()||fs.lstatSync(proofDir).isSymbolicLink())return legacy;
  for(const name of fs.readdirSync(proofDir).filter(n=>/^legacy-selection-[a-f0-9]{64}\.json$/.test(n))){
   const proof=JSON.parse(read(path.join(proofDir,name)));
   if(proof.schema!=='legacy-selection-new-policy-v1'||proof.job_id!==path.basename(path.dirname(jobDir))||canonical(proof.binding)!==canonical(binding)||proof.replacement_policy_id!==policy.id||proof.previous_result!=='unchanged-unknown'||proof.original_output_reused!==false||proof.original_files_preserved!==true||proof.original_process_no_longer_running!==true||proof.legacy_observed_tool_calls!==0||proof.unknown?.length!==1)continue;
   const original=proof.unknown[0];if(!/^[a-f0-9]{64}$/.test(original.input_hash))continue;let valid=true;
   for(const dir of selectionDirectories(legacy)){
    if(fs.existsSync(path.join(dir,'selection-started.json'))&&!fs.existsSync(path.join(dir,'selection-receipt.json'))){if(path.dirname(dir)!==legacy||path.basename(dir)!==original.input_hash||fs.existsSync(path.join(dir,'selection.json'))||fs.existsSync(path.join(dir,'process/cli-process-exit.json')))valid=false;}
   }
   const dir=path.join(legacy,original.input_hash);if(valid&&sha(read(path.join(dir,'selection-started.json')))===original.started_sha256&&sha(read(path.join(dir,'process/cli-owned-child.json')))===original.owned_process_sha256&&sha(read(path.join(dir,'process/cli-events.log')))===original.events_sha256)return current;
  }
 }catch{}
 return legacy;
}
export function legacySelectionPolicyTransition(selection,{root=process.cwd(),isProcessAlive=legacyProcessAlive}={}){
 const j=selection.job,h=selection.native_preparation?.handoff||selection.native_preparation,r=h?.reconciliation;
 if(policy.enabled!==true||r?.state!=='unknown'||r.evidence_hashes.length>=512||j.status!=='approved'||!h.base_video||!j.media_continuation?.scope?.owner_confirmed||j.media_continuation.scope.id!==h.binding.scope_id)return null;
 const {scope,...binding}=h.binding,parent=path.resolve(root,'.sites-runtime/authorized-inputs',j.id,'revision-'+j.revision,'automatic-material-plan'),hashes=new Set(),unknown=[];
 try{
  if(fs.lstatSync(parent).isSymbolicLink())return null;
  const read=f=>{const s=fs.lstatSync(f);if(s.isSymbolicLink()||!s.isFile()||s.size>2000000)throw Error('unconfirmed evidence');const b=fs.readFileSync(f);hashes.add(sha(b));return b;};
  for(const dir of selectionDirectories(parent)){const name=path.basename(dir);
   for(const name of ['selection-started.json','selection-receipt.json','selection-reconciliation.json','prompt.txt','selection.json','process/cli-process-started.json','process/cli-owned-child.json','process/cli-process-exit.json','process/cli-events.log'])if(fs.existsSync(path.join(dir,name)))read(path.join(dir,name));
   if(!fs.existsSync(path.join(dir,'selection-started.json'))||fs.existsSync(path.join(dir,'selection-receipt.json'))||fs.existsSync(path.join(dir,'process/cli-process-exit.json')))continue;
   const start=JSON.parse(read(path.join(dir,'selection-started.json'))),p=JSON.parse(read(path.join(dir,'process/cli-process-started.json'))),owned=JSON.parse(read(path.join(dir,'process/cli-owned-child.json'))),prompt=read(path.join(dir,'prompt.txt')),events=legacySelectionEvents(read(path.join(dir,'process/cli-events.log')).toString('utf8'));
   if(start.policy_id!==undefined||(path.dirname(dir)!==parent||start.input_hash!==name)||canonical(start.binding)!==canonical(binding)||p.scope!=='owned-cli-child-tree'||p.sandbox!=='read-only'||p.prompt_sha256!==sha(prompt)||!Number.isSafeInteger(owned.pid)||owned.pid<1||owned.started_at!==p.started_at||owned.scope!==p.scope||isProcessAlive(owned.pid,{startedAt:owned.started_at,output:path.join(dir,'selection.json')})!==false||fs.existsSync(path.join(dir,'selection.json'))||!events.length||events.some(v=>!safeLegacyEvent(v)))return null;
   unknown.push({input_hash:name,started_sha256:sha(read(path.join(dir,'selection-started.json'))),owned_process_sha256:sha(read(path.join(dir,'process/cli-owned-child.json'))),events_sha256:sha(read(path.join(dir,'process/cli-events.log'))),pid:owned.pid});
  }
  if(unknown.length!==1||!r.evidence_hashes.length||!r.evidence_hashes.every(v=>hashes.has(v)))return null;
  const proof={schema:'legacy-selection-new-policy-v1',job_id:j.id,binding,previous_fingerprint:r.fingerprint,replacement_policy_id:policy.id,previous_result:'unchanged-unknown',original_output_reused:false,original_files_preserved:true,original_process_no_longer_running:true,legacy_observed_tool_calls:0,unknown,quality_approved:false,publication_authorized:false,new_paid_calls:0},bytes=Buffer.from(JSON.stringify(proof,null,2)),dir=path.resolve(parent,'../content-motion'),file=path.join(dir,'legacy-selection-'+r.fingerprint+'.json');fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(file)){if(sha(fs.readFileSync(file))!==sha(bytes))return null;}else fs.writeFileSync(file,bytes,{flag:'wx'});
  return{schema:'native-preclaim-reconciliation-v1',state:'superseded',code:'AUTO_MATERIAL_LEGACY_PLAN_SUPERSEDED',phase:'automatic-material-selection',fingerprint:sha(canonical(proof)),previous_fingerprint:r.fingerprint,evidence_hashes:[...new Set([...r.evidence_hashes,sha(bytes)])].sort(),replacement_policy_id:policy.id,original_result_unknown:true};
 }catch{return null;}
}
