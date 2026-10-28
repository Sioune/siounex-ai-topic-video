import fs from 'node:fs';
import path from 'node:path';
import {safeRateLimitFailure} from '../lib/cli-failure-contract.mts';
import {cliFailureDiagnostic} from './cli-failure-recovery.mjs';
import {researchDigest,researchSearchEvents} from './research-web.mjs';
const read=file=>fs.readFileSync(file,'utf8');
const json=file=>JSON.parse(read(file));
const digest=file=>researchDigest(fs.readFileSync(file));
function safeFile(file){if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw Error('Research receipt/file missing or linked; reconcile original output');return file;}
function process(folder){
 for(const dir of [path.dirname(folder),folder,path.join(folder,'process')])if(!fs.existsSync(dir)||fs.lstatSync(dir).isSymbolicLink()||!fs.statSync(dir).isDirectory())throw Error('Research process directory missing or linked; reconcile original receipt');
 const metadataDir=path.join(folder,'process'),output=path.join(folder,'output.json'),prompt=read(safeFile(path.join(folder,'prompt.txt'))),start=json(safeFile(path.join(metadataDir,'cli-process-started.json'))),owned=json(safeFile(path.join(metadataDir,'cli-owned-child.json'))),exit=json(safeFile(path.join(metadataDir,'cli-process-exit.json'))),log=read(safeFile(path.join(metadataDir,'cli-events.log')));
 if(!Number.isInteger(exit.pid)||exit.pid<=0||!Number.isFinite(Date.parse(start.started_at))||Date.parse(exit.finished_at)<Date.parse(start.started_at)||start.scope!=='owned-cli-child-tree'||exit.scope!==start.scope||owned.scope!==start.scope||owned.pid!==exit.pid||owned.started_at!==start.started_at||exit.started_at!==start.started_at||start.prompt_sha256!==researchDigest(prompt)||exit.prompt_sha256!==researchDigest(prompt)||!Number.isFinite(Date.parse(exit.finished_at))||exit.timed_out||exit.termination_unconfirmed||exit.event_log_sha256!==researchDigest(log)||exit.output_present!==fs.existsSync(output))throw Error('Research process evidence changed or has no confirmed terminal result');
 if(exit.exit_code===0&&exit.error_code==='CLI_COMPLETED'&&exit.result_unknown===false&&fs.existsSync(output)){
  safeFile(output);if(exit.output_sha256!==digest(output))throw Error('Research completed output SHA changed');
  return{completed:true,value:json(output),prompt,log,events:researchSearchEvents(log),output_sha256:digest(output),receipt:exit};
 }
 const diagnostic=cliFailureDiagnostic({metadataDir,output,prompt,stage:path.basename(folder)==='discovery'?'keyword-discovery':'keyword-writing'});
 if(!safeRateLimitFailure(diagnostic))throw Error('Research invocation result unknown, tools used, or output unconfirmed; no automatic repeat');
 return{completed:false,diagnostic};
}
export function researchCacheProof({attempt,started_at,discovered,documentsFile}){return{origin_attempt:attempt,discovery_output_sha256:discovered.output_sha256,discovery_events_sha256:researchDigest(discovered.log),discovery_prompt_sha256:researchDigest(discovered.prompt),documents_sha256:digest(documentsFile),started_at};}
function reuseDocuments(base,research,cache){
 if(!cache||!Number.isSafeInteger(cache.origin_attempt)||cache.origin_attempt<1||cache.origin_attempt>research.attempt)throw Error('Writing retry lacks exact original discovery binding');
 const origin=path.join(base,'attempt-'+cache.origin_attempt),invocation=json(safeFile(path.join(origin,'invocation.json'))),discovered=process(path.join(origin,'discovery')),documentsFile=safeFile(path.join(origin,'documents.json'));
 if(invocation.research_id!==research.id||invocation.input_hash!==research.input_hash||invocation.attempt!==cache.origin_attempt||!discovered.completed||!discovered.events.search_count||!discovered.events.queries.length||cache.discovery_output_sha256!==discovered.output_sha256||cache.discovery_events_sha256!==researchDigest(discovered.log)||cache.discovery_prompt_sha256!==researchDigest(discovered.prompt)||cache.documents_sha256!==digest(documentsFile)||cache.started_at!==invocation.started_at)throw Error('Cached discovery/documents SHA or research binding changed; no repeat search');
 const saved=json(documentsFile);if(!Array.isArray(saved.documents)||saved.documents.length<2||!Array.isArray(saved.failed_candidates)||saved.documents.some(d=>typeof d.text!=='string'||d.extract_sha256!==researchDigest(d.text)))throw Error('Cached document text evidence is incomplete or changed');
 return{discovered,documents:saved.documents,failures:saved.failed_candidates,cache,started_at:cache.started_at};
}
// Before claiming, every old invocation must be terminal and its original bytes
// unchanged. A fresh lease never turns an unknown previous output into a retry.
export function inspectResearchRetry(research,{directory,now=Date.now()}={}){
 if(!research.attempt)return null;
 const failure=research.cli_failure,b=failure?.research_binding;
 if(!safeRateLimitFailure(failure)||!b||b.id!==research.id||b.input_hash!==research.input_hash||b.attempt!==research.attempt||b.version!==research.version||!['keyword-discovery','keyword-writing'].includes(failure.stage)||Number(failure.next_retry_ms)>now)throw Error('Prior research outcome/cooldown not reconciled; no new claim or model call');
 const base=path.resolve(directory,research.id);if(!fs.existsSync(base)||fs.lstatSync(base).isSymbolicLink())throw Error('Original research cache missing or linked; reconcile before retry');
 let lastFailure=null,hadDiscovery=false;
 for(const entry of fs.readdirSync(base,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Linked research attempt requires reconciliation');const n=/^attempt-(\d+)$/.exec(entry.name);if(n&&Number(n[1])>research.attempt)throw Error('A later local research attempt already exists; reconcile before claiming');}
 for(let attempt=1;attempt<=research.attempt;attempt++){
  const folder=path.join(base,'attempt-'+attempt),invocation=json(safeFile(path.join(folder,'invocation.json')));
  if(invocation.research_id!==research.id||invocation.input_hash!==research.input_hash||invocation.attempt!==attempt||fs.existsSync(path.join(folder,'result.json')))throw Error('Prior research input changed or result awaits reconciliation');
  const discoveryFolder=path.join(folder,'discovery'),reuseFile=path.join(folder,'reuse.json');let discovered;
  if(fs.existsSync(discoveryFolder))discovered=process(discoveryFolder);
  else{const reuse=json(safeFile(reuseFile));if(reuse.schema!=='research-stage-reuse-v1'||reuse.research_id!==research.id||reuse.input_hash!==research.input_hash||reuse.attempt!==attempt)throw Error('Research stage reuse binding changed');discovered=reuseDocuments(base,research,reuse.cache).discovered;}
  if(!discovered.completed){lastFailure=discovered.diagnostic;if(fs.existsSync(path.join(folder,'writing')))throw Error('Writing followed an unsuccessful discovery; reconcile output');continue;}
  hadDiscovery=true;const written=process(path.join(folder,'writing'));if(written.completed)throw Error('Completed writing output must reconcile before any new invocation');lastFailure=written.diagnostic;
 }
 if(!lastFailure||lastFailure.process_receipt_sha256!==failure.process_receipt_sha256||lastFailure.event_log_sha256!==failure.event_log_sha256||lastFailure.prompt_sha256!==failure.prompt_sha256||lastFailure.stage!==failure.stage)throw Error('Current server failure does not match last immutable process receipt');
 if(failure.stage==='keyword-writing')return reuseDocuments(base,research,failure.cache);
 if(hadDiscovery)throw Error('Existing completed discovery must not be searched again');
 return null;
}
