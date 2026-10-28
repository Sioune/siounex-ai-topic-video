// Reusable owner-private Site session. No creator-platform network calls.
// Credentials enter once on hidden stdin and stay in process memory only.
import path from 'node:path';
import {validateExpectedArchive,saveVerifiedArchive} from './publishing-download-validation.mjs';
const endpoint='https://siounex-ai-topic-library.siounexzhao.chatgpt.site/api/publishing-service';
const actions=new Set(['arm_prepared_slot','authorize_empty_slot_makeup','authorize_prepared_slot_continuation','prepare_next_slot','read_preparation','claim_preparation','read_preparation_materials','checkpoint_preparation','run_prepared_tick','reconcile_publications','read_browser_work','read_browser_materials','claim_browser_work','claim_browser_reconciliation','checkpoint_browser_work','complete_browser_work','observe_account','read_engagement','claim_engagement','record_engagement','observe_native_engagement','observe_browser_engagement','run_collection_tick']);
const frame=value=>{const raw=JSON.stringify(value);for(let n=0;n<raw.length;n+=22)process.stdout.write('V2_JSON_PART:'+JSON.stringify(raw.slice(n,n+22))+'\n');process.stdout.write('V2_JSON_END\n');};
let credential=null,buffer='',queue=Promise.resolve();
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');process.stdin.resume();
process.stdout.write('Ready for hidden owner-private session JSON.\n');
process.stdin.on('data',chunk=>{
 if(chunk.includes('\u0003')){credential=null;process.exit(0);}
 buffer+=chunk;if(buffer.length>150000){credential=null;process.exit(1);}
 let at;while((at=buffer.search(/[\r\n]/))!==-1){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);if(!line.trim())continue;queue=queue.then(()=>receive(line));}
});
process.stdin.on('end',()=>{queue.finally(()=>{credential=null;process.exit(0);});});
async function receive(line){
 try{
  const request=JSON.parse(line);
  if(!credential){if(Object.keys(request).length!==1||typeof request.site_token!=='string'||!request.site_token)throw Error('Expected in-memory Site credential');credential=request.site_token;frame({session_ready:true});return;}
  if(request.close===true&&Object.keys(request).length===1){credential=null;frame({session_closed:true});process.exit(0);}
  if(Object.keys(request).some(k=>!['body','operation','expected_sha256','expected_size_bytes'].includes(k))||!request.body||typeof request.body!=='object'||Array.isArray(request.body))throw Error('Unsupported session request');
  const download=request.operation==='download';
  if(download)validateExpectedArchive(request);else if(request.operation||!actions.has(request.body.action))throw Error('Action outside publishing session scope');
  const response=await fetch(endpoint+(download?'/media':''),{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json','OAI-Sites-Authorization':'Bearer '+credential,'X-Publishing-Service':'owner-private'},body:JSON.stringify(request.body)});
  if(download&&response.ok){frame({http_status:response.status,...await saveVerifiedArchive(response,request,path.resolve('.sites-runtime/publishing-downloads'))});return;}
  let result;try{result=await response.json();}catch{throw Error('Site response was not JSON');}
  frame({http_status:response.status,result});
 }catch(error){frame({client_error:error instanceof Error?error.message:'Private publishing session failed'});}
}
